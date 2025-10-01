import express from "express";
import http from "http";
import { Server } from "socket.io";
import { bettingService } from "./bettingService.js";
import {
  updatePlayerHitbox,
  removePlayerHitbox,
  performRaycast,
} from "./physics.js";

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

// --- Game State Variables ---
// This is the source of truth for the entire game's state.
// It determines whether players are in the lobby, fighting, or viewing results.
let gamePhase = "LOBBY"; // Can be 'LOBBY', 'IN_ROUND', 'POST_ROUND'

// Timers and intervals that control the flow of the game.
let lobbyCountdown = null; // The current countdown time in seconds for the auction.
let lobbyCountdownIntervalId = null; // The interval ID for the lobby countdown.
let roundTimer = null; // The current countdown time in seconds for the game round.
let gameLoopIntervalId = null; // The main game loop for physics and state updates (20tps).
let roundTimerIntervalId = null; // The interval ID for the round timer.

// A Set containing the socket IDs of the players currently in the fight.
let activeFighterIds = new Set();

// --- Game Constants ---
const MAIN_COUNTDOWN_SECONDS = 1; // The initial duration of the lobby auction countdown.
const OVERTIME_SECONDS = 10; // Time added to the auction when a new top bidder emerges.
const ROUND_DURATION_SECONDS = 60; // 60 seconds for a standard round

// --- UTILITY & BROADCAST FUNCTIONS ---
// These functions help manage and communicate the game state to all clients.

/**
 * Filters the global players object to get only active contenders.
 * @returns {Array<Object>} An array of player objects with the 'CONTENDER' role.
 */
const getContenders = () =>
  Object.values(players).filter((p) => p.role === "CONTENDER");

/**
 * Gets the IDs of the top 4 contenders based on their bet amount and timestamp.
 * NOTE: This is currently configured for 2 players for testing purposes.
 * @returns {Array<string>} An array of the top 4 player IDs.
 */
const getTop4ContenderIds = () =>
  getContenders()
    .sort(
      (a, b) =>
        b.betAmount - a.betAmount ||
        (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0),
    )
    .slice(0, 2)
    .map((p) => p.id);

/**
 * Broadcasts the current list of all players to all connected clients.
 */
const broadcastLobbyState = () => io.emit("lobby:state", players);

/**
 * Broadcasts the current lobby countdown time to all clients.
 */
const broadcastLobbyCountdown = () =>
  io.emit("lobby:countdown", lobbyCountdown);

/**
 * Broadcasts the current round timer to all clients.
 */
const broadcastRoundTimer = () => io.emit("round:timer", roundTimer);

// --- LOBBY LOGIC ---
// Manages the pre-game auction phase.

/**
 * Stops the lobby countdown timer and clears the interval.
 */
const stopLobbyCountdown = () => {
  if (lobbyCountdownIntervalId) {
    clearInterval(lobbyCountdownIntervalId);
    lobbyCountdownIntervalId = null;
    lobbyCountdown = null;
    broadcastLobbyCountdown(); // Notify clients that the countdown has stopped.
  }
};

/**
 * Finalizes the auction, transitions the game to the 'IN_ROUND' phase,
 * and sets up the fighters for the match.
 */
const finalizeAuction = () => {
  stopLobbyCountdown();
  gamePhase = "IN_ROUND"; // <-- Critical state change
  const top4Ids = getTop4ContenderIds();
  let pot = 0;
  activeFighterIds.clear();
  const finalFighters = [];

  // Populate the fighters list and calculate the prize pot.
  for (const id of top4Ids) {
    const player = players[id];
    if (player) {
      pot += player.betAmount;
      activeFighterIds.add(player.id);
      finalFighters.push(player);
    }
  }
  // Reset the bet amount for non-fighters.
  for (const player of Object.values(players)) {
    if (!activeFighterIds.has(player.id) && player.role === "CONTENDER") {
      player.betAmount = 0;
    }
  }

  // Announce the start of the round to all clients.
  io.emit("game:phaseChange", { phase: "IN_ROUND", fighters: finalFighters });
  broadcastLobbyState(); // Update player states (e.g., cleared bets).
  startGameRound(pot); // Begin the game round.
};

/**
 * Starts or restarts the lobby countdown.
 * @param {number} duration - The duration of the countdown in seconds.
 */
const startLobbyCountdown = (duration) => {
  stopLobbyCountdown(); // Ensure no other countdown is running.
  lobbyCountdown = duration;
  lobbyCountdownIntervalId = setInterval(() => {
    broadcastLobbyCountdown();
    if (lobbyCountdown > 0) {
      lobbyCountdown--;
    } else {
      finalizeAuction(); // Time's up, finalize the auction.
    }
  }, 1000);
};

/**
 * Checks the state of the lobby and manages the countdown timer accordingly.
 * It starts, stops, or adds overtime based on player activity.
 * @param {Array<string>} [previousTop4Ids=[]] - The list of top 4 IDs from before the latest change.
 */
const checkAndManageCountdown = (previousTop4Ids = []) => {
  const contenders = getContenders();
  // The countdown only runs if there are enough contenders (2 for testing).
  if (contenders.length < 2) {
    stopLobbyCountdown();
  } else {
    if (!lobbyCountdownIntervalId) {
      // If no countdown is active, start a new one.
      startLobbyCountdown(MAIN_COUNTDOWN_SECONDS);
    } else {
      // If a countdown is active, check if the top bidders have changed.
      const currentTop4Ids = getTop4ContenderIds();
      if (JSON.stringify(previousTop4Ids) !== JSON.stringify(currentTop4Ids)) {
        lobbyCountdown += OVERTIME_SECONDS; // Add overtime if the top 4 changed.
      }
    }
  }
};

// --- GAME ROUND LOGIC ---
// Manages the 'IN_ROUND' and 'POST_ROUND' phases.

/**
 * Ends the current game round, declares a winner, and transitions to 'POST_ROUND'.
 * @param {Object} winner - The winning player object.
 * @param {number} pot - The total prize pot.
 */
const endRound = (winner, pot) => {
  // Stop all game-related timers and loops.
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  if (roundTimerIntervalId) clearInterval(roundTimerIntervalId);
  gameLoopIntervalId = null;
  roundTimerIntervalId = null;
  roundTimer = null;

  gamePhase = "POST_ROUND"; // <-- Critical state change
  console.log(`Entering POST_ROUND. Winner: ${winner.name}`);

  // Announce the winner and the end of the round.
  io.emit("game:phaseChange", {
    phase: "POST_ROUND",
    winnerData: { winner: winner.name, pot: pot },
  });

  // After a 10-second celebration, reset the game back to the lobby.
  setTimeout(() => {
    console.log("Resetting to LOBBY phase...");
    gamePhase = "LOBBY"; // <-- Critical state change
    players = {}; // Clear all player data for the new round.
    activeFighterIds.clear();

    // Announce the return to the lobby.
    io.emit("game:phaseChange", { phase: "LOBBY" });
    checkAndManageCountdown(); // Check if a new countdown should start.
  }, 10000);
};

/**
 * Initializes and starts the main game round.
 * @param {number} pot - The prize pot for the round.
 */
const startGameRound = (pot) => {
  roundTimer = ROUND_DURATION_SECONDS;

  // Initialize health, position, and inputs for all fighters.
  const currentFighters = Object.values(players).filter((p) =>
    activeFighterIds.has(p.id),
  );
  currentFighters.forEach((fighter) => {
    fighter.position = [Math.random() * 10 - 5, 0, Math.random() * 10 - 5]; // Random spawn point
    fighter.health = 3;
    fighter.input = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
    };
  });

  // Low-frequency timer for the round countdown (1tps).
  roundTimerIntervalId = setInterval(() => {
    const currentFighters = Object.values(players).filter((p) =>
      activeFighterIds.has(p.id),
    );
    if (roundTimer > 0) {
      roundTimer--;
      broadcastRoundTimer();
    } else {
      // If the timer runs out, end the round and pick a random winner from survivors.
      clearInterval(roundTimerIntervalId);
      const winner =
        currentFighters[Math.floor(Math.random() * currentFighters.length)];
      endRound(winner, pot);
    }
  }, 1000);

  // High-frequency game loop for player movement and state updates (20tps).
  gameLoopIntervalId = setInterval(() => {
    const currentFighters = Object.values(players).filter((p) =>
      activeFighterIds.has(p.id),
    );

    // Process inputs and update player positions.
    currentFighters.forEach((p) => {
      const input = p.input;
      const moveDirection = { x: 0, z: 0 };
      if (input.moveForward) moveDirection.z -= 1;
      if (input.moveBackward) moveDirection.z += 1;
      if (input.moveLeft) moveDirection.x -= 1;
      if (input.moveRight) moveDirection.x += 1;

      // Update position based on input and a fixed tick rate.
      if (moveDirection.x !== 0 || moveDirection.z !== 0) {
        p.position[0] += moveDirection.x * 5 * (1 / 20);
        p.position[2] += moveDirection.z * 5 * (1 / 20);
      }
      updatePlayerHitbox(p); // Update hitbox in the physics engine.
    });

    // Broadcast the updated state of all fighters to all clients.
    io.emit(
      "game:state",
      currentFighters.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
    );
  }, 1000 / 20);
};

// --- MAIN CONNECTION HANDLER ---
// This is the entry point for all client connections and defines all event listeners.
io.on("connection", (socket) => {
  console.log("✅ A ghost connected:", socket.id);

  // When a new client connects, send them the current game state.
  socket.emit("game:phaseChange", { phase: gamePhase });
  socket.emit("lobby:state", players);
  socket.emit("lobby:countdown", lobbyCountdown);

  /**
   * Handles a player's request to enter the lobby by paying an entry fee.
   */
  socket.on("player:enterLobby", async (amount) => {
    const MIN_BET = 1000;
    // Prevent re-entry or invalid bets.
    if (players[socket.id] || typeof amount !== "number" || amount < MIN_BET)
      return;

    // Use the betting service to process the payment.
    const success = await bettingService.payEntryFee(socket.id, amount);
    if (success) {
      // If successful, create the player object.
      players[socket.id] = {
        id: socket.id,
        name: `Contender-${socket.id.substring(0, 4)}`, // Default name
        role: "CONTENDER",
        isVerified: true,
        betAmount: amount,
        lastBetTimestamp: Date.now(),
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      };

      socket.emit("lobby:entrySuccess"); // Notify the client of success.
      broadcastLobbyState(); // Update everyone.
      checkAndManageCountdown(getTop4ContenderIds()); // Potentially start the countdown.
    }
  });

  /**
   * Handles a player setting their name after entering the lobby.
   */
  socket.on("player:join", (playerName) => {
    const player = players[socket.id];
    if (player && player.isVerified) {
      player.name = playerName;
      broadcastLobbyState();
    }
  });

  /**
   * Handles a player placing an additional bet to improve their rank.
   */
  socket.on("player:placeBet", async (amount) => {
    const player = players[socket.id];
    if (player && player.role === "CONTENDER") {
      const amountNum = parseInt(amount, 10);
      if (isNaN(amountNum) || amountNum <= 0) return;

      const previousTop4 = getTop4ContenderIds(); // Check if this bet changes the top 4.
      const success = await bettingService.placeBet(player.id, amountNum);
      if (success) {
        player.betAmount += amountNum;
        broadcastLobbyState();
        checkAndManageCountdown(previousTop4); // Potentially add overtime.
      }
    }
  });

  /**
   * Handles client disconnection.
   */
  socket.on("disconnect", () => {
    if (players[socket.id]) {
      removePlayerHitbox(socket.id); // Clean up physics object.
      delete players[socket.id]; // Remove from state.
      broadcastLobbyState();
      checkAndManageCountdown(getTop4ContenderIds()); // Re-evaluate the countdown.
    }
  });

  /**
   * Receives and updates player movement input.
   */
  socket.on("player:input", (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
    }
  });

  /**
   * Handles a player shooting action. This is the core of the combat logic.
   */
  socket.on("player:shoot", (shotData) => {
    const shooter = players[socket.id];
    // A player can only shoot if they are an active fighter.
    if (!shooter || !activeFighterIds.has(shooter.id)) return;

    // Perform a server-authoritative raycast to detect hits.
    const hit = performRaycast(shooter, shotData);

    if (hit) {
      const hitObjectName = hit.object.name;
      const hitPlayer = players[hitObjectName];

      if (hitPlayer) {
        // --- Health and Damage Logic ---
        if (hitPlayer.health > 0) {
          hitPlayer.health -= 1; // Apply damage.
          console.log(
            `💥 ${shooter.name} shot ${hitPlayer.name}! (${hitPlayer.health} HP remaining)`,
          );

          // Notify clients about the hit.
          io.emit("player:hit", {
            shooterId: shooter.id,
            victimId: hitPlayer.id,
            victimHealth: hitPlayer.health,
          });

          // --- Elimination Logic ---
          if (hitPlayer.health <= 0) {
            console.log(
              `💀 ${hitPlayer.name} has been eliminated by ${shooter.name}.`,
            );
            activeFighterIds.delete(hitPlayer.id); // Remove from active fighters.
            io.emit("player:eliminated", {
              victimId: hitPlayer.id,
              eliminatorId: shooter.id,
            });

            // --- Win Condition Check ---
            if (activeFighterIds.size === 1) {
              const winnerId = activeFighterIds.values().next().value;
              const winner = players[winnerId];
              // Recalculate pot based on remaining fighter bets (though it should be the same).
              const pot = Array.from(activeFighterIds).reduce(
                (acc, id) => acc + (players[id]?.betAmount || 0),
                0,
              );
              endRound(winner, pot); // End the round and declare the winner.
            }
          }
        }
      } else {
        // If the raycast hit something other than a player (e.g., the floor).
        io.emit("environment:hit", {
          point: hit.point.toArray(),
          normal: hit.face.normal.toArray(),
        });
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`🚀 Server is running on http://localhost:${PORT}`),
);
