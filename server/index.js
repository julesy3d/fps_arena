// ============================================
// STEP 1: ADD DUEL STATE MACHINE
// This adds substates within IN_ROUND phase
// ============================================

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

let TREASURY_KEYPAIR;
try {
  const privateKeyBytes = bs58.decode(process.env.TREASURY_PRIVATE_KEY);
  TREASURY_KEYPAIR = Keypair.fromSecretKey(privateKeyBytes);
  console.log("✅ Treasury wallet loaded:", TREASURY_KEYPAIR.publicKey.toBase58());
} catch (error) {
  console.error("❌ Failed to load treasury private key:", error);
  process.exit(1);
}

// ============================================
// GAME STATE VARIABLES
// ============================================
let gamePhase = "LOBBY"; // Main phase: LOBBY | IN_ROUND | POST_ROUND
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let roundTimerIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

// NEW: Duel-specific state (substates of IN_ROUND)
let duelState = "WAITING"; // WAITING | ACTIVE | STANDOFF | FINISHED
let gongTime = null; // When GONG was sent
let duelTimerIntervalId = null;
let duelMaxDuration = 15000; // 15 seconds max after GONG

// NEW: Per-player duel data
// Structure: { [socketId]: { hasDrawn, barStartTime, shotTime, gongPing, isPickingUp, pickupStartTime } }
let duelData = {};

// ============================================
// CONSTANTS
// ============================================
const MAIN_COUNTDOWN_SECONDS = 1;
const OVERTIME_SECONDS = 10;
const MIN_PLAYERS_TO_START = 2;
const BAR_CYCLE_DURATION = 2000; // 2 seconds per cycle
const BAR_TARGET_MIN = 0.60; // 60% of bar
const BAR_TARGET_MAX = 0.80; // 80% of bar
const GUN_PICKUP_DURATION = 500; // 500ms to pick up dropped gun

// ============================================
// HELPER FUNCTIONS (unchanged)
// ============================================
const getContendersWithBets = () => Object.values(players).filter((p) => p.betAmount > 0);
const getTopFighterIds = () => getContendersWithBets().sort((a, b) => b.betAmount - a.betAmount || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0)).slice(0, MIN_PLAYERS_TO_START).map((p) => p.id);
const broadcastLobbyState = () => io.emit("lobby:state", players);
const broadcastLobbyCountdown = () => io.emit("lobby:countdown", lobbyCountdown);

const stopLobbyCountdown = () => {
  if (lobbyCountdownIntervalId) {
    clearInterval(lobbyCountdownIntervalId);
    lobbyCountdownIntervalId = null;
    lobbyCountdown = null;
    broadcastLobbyCountdown();
  }
};

// ============================================
// NEW: DUEL STATE MANAGEMENT FUNCTIONS
// ============================================

/**
 * Drops a player's gun (penalty for shooting too early/late)
 * They must wait 500ms before they can draw again
 */
const dropGun = (socketId) => {
  const playerDuelData = duelData[socketId];
  if (!playerDuelData) return;
  
  const player = players[socketId];
  console.log(`🔫💨 ${player?.name}'s gun drops to the ground`);
  
  // Mark as picking up (prevents spam clicking)
  playerDuelData.isPickingUp = true;
  playerDuelData.pickupStartTime = Date.now();
  playerDuelData.hasDrawn = false;
  playerDuelData.barStartTime = null;
  
  // Tell client their gun dropped
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit("duel:gunDropped");
  }
  
  // After 500ms, allow them to draw again
  setTimeout(() => {
    if (duelData[socketId]) { // Check they're still in duel
      duelData[socketId].isPickingUp = false;
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit("duel:canDrawAgain");
      }
      console.log(`🔫✅ ${player?.name} picked up their gun`);
    }
  }, GUN_PICKUP_DURATION);
};

/**
 * Starts the duel sequence after fighters are locked in
 * This is called from finalizeAuction()
 */
const startDuel = () => {
  console.log("🔫 Starting duel sequence...");
  
  // Reset duel state
  duelState = "WAITING";
  gongTime = null;
  duelData = {};
  
  // Initialize duel data for each fighter
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    duelData[id] = {
      hasDrawn: false,
      barStartTime: null,
      shotTime: null,
      gongPing: null, // Will be measured when they acknowledge GONG
      isPickingUp: false,
      pickupStartTime: null
    };
  });
  
  // Position fighters at fixed duel positions
  // Fighter 1 at (0, 0, -5), Fighter 2 at (0, 0, 5), facing each other
  fighterIds.forEach((id, index) => {
    const player = players[id];
    if (player) {
      player.position = [0, 0, index === 0 ? -5 : 5];
      player.rotation = index === 0 ? 0 : Math.PI; // Face each other
      player.health = 1; // Only need 1 HP for duel
    }
  });
  
  // Broadcast initial duel state to clients
  io.emit("duel:state", { 
    state: "WAITING", 
    fighters: fighterIds.map(id => players[id]) 
  });
  
  // Wait random time (5-8 seconds) for cinematic buildup, then send GONG
  const cinematicDelay = 5000 + Math.random() * 3000; // 5000ms to 8000ms
  console.log(`⏳ Cinematic delay: ${(cinematicDelay / 1000).toFixed(1)}s before GONG`);
  
  setTimeout(() => {
    sendGong();
  }, cinematicDelay);
};

/**
 * Sends the GONG signal to start the duel
 * Also starts measuring ping for fairness
 */
const sendGong = () => {
  console.log("🔔 GONG! Duel is ACTIVE");
  
  duelState = "ACTIVE";
  gongTime = Date.now();
  
  // Broadcast GONG to all fighters
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    const socket = io.sockets.sockets.get(id);
    if (socket) {
      // Send GONG with timestamp for ping measurement
      socket.emit("duel:gong", { timestamp: gongTime });
    }
  });
  
  // Start 15-second max duel timer
  duelTimerIntervalId = setTimeout(() => {
    console.log("⏱️ Duel timeout reached (15s)");
    endDuel("TIMEOUT");
  }, duelMaxDuration);
};

/**
 * Ends the duel and determines winner
 * @param {string} reason - "WINNER" | "TIMEOUT" | "DISCONNECT"
 */
const endDuel = (reason) => {
  console.log(`🏁 Duel ending: ${reason}`);
  
  // Clear duel timer
  if (duelTimerIntervalId) {
    clearTimeout(duelTimerIntervalId);
    duelTimerIntervalId = null;
  }
  
  duelState = "FINISHED";
  
  // Determine winner based on reason
  let winner = null;
  let isSplitPot = false;
  
  if (reason === "WINNER") {
    // Find the player who shot first
    const fighterIds = Array.from(activeFighterIds);
    const validShots = fighterIds
      .filter(id => duelData[id] && duelData[id].shotTime !== null)
      .map(id => ({ id, time: duelData[id].shotTime }))
      .sort((a, b) => a.time - b.time);
    
    if (validShots.length > 0) {
      winner = players[validShots[0].id];
      console.log(`🎯 Winner: ${winner.name}`);
    }
  } else if (reason === "TIMEOUT") {
    // It's a draw - split pot between both fighters
    console.log(`⏱️ Timeout! Both gunslingers survived - splitting pot`);
    isSplitPot = true;
  }
  
  // Call the existing endRound function with the winner (or null for split)
  endRound(winner, isSplitPot);
};

// ============================================
// MODIFIED: finalizeAuction now starts duel
// ============================================
const finalizeAuction = () => {
  stopLobbyCountdown();
  gamePhase = "IN_ROUND";
  const fighterIds = getTopFighterIds();
  activeFighterIds.clear();
  const finalFighters = [];

  roundPot = Object.values(players).reduce((sum, player) => sum + player.betAmount, 0);

  for (const id of fighterIds) {
    const player = players[id];
    if (player) {
      activeFighterIds.add(player.id);
      finalFighters.push(player);
    }
  }

  getContendersWithBets().forEach(p => {
    try {
      incrementPlayerStat(p.walletAddress, "total_games_played", 1);
      if (!activeFighterIds.has(p.id)) {
        incrementPlayerStat(p.walletAddress, "net_winnings", -p.betAmount);
      }
    } catch (error) {
      console.error(`Failed to update stats for ${p.walletAddress}:`, error);
    }
  });

  io.emit("game:phaseChange", { phase: "IN_ROUND", fighters: finalFighters });
  broadcastLobbyState();
  
  // NEW: Start duel instead of old game loop
  startDuel();
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

// ============================================
// EXISTING: endRound (MODIFIED to handle split pot)
// ============================================
const endRound = async (winner, isSplitPot = false) => {
    if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
    roundTimerIntervalId = null;
    roundTimer = null;

    gamePhase = "POST_ROUND";
    const roundId = `round_${Date.now()}`;
    console.log(`Entering POST_ROUND. Round ID: ${roundId}`);
    console.log(`Winner: ${winner ? winner.name : 'Split Pot'}`);

    const protocolFee = Math.floor(roundPot * 0.1);
    
    // Handle split pot differently
    if (isSplitPot) {
      const splitAmount = Math.floor((roundPot * 0.9) / 2); // 45% each
      console.log(`Protocol fee (10%): ${protocolFee} lamports`);
      console.log(`Split payout (45% each): ${splitAmount} lamports`);
      
      // Log protocol fee
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
      
      // Pay both fighters
      const fighterIds = Array.from(activeFighterIds);
      for (const fighterId of fighterIds) {
        const fighter = players[fighterId];
        if (!fighter || splitAmount <= 0) continue;
        
        let payoutTxId = null;
        try {
          payoutTxId = await logTransaction({
            round_id: roundId,
            transaction_type: 'payout_split',
            recipient_wallet: fighter.walletAddress,
            amount: splitAmount,
            status: 'pending'
          });

          const payoutTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: TREASURY_KEYPAIR.publicKey,
              toPubkey: new PublicKey(fighter.walletAddress),
              lamports: splitAmount,
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
          
          console.log(`💰 Paid ${splitAmount} lamports to ${fighter.name}: ${payoutSignature}`);
          
          // Update stats for split
          const netGain = splitAmount - fighter.betAmount;
          incrementPlayerStat(fighter.walletAddress, "net_winnings", netGain);
          
        } catch (error) {
          console.error(`❌ Split payout failed for ${fighter.name}:`, error);
          if (payoutTxId) {
            await updateTransaction(payoutTxId, {
              status: 'failed',
              error_message: error.message
            });
          }
        }
      }
      
      // Broadcast split pot result
      io.emit("game:phaseChange", {
        phase: "POST_ROUND",
        winnerData: { 
          name: "DRAW - POT SPLIT", 
          pot: splitAmount * 2,
          isSplit: true 
        },
      });
      
    } else {
      // Normal single winner flow
      const winnerPayout = Math.floor(roundPot * 0.9);
      console.log(`Protocol fee (10%): ${protocolFee} lamports`);
      console.log(`Winner payout (90%): ${winnerPayout} lamports`);

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
    }

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
      duelData = {}; // NEW: Clear duel data
      io.emit("game:phaseChange", { phase: "LOBBY" });
      broadcastLobbyState();
      checkAndManageCountdown();
    }, 10000);
};

// ============================================
// SOCKET EVENT HANDLERS
// ============================================
const betRequestTimestamps = new Map();
const BET_REQUEST_COOLDOWN = 3000;
const MIN_BET = 1000;
const MAX_BET = 1000000000;

io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);
  socket.emit("game:phaseChange", { phase: gamePhase });
  socket.emit("lobby:state", players);
  socket.emit("lobby:countdown", lobbyCountdown);

  // ============================================
  // EXISTING SOCKET HANDLERS (unchanged)
  // ============================================
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

  socket.on("player:requestBet", async ({ amount }) => {
    const player = players[socket.id];
    if (!player) {
      return socket.emit("lobby:betFailed", "Player not found.");
    }

    console.log(`\n========== BET REQUEST ==========`);
    console.log(`Player: ${player.name} (${player.walletAddress})`);
    console.log(`Amount: ${amount} lamports`);

    const lastRequest = betRequestTimestamps.get(socket.id) || 0;
    if (Date.now() - lastRequest < BET_REQUEST_COOLDOWN) {
      console.log(`❌ Rate limited`);
      return socket.emit("lobby:betFailed", "Please wait before placing another bet.");
    }
    betRequestTimestamps.set(socket.id, Date.now());

    if (amount < MIN_BET || amount > MAX_BET) {
      console.log(`❌ Invalid amount (min: ${MIN_BET}, max: ${MAX_BET})`);
      return socket.emit("lobby:betFailed", `Bet must be between ${MIN_BET} and ${MAX_BET} lamports.`);
    }

    try {
      const playerBalance = await connection.getBalance(new PublicKey(player.walletAddress));
      console.log(`Player balance: ${playerBalance} lamports`);
      
      if (playerBalance < amount + 5000) {
        console.log(`❌ Insufficient balance`);
        return socket.emit("lobby:betFailed", "Insufficient SOL balance for bet + fees");
      }

      console.log(`Creating transaction...`);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(player.walletAddress),
          toPubkey: TREASURY_WALLET_ADDRESS,
          lamports: amount,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      console.log(`Blockhash: ${blockhash}`);
      
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(player.walletAddress);

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
      
      const systemInstructions = tx.instructions.filter(instr => 
        SystemProgram.programId.equals(instr.programId)
      );
      
      if (systemInstructions.length === 0) {
        throw new Error("No SystemProgram transfer instruction found");
      }
      
      if (systemInstructions.length > 1) {
        throw new Error("Transaction contains multiple SystemProgram instructions");
      }
      
      const transferInstruction = systemInstructions[0];
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
      
      if (lamports !== amount) {
        throw new Error(`Amount mismatch: expected ${amount}, got ${lamports}`);
      }
      
      if (!fromPubkey.equals(new PublicKey(player.walletAddress))) {
        throw new Error("Wrong sender wallet");
      }
      
      if (!toPubkey.equals(TREASURY_WALLET_ADDRESS)) {
        throw new Error("Wrong recipient wallet");
      }

      console.log(`Sending transaction to Solana network...`);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`Transaction sent: ${signature}`);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`✅ Transaction confirmed!`);

      player.betAmount += amount;
      player.lastBetTimestamp = Date.now();
      
      socket.emit("lobby:betVerified", { signature });
      broadcastLobbyState();
      checkAndManageCountdown(previousTopFighterIds);

    } catch (error) {
      console.error(`\n❌ BET VERIFICATION FAILED:`, error);
      
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

  // ============================================
  // NEW: DUEL EVENT HANDLERS
  // ============================================
  
  /**
   * Client acknowledges receiving GONG
   * Used to measure ping for fairness
   */
  socket.on("duel:gongAck", () => {
    if (!duelData[socket.id]) return;
    
    const now = Date.now();
    const rtt = now - gongTime; // Round trip time
    duelData[socket.id].gongPing = rtt / 2; // One-way latency estimate
    
    console.log(`📡 ${players[socket.id]?.name} ping: ${duelData[socket.id].gongPing}ms`);
  });
  
  /**
   * Universal click handler for duel
   * Handles: pre-GONG penalty, draw, shoot
   */
  socket.on("duel:click", () => {
    const player = players[socket.id];
    if (!player || !activeFighterIds.has(socket.id)) return;
    
    const playerDuelData = duelData[socket.id];
    if (!playerDuelData) return;
    
    console.log(`🖱️ Click from ${player.name} | State: ${duelState} | HasDrawn: ${playerDuelData.hasDrawn}`);
    
    // ============================================
    // CASE 1: Clicked before GONG (too early!)
    // ============================================
    if (duelState === "WAITING") {
      console.log(`⚠️ ${player.name} clicked before GONG - gun drops`);
      dropGun(socket.id);
      return;
    }
    
    // ============================================
    // CASE 2: Clicked while picking up gun (spam protection)
    // ============================================
    if (playerDuelData.isPickingUp) {
      console.log(`⚠️ ${player.name} is still picking up gun`);
      return;
    }
    
    // ============================================
    // CASE 3: First click after GONG = DRAW
    // ============================================
    if (!playerDuelData.hasDrawn) {
      console.log(`🔫 ${player.name} DRAWS weapon`);
      
      playerDuelData.hasDrawn = true;
      playerDuelData.barStartTime = Date.now();
      
      // Tell this player their bar is starting
      socket.emit("duel:barStart", { startTime: playerDuelData.barStartTime });
      
      // Tell opponent that this player drew (for animation sync)
      const opponentId = Array.from(activeFighterIds).find(id => id !== socket.id);
      if (opponentId) {
        io.to(opponentId).emit("duel:opponentDrew", { playerId: socket.id });
      }
      
      return;
    }
    
    // ============================================
    // CASE 4: Second click = SHOOT
    // ============================================
    if (playerDuelData.hasDrawn && !playerDuelData.shotTime) {
      console.log(`💥 ${player.name} attempts to SHOOT`);
      
      const now = Date.now();
      const elapsed = now - playerDuelData.barStartTime;
      const cycles = elapsed / BAR_CYCLE_DURATION;
      const barPosition = cycles % 1; // 0.0 to 1.0
      
      console.log(`📊 Bar position: ${(barPosition * 100).toFixed(1)}% (target: ${BAR_TARGET_MIN * 100}-${BAR_TARGET_MAX * 100}%)`);
      
      // ============================================
      // CASE 4a: Shot in target zone = VALID SHOT
      // ============================================
      if (barPosition >= BAR_TARGET_MIN && barPosition <= BAR_TARGET_MAX) {
        console.log(`✅ VALID SHOT from ${player.name}`);
        
        // Apply ping compensation (subtract their ping from shot time)
        const pingCompensation = playerDuelData.gongPing || 0;
        const compensatedTime = now - pingCompensation;
        playerDuelData.shotTime = compensatedTime;
        
        console.log(`⏱️ Shot time: ${now}ms, Ping: ${pingCompensation}ms, Compensated: ${compensatedTime}ms`);
        
        // Broadcast that this player shot (for visual feedback)
        io.emit("duel:playerShot", { 
          playerId: socket.id, 
          hit: true 
        });
        
        // Check if both players have shot
        const fighterIds = Array.from(activeFighterIds);
        const bothShot = fighterIds.every(id => 
          duelData[id] && duelData[id].shotTime !== null
        );
        
        if (bothShot) {
          // Both shot - check timing for standoff
          const [p1Id, p2Id] = fighterIds;
          const time1 = duelData[p1Id].shotTime;
          const time2 = duelData[p2Id].shotTime;
          const timeDiff = Math.abs(time1 - time2);
          
          console.log(`⚔️ Both fighters shot! Time difference: ${timeDiff}ms`);
          
          if (timeDiff < 100) {
            // Too close to call - STANDOFF cinematic
            console.log(`🎬 STANDOFF! (shots within 100ms)`);
            duelState = "STANDOFF";
            io.emit("duel:standoff");
            
            // After 1.5 seconds, reveal winner
            setTimeout(() => {
              const winnerId = time1 < time2 ? p1Id : p2Id;
              players[winnerId === p1Id ? p2Id : p1Id].health = 0;
              console.log(`🎯 Standoff winner: ${players[winnerId].name}`);
              endDuel("WINNER");
            }, 1500);
          } else {
            // Clear winner - instant
            const winnerId = time1 < time2 ? p1Id : p2Id;
            const loserId = winnerId === p1Id ? p2Id : p1Id;
            players[loserId].health = 0;
            console.log(`🎯 Winner: ${players[winnerId].name} (faster by ${timeDiff}ms)`);
            endDuel("WINNER");
          }
        } else {
          // This player shot first, opponent hasn't shot yet
          // They're ahead, but opponent still has time
          console.log(`⏳ ${player.name} shot first, waiting for opponent...`);
        }
        
        return;
      }
      
      // ============================================
      // CASE 4b: Shot outside target zone = MISS (gun drops)
      // ============================================
      console.log(`❌ MISS from ${player.name} - outside target zone`);
      dropGun(socket.id);
      
      // Broadcast miss (for visual feedback)
      io.emit("duel:playerShot", { 
        playerId: socket.id, 
        hit: false 
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔥 A user disconnected:", socket.id);
    if (players[socket.id]) {
      removePlayerHitbox(socket.id);
      betRequestTimestamps.delete(socket.id);
      
      // NEW: Handle disconnect during duel
      if (duelState === "ACTIVE" && activeFighterIds.has(socket.id)) {
        console.log(`💀 Fighter ${players[socket.id].name} disconnected during duel`);
        players[socket.id].health = 0;
        
        // Check if other fighter should win
        const remainingFighters = Array.from(activeFighterIds).filter(id => 
          id !== socket.id && players[id] && players[id].health > 0
        );
        
        if (remainingFighters.length === 1) {
          console.log(`🎯 Opponent wins by disconnect`);
          endDuel("WINNER");
        }
      }
      
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTopFighterIds());
    }
  });
});

server.listen(PORT, () =>
  console.log(`🚀 Server is running on http://localhost:${PORT}`),
);