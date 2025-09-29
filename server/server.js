const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const THREE = require('three');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- Game Constants ---
const GAME_PHASE = {
  LOBBY: 'LOBBY',
  IN_ROUND: 'IN_ROUND',
  ROUND_OVER: 'ROUND_OVER'
};
const PLAYER_ROLE = {
  CONTESTANT: 'CONTESTANT',
  SPECTATOR: 'SPECTATOR'
};
const MAX_CONTESTANTS = 4;
const LOBBY_TIMEOUT_MS = 30000;
const ROUND_END_DELAY_MS = 5000;

const SPAWN_POINTS = [
    { position: [10, 1, 10], rotation: [0, -0.785, 0, 0.619] },
    { position: [-10, 1, 10], rotation: [0, -2.356, 0, 0.619] },
    { position: [10, 1, -10], rotation: [0, 0.785, 0, 0.619] },
    { position: [-10, 1, -10], rotation: [0, 2.356, 0, 0.619] },
];

// --- Game State ---
let gameState = {
  phase: GAME_PHASE.LOBBY,
  players: {},
  roundWinner: null,
};
let lobbyTimeout = null;

// --- Helper Functions ---
const broadcastGameState = () => {
  const clientGameState = {
    phase: gameState.phase,
    roundWinner: gameState.roundWinner,
    contestants: Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT),
    spectators: Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.SPECTATOR),
  };
  io.emit('gameState', clientGameState);
};

const initializePlayer = (socketId, name) => ({
  id: socketId,
  name: name,
  hp: 3,
  role: PLAYER_ROLE.SPECTATOR,
  isReady: false,
  position: [0, 1.7, 0],
  rotation: [0, 0, 0, 1],
});

const resetGame = () => {
    console.log("Returning to lobby.");
    gameState.phase = GAME_PHASE.LOBBY;
    gameState.roundWinner = null;
    Object.values(gameState.players).forEach(p => {
        p.hp = 3;
        p.isReady = false;
        p.position = [0, 1.7, 0]; // Reset to lobby position
        // Reset roles to spectator at the end of a round
        p.role = PLAYER_ROLE.SPECTATOR;
    });
    broadcastGameState();
};

const checkWinCondition = () => {
    const activeContestants = Object.values(gameState.players)
        .filter(p => p.role === PLAYER_ROLE.CONTESTANT && p.hp > 0);

    if (activeContestants.length <= 1) {
        gameState.phase = GAME_PHASE.ROUND_OVER;
        if (activeContestants.length === 1) {
            gameState.roundWinner = activeContestants[0].name;
            console.log(`Round over. Winner: ${gameState.roundWinner}`);
        } else {
            gameState.roundWinner = "Nobody"; // Draw or all defeated
            console.log("Round over. No winner.");
        }
        broadcastGameState();

        // After a delay, reset the game
        setTimeout(resetGame, ROUND_END_DELAY_MS);
    }
};


const startRound = () => {
  if (lobbyTimeout) clearTimeout(lobbyTimeout);
  lobbyTimeout = null;

  gameState.phase = GAME_PHASE.IN_ROUND;
  gameState.roundWinner = null;
  const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);

  contestants.forEach((player, index) => {
    player.hp = 3;
    player.isReady = false;
    if (SPAWN_POINTS[index]) {
        player.position = SPAWN_POINTS[index].position;
        player.rotation = SPAWN_POINTS[index].rotation;
    }
  });
  broadcastGameState();
};

const checkRoundStart = () => {
  if (gameState.phase !== GAME_PHASE.LOBBY) return;
  const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);
  if (contestants.length === MAX_CONTESTANTS && contestants.every(p => p.isReady)) {
    startRound();
  }
};

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Create a new player object and add it to the game state.
  const playerName = `Player_${socket.id.substring(0, 4)}`;
  gameState.players[socket.id] = initializePlayer(socket.id, playerName);
  gameState.players[socket.id].joinTime = Date.now();

  broadcastGameState();

  socket.on('playerReady', () => {
    const player = gameState.players[socket.id];
    if (player && player.role === PLAYER_ROLE.CONTESTANT) {
      player.isReady = true;
      broadcastGameState();
      checkRoundStart();
    }
  });

  socket.on('playerWantsToPlay', () => {
    const player = gameState.players[socket.id];
    const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);
    if (player && player.role === PLAYER_ROLE.SPECTATOR && contestants.length < MAX_CONTESTANTS) {
      player.role = PLAYER_ROLE.CONTESTANT;
      broadcastGameState();
    }
  });

  socket.on('playerWantsToSpectate', () => {
    const player = gameState.players[socket.id];
    if (player && player.role === PLAYER_ROLE.CONTESTANT) {
      player.role = PLAYER_ROLE.SPECTATOR;
      player.isReady = false; // Reset ready status
      broadcastGameState();
    }
  });

  socket.on('playerMove', (playerData) => {
    const player = gameState.players[socket.id];
    if (player && gameState.phase === GAME_PHASE.IN_ROUND) {
      player.position = playerData.position;
      player.rotation = playerData.rotation;
      socket.broadcast.emit('playerMoved', { id: player.id, position: player.position, rotation: player.rotation });
    }
  });

  socket.on('playerShot', () => {
    const shooter = gameState.players[socket.id];
    if (!shooter || shooter.role !== PLAYER_ROLE.CONTESTANT || shooter.hp <= 0) return;

    const raycaster = new THREE.Raycaster();
    const cameraPosition = new THREE.Vector3().fromArray(shooter.position);
    const cameraQuaternion = new THREE.Quaternion().fromArray(shooter.rotation);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
    raycaster.set(cameraPosition, direction);

    const potentialTargets = Object.values(gameState.players).filter(p => p.id !== socket.id && p.role === PLAYER_ROLE.CONTESTANT && p.hp > 0);

    let hitPlayer = null;
    let shortestDistance = Infinity;

    potentialTargets.forEach(target => {
        const targetBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3().fromArray(target.position),
            new THREE.Vector3(1, 1.8, 1) // Player hitbox
        );
        const intersection = raycaster.ray.intersectBox(targetBox, new THREE.Vector3());
        if (intersection) {
            const distance = cameraPosition.distanceTo(intersection);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                hitPlayer = target;
            }
        }
    });

    if (hitPlayer) {
        console.log(`${shooter.name} hit ${hitPlayer.name}`);
        hitPlayer.hp -= 1;
        if (hitPlayer.hp <= 0) {
            console.log(`${hitPlayer.name} has been defeated.`);
            hitPlayer.role = PLAYER_ROLE.SPECTATOR; // Transition to spectator
        }
        broadcastGameState();
        checkWinCondition();
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (!gameState.players[socket.id]) return;

    const wasContestant = gameState.players[socket.id].role === PLAYER_ROLE.CONTESTANT;
    const wasInRound = gameState.phase === GAME_PHASE.IN_ROUND;

    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id); // Notify clients immediately

    if (wasInRound) {
        checkWinCondition();
    }
    broadcastGameState();
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send(`<h1>FPS Arena Server</h1><p>Phase: ${gameState.phase}</p><p>Players: ${Object.keys(gameState.players).length}</p>`);
});