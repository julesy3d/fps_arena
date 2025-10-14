// ============================================
// CLEAN DUEL SYSTEM - SERVER AUTHORITY
// MVP: Simple, fair, server-controlled duels
// ============================================

import express from "express";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";
import { Connection, clusterApiUrl, PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
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
// GAME STATE
// ============================================
let gamePhase = "LOBBY";
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

// ============================================
// DUEL STATE - SYNCHRONIZED MULTI-ROUND
// ============================================
let duelState = "WAITING"; // WAITING | DRAW_PHASE | AIM_PHASE | FINISHED
let gongTime = null;
let duelTimerIntervalId = null;
let duelMaxDuration = 30000; // 30s for multi-round

// Round tracking
let currentRound = 1;
let synchronizedBarStartTime = null;

// Per-player duel data
let duelData = {}; // { [socketId]: { hasDrawn, drawTime, hasFired, shotResult, isPickingUpGun } }

// Bar configuration - gets faster each round
const getBarCycleDuration = (round) => {
  // --- Exponential Difficulty Curve ---
  const baseDuration = 2200; // The duration of Round 1 in ms.
  const speedFactor = 0.75;  // Each round will be 75% as long as the previous one.
  
  // Calculation: base * factor^(round-1)
  const duration = baseDuration * Math.pow(speedFactor, round - 1);
  
  // Set a minimum duration so it doesn't become impossible.
  const minimumDuration = 800; // "Hell Mode" cap.
  
  return Math.max(duration, minimumDuration);
};

const BAR_TARGET_MIN = 0.60;     // 60%
const BAR_TARGET_MAX = 0.80;     // 80%
const DRAW_WINDOW = 1500;        // 1.5s to draw after GONG

// ============================================
// CONSTANTS
// ============================================
const MAIN_COUNTDOWN_SECONDS = 1;
const OVERTIME_SECONDS = 10;
const MIN_PLAYERS_TO_START = 2;

// ============================================
// HELPER FUNCTIONS
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
// DUEL: START SEQUENCE
// ============================================
const startDuel = () => {
  console.log("🔫 Starting duel sequence...");
  
  duelState = "WAITING";
  gongTime = null;
  duelData = {};
  currentRound = 1;
  synchronizedBarStartTime = null;
  
  // Position fighters
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach((id, index) => {
    const player = players[id];
    if (player) {
      player.position = [0, 0, index === 0 ? -3 : 3];
      player.rotation = index === 0 ? 0 : Math.PI;
      player.health = 1;
    }
    
    // Initialize duel data
    duelData[id] = {
      hasDrawn: false,
      drawTime: null,
      hasFired: false,
      shotResult: null, // Will be 'hit', 'miss', or null
      isAI: false,
      aiShotAttempted: false,
      isReady: false,
    };
  });
  
  // Broadcast initial state
  io.emit("duel:state", { 
    state: "WAITING",
    fighters: fighterIds.map(id => ({
      id: players[id].id,
      name: players[id].name,
      position: players[id].position,
      rotation: players[id].rotation,
      health: players[id].health
    }))
  });
  
  // Random delay before GONG (5-8 seconds)
  const gongDelay = 5000 + Math.random() * 3000;
  console.log(`⏳ GONG in ${(gongDelay / 1000).toFixed(1)}s`);
  
};

// ============================================
// DUEL: SEND GONG (PHASE 1: DRAW) - ONCE!
// ============================================
const sendGong = () => {
  console.log(`🔔 GONG! - DRAW PHASE`);
  
  duelState = "DRAW_PHASE";
  gongTime = Date.now();
  
  // Tell all fighters
  io.emit("duel:gong", { 
    barCycleDuration: getBarCycleDuration(currentRound)
  });

  // ADDED: AI automatically draws after a short, realistic delay
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    if (duelData[id]?.isAI) {
      const aiDrawDelay = 200 + Math.random() * 300; // 200-500ms reaction
      setTimeout(() => {
        console.log(`🤖 AI ${players[id].name} is drawing...`);
        handleDraw(id);
      }, aiDrawDelay);
    }
  });
  
  // Start 30-second overall timeout
  duelTimerIntervalId = setTimeout(() => {
    console.log("⏱️ Duel timeout (30s)");
    endDuel("TIMEOUT");
  }, duelMaxDuration);
  
  // Check if both drew after 1.5s
  setTimeout(() => {
    checkIfBothDrewOrFailed();
  }, DRAW_WINDOW);
};

// ============================================
// DUEL: CHECK IF BOTH DREW (OR FAILED)
// ============================================
const checkIfBothDrewOrFailed = () => {
  if (duelState !== "DRAW_PHASE") return;
  
  const fighterIds = Array.from(activeFighterIds);
  const drawnFighters = fighterIds.filter(id => duelData[id]?.hasDrawn);
  const drewCount = drawnFighters.length;
  
  console.log(`📊 Draw phase ended: ${drewCount}/2 players drew`);
  
  if (drewCount === 2) {
    // Both drew successfully - start continuous shooting phase
    console.log("✅ Both players drew - starting continuous AIM PHASE");
    startAimPhase();
    
  } else if (drewCount === 1) {
    // One drew, one failed
    const drawerId = drawnFighters[0];
    const drawer = players[drawerId];
    const failedId = fighterIds.find(id => id !== drawerId);
    const failed = players[failedId];
    
    console.log(`⚠️ ${failed.name} failed to draw, ${drawer.name} has advantage`);
    
    // Drawer gets ONE shot to win
    // If they miss, advance to next round
    startAimPhase(); // But only drawer can shoot
    
    // Mark failed player as unable to shoot this round
    duelData[failedId].hasFired = true;
    duelData[failedId].shotResult = 'forfeit';
    
  } else {
    // Both failed to draw
    console.log(`❌ Both players failed to draw - advancing to Round ${currentRound + 1}`);
    io.emit("duel:bothFailedDraw");
    
    setTimeout(() => {
      advanceRoundAfterBothFail();
    }, 1000);
  }
};

// ============================================
// DUEL: ADVANCE ROUND (AFTER BOTH FAIL DRAW)
// ============================================
const advanceRoundAfterBothFail = () => {
  currentRound++;
  console.log(`⏭️ Advancing to round ${currentRound} after both failed draw`);
  
  // Reset states but DON'T send GONG again
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    if (duelData[id]) {
      duelData[id].hasDrawn = false;
      duelData[id].drawTime = null;
      duelData[id].hasFired = false;
      duelData[id].shotResult = null;
      duelData[id].aiShotAttempted = false;
    }
  });
  
  // Go back to draw phase (guns on ground, pick them up)
  duelState = "DRAW_PHASE";
  
  io.emit("duel:newRound", {
    round: currentRound,
    barCycleDuration: getBarCycleDuration(currentRound),
    message: "PICK UP YOUR GUNS!"
  });
  
  // Give them 1.5s to pick up guns
  setTimeout(() => {
    checkIfBothDrewOrFailed();
  }, DRAW_WINDOW);
};

// ============================================
// DUEL: START AIM PHASE (SYNCHRONIZED BAR)
// ============================================
const startAimPhase = () => {
  duelState = "AIM_PHASE";
  synchronizedBarStartTime = Date.now();
  
  console.log(`🎯 AIM PHASE - Round ${currentRound} (${getBarCycleDuration(currentRound)}ms cycle)`);
  
  // Tell clients aim phase started
  io.emit("duel:aimPhase", {
    startTime: synchronizedBarStartTime,
    barCycleDuration: getBarCycleDuration(currentRound)
  });
  
  // Start synchronized bar broadcasts
  startBarUpdateLoop();
};

// ============================================
// DUEL: BAR UPDATE LOOP (SYNCHRONIZED)
// ============================================
let barUpdateIntervalId = null;

const startBarUpdateLoop = () => {
  if (barUpdateIntervalId) {
    clearInterval(barUpdateIntervalId);
  }

  barUpdateIntervalId = setInterval(() => {
    if (duelState !== "AIM_PHASE" || !synchronizedBarStartTime) {
      clearInterval(barUpdateIntervalId);
      barUpdateIntervalId = null;
      return;
    }

    const now = Date.now();
    const elapsed = now - synchronizedBarStartTime;
    const cycleDuration = getBarCycleDuration(currentRound);
    const cycles = elapsed / cycleDuration;
    const position = cycles % 1;

    io.emit("duel:barUpdate", { position });

    const fighterIds = Array.from(activeFighterIds);

    // --- AI Shooting Logic ---
    fighterIds.forEach(id => {
      const playerData = duelData[id];
      if (playerData?.isAI && !playerData.hasFired && !playerData.aiShotAttempted) {
        // AI makes its one decision for the round as soon as the bar enters the target zone
        if (position >= BAR_TARGET_MIN) {
          playerData.aiShotAttempted = true; // Prevents re-rolling on subsequent frames

          if (Math.random() < 0.70) {
            // SUCCESS: Shoot now
            console.log(`🤖 AI ${players[id].name} is shooting...`);
            handleShoot(id);
          } else {
            // FAILURE: Do nothing. Let the auto-miss rule handle it.
            console.log(`🤖 AI ${players[id].name} decided to wait (will auto-miss).`);
          }
        }
      }
    });

    // --- Auto-Miss Logic ---
    if (position > BAR_TARGET_MAX) {
      fighterIds.forEach(id => {
        const playerData = duelData[id];
        if (playerData && !playerData.hasFired) {
          console.log(`⏰ ${players[id].name} auto-missed (too slow)`);
          playerData.hasFired = true;
          playerData.shotResult = 'miss';
          io.emit("duel:shot", { 
            shooterId: id, 
            hit: false, 
            autoMiss: true 
          });
        }
      });
    }

    // --- Round End Check ---
    const bothFired = fighterIds.every(id => duelData[id]?.hasFired);
    if (bothFired) {
      evaluateRoundResults();
    }

  }, 1000 / 60);
};

// ============================================
// DUEL: HANDLE DRAW
// ============================================
const handleDraw = (socketId) => {
  const player = players[socketId];
  const playerData = duelData[socketId];
  
  if (!player || !playerData || !activeFighterIds.has(socketId)) {
    return;
  }
  
  // Check if already drawn
  if (playerData.hasDrawn) {
    console.log(`⚠️ ${player.name} already has weapon drawn`);
    return;
  }
  
  // Check if picking up gun
  if (playerData.isPickingUpGun) {
    console.log(`⚠️ ${player.name} is picking up gun`);
    return;
  }
  
  // Check if before GONG
  if (duelState === "WAITING") {
    console.log(`💥 ${player.name} drew BEFORE gong - gun drops!`);
    return;
  }
  
  // Check if not in draw phase
  if (duelState !== "DRAW_PHASE") {
    console.log(`⚠️ ${player.name} tried to draw outside draw phase`);
    return;
  }
  
  // Valid draw!
  const now = Date.now();
  const drawTime = now - gongTime;
  
  console.log(`🔫 ${player.name} DRAWS weapon (${drawTime}ms after GONG)`);
  playerData.hasDrawn = true;
  playerData.drawTime = drawTime;
  
  // Tell this player
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit("duel:drawSuccess");
  }
  
  // Tell opponent
  const opponentId = Array.from(activeFighterIds).find(id => id !== socketId);
  if (opponentId) {
    const opponentSocket = io.sockets.sockets.get(opponentId);
    if (opponentSocket) {
      opponentSocket.emit("duel:opponentDrew", { playerId: socketId });
    }
  }
  
  // Check if both have drawn now
  const bothDrew = Array.from(activeFighterIds).every(id => duelData[id]?.hasDrawn);
  if (bothDrew) {
    console.log("✅ Both players drew - starting AIM PHASE");
    startAimPhase();
  }
};

// ============================================
// DUEL: HANDLE SHOOT
// ============================================
const handleShoot = (socketId) => {
  const player = players[socketId];
  const playerData = duelData[socketId];
  
  if (!player || !playerData || !activeFighterIds.has(socketId)) {
    return;
  }
  
  // Must have drawn first
  if (!playerData.hasDrawn) {
    console.log(`⚠️ ${player.name} tried to shoot without drawing`);
    return;
  }
  
  // Must be in aim phase
  if (duelState !== "AIM_PHASE") {
    console.log(`⚠️ ${player.name} tried to shoot outside aim phase`);
    return;
  }
  
  // Can't shoot while picking up gun
  if (playerData.isPickingUpGun) {
    console.log(`⚠️ ${player.name} tried to shoot while picking up gun`);
    return;
  }
  
  // Already fired this round
  if (playerData.hasFired) {
    console.log(`⚠️ ${player.name} already fired this round`);
    return;
  }
  
  // Calculate bar position RIGHT NOW from synchronized bar
  const now = Date.now();
  const elapsed = now - synchronizedBarStartTime;
  const cycleDuration = getBarCycleDuration(currentRound);
  const cycles = elapsed / cycleDuration;
  const barPosition = cycles % 1;
  
  // Check if in target zone
  const isHit = barPosition >= BAR_TARGET_MIN && barPosition <= BAR_TARGET_MAX;
  
  console.log(`💥 ${player.name} SHOOTS at ${(barPosition * 100).toFixed(1)}% - ${isHit ? 'HIT' : 'MISS'}`);
  
  // Record result
  playerData.hasFired = true;
  playerData.shotResult = isHit ? 'hit' : 'miss';
  
  // Broadcast shot
  io.emit("duel:shot", { 
    shooterId: socketId, 
    hit: isHit,
    barPosition 
  });
  
  // Check if both have fired
  const fighterIds = Array.from(activeFighterIds);
  const bothFired = fighterIds.every(id => duelData[id]?.hasFired);
  
  if (bothFired) {
    evaluateRoundResults();
  }
};

// ============================================
// DUEL: EVALUATE ROUND RESULTS
// ============================================
const evaluateRoundResults = () => {
  if (duelState !== "AIM_PHASE") return; // Prevent multiple evaluations
  console.log(`📊 Evaluating round ${currentRound} results...`);
  
  // Mark duel as temporarily paused during evaluation
  duelState = "EVALUATING";

  if (barUpdateIntervalId) {
    clearInterval(barUpdateIntervalId);
    barUpdateIntervalId = null;
  }

  const fighterIds = Array.from(activeFighterIds);
  const [p1Id, p2Id] = fighterIds;
  const p1Result = duelData[p1Id]?.shotResult;
  const p2Result = duelData[p2Id]?.shotResult;

  console.log(`  ${players[p1Id].name}: ${p1Result}`);
  console.log(`  ${players[p2Id].name}: ${p2Result}`);
  
  // CHANGED: Added comprehensive evaluation logic including forfeits
  let outcome = null;

  // Forfeit cases
  if (p1Result === 'forfeit') {
    outcome = (p2Result === 'hit') ? 'p2_wins' : 'advance';
  } else if (p2Result === 'forfeit') {
    outcome = (p1Result === 'hit') ? 'p1_wins' : 'advance';
  }
  // Normal cases
  else if (p1Result === 'hit' && p2Result === 'hit') outcome = 'dodge';
  else if (p1Result === 'hit' && p2Result === 'miss') outcome = 'p1_wins';
  else if (p1Result === 'miss' && p2Result === 'hit') outcome = 'p2_wins';
  else if (p1Result === 'miss' && p2Result === 'miss') outcome = 'advance_miss';

  // Execute outcome
  switch (outcome) {
    case 'p1_wins':
      console.log(`🎯 ${players[p1Id].name} WINS!`);
      players[p2Id].health = 0;
      endDuel("WINNER", players[p1Id]);
      break;
    case 'p2_wins':
      console.log(`🎯 ${players[p2Id].name} WINS!`);
      players[p1Id].health = 0;
      endDuel("WINNER", players[p2Id]);
      break;
    case 'dodge':
      console.log(`🤺 BOTH HIT - DODGE! Advancing to round ${currentRound + 1}`);
      io.emit("duel:bothHit", { round: currentRound });
      setTimeout(advanceRound, 1000);
      break;
    case 'advance_miss':
      console.log(`❌ BOTH MISS - Advancing to round ${currentRound + 1}`);
      io.emit("duel:bothMiss", { round: currentRound });
      setTimeout(advanceRound, 1000);
      break;
    case 'advance': // Covers forfeit/miss cases where no one scored
      console.log(`- No winner this round. Advancing to round ${currentRound + 1}`);
      io.emit("duel:bothMiss", { round: currentRound }); // Can reuse 'bothMiss' UI
      setTimeout(advanceRound, 1000);
      break;
  }
};

// ============================================
// DUEL: ADVANCE TO NEXT ROUND (SHOOTING CONTINUES)
// ============================================
const advanceRound = () => {
  currentRound++;
  console.log(`⏭️ Advancing to round ${currentRound} - BAR SPEEDS UP`);

  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    if (duelData[id]) {
      duelData[id].hasFired = false;
      duelData[id].shotResult = null;
      duelData[id].aiShotAttempted = false;
    }
  });

  io.emit("duel:newRound", {
    round: currentRound,
    barCycleDuration: getBarCycleDuration(currentRound),
    message: `ROUND ${currentRound}!`
  });

  // ADDED: Reset the bar timer for the new round and restart the loop
  duelState = "AIM_PHASE"; // Set state back to AIM
  synchronizedBarStartTime = Date.now();
  startBarUpdateLoop();
};

// ============================================
// DUEL: END
// ============================================
const endDuel = (reason, winner = null) => {
  console.log(`🏁 Duel ending: ${reason}`);
  
  // Clear timers
  if (duelTimerIntervalId) {
    clearTimeout(duelTimerIntervalId);
    duelTimerIntervalId = null;
  }
  if (barUpdateIntervalId) {
    clearInterval(barUpdateIntervalId);
    barUpdateIntervalId = null;
  }
  
  duelState = "FINISHED";
  
  // Determine payout
  let isSplit = false;
  
  if (reason === "TIMEOUT") {
    console.log("⏱️ Timeout - splitting pot");
    isSplit = true;
  }
  
  // Call existing endRound function
  endRound(winner, isSplit);
};

// ============================================
// EXISTING: finalizeAuction
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
    }
  }

  fighterIds.forEach((id, index) => {
    const player = players[id];
    if (player) {
      player.position = [0, 0, index === 0 ? -3 : 3];
      player.rotation = index === 0 ? 0 : Math.PI;
      player.health = 1;
      finalFighters.push(player);
    }
  });

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
  
  // Start duel
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
// EXISTING: endRound (unchanged)
// ============================================
const endRound = async (winner, isSplitPot = false) => {
    gamePhase = "POST_ROUND";
    const roundId = `round_${Date.now()}`;
    console.log(`Entering POST_ROUND. Round ID: ${roundId}`);
    console.log(`Winner: ${winner ? winner.name : 'Split Pot'}`);

    const protocolFee = Math.floor(roundPot * 0.1);
    
    if (isSplitPot) {
      const splitAmount = Math.floor((roundPot * 0.9) / 2);
      console.log(`Protocol fee (10%): ${protocolFee} lamports`);
      console.log(`Split payout (45% each): ${splitAmount} lamports`);
      
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
      
      io.emit("game:phaseChange", {
        phase: "POST_ROUND",
        winnerData: { 
          name: "DRAW - POT SPLIT", 
          pot: splitAmount * 2,
          isSplit: true 
        },
      });
      
    } else {
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
      duelData = {};
      io.emit("game:phaseChange", { phase: "LOBBY" });
      broadcastLobbyState();
      checkAndManageCountdown();
    }, 10000);
};

// ============================================
// SOCKET CONNECTION
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

  // ... [Keep all existing socket handlers for lobby/betting - unchanged] ...
  
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
  // DUEL SOCKET HANDLERS
  // ============================================
  
  socket.on("duel:draw", () => {
    handleDraw(socket.id);
  });
  
  socket.on("duel:shoot", () => {
    handleShoot(socket.id);
  });

  socket.on("duel:playerReady", () => {
    const playerId = socket.id;
    if (duelData[playerId]) {
      console.log(`✅ Player ${players[playerId].name} is ready.`);
      duelData[playerId].isReady = true;

      const fighterIds = Array.from(activeFighterIds);
      const allReady = fighterIds.every(id => duelData[id]?.isReady);

      // CRITICAL FIX: Check if all players are ready AND we are still in the "WAITING" state.
      if (allReady && duelState === 'WAITING') {
        // Immediately change the state to prevent this block from ever running again for this duel.
        duelState = 'CINEMATIC'; 
        
        console.log("🔥 All players are ready. Starting the duel cinematic.");
        io.emit("duel:bothReady");

        const gongDelay = 5000 + Math.random() * 3000;
        console.log(`⏳ GONG in ${(gongDelay / 1000).toFixed(1)}s`);
        setTimeout(() => {
          sendGong();
        }, gongDelay);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("🔥 A user disconnected:", socket.id);
    if (players[socket.id]) {
      // ... (other disconnect logic)
      
      // CHANGED: Correctly checks for active duel state
      if (
        (duelState === "DRAW_PHASE" || duelState === "AIM_PHASE") && 
        activeFighterIds.has(socket.id)
      ) {
        console.log(`💀 Fighter ${players[socket.id].name} disconnected during duel`);
        players[socket.id].health = 0;
        
        const remainingFighters = Array.from(activeFighterIds).filter(id => 
          id !== socket.id && players[id] // No health check needed, they are the only one left
        );
        
        if (remainingFighters.length === 1) {
          console.log(`🎯 Opponent wins by disconnect`);
          endDuel("WINNER", players[remainingFighters[0]]);
        }
      }
      
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTopFighterIds());
    }
  });

  // ADDED: Handler to activate AI mode for the opponent
  socket.on("duel:requestAIMode", () => {
    const requesterId = socket.id;

    if (duelData[requesterId]) {
      duelData[requesterId].isAI = true;
      console.log(`🤖 AI Mode activated for player: ${players[requesterId].name}`);
      
      const requesterSocket = io.sockets.sockets.get(requesterId);
      if (requesterSocket) {
        requesterSocket.emit("duel:aiModeConfirmed", { aiPlayerId: requesterId });
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`🚀 Server is running on http://localhost:${PORT}`),
);