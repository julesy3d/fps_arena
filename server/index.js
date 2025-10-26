/**
 * @file index.js
 * @description Main server file for the PotShot.gg game.
 * This file sets up the Express server, Socket.IO connection, and handles all
 * server-authoritative game logic, including lobby management, betting, and duels.
 */

import express from "express";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";
import {
  getPlayerStats,
  updatePlayerStats,
  incrementPlayerStat,
  logTransaction,
  updateTransaction,
} from "./database.js";
import {
  verifyWalletSignature,
  generateChallengeMessage,
  isChallengeFresh,
} from './walletVerification.js';

const app = express();
app.use(express.json());
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL;

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://txfhjhrt-3000.uks1.devtunnels.ms",
      "https://scaling-space-acorn-rrp7w7j9xwphwj47-3000.app.github.dev",
      CLIENT_URL,
    ].filter(Boolean),
    methods: ["GET", "POST"],
  },
  transports: ['websocket'],
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  cookie: false,
  allowUpgrades: true,
});

const PORT = process.env.PORT || 3001;
let players = {};

// Track challenge messages per socket to prevent replay attacks
const socketChallenges = new Map(); // Map<socketId, { message: string, timestamp: number }>

// ============================================
// GAME STATE
// ============================================
let gamePhase = "LOBBY";
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let activeFighterIds = new Set();
let roundPot = 0;

// ============================================
// DUEL STATE
// ============================================
let duelState = "WAITING";
let gongTime = null;
let duelTimerIntervalId = null;
let duelMaxDuration = 30000;

let currentRound = 1;
let synchronizedBarStartTime = null;

let duelData = {};

/**
 * @function getBarCycleDuration
 * @description Calculates the duration of the shooting bar cycle for a given round.
 * The duration decreases exponentially with each round, making it harder.
 * @param {number} round - The current duel round number.
 * @returns {number} The duration of the bar cycle in milliseconds.
 */
const getBarCycleDuration = (round) => {
  const baseDuration = 2200;
  const speedFactor = 0.65;
  const duration = baseDuration * Math.pow(speedFactor, round - 1);
  const minimumDuration = 500;
  return Math.max(duration, minimumDuration);
};

const BAR_TARGET_MIN = 0.60;
const BAR_TARGET_MAX = 0.80;
const DRAW_WINDOW = 1500;

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

const checkInternalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).send('Unauthorized');
  }
  next();
};

app.post('/internal/confirm-bet', checkInternalAuth, (req, res) => {
  const { socketId, amount, walletAddress } = req.body;
  const player = players[socketId];

  if (player && player.walletAddress === walletAddress) {
    player.betAmount += amount;
    player.lastBetTimestamp = Date.now();
    broadcastLobbyState();
    checkAndManageCountdown();
    res.status(200).send({ message: 'Bet confirmed' });
  } else {
    res.status(404).send({ message: 'Player not found or wallet address mismatch' });
  }
});

app.post('/internal/log-transaction', checkInternalAuth, async (req, res) => {
  try {
    const { transactionData } = req.body;
    await logTransaction(transactionData);
    res.status(200).send({ message: 'Transaction logged' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to log transaction' });
  }
});
const broadcastLobbyCountdown = () => io.emit("lobby:countdown", lobbyCountdown);

const stopLobbyCountdown = () => {
  if (lobbyCountdownIntervalId) {
    clearInterval(lobbyCountdownIntervalId);
    lobbyCountdownIntervalId = null;
    lobbyCountdown = null;
    broadcastLobbyCountdown();
  }
};

/**
 * @function startDuel
 * @description Initializes the state for a new duel between the top two bidders.
 * Sets up player positions, health, and duel-specific data.
 */
const startDuel = () => {
  duelState = "WAITING";
  gongTime = null;
  duelData = {};
  currentRound = 1;
  synchronizedBarStartTime = null;
  
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach((id, index) => {
    const player = players[id];
    if (player) {
      player.position = [0, 0, index === 0 ? -3 : 3];
      player.rotation = index === 0 ? 0 : Math.PI;
      player.health = 1;
    }
    
    duelData[id] = {
      hasDrawn: false,
      drawTime: null,
      hasFired: false,
      shotResult: null,
      isAI: false,
      aiShotAttempted: false,
      isReady: false,
    };
  });
  
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
};

/**
 * @function sendGong
 * @description Initiates the aiming phase of the duel.
 * Emits the 'gong' event to clients and starts the synchronized bar update loop.
 */
const sendGong = () => {
  duelState = "AIM_PHASE";
  gongTime = Date.now();
  synchronizedBarStartTime = Date.now();
  
  const fighterIds = Array.from(activeFighterIds);
  fighterIds.forEach(id => {
    if (duelData[id]) {
      duelData[id].hasDrawn = true;
      duelData[id].drawTime = 0;
    }
  });
  
  io.emit("duel:gong", { 
    barCycleDuration: getBarCycleDuration(currentRound)
  });
  
  io.emit("duel:aimPhase", {
    startTime: synchronizedBarStartTime,
    barCycleDuration: getBarCycleDuration(currentRound)
  });
  
  fighterIds.forEach(id => {
    if (duelData[id]?.isAI) {
      const aiDrawDelay = 200 + Math.random() * 300;
      setTimeout(() => {
      }, aiDrawDelay);
    }
  });
  
  startBarUpdateLoop();
  
  if (duelTimerIntervalId) {
    clearTimeout(duelTimerIntervalId);
  }
  duelTimerIntervalId = setTimeout(() => {
    endDuel("TIMEOUT");
  }, duelMaxDuration);
};

let barUpdateIntervalId = null;

/**
 * @function startBarUpdateLoop
 * @description Starts a loop that broadcasts the synchronized position of the shooting bar to all clients.
 * Also handles AI shooting logic and auto-miss conditions.
 */
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

    fighterIds.forEach(id => {
      const playerData = duelData[id];
      if (playerData?.isAI && !playerData.hasFired && !playerData.aiShotAttempted) {
        if (position >= BAR_TARGET_MIN) {
          playerData.aiShotAttempted = true;

          if (Math.random() < 0.8) {
            handleShoot(id);
          } else {
          }
        }
      }
    });

    if (position > BAR_TARGET_MAX) {
      fighterIds.forEach(id => {
        const playerData = duelData[id];
        if (playerData && !playerData.hasFired) {
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

    const bothFired = fighterIds.every(id => duelData[id]?.hasFired);
    if (bothFired) {
      evaluateRoundResults();
    }

  }, 1000 / 60);
};

/**
 * @function handleShoot
 * @description Processes a 'shoot' action from a player.
 * Validates the shot, determines if it was a hit or miss, and broadcasts the result.
 * @param {string} socketId - The socket ID of the player who shot.
 */
const handleShoot = (socketId) => {
  const player = players[socketId];
  const playerData = duelData[socketId];
  
  if (!player || !playerData || !activeFighterIds.has(socketId)) {
    return;
  }
  
  if (!playerData.hasDrawn) {
    return;
  }
  
  if (duelState !== "AIM_PHASE") {
    return;
  }
  
  if (playerData.isPickingUpGun) {
    return;
  }
  
  if (playerData.hasFired) {
    return;
  }
  
  const now = Date.now();
  const elapsed = now - synchronizedBarStartTime;
  const cycleDuration = getBarCycleDuration(currentRound);
  const cycles = elapsed / cycleDuration;
  const barPosition = cycles % 1;
  
  const isHit = barPosition >= BAR_TARGET_MIN && barPosition <= BAR_TARGET_MAX;
  
  playerData.hasFired = true;
  playerData.shotResult = isHit ? 'hit' : 'miss';
  
  io.emit("duel:shot", { 
    shooterId: socketId, 
    hit: isHit,
    barPosition 
  });
  
  const fighterIds = Array.from(activeFighterIds);
  const bothFired = fighterIds.every(id => duelData[id]?.hasFired);
  
  if (bothFired) {
    evaluateRoundResults();
  }
};

/**
 * @function evaluateRoundResults
 * @description Evaluates the results of a duel round after both players have acted.
 * Determines the outcome (win, loss, dodge, miss) and triggers the next state.
 */
const evaluateRoundResults = () => {
  if (duelState !== "AIM_PHASE") return;
  duelState = "EVALUATING";

  if (barUpdateIntervalId) {
    clearInterval(barUpdateIntervalId);
    barUpdateIntervalId = null;
  }

  const fighterIds = Array.from(activeFighterIds);
  const [p1Id, p2Id] = fighterIds;
  const p1Result = duelData[p1Id]?.shotResult;
  const p2Result = duelData[p2Id]?.shotResult;
  
  let outcome = null;

  if (p1Result === 'forfeit') {
    outcome = (p2Result === 'hit') ? 'p2_wins' : 'advance';
  } else if (p2Result === 'forfeit') {
    outcome = (p1Result === 'hit') ? 'p1_wins' : 'advance';
  }
  else if (p1Result === 'hit' && p2Result === 'hit') {
    outcome = 'dodge';
  } else if (p1Result === 'hit' && p2Result === 'miss') {
    outcome = 'p1_wins';
  } else if (p1Result === 'miss' && p2Result === 'hit') {
    outcome = 'p2_wins';
  } else if (p1Result === 'miss' && p2Result === 'miss') {
    outcome = 'advance_miss';
  }

  switch (outcome) {
    case 'p1_wins':
      players[p2Id].health = 0;
      
      io.emit("duel:roundEnd", { 
        outcome: 'hit',
        winnerId: p1Id,
        loserId: p2Id,
        round: currentRound
      });
      
      setTimeout(() => endDuel("WINNER", players[p1Id]), 800);
      break;
      
    case 'p2_wins':
      players[p1Id].health = 0;
      
      io.emit("duel:roundEnd", { 
        outcome: 'hit',
        winnerId: p2Id,
        loserId: p1Id,
        round: currentRound
      });
      
      setTimeout(() => endDuel("WINNER", players[p2Id]), 800);
      break;
      
    case 'dodge':
      io.emit("duel:roundEnd", { 
        outcome: 'dodge',
        round: currentRound
      });
      
      setTimeout(advanceRound, 1200);
      break;
      
    case 'advance_miss':
      io.emit("duel:roundEnd", { 
        outcome: 'miss',
        round: currentRound
      });
      
      setTimeout(advanceRound, 1200);
      break;
      
    case 'advance':
      io.emit("duel:roundEnd", { 
        outcome: 'miss',
        round: currentRound
      });
      
      setTimeout(advanceRound, 1200);
      break;
  }
};

/**
 * @function advanceRound
 * @description Advances the duel to the next round.
 * Resets round-specific state and notifies clients.
 */
const advanceRound = () => {
  currentRound++;

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

  duelState = "AIM_PHASE";
  synchronizedBarStartTime = Date.now();
  startBarUpdateLoop();
};

/**
 * @function endDuel
 * @description Ends the current duel.
 * @param {string} reason - The reason the duel ended (e.g., "WINNER", "TIMEOUT").
 * @param {object|null} winner - The winning player object, if any.
 */
const endDuel = (reason, winner = null) => {
  if (duelTimerIntervalId) {
    clearTimeout(duelTimerIntervalId);
    duelTimerIntervalId = null;
  }
  if (barUpdateIntervalId) {
    clearInterval(barUpdateIntervalId);
    barUpdateIntervalId = null;
  }
  
  duelState = "FINISHED";
  synchronizedBarStartTime = null;
  
  let isSplit = false;
  
  if (reason === "TIMEOUT") {
    isSplit = true;
  }
  
  endRound(winner, isSplit);
};

/**
 * @function finalizeAuction
 * @description Finalizes the betting auction and starts the duel.
 * Calculates the total pot and sets the initial state for the duel.
 */
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
    }
  });

  io.emit("game:phaseChange", { 
    phase: "IN_ROUND", 
    fighters: finalFighters,
    roundPot: roundPot
  });
  
  broadcastLobbyState();
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

/**
 * @function endRound
 * @description Handles the end of a round, including payouts and state reset.
 * @param {object|null} winner - The winning player object.
 * @param {boolean} isSplitPot - Whether the pot should be split.
 */
const endRound = async (winner, isSplitPot = false) => {
    gamePhase = "POST_ROUND";
    const roundId = `round_${Date.now()}`;

    const protocolFee = Math.floor(roundPot * 0.1);
    
    if (isSplitPot) {
        const splitAmount = Math.floor((roundPot * 0.9) / 2);
        
        try {
            logTransaction({
                round_id: roundId,
                transaction_type: 'protocol_fee',
                recipient_wallet: 'TREASURY',
                amount: protocolFee,
                status: 'confirmed',
                signature: 'N/A',
                confirmed_at: new Date()
            });
        } catch (error) {
        }

        const fighterIds = Array.from(activeFighterIds);
        for (const fighterId of fighterIds) {
            const fighter = players[fighterId];
            if (!fighter || splitAmount <= 0) continue;

            fetch(`${process.env.VERCEL_API_URL}/api/payout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`
                },
                body: JSON.stringify({
                    winnerAddress: fighter.walletAddress,
                    amount: splitAmount
                })
            }).catch(error => console.error('Payout fetch error:', error));

            const netGain = splitAmount - fighter.betAmount;
            incrementPlayerStat(fighter.walletAddress, "net_winnings", netGain);
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

        try {
            logTransaction({
                round_id: roundId,
                transaction_type: 'protocol_fee',
                recipient_wallet: 'TREASURY',
                amount: protocolFee,
                status: 'confirmed',
                signature: 'N/A',
                confirmed_at: new Date()
            });
        } catch (error) {
        }

        if (winner && winnerPayout > 0) {
            fetch(`${process.env.VERCEL_API_URL}/api/payout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`
                },
                body: JSON.stringify({
                    winnerAddress: winner.walletAddress,
                    amount: winnerPayout
                })
            }).catch(error => console.error('Payout fetch error:', error));
        }

      if (winner) {
        try {
          incrementPlayerStat(winner.walletAddress, "wins", 1);
          const netGain = winnerPayout - winner.betAmount;
          incrementPlayerStat(winner.walletAddress, "net_winnings", netGain);
        } catch (error) {
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
          }
        }
      });

      io.emit("game:phaseChange", {
        phase: "POST_ROUND",
        winnerData: { name: winner ? winner.name : "DRAW", pot: winnerPayout },
      });
    }

    setTimeout(async () => {
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
        }
      }

      activeFighterIds.clear();
      duelData = {};
      io.emit("game:phaseChange", { phase: "LOBBY" });
      broadcastLobbyState();
      checkAndManageCountdown();
    }, 10000);
};

io.on("connection", (socket) => {
  socket.emit("game:phaseChange", { phase: gamePhase });
  socket.emit("lobby:state", players);
  socket.emit("lobby:countdown", lobbyCountdown);

socket.on("player:requestChallenge", () => {
  const message = generateChallengeMessage(socket.id);
  socketChallenges.set(socket.id, {
    message,
    timestamp: Date.now()
  });
  
  socket.emit("player:authChallenge", { message });
});

socket.on("player:joinWithWallet", async ({ walletAddress, signature, message }) => {
  try {
    // 1. Verify all required fields are present
    if (!walletAddress || !signature || !message) {
      return socket.emit("lobby:joinFailed", "Missing authentication data");
    }

    // 2. Check if this wallet is already connected
    if (Object.values(players).find(p => p.walletAddress === walletAddress)) {
      return socket.emit("lobby:joinFailed", "This wallet is already connected");
    }

    // 3. Verify the challenge exists and matches
    const challenge = socketChallenges.get(socket.id);
    if (!challenge || challenge.message !== message) {
      return socket.emit("lobby:joinFailed", "Invalid challenge");
    }

    // 4. Verify the challenge is fresh (not a replay attack)
    if (!isChallengeFresh(message)) {
      socketChallenges.delete(socket.id);
      return socket.emit("lobby:joinFailed", "Challenge expired");
    }

    // 5. Cryptographically verify the signature
    const isValid = verifyWalletSignature(walletAddress, signature, message);
    if (!isValid) {
      socketChallenges.delete(socket.id);
      return socket.emit("lobby:joinFailed", "Invalid wallet signature");
    }

    // 6. Clean up the used challenge
    socketChallenges.delete(socket.id);

    // 7. Signature verified! Now we can trust the wallet address
    const playerData = await getPlayerStats(walletAddress);
    if (!playerData) {
      return socket.emit("lobby:joinFailed", "Failed to fetch player data");
    }

    let playerName = playerData.username || "unknown player";

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
    console.error('Wallet authentication error:', error);
    socket.emit("lobby:joinFailed", "Authentication failed");
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
      }
    }
  });
  
  socket.on("duel:shoot", () => {
    handleShoot(socket.id);
  });

  socket.on("duel:playerReady", () => {
    const playerId = socket.id;
    if (duelData[playerId]) {
      duelData[playerId].isReady = true;

      const fighterIds = Array.from(activeFighterIds);
      const allReady = fighterIds.every(id => duelData[id]?.isReady);

      if (allReady && duelState === 'WAITING') {
        duelState = 'CINEMATIC'; 
        
        io.emit("duel:bothReady");

        const gongDelay = 27000 + Math.random() * 5000;
        setTimeout(() => {
          sendGong();
        }, gongDelay);
      }
    }
  });

  socket.on("disconnect", () => {
      
    socketChallenges.delete(socket.id);

    if (players[socket.id]) {
      
      if (
        (duelState === "DRAW_PHASE" || duelState === "AIM_PHASE") && 
        activeFighterIds.has(socket.id)
      ) {
        players[socket.id].health = 0;
        
        const remainingFighters = Array.from(activeFighterIds).filter(id => 
          id !== socket.id && players[id]
        );
        
        if (remainingFighters.length === 1) {
          endDuel("WINNER", players[remainingFighters[0]]);
        }
      }
      
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTopFighterIds());
    }
  });

  socket.on("duel:requestAIMode", () => {
    const requesterId = socket.id;

    if (duelData[requesterId]) {
      duelData[requesterId].isAI = true;
      
      const requesterSocket = io.sockets.sockets.get(requesterId);
      if (requesterSocket) {
        requesterSocket.emit("duel:aiModeConfirmed", { aiPlayerId: requesterId });
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  for (const [socketId, challenge] of socketChallenges.entries()) {
    if (now - challenge.timestamp > fiveMinutes) {
      socketChallenges.delete(socketId);
    }
  }
}, 5 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server listening on port ${PORT}`),
);
