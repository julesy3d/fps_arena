import express from "express";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";
import { Connection, clusterApiUrl, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TREASURY_WALLET_ADDRESS = new PublicKey(process.env.TREASURY_WALLET_ADDRESS);

let gamePhase = "LOBBY";
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let gameLoopIntervalId = null;
let roundTimerIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

const MAIN_COUNTDOWN_SECONDS = 30;
const OVERTIME_SECONDS = 10;
const ROUND_DURATION_SECONDS = 60;
const MIN_PLAYERS_TO_START = 4; // Set to 4 for production

const getContendersWithBets = () => Object.values(players).filter((p) => p.betAmount > 0);
const getTopFighterIds = () => getContendersWithBets().sort((a, b) => b.betAmount - a.betAmount || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0)).slice(0, MIN_PLAYERS_TO_START).map((p) => p.id);
const broadcastLobbyState = () => io.emit("lobby:state", players);
const broadcastLobbyCountdown = () => io.emit("lobby:countdown", lobbyCountdown);
const broadcastRoundTimer = () => io.emit("round:timer", roundTimer);

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
  const fighterIds = getTopFighterIds();
  activeFighterIds.clear();
  const finalFighters = [];

  // RULE CHANGE: The pot now includes ALL bets from everyone who participated.
  roundPot = Object.values(players).reduce((sum, player) => sum + player.betAmount, 0);

  for (const id of fighterIds) {
    const player = players[id];
    if (player) {
      activeFighterIds.add(player.id);
      finalFighters.push(player);
    }
  }

  // All bettors are considered to have played the round
  getContendersWithBets().forEach(p => {
    incrementPlayerStat(p.walletAddress, "total_games_played", 1);
    // Only non-fighters' bets are settled now as a loss. Fighters' bets are settled after the match.
    if (!activeFighterIds.has(p.id)) {
        incrementPlayerStat(p.walletAddress, "net_winnings", -p.betAmount);
    }
  });


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

const checkAndManageCountdown = (previousTopFighterIds = []) => {
  const contendersWithBets = getContendersWithBets();
  if (contendersWithBets.length < MIN_PLAYERS_TO_START) {
    stopLobbyCountdown();
  } else {
    if (!lobbyCountdownIntervalId) {
      startLobbyCountdown(MAIN_COUNTDOWN_SECONDS);
    } else {
      const currentTopFighterIds = getTopFighterIds();
      if (JSON.stringify(previousTopFighterIds) !== JSON.stringify(currentTopFighterIds)) {
        lobbyCountdown += OVERTIME_SECONDS;
      }
    }
  }
};

const endRound = (winner) => {
    if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
    if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
    gameLoopIntervalId = null;
    roundTimerIntervalId = null;
    roundTimer = null;

    gamePhase = "POST_ROUND";
    console.log(`Entering POST_ROUND. Winner: ${winner ? winner.name : 'None'}`);

    // RULE CHANGE: Calculate winner's earnings with 10% burn.
    const winnings = roundPot * 0.9;

    if (winner) {
      incrementPlayerStat(winner.walletAddress, "wins", 1);
      // Winner's net gain is the total pot (after burn) minus their own bet.
      const netGain = winnings - winner.betAmount;
      incrementPlayerStat(winner.walletAddress, "net_winnings", netGain);
    }

    const fighterIdsAtStart = new Set(activeFighterIds);
    fighterIdsAtStart.forEach((fighterId) => {
      const fighter = Object.values(players).find(p => p.id === fighterId);
      if (fighter && (!winner || fighter.id !== winner.id)) {
        incrementPlayerStat(fighter.walletAddress, "deaths", 1);
        // Losing fighters lose their bet amount from net_winnings
        incrementPlayerStat(fighter.walletAddress, "net_winnings", -fighter.betAmount);
      }
    });

    io.emit("game:phaseChange", {
      phase: "POST_ROUND",
      winnerData: { name: winner ? winner.name : "DRAW", pot: winnings }, // Send the final pot after burn.
    });

    setTimeout(async () => {
      console.log("Resetting to LOBBY phase...");
      gamePhase = "LOBBY";

      // On reset, re-fetch player stats to ensure they are up-to-date for the new lobby.
      for (const p of Object.values(players)) {
          const latestStats = await getPlayerStats(p.walletAddress);
          if (latestStats && players[p.id]) { // Check if player still exists
            players[p.id].betAmount = 0;
            players[p.id].isVerified = false;
            players[p.id].lastBetTimestamp = null;
            // Update stats after the round ends.
            players[p.id].stats = {
                kills: latestStats.kills,
                deaths: latestStats.deaths,
                wins: latestStats.wins,
                totalGamesPlayed: latestStats.total_games_played,
                netWinnings: latestStats.net_winnings
            };
          }
      }

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

  socket.on("player:joinWithWallet", async ({ walletAddress }) => {
    if (!walletAddress || Object.values(players).find(p => p.walletAddress === walletAddress)) return;

    const playerData = await getPlayerStats(walletAddress);
    if (!playerData) return;

    let playerName = playerData.username;
    if (!playerName || playerName === "Gladiator") {
        playerName = `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`;
    }

    players[socket.id] = {
      id: socket.id,
      walletAddress: walletAddress,
      name: playerName,
      role: "CONTENDER",
      isVerified: false,
      betAmount: 0,
      lastBetTimestamp: null,
      position: [0, 0, 0], rotation: [0, 0, 0, 1],
      // NEW: Pass all relevant stats to the client for the leaderboard
      stats: {
        kills: playerData.kills,
        deaths: playerData.deaths,
        wins: playerData.wins,
        totalGamesPlayed: playerData.total_games_played,
        netWinnings: playerData.net_winnings
      }
    };

    socket.emit("lobby:joined", { name: players[socket.id].name, isVerified: players[socket.id].isVerified });
    broadcastLobbyState();
  });

  socket.on("player:setName", (playerName) => {
    const player = players[socket.id];
    if (player) {
      player.name = playerName;
      updatePlayerStats(player.walletAddress, { username: playerName });
      broadcastLobbyState();
    }
  });

socket.on("player:verifyBet", async ({ serializedTx, amount }) => {
    const player = players[socket.id];
    if (!player) {
        return socket.emit("lobby:betFailed", "Player not found.");
    }

    const previousTopFighterIds = getTopFighterIds();

    try {
        console.log(`Verifying bet for ${player.walletAddress}`);
        const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));

        // Verify the transaction is signed by the correct player
        if (!tx.verifySignatures()) {
            throw new Error("Transaction signature verification failed.");
        }

        const instruction = tx.instructions[0];
        if (!instruction || !SystemProgram.programId.equals(instruction.programId)) {
            throw new Error("Invalid instruction program ID.");
        }

        // A simple way to decode transfer instruction data
        const decodedData = Buffer.from(instruction.data);
        const instructionType = decodedData.readUInt32LE(0);
        if (instructionType !== 2) throw new Error("Instruction is not a transfer.");

        const sentAmount = decodedData.readBigUInt64LE(4);
        if (BigInt(amount) !== sentAmount) {
            throw new Error(`Amount mismatch. Expected ${amount}, got ${sentAmount.toString()}`);
        }

        const fromKey = instruction.keys[0].pubkey;
        const toKey = instruction.keys[1].pubkey;

        if (fromKey.toBase58() !== player.walletAddress || !toKey.equals(TREASURY_WALLET_ADDRESS)) {
            throw new Error("Transaction sender or receiver is incorrect.");
        }

        // If all checks pass, send the transaction
        const signature = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(signature, 'processed');
        console.log(`✅ Bet verification successful for ${player.walletAddress}. Signature: ${signature}`);
        
        // --- OUR LOGIC STARTS HERE ---
        player.betAmount += amount;
        player.lastBetTimestamp = Date.now();
        player.isVerified = true;
        
        socket.emit("lobby:betVerified");
        broadcastLobbyState();
        checkAndManageCountdown(previousTopFighterIds);

    } catch (error) {
        console.error("Bet verification failed:", error);
        socket.emit("lobby:betFailed", `On-chain verification failed: ${error.message}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔥 A user disconnected:", socket.id);
    if (players[socket.id]) {
      removePlayerHitbox(socket.id);
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTopFighterIds());
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