import express from "express";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";
import { Connection, clusterApiUrl, PublicKey, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import {
  updatePlayerHitbox,
  removePlayerHitbox,
  performRaycast,
} from "./physics.js";
import {
  getPlayerStats,
  updatePlayerStats,
  incrementPlayerStat,
} from "./database.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://txfhjhrt-3000.uks1.devtunnels.ms",
      "https://scaling-space-acorn-rrp7w7j9xwphwj47-3000.app.github.dev",
    ],
    methods: ["GET", "POST"],
  },
});

const PORT = 3001;
let players = {};

// Solana connection
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TREASURY_WALLET_ADDRESS = new PublicKey(process.env.TREASURY_WALLET_ADDRESS);

// --- Game State Variables ---
let gamePhase = "LOBBY"; // 'LOBBY', 'IN_ROUND', 'POST_ROUND'
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let gameLoopIntervalId = null;
let roundTimerIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

// --- Game Constants ---
const MAIN_COUNTDOWN_SECONDS = 1;
const OVERTIME_SECONDS = 10;
const ROUND_DURATION_SECONDS = 60;

// --- UTILITY & BROADCAST FUNCTIONS ---
const getContenders = () => Object.values(players).filter((p) => p.role === "CONTENDER");
const getTop4ContenderIds = () => getContenders().sort((a, b) => b.betAmount - a.betAmount || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0)).slice(0, 2).map((p) => p.id);
const broadcastLobbyState = () => io.emit("lobby:state", players);
const broadcastLobbyCountdown = () => io.emit("lobby:countdown", lobbyCountdown);
const broadcastRoundTimer = () => io.emit("round:timer", roundTimer);

// --- LOBBY LOGIC ---
const stopLobbyCountdown = () => {
  if (lobbyCountdownIntervalId) {
    clearInterval(lobbyCountdownIntervalId);
    lobbyCountdownIntervalId = null;
    lobbyCountdown = null;
    broadcastLobbyCountdown();
  }
};

const finalizeAuction = () => {
  stopLobbyCountdown();
  gamePhase = "IN_ROUND";
  const top4Ids = getTop4ContenderIds();
  roundPot = 0;
  activeFighterIds.clear();
  const finalFighters = [];

  for (const id of top4Ids) {
    const player = players[id];
    if (player) {
      roundPot += player.betAmount;
      activeFighterIds.add(player.id);
      finalFighters.push(player);
      incrementPlayerStat(player.walletAddress, "total_games_played", 1);
      incrementPlayerStat(player.walletAddress, "total_tokens_wagered", player.betAmount);
    }
  }

  for (const player of Object.values(players)) {
    if (!activeFighterIds.has(player.id) && player.role === "CONTENDER") {
      console.log(`Burning ${player.betAmount} tokens for ${player.name}`);
      incrementPlayerStat(player.walletAddress, "total_tokens_wagered", player.betAmount);
      incrementPlayerStat(player.walletAddress, "net_winnings", -player.betAmount);
      player.betAmount = 0;
    }
  }

  io.emit("game:phaseChange", { phase: "IN_ROUND", fighters: finalFighters });
  broadcastLobbyState();
  startGameRound();
};

const startLobbyCountdown = (duration) => {
  stopLobbyCountdown();
  lobbyCountdown = duration;
  lobbyCountdownIntervalId = setInterval(() => {
    broadcastLobbyCountdown();
    if (lobbyCountdown > 0) {
      lobbyCountdown--;
    } else {
      finalizeAuction();
    }
  }, 1000);
};

const checkAndManageCountdown = (previousTop4Ids = []) => {
  const contenders = getContenders();
  if (contenders.length < 2) {
    stopLobbyCountdown();
  } else {
    if (!lobbyCountdownIntervalId) {
      startLobbyCountdown(MAIN_COUNTDOWN_SECONDS);
    } else {
      const currentTop4Ids = getTop4ContenderIds();
      if (JSON.stringify(previousTop4Ids) !== JSON.stringify(currentTop4Ids)) {
        lobbyCountdown += OVERTIME_SECONDS;
      }
    }
  }
};

// --- GAME ROUND LOGIC ---
const endRound = (winner) => {
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
  gameLoopIntervalId = null;
  roundTimerIntervalId = null;
  roundTimer = null;

  gamePhase = "POST_ROUND";
  console.log(`Entering POST_ROUND. Winner: ${winner ? winner.name : 'None'}`);

  if (winner) {
    incrementPlayerStat(winner.walletAddress, "wins", 1);
    incrementPlayerStat(winner.walletAddress, "net_winnings", roundPot);
  }
  
  const fighterIdsAtStart = new Set(activeFighterIds);
  fighterIdsAtStart.forEach((fighterId) => {
    const fighter = Object.values(players).find(p => p.id === fighterId);
    if (fighter && (!winner || fighter.id !== winner.id)) {
      incrementPlayerStat(fighter.walletAddress, "deaths", 1);
    }
  });

  io.emit("game:phaseChange", {
    phase: "POST_ROUND",
    winnerData: { name: winner ? winner.name : "DRAW", pot: roundPot },
  });

  setTimeout(() => {
    console.log("Resetting to LOBBY phase...");
    gamePhase = "LOBBY";
    Object.values(players).forEach(p => {
        p.role = "SPECTATOR";
        p.betAmount = 0;
        p.isVerified = false;
    });
    activeFighterIds.clear();

    io.emit("game:phaseChange", { phase: "LOBBY" });
    broadcastLobbyState();
    checkAndManageCountdown();
  }, 10000);
};

const startGameRound = () => {
  roundTimer = ROUND_DURATION_SECONDS;
  const currentFighters = Object.values(players).filter((p) => activeFighterIds.has(p.id));
  currentFighters.forEach((fighter) => {
    fighter.position = [Math.random() * 10 - 5, 0, Math.random() * 10 - 5];
    fighter.health = 3;
    fighter.input = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false };
  });

  roundTimerIntervalId = setInterval(() => {
    const livingFighters = Object.values(players).filter((p) => activeFighterIds.has(p.id) && p.health > 0);
    if (roundTimer > 0) {
      roundTimer--;
      broadcastRoundTimer();
    } else {
      clearInterval(roundTimerIntervalId);
      const winner = livingFighters.length > 0 ? livingFighters[Math.floor(Math.random() * livingFighters.length)] : null;
      endRound(winner);
    }
  }, 1000);

  gameLoopIntervalId = setInterval(() => {
    const currentFighters = Object.values(players).filter((p) => activeFighterIds.has(p.id));
    currentFighters.forEach((p) => {
      const input = p.input;
      if (p.health > 0 && input) {
        const moveDirection = { x: 0, z: 0 };
        if (input.moveForward) moveDirection.z -= 1;
        if (input.moveBackward) moveDirection.z += 1;
        if (input.moveLeft) moveDirection.x -= 1;
        if (input.moveRight) moveDirection.x += 1;

        if (moveDirection.x !== 0 || moveDirection.z !== 0) {
          p.position[0] += moveDirection.x * 5 * (1 / 20);
          p.position[2] += moveDirection.z * 5 * (1 / 20);
        }
      }
      updatePlayerHitbox(p);
    });
    io.emit("game:state", currentFighters.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}));
  }, 1000 / 20);
};

// --- MAIN CONNECTION HANDLER ---
io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);
  socket.emit("game:phaseChange", { phase: gamePhase });
  socket.emit("lobby:state", players);
  socket.emit("lobby:countdown", lobbyCountdown);

  socket.on("player:verifyEntry", async ({ signature, walletAddress, amount }) => {
      try {
          console.log(`Verifying entry for ${walletAddress} with signature ${signature}`);
          const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });

          if (!tx) throw new Error("Transaction not found.");
          if (tx.meta?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);

          const accountKeys = tx.transaction.message.staticAccountKeys.map(key => key.toBase58());
          
          const transferInstruction = tx.transaction.message.instructions.find(ix => {
              if (!ix.programIdIndex) return false;
              const programId = accountKeys[ix.programIdIndex];
              return programId === SystemProgram.programId.toBase58();
          });

          if (!transferInstruction) {
              throw new Error("SystemProgram.transfer instruction not found in transaction.");
          }
         
          // ** THE FIX: Convert the decoded Uint8Array from bs58 into a Node.js Buffer **
          const decodedData = Buffer.from(bs58.decode(transferInstruction.data));
          const instructionType = decodedData.readUInt32LE(0);

          if (instructionType !== 2) { // 2 = SystemProgram Transfer
            throw new Error("Instruction is not a SystemProgram.transfer");
          }

          const sentAmount = decodedData.readBigUInt64LE(4);
          if (BigInt(amount) !== sentAmount) {
              throw new Error(`Amount mismatch. Expected ${amount}, got ${sentAmount.toString()}`);
          }
          
          const fromAddress = accountKeys[transferInstruction.accounts[0]];
          const toAddress = accountKeys[transferInstruction.accounts[1]];

          if (fromAddress !== walletAddress || toAddress !== TREASURY_WALLET_ADDRESS.toBase58()) {
              throw new Error("Transaction sender or receiver is incorrect.");
          }

          console.log(`✅ Verification successful for ${walletAddress}`);

          const existingPlayer = Object.values(players).find(p => p.walletAddress === walletAddress);
          if (existingPlayer) return;

          const playerData = await getPlayerStats(walletAddress);
          if (!playerData) {
              socket.emit("lobby:entryFailed", "Could not retrieve player data.");
              return;
          }

          let playerName = playerData.username;
          if (!playerName || playerName === "Gladiator") {
              playerName = `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`;
          }

          players[socket.id] = {
              id: socket.id,
              walletAddress: walletAddress,
              name: playerName,
              role: "CONTENDER",
              isVerified: true,
              betAmount: amount,
              lastBetTimestamp: Date.now(),
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              stats: { kills: playerData.kills, deaths: playerData.deaths, wins: playerData.wins }
          };

          socket.emit("lobby:entrySuccess", { name: players[socket.id].name });
          broadcastLobbyState();
          checkAndManageCountdown(getTop4ContenderIds());

      } catch (error) {
          console.error("Verification failed:", error);
          socket.emit("lobby:entryFailed", `On-chain verification failed: ${error.message}`);
      }
  });


  socket.on("player:join", (playerName) => {
    const player = players[socket.id];
    if (player && player.isVerified) {
      player.name = playerName;
      updatePlayerStats(player.walletAddress, { username: playerName });
      broadcastLobbyState();
    }
  });

  socket.on("player:placeBet", async (amount) => {
    const player = players[socket.id];
    if (player && player.role === "CONTENDER") {
      const amountNum = parseInt(amount, 10);
      if (isNaN(amountNum) || amountNum <= 0) return;
      
      const previousTop4 = getTop4ContenderIds();
      player.betAmount += amountNum;
      broadcastLobbyState();
      checkAndManageCountdown(previousTop4);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔥 A user disconnected:", socket.id);
    if (players[socket.id]) {
      removePlayerHitbox(socket.id);
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTop4ContenderIds());
    }
  });

  socket.on("player:input", (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
    }
  });

  socket.on("player:shoot", (shotData) => {
    const shooter = players[socket.id];
    if (!shooter || !activeFighterIds.has(shooter.id) || shooter.health <= 0) return;
    const hit = performRaycast(shooter, shotData);
    if (hit) {
      const hitPlayer = players[hit.object.name];
      if (hitPlayer && hitPlayer.health > 0) {
        hitPlayer.health -= 1;
        io.emit("player:hit", { shooterId: shooter.id, victimId: hitPlayer.id, victimHealth: hitPlayer.health });
        if (hitPlayer.health <= 0) {
          incrementPlayerStat(shooter.walletAddress, "kills", 1);
          io.emit("player:eliminated", { victimId: hitPlayer.id, eliminatorId: shooter.id });
          const livingFighters = Object.values(players).filter(p => activeFighterIds.has(p.id) && p.health > 0);
          if (livingFighters.length <= 1) {
            endRound(livingFighters[0] || null);
          }
        }
      } else {
        io.emit("environment:hit", { point: hit.point.toArray(), normal: hit.face.normal.toArray() });
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`🚀 Server is running on http://localhost:${PORT}`),
);