import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { bettingService } from './bettingService.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ["http://localhost:3000", "https://txfhjhrt-3000.uks1.devtunnels.ms"], methods: ["GET", "POST"] } });

const PORT = 3001;
let players = {};

// Game State Variables
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let gameLoopIntervalId = null;
let activeFighters = [];
let roundTimerIntervalId = null;

const MAIN_COUNTDOWN_SECONDS = 30;
const OVERTIME_SECONDS = 10;
const ROUND_DURATION_SECONDS = 60;

// UTILITY & BROADCAST FUNCTIONS
const getContenders = () => Object.values(players).filter(p => p.role === 'CONTENDER');
const getTop4ContenderIds = () => getContenders().sort((a, b) => b.betAmount - a.betAmount || a.lastBetTimestamp - b.lastBetTimestamp).slice(0, 4).map(p => p.id);
const broadcastLobbyState = () => io.emit('lobby:state', players);
const broadcastLobbyCountdown = () => io.emit('lobby:countdown', lobbyCountdown);
const broadcastRoundTimer = () => io.emit('round:timer', roundTimer);

// LOBBY LOGIC
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
  const top4Ids = new Set(getTop4ContenderIds());
  let pot = 0;
  
  activeFighters = []; 
  
  for (const player of Object.values(players)) {
    if (top4Ids.has(player.id)) {
      pot += player.betAmount;
      activeFighters.push(player);
    } else if (player.role === 'CONTENDER') {
      console.log(`Burning ${player.betAmount} from ${player.name}`);
      player.betAmount = 0;
    }
  }

  io.emit('round:start', activeFighters);
  broadcastLobbyState();
  startGameRound(pot);
};

const startLobbyCountdown = (duration) => {
  stopLobbyCountdown();
  lobbyCountdown = duration;
  lobbyCountdownIntervalId = setInterval(() => {
    broadcastLobbyCountdown();
    if (lobbyCountdown > 0) lobbyCountdown--;
    else finalizeAuction();
  }, 1000);
};

const checkAndManageCountdown = (previousTop4Ids = []) => {
  const contenders = getContenders();
  if (contenders.length < 4) {
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
const endRound = (winner, pot) => {
  // 1. Stop all active timers for the round
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
  gameLoopIntervalId = null;
  roundTimerIntervalId = null;
  roundTimer = null;
  
  // 2. Announce the winner to the server console and all clients
  console.log(`Round over. Winner: ${winner.name}, Pot: ${pot}`);
  io.emit('round:end', { winner: winner.name, pot: pot });

  // 3. After a 5-second delay for the announcement, reset the lobby
  setTimeout(() => {
    console.log("Resetting lobby for the next round...");
    players = {}; 
    activeFighters = [];
    io.emit('lobby:reset'); // Tell all clients to reset their personal state
    checkAndManageCountdown(); // Check if a new auction should begin
  }, 5000); 
};

const startGameRound = (pot) => {
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);

  roundTimer = ROUND_DURATION_SECONDS;
  let tick = 0;
  
  activeFighters.forEach(fighter => {
    fighter.position = [Math.random() * 10 - 5, 0, Math.random() * 10 - 5];
    fighter.health = 3;
    fighter.input = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false };
  });

  roundTimerIntervalId = setInterval(() => {
    if (roundTimer > 0) {
      roundTimer--;
      broadcastRoundTimer();
    } else {
      clearInterval(roundTimerIntervalId);
      const winner = activeFighters[Math.floor(Math.random() * activeFighters.length)];
      endRound(winner, pot);
    }
  }, 1000);

  // The main game loop for physics and state updates
  gameLoopIntervalId = setInterval(() => {
    activeFighters.forEach(p => {
      const input = p.input;
      const moveDirection = { x: 0, z: 0 };
      if (input.moveForward) moveDirection.z -= 1;
      if (input.moveBackward) moveDirection.z += 1;
      if (input.moveLeft) moveDirection.x -= 1;
      if (input.moveRight) moveDirection.x += 1;

      if (moveDirection.x !== 0 || moveDirection.z !== 0) {
        p.position[0] += moveDirection.x * 5 * (1 / 20);
        p.position[2] += moveDirection.z * 5 * (1 / 20);
      }
    });
    
    io.emit('game:state', activeFighters.reduce((acc, p) => ({...acc, [p.id]: p}), {}));
  }, 1000 / 20);
};


// --- CONNECTION HANDLER ---
io.on('connection', (socket) => {
  console.log('✅ A ghost connected:', socket.id);
  
  socket.emit('lobby:state', players);
  socket.emit('lobby:countdown', lobbyCountdown);

  socket.on('player:enterLobby', async (amount) => {
    const MIN_BET = 1000;
    if (players[socket.id] || typeof amount !== 'number' || amount < MIN_BET) return;

    const success = await bettingService.payEntryFee(socket.id, amount);
    if (success) {
      players[socket.id] = { 
        id: socket.id, 
        name: `Contender-${socket.id.substring(0, 4)}`,
        role: 'CONTENDER',
        isVerified: true,
        betAmount: amount, 
        lastBetTimestamp: Date.now(),
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1]
      };
      
      socket.emit('lobby:entrySuccess');
      broadcastLobbyState();
      checkAndManageCountdown(getTop4ContenderIds());
    }
  });

  socket.on('player:join', (playerName) => {
    const player = players[socket.id];
    if (player && player.isVerified) {
      player.name = playerName;
      broadcastLobbyState();
    }
  });

  socket.on('player:placeBet', async (amount) => {
    const player = players[socket.id];
    if (player && player.role === 'CONTENDER') {
      const amountNum = parseInt(amount, 10);
      if (isNaN(amountNum) || amountNum <= 0) return;

      const previousTop4 = getTop4ContenderIds();
      const success = await bettingService.placeBet(player.id, amountNum);
      if (success) {
        player.betAmount += amountNum;
        broadcastLobbyState();
        checkAndManageCountdown(previousTop4);
      }
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(`❌ ${players[socket.id].name} disconnected.`);
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTop4ContenderIds());
    } else {
      console.log(`❌ A ghost disconnected: ${socket.id}`);
    }
  });

  socket.on('player:input', (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server is running on http://localhost:${PORT}`));