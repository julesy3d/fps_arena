import express from "express";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";
import { Connection, clusterApiUrl, PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
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
  logTransaction,
  updateTransaction,
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

// Load treasury keypair from private key
let TREASURY_KEYPAIR;
try {
  const privateKeyBytes = bs58.decode(process.env.TREASURY_PRIVATE_KEY);
  TREASURY_KEYPAIR = Keypair.fromSecretKey(privateKeyBytes);
  console.log("✅ Treasury wallet loaded:", TREASURY_KEYPAIR.publicKey.toBase58());
} catch (error) {
  console.error("❌ Failed to load treasury private key:", error);
  process.exit(1);
}

let gamePhase = "LOBBY";
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let gameLoopIntervalId = null;
let roundTimerIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

const MAIN_COUNTDOWN_SECONDS = 1;
const OVERTIME_SECONDS = 10;
const ROUND_DURATION_SECONDS = 600;
const MIN_PLAYERS_TO_START = 2; // Set to 4 for production

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
    try {
      incrementPlayerStat(p.walletAddress, "total_games_played", 1);
      // Only non-fighters' bets are settled now as a loss. Fighters' bets are settled after the match.
      if (!activeFighterIds.has(p.id)) {
        incrementPlayerStat(p.walletAddress, "net_winnings", -p.betAmount);
      }
    } catch (error) {
      console.error(`Failed to update stats for ${p.walletAddress}:`, error);
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

const endRound = async (winner) => {
    if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
    if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
    gameLoopIntervalId = null;
    roundTimerIntervalId = null;
    roundTimer = null;

    gamePhase = "POST_ROUND";
    const roundId = `round_${Date.now()}`;
    console.log(`Entering POST_ROUND. Round ID: ${roundId}`);
    console.log(`Winner: ${winner ? winner.name : 'None'}`);

    const protocolFee = Math.floor(roundPot * 0.1);
    const winnerPayout = Math.floor(roundPot * 0.9);

    console.log(`Protocol fee (10%): ${protocolFee} lamports - retained in treasury`);
    console.log(`Winner payout (90%): ${winnerPayout} lamports`);

    // Log protocol fee retention
    try {
      await logTransaction({
        round_id: roundId,
        transaction_type: 'protocol_fee',
        recipient_wallet: TREASURY_KEYPAIR.publicKey.toBase58(),
        amount: protocolFee,
        status: 'confirmed',
        signature: 'N/A',
        confirmed_at: new Date()
      });
    } catch (error) {
      console.error("Failed to log protocol fee:", error);
    }

    // Pay winner 90%
    if (winner && winnerPayout > 0) {
      let payoutTxId = null;
      try {
        payoutTxId = await logTransaction({
          round_id: roundId,
          transaction_type: 'payout',
          recipient_wallet: winner.walletAddress,
          amount: winnerPayout,
          status: 'pending'
        });

        const payoutTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: TREASURY_KEYPAIR.publicKey,
            toPubkey: new PublicKey(winner.walletAddress),
            lamports: winnerPayout,
          })
        );
        
        const { blockhash: payoutBlockhash } = await connection.getLatestBlockhash();
        payoutTx.recentBlockhash = payoutBlockhash;
        payoutTx.feePayer = TREASURY_KEYPAIR.publicKey;
        payoutTx.sign(TREASURY_KEYPAIR);
        
        const payoutSignature = await connection.sendRawTransaction(payoutTx.serialize());
        await connection.confirmTransaction(payoutSignature, 'confirmed');
        
        if (payoutTxId) {
          await updateTransaction(payoutTxId, {
            status: 'confirmed',
            signature: payoutSignature,
            confirmed_at: new Date()
          });
        }
        
        console.log(`💰 Paid ${winnerPayout} lamports to ${winner.name}: ${payoutSignature}`);
      } catch (error) {
        console.error("❌ Payout transaction failed:", error);
        if (payoutTxId) {
          await updateTransaction(payoutTxId, {
            status: 'failed',
            error_message: error.message
          });
        }
      }
    }

    // Update database stats
    if (winner) {
      try {
        incrementPlayerStat(winner.walletAddress, "wins", 1);
        const netGain = winnerPayout - winner.betAmount;
        incrementPlayerStat(winner.walletAddress, "net_winnings", netGain);
      } catch (error) {
        console.error(`Failed to update winner stats:`, error);
      }
    }

    const fighterIdsAtStart = new Set(activeFighterIds);
    fighterIdsAtStart.forEach((fighterId) => {
      const fighter = Object.values(players).find(p => p.id === fighterId);
      if (fighter && (!winner || fighter.id !== winner.id)) {
        try {
          incrementPlayerStat(fighter.walletAddress, "deaths", 1);
          incrementPlayerStat(fighter.walletAddress, "net_winnings", -fighter.betAmount);
        } catch (error) {
          console.error(`Failed to update loser stats for ${fighter.walletAddress}:`, error);
        }
      }
    });

    io.emit("game:phaseChange", {
      phase: "POST_ROUND",
      winnerData: { name: winner ? winner.name : "DRAW", pot: winnerPayout },
    });

    setTimeout(async () => {
      console.log("Resetting to LOBBY phase...");
      gamePhase = "LOBBY";

      for (const p of Object.values(players)) {
        try {
          const latestStats = await getPlayerStats(p.walletAddress);
          if (latestStats && players[p.id]) {
            players[p.id].betAmount = 0;
            players[p.id].lastBetTimestamp = null;
            players[p.id].stats = {
              kills: latestStats.kills,
              deaths: latestStats.deaths,
              wins: latestStats.wins,
              totalGamesPlayed: latestStats.total_games_played,
              netWinnings: latestStats.net_winnings
            };
          }
        } catch (error) {
          console.error(`Failed to refresh stats for ${p.walletAddress}:`, error);
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
          const yaw = p.cameraRotation || 0;
          const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
          const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
          
          const moveDirection = { x: 0, z: 0 };
          
          if (input.moveForward) {
            moveDirection.x += forward.x;
            moveDirection.z += forward.z;
          }
          if (input.moveBackward) {
            moveDirection.x -= forward.x;
            moveDirection.z -= forward.z;
          }
          if (input.moveLeft) {
            moveDirection.x -= right.x;
            moveDirection.z -= right.z;
          }
          if (input.moveRight) {
            moveDirection.x += right.x;
            moveDirection.z += right.z;
          }

          const magnitude = Math.sqrt(moveDirection.x ** 2 + moveDirection.z ** 2);
          if (magnitude > 0) {
            moveDirection.x /= magnitude;
            moveDirection.z /= magnitude;
            
            p.position[0] += moveDirection.x * 5 * (1 / 60);
            p.position[2] += moveDirection.z * 5 * (1 / 60);
          }
          
          // Character always faces camera direction, not movement direction
          p.rotation = yaw + Math.PI;
        }
        updatePlayerHitbox(p);
      });
      io.emit("game:state", currentFighters.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}));
    }, 1000 / 60);
    };

// Rate limiting for bet requests
const betRequestTimestamps = new Map();
const BET_REQUEST_COOLDOWN = 3000; // 3 seconds between requests
const MIN_BET = 1000;
const MAX_BET = 1000000000; // 1 SOL in lamports

// --- MAIN CONNECTION HANDLER ---
io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);
  socket.emit("game:phaseChange", { phase: gamePhase });
  socket.emit("lobby:state", players);
  socket.emit("lobby:countdown", lobbyCountdown);

  socket.on("player:joinWithWallet", async ({ walletAddress }) => {
    if (!walletAddress || Object.values(players).find(p => p.walletAddress === walletAddress)) return;

    try {
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
        betAmount: 0,
        lastBetTimestamp: null,
        position: [0, 0, 0], 
        rotation: 0,
        stats: {
          kills: playerData.kills,
          deaths: playerData.deaths,
          wins: playerData.wins,
          totalGamesPlayed: playerData.total_games_played,
          netWinnings: playerData.net_winnings
        }
      };

      socket.emit("lobby:joined", { name: players[socket.id].name });
      broadcastLobbyState();
    } catch (error) {
      console.error(`Failed to join player ${walletAddress}:`, error);
    }
  });

  socket.on("player:setName", (playerName) => {
    const player = players[socket.id];
    if (player) {
      try {
        player.name = playerName;
        updatePlayerStats(player.walletAddress, { username: playerName });
        broadcastLobbyState();
      } catch (error) {
        console.error(`Failed to update player name:`, error);
      }
    }
  });

// Server creates the transaction
socket.on("player:requestBet", async ({ amount }) => {
  const player = players[socket.id];
  if (!player) {
    return socket.emit("lobby:betFailed", "Player not found.");
  }

  console.log(`\n========== BET REQUEST ==========`);
  console.log(`Player: ${player.name} (${player.walletAddress})`);
  console.log(`Amount: ${amount} lamports`);

  // Rate limiting
  const lastRequest = betRequestTimestamps.get(socket.id) || 0;
  if (Date.now() - lastRequest < BET_REQUEST_COOLDOWN) {
    console.log(`❌ Rate limited`);
    return socket.emit("lobby:betFailed", "Please wait before placing another bet.");
  }
  betRequestTimestamps.set(socket.id, Date.now());

  // Validate amount
  if (amount < MIN_BET || amount > MAX_BET) {
    console.log(`❌ Invalid amount (min: ${MIN_BET}, max: ${MAX_BET})`);
    return socket.emit("lobby:betFailed", `Bet must be between ${MIN_BET} and ${MAX_BET} lamports.`);
  }

  try {
    // Check player balance first
    const playerBalance = await connection.getBalance(new PublicKey(player.walletAddress));
    console.log(`Player balance: ${playerBalance} lamports`);
    
    if (playerBalance < amount + 5000) { // +5000 for transaction fee
      console.log(`❌ Insufficient balance (need ${amount + 5000}, have ${playerBalance})`);
      return socket.emit("lobby:betFailed", "Insufficient SOL balance for bet + fees");
    }

    // Create unsigned transaction
    console.log(`Creating transaction...`);
    console.log(`  From: ${player.walletAddress}`);
    console.log(`  To: ${TREASURY_WALLET_ADDRESS.toBase58()}`);
    console.log(`  Amount: ${amount} lamports`);
    
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(player.walletAddress),
        toPubkey: TREASURY_WALLET_ADDRESS,
        lamports: amount,
      })
    );

    // Get fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    console.log(`Blockhash: ${blockhash}`);
    
    tx.recentBlockhash = blockhash;
    tx.feePayer = new PublicKey(player.walletAddress);

    // Serialize without requiring signatures
    const serializedTx = tx.serialize({ 
      requireAllSignatures: false 
    }).toString('base64');

    console.log(`Transaction created, sending to client for signing`);
    console.log(`========== BET REQUEST COMPLETE ==========\n`);
    
    socket.emit("lobby:signatureRequest", { serializedTx, amount });
  } catch (error) {
    console.error(`❌ Error creating transaction:`, error);
    socket.emit("lobby:betFailed", "Failed to create transaction.");
  }
});

// Validate and broadcast the signed transaction
socket.on("player:submitSignedBet", async ({ serializedTx, amount }) => {
  const player = players[socket.id];
  if (!player) {
    return socket.emit("lobby:betFailed", "Player not found.");
  }

  console.log(`\n========== SIGNED BET SUBMISSION ==========`);
  console.log(`Player: ${player.name} (${player.walletAddress})`);
  console.log(`Amount: ${amount} lamports`);

  const previousTopFighterIds = getTopFighterIds();

  try {
    console.log(`Deserializing transaction...`);
    const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));
    
    console.log(`Transaction has ${tx.instructions.length} instructions`);
    
    console.log(`Validating transaction structure...`);
    
    // SECURITY: Find ALL SystemProgram instructions
    const systemInstructions = tx.instructions.filter(instr => 
      SystemProgram.programId.equals(instr.programId)
    );
    
    if (systemInstructions.length === 0) {
      console.log(`❌ No SystemProgram instructions found`);
      throw new Error("No SystemProgram transfer instruction found");
    }
    
    if (systemInstructions.length > 1) {
      console.log(`❌ SECURITY ALERT: Multiple SystemProgram instructions detected!`);
      console.log(`   This could be an attempt to add hidden transfers`);
      throw new Error("Transaction contains multiple SystemProgram instructions");
    }
    
    const transferInstruction = systemInstructions[0];
    console.log(`  Found exactly 1 SystemProgram instruction: OK`);

    // Manual decode: SystemProgram transfer format
    // Bytes 0-3: instruction type (2 = transfer)
    // Bytes 4-11: lamports (u64)
    const instructionData = transferInstruction.data;
    
    if (instructionData.length !== 12) {
      throw new Error("Invalid instruction data length");
    }
    
    const instructionType = instructionData.readUInt32LE(0);
    if (instructionType !== 2) {
      throw new Error("Not a transfer instruction");
    }
    
    const lamports = Number(instructionData.readBigUInt64LE(4));
    const fromPubkey = transferInstruction.keys[0].pubkey;
    const toPubkey = transferInstruction.keys[1].pubkey;
    
    console.log(`  Decoded transfer:`);
    console.log(`    From: ${fromPubkey.toBase58()}`);
    console.log(`    To: ${toPubkey.toBase58()}`);
    console.log(`    Amount: ${lamports}`);
    
    // Verify amounts and addresses
    if (lamports !== amount) {
      throw new Error(`Amount mismatch: expected ${amount}, got ${lamports}`);
    }
    console.log(`  Amount match: OK`);
    
    if (!fromPubkey.equals(new PublicKey(player.walletAddress))) {
      throw new Error("Wrong sender wallet");
    }
    console.log(`  Sender match: OK`);
    
    if (!toPubkey.equals(TREASURY_WALLET_ADDRESS)) {
      throw new Error("Wrong recipient wallet");
    }
    console.log(`  Recipient match: OK`);

    // Send transaction to Solana
    console.log(`Sending transaction to Solana network...`);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,  // Skip simulation, trust our validation
      preflightCommitment: 'confirmed'
    });
    
    console.log(`Transaction sent: ${signature}`);
    console.log(`Waiting for confirmation...`);

    // CRITICAL: Wait for confirmation before updating game state
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Transaction confirmed!`);

    // NOW it's safe to update game state
    player.betAmount += amount;
    player.lastBetTimestamp = Date.now();
    
    console.log(`Game state updated:`);
    console.log(`  Player total bet: ${player.betAmount}`);
    console.log(`========== SIGNED BET COMPLETE ==========\n`);
    
    socket.emit("lobby:betVerified", { signature });
    broadcastLobbyState();
    checkAndManageCountdown(previousTopFighterIds);

  } catch (error) {
    console.error(`\n❌ BET VERIFICATION FAILED:`);
    console.error(`   Error type: ${error.constructor.name}`);
    console.error(`   Error message: ${error.message}`);
    
    if (error.logs) {
      console.error(`   Simulation logs:`, error.logs);
    }
    console.error(`   Full error:`, error);
    console.error(`========== SIGNED BET FAILED ==========\n`);
    
    let errorMessage = "Transaction failed";
    if (error.message.includes("insufficient")) {
      errorMessage = "Insufficient SOL balance";
    } else if (error.message.includes("blockhash")) {
      errorMessage = "Transaction expired, please try again";
    } else if (error.message.includes("Amount mismatch")) {
      errorMessage = "Amount validation failed";
    } else if (error.message.includes("Wrong sender") || error.message.includes("Wrong recipient")) {
      errorMessage = "Invalid transaction addresses";
    } else if (error.message.includes("multiple SystemProgram")) {
      errorMessage = "Invalid transaction structure";
    } else {
      errorMessage = error.message;
    }
    
    socket.emit("lobby:betFailed", errorMessage);
  }
});
  socket.on("disconnect", () => {
    console.log("🔥 A user disconnected:", socket.id);
    if (players[socket.id]) {
      removePlayerHitbox(socket.id);
      betRequestTimestamps.delete(socket.id);
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTopFighterIds());
    }
  });

  socket.on("player:input", (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
      players[socket.id].cameraRotation = input.cameraYaw; // Add this line
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
          try {
            incrementPlayerStat(shooter.walletAddress, "kills", 1);
          } catch (error) {
            console.error("Failed to increment kill stat:", error);
          }
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