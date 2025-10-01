import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { bettingService } from './bettingService.js';
import { updatePlayerHitbox, removePlayerHitbox, performRaycast } from './physics.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ["http://localhost:3000", "https://txfhjhrt-3000.uks1.devtunnels.ms", "https://scaling-space-acorn-rrp7w7j9xwphwj47-3000.app.github.dev"], methods: ["GET", "POST"] } });

const PORT = 3001;
let players = {};

// --- Game State Variables ---
let gamePhase = 'LOBBY';
let lobbyCountdown = null;
let lobbyCountdownIntervalId = null;
let roundTimer = null;
let gameLoopIntervalId = null;
let roundTimerIntervalId = null;
let activeFighterIds = new Set();

const MAIN_COUNTDOWN_SECONDS = 1;
const OVERTIME_SECONDS = 10;
const ROUND_DURATION_SECONDS = 600; // Restored to 10 minutes

// --- UTILITY & BROADCAST FUNCTIONS ---
const getContenders = () => Object.values(players).filter(p => p.role === 'CONTENDER');
const getTop4ContenderIds = () => getContenders().sort((a, b) => b.betAmount - a.betAmount || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0)).slice(0, 2).map(p => p.id);
const broadcastLobbyState = () => io.emit('lobby:state', players);
const broadcastLobbyCountdown = () => io.emit('lobby:countdown', lobbyCountdown);
const broadcastRoundTimer = () => io.emit('round:timer', roundTimer);

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
  gamePhase = 'IN_ROUND'; // <-- Set state
  const top4Ids = getTop4ContenderIds();
  let pot = 0;
  activeFighterIds.clear();
  const finalFighters = [];

  for (const id of top4Ids) {
    const player = players[id];
    if (player) {
      pot += player.betAmount;
      activeFighterIds.add(player.id);
      finalFighters.push(player);
    }
  }
  for (const player of Object.values(players)) {
    if (!activeFighterIds.has(player.id) && player.role === 'CONTENDER') {
      player.betAmount = 0;
    }
  }

  // Use the new unified event
  io.emit('game:phaseChange', { phase: 'IN_ROUND', fighters: finalFighters });
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
const endRound = (winner, pot) => {
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
  gameLoopIntervalId = null;
  roundTimerIntervalId = null;
  roundTimer = null;
  
  gamePhase = 'POST_ROUND'; // <-- Set state
  console.log(`Entering POST_ROUND. Winner: ${winner.name}`);
  
  // Use the new unified event
  io.emit('game:phaseChange', { 
    phase: 'POST_ROUND',
    winnerData: { winner: winner.name, pot: pot }
  });

  setTimeout(() => {
    console.log("Resetting to LOBBY phase...");
    gamePhase = 'LOBBY';
    players = {}; 
    activeFighterIds.clear();
    
    // Announce the return to the lobby
    io.emit('game:phaseChange', { phase: 'LOBBY' });
    checkAndManageCountdown();
  }, 10000); 
};

const startGameRound = (pot) => {
  roundTimer = ROUND_DURATION_SECONDS;
  
  // Get fresh fighter objects using the IDs
  const currentFighters = Object.values(players).filter(p => activeFighterIds.has(p.id));
  currentFighters.forEach(fighter => {
    fighter.position = [Math.random() * 10 - 5, 0, Math.random() * 10 - 5];
    fighter.health = 3;
    fighter.input = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false };
  });

  roundTimerIntervalId = setInterval(() => {
    const currentFighters = Object.values(players).filter(p => activeFighterIds.has(p.id));
    if (roundTimer > 0) {
      roundTimer--;
      broadcastRoundTimer();
    } else {
      clearInterval(roundTimerIntervalId);
      const winner = currentFighters[Math.floor(Math.random() * currentFighters.length)];
      endRound(winner, pot);
    }
  }, 1000);

  gameLoopIntervalId = setInterval(() => {
    const currentFighters = Object.values(players).filter(p => activeFighterIds.has(p.id));

    currentFighters.forEach(p => {
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
      updatePlayerHitbox(p);
    });
    
    io.emit('game:state', currentFighters.reduce((acc, p) => ({...acc, [p.id]: p}), {}));
  }, 1000 / 20);
};

// --- CONNECTION HANDLER ---
io.on('connection', (socket) => {
  console.log('✅ A ghost connected:', socket.id);
  
  socket.emit('game:phaseChange', { phase: gamePhase });
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
      removePlayerHitbox(socket.id);
      delete players[socket.id];
      broadcastLobbyState();
      checkAndManageCountdown(getTop4ContenderIds());
    }
  });

  socket.on('player:input', (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
    }
  });

  socket.on('player:shoot', (shotData) => {
    const shooter = players[socket.id];
    if (!shooter || !activeFighterIds.has(shooter.id)) return;

    const hit = performRaycast(shooter, shotData);

    if (hit) {
      const hitObjectName = hit.object.name;
      const hitPlayer = players[hitObjectName];

      if (hitPlayer) {
        // --- NEW: HEALTH & DAMAGE LOGIC ---
        if (hitPlayer.health > 0) {
          hitPlayer.health -= 1;
          console.log(`💥 ${shooter.name} shot ${hitPlayer.name}! (${hitPlayer.health} HP remaining)`);
          
          io.emit('player:hit', {
            shooterId: shooter.id,
            victimId: hitPlayer.id,
            victimHealth: hitPlayer.health,
          });

          if (hitPlayer.health <= 0) {
            console.log(`💀 ${hitPlayer.name} has been eliminated by ${shooter.name}.`);
            activeFighterIds.delete(hitPlayer.id);
            io.emit('player:eliminated', { victimId: hitPlayer.id, eliminatorId: shooter.id });

            // Check for a winner
            if (activeFighterIds.size === 1) {
              const winnerId = activeFighterIds.values().next().value;
              const winner = players[winnerId];
              const pot = Array.from(activeFighterIds).reduce((acc, id) => acc + (players[id]?.betAmount || 0), 0);
              endRound(winner, pot);
            }
          }
        }
      } else {
        io.emit('environment:hit', { 
          point: hit.point.toArray(), 
          normal: hit.face.normal.toArray() 
        });
      }
    }
  }); 
});

server.listen(PORT, () => console.log(`🚀 Server is running on http://localhost:${PORT}`));