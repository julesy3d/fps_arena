/**
 * @file server.js
 * @description This file contains the server-side logic for a multiplayer FPS game.
 * It manages the game state, player connections, and real-time communication using Socket.IO,
 * following a "Coliseum" model where players cycle between spectating and fighting in rounds.
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const THREE = require('three');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration to allow connections from the client.
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- Game Constants ---

/** @description The different phases the game can be in, defining the current state of the game loop. */
const GAME_PHASE = {
  LOBBY: 'LOBBY',
  COUNTDOWN: 'COUNTDOWN',
  IN_ROUND: 'IN_ROUND',
  ROUND_OVER: 'ROUND_OVER'
};

/** @description The roles a player can have within the game. */
const PLAYER_ROLE = {
  CONTESTANT: 'CONTESTANT',
  SPECTATOR: 'SPECTATOR'
};

/** @description The maximum number of players who can be contestants in a round. */
const MAX_CONTESTANTS = 4;
/** @description The duration of the pre-round countdown in seconds. */
const COUNTDOWN_SECONDS = 5;
/** @description The delay in milliseconds before the game resets to the lobby after a round ends. */
const ROUND_END_DELAY_MS = 5000;

/** @description Pre-defined spawn points for contestants at the start of a round. */
const SPAWN_POINTS = [
    { position: [10, 1, 10], rotation: [0, -0.785, 0, 0.619] },
    { position: [-10, 1, 10], rotation: [0, -2.356, 0, 0.619] },
    { position: [10, 1, -10], rotation: [0, 0.785, 0, 0.619] },
    { position: [-10, 1, -10], rotation: [0, 2.356, 0, 0.619] },
];

// --- Game State ---

/**
 * @description The main object holding the entire current state of the game.
 * @property {string} phase - The current phase of the game (e.g., 'LOBBY', 'IN_ROUND').
 * @property {Object.<string, Object>} players - A dictionary of all connected player objects, keyed by their socket.id.
 * @property {string|null} roundWinner - The name of the winning player for the completed round.
 * @property {number} countdown - The current value of the pre-round countdown timer.
 */
let gameState = {
  phase: GAME_PHASE.LOBBY,
  players: {},
  roundWinner: null,
  countdown: COUNTDOWN_SECONDS,
};
/** @description Holds the timer interval for the round countdown. */
let roundCountdownTimer = null;

// --- Helper Functions ---

/**
 * @description Constructs a simplified version of the game state and broadcasts it to ALL connected clients.
 * This is the single source of truth for the client-side UI and game logic.
 */
const broadcastGameState = () => {
  const clientGameState = {
    phase: gameState.phase,
    roundWinner: gameState.roundWinner,
    countdown: gameState.countdown,
    contestants: Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT),
    spectators: Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.SPECTATOR),
  };
  io.emit('gameState', clientGameState);
};

/**
 * @description Creates a new player object with default values.
 * @param {string} socketId - The socket ID of the player.
 * @param {string} name - The initial name for the player.
 * @returns {Object} A new player object.
 */
const initializePlayer = (socketId, name) => ({
  id: socketId,
  name: name,
  hp: 3,
  role: PLAYER_ROLE.SPECTATOR, // All players start as spectators.
  isReady: false,
  position: [0, 1.7, 0],
  rotation: [0, 0, 0, 1],
});

/**
 * @description Resets the game to the LOBBY phase. This is called after a round ends.
 * It clears any running timers and resets all players to be spectators.
 */
const resetGame = () => {
    if (roundCountdownTimer) clearInterval(roundCountdownTimer);
    roundCountdownTimer = null;

    console.log("Returning to lobby.");
    gameState.phase = GAME_PHASE.LOBBY;
    gameState.roundWinner = null;
    gameState.countdown = COUNTDOWN_SECONDS;

    Object.values(gameState.players).forEach(p => {
        p.hp = 3;
        p.isReady = false;
        p.position = [0, 1.7, 0]; // Reset to a default lobby position.
        // Crucially, all players become spectators at the end of a round.
        p.role = PLAYER_ROLE.SPECTATOR;
    });
    broadcastGameState();
};

/**
 * @description Checks if the win condition (one or zero contestants left alive) has been met.
 * If so, it transitions the game to the ROUND_OVER phase and triggers the game reset timer.
 */
const checkWinCondition = () => {
    const activeContestants = Object.values(gameState.players)
        .filter(p => p.role === PLAYER_ROLE.CONTESTANT && p.hp > 0);

    if (activeContestants.length <= 1 && gameState.phase === GAME_PHASE.IN_ROUND) {
        gameState.phase = GAME_PHASE.ROUND_OVER;
        if (activeContestants.length === 1) {
            gameState.roundWinner = activeContestants[0].name;
            console.log(`Round over. Winner: ${gameState.roundWinner}`);
        } else {
            gameState.roundWinner = "Nobody"; // Draw or all defeated.
            console.log("Round over. No winner.");
        }
        broadcastGameState();

        // After a delay, reset the game back to the lobby.
        setTimeout(resetGame, ROUND_END_DELAY_MS);
    }
};

/**
 * @description Transitions the game to the IN_ROUND phase.
 * It teleports contestants to their spawn points and resets their stats.
 */
const startRound = () => {
  console.log("Starting a new round!");
  gameState.phase = GAME_PHASE.IN_ROUND;
  gameState.roundWinner = null;
  const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);

  // Assign spawn points and reset stats for each contestant.
  contestants.forEach((player, index) => {
    player.hp = 3;
    player.isReady = false; // Reset ready status for the next lobby phase.
    if (SPAWN_POINTS[index]) {
        player.position = SPAWN_POINTS[index].position;
        player.rotation = SPAWN_POINTS[index].rotation;
    }
  });

  // Any players who were not contestants become spectators for this round.
  Object.values(gameState.players).forEach(p => {
      if(p.role !== PLAYER_ROLE.CONTESTANT) {
          p.role = PLAYER_ROLE.SPECTATOR;
      }
  });

  broadcastGameState();
};

/**
 * @description Starts the pre-round countdown.
 * This function is called when enough players are ready.
 */
const startCountdown = () => {
    gameState.phase = GAME_PHASE.COUNTDOWN;
    gameState.countdown = COUNTDOWN_SECONDS;
    broadcastGameState();

    if (roundCountdownTimer) clearInterval(roundCountdownTimer);

    roundCountdownTimer = setInterval(() => {
        gameState.countdown -= 1;
        broadcastGameState();

        if (gameState.countdown <= 0) {
            clearInterval(roundCountdownTimer);
            roundCountdownTimer = null;
            startRound();
        }
    }, 1000);
}

/**
 * @description Checks if the conditions to start a round are met (max contestants, all are ready).
 * If they are, it triggers the countdown.
 */
const checkRoundStart = () => {
  if (gameState.phase !== GAME_PHASE.LOBBY) return;
  const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);
  if (contestants.length === MAX_CONTESTANTS && contestants.every(p => p.isReady)) {
    startCountdown();
  }
};

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Create a new player object with a default name and add it to the game state.
  const playerName = `Player_${socket.id.substring(0, 4)}`;
  gameState.players[socket.id] = initializePlayer(socket.id, playerName);

  // Send the initial game state to all clients.
  broadcastGameState();

  /**
   * @description Handles a client's request to set their name.
   * @param {Object} data - The data sent by the client.
   * @param {string} data.name - The desired name.
   */
  socket.on('setPlayerName', ({ name }) => {
    const player = gameState.players[socket.id];
    if (player && name) {
      player.name = name;
      console.log(`Player ${socket.id} set their name to: ${name}`);
      broadcastGameState();
    }
  });

  /**
   * @description Handles a contestant marking themselves as ready to play.
   */
  socket.on('playerReady', () => {
    const player = gameState.players[socket.id];
    if (player && player.role === PLAYER_ROLE.CONTESTANT && gameState.phase === GAME_PHASE.LOBBY) {
      player.isReady = true;
      console.log(`${player.name} is ready.`);
      broadcastGameState();
      checkRoundStart(); // Check if the round can now start.
    }
  });

  /**
   * @description Handles a spectator's request to become a contestant.
   */
  socket.on('playerWantsToPlay', () => {
    const player = gameState.players[socket.id];
    const contestants = Object.values(gameState.players).filter(p => p.role === PLAYER_ROLE.CONTESTANT);
    if (player && player.role === PLAYER_ROLE.SPECTATOR && contestants.length < MAX_CONTESTANTS) {
      player.role = PLAYER_ROLE.CONTESTANT;
      console.log(`${player.name} has become a contestant.`);
      broadcastGameState();
    }
  });

  /**
   * @description Handles receiving player movement data from a client.
   * @param {Object} playerData - The position and rotation data from the client.
   */
  socket.on('playerMove', (playerData) => {
    const player = gameState.players[socket.id];
    // Only process movement if the player is a contestant in an active round.
    if (player && gameState.phase === GAME_PHASE.IN_ROUND) {
      player.position = playerData.position;
      player.rotation = playerData.rotation;
      // Broadcast the movement to all other clients.
      socket.broadcast.emit('playerMoved', { id: player.id, position: player.position, rotation: player.rotation });
    }
  });

  /**
   * @description Handles a player shooting event. This is server-authoritative.
   * The server performs a raycast to determine if any other player was hit.
   */
  socket.on('playerShot', () => {
    const shooter = gameState.players[socket.id];
    // Validate that the shooter is an active contestant.
    if (!shooter || shooter.role !== PLAYER_ROLE.CONTESTANT || shooter.hp <= 0) return;

    // Create a raycaster from the shooter's camera position and direction.
    const raycaster = new THREE.Raycaster();
    const cameraPosition = new THREE.Vector3().fromArray(shooter.position);
    const cameraQuaternion = new THREE.Quaternion().fromArray(shooter.rotation);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
    raycaster.set(cameraPosition, direction);

    // Get a list of all other active contestants to check for hits.
    const potentialTargets = Object.values(gameState.players).filter(p => p.id !== socket.id && p.role === PLAYER_ROLE.CONTESTANT && p.hp > 0);

    let hitPlayer = null;
    let shortestDistance = Infinity;

    // Iterate through potential targets to find the closest hit.
    potentialTargets.forEach(target => {
        const targetBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3().fromArray(target.position),
            new THREE.Vector3(1, 1.8, 1) // A simplified player hitbox.
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

    // If a player was hit, reduce their HP and check for win conditions.
    if (hitPlayer) {
        console.log(`${shooter.name} hit ${hitPlayer.name}`);
        hitPlayer.hp -= 1;
        if (hitPlayer.hp <= 0) {
            console.log(`${hitPlayer.name} has been defeated.`);
            hitPlayer.role = PLAYER_ROLE.SPECTATOR; // A defeated player becomes a spectator.
        }
        broadcastGameState();
        checkWinCondition();
    }
  });

  /**
   * @description Handles a client disconnecting from the server.
   */
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const player = gameState.players[socket.id];
    if (!player) return;

    const wasContestant = player.role === PLAYER_ROLE.CONTESTANT;
    const wasInRound = gameState.phase === GAME_PHASE.IN_ROUND;
    const wasInCountdown = gameState.phase === GAME_PHASE.COUNTDOWN;

    // Remove the player from the game state.
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id); // Notify clients immediately to remove the player model.

    // If a contestant leaves during a countdown, cancel it and return to the lobby.
    if (wasContestant && wasInCountdown) {
        console.log("A contestant disconnected during countdown. Returning to lobby.");
        resetGame(); // This will clear the timer and reset the phase.
    } else if (wasInRound) {
        // If the disconnected player was in a round, check if the win condition is now met.
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