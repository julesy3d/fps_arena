/**
 * @file Game.tsx
 * @description This is the main component for the game client. It orchestrates all other components,
 * manages the connection to the server, and handles the primary game state and UI rendering.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Player } from "./Player";
import { useSocket } from "@/hooks/useSocket";
import { OtherPlayer } from "./OtherPlayer";
import Lobby from "./Lobby";
import Hud from "./Hud";
import { SpectatorCamera } from "./SpectatorCamera";

// --- Type Definitions ---

/** @description Defines the structure for a single player's state, received from the server. */
interface PlayerState {
  id: string;
  name: string;
  hp: number;
  role: 'CONTESTANT' | 'SPECTATOR';
  isReady: boolean;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
}

/** @description Defines the overall game state structure, received from the server. */
interface GameState {
  phase: 'LOBBY' | 'COUNTDOWN' | 'IN_ROUND' | 'ROUND_OVER';
  players: Record<string, PlayerState>;
  roundWinner: string | null;
  countdown: number;
}

// --- Scene Component ---
/**
 * @description Renders the 3D world, including the floor, lighting, and all players.
 * It also handles sending the local player's movement data to the server on each frame.
 */
const Scene = ({ gameState, socket, setLock, ownPlayer }: { gameState: GameState, socket: any, setLock: (locked: boolean) => void, ownPlayer: PlayerState | null }) => {
  const { camera } = useThree();
  // Filter out the local player and defeated players from the rendering list.
  const otherPlayers = Object.values(gameState.players).filter(p => p.id !== socket?.id && p.hp > 0);

  useFrame(() => {
    // On every frame, if the local player is a contestant and the round is active, send their camera's position and rotation.
    if (socket && socket.connected && ownPlayer?.role === 'CONTESTANT' && gameState.phase === 'IN_ROUND') {
      socket.emit("playerMove", {
        position: camera.position.toArray(),
        rotation: camera.quaternion.toArray(),
      });
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />

      {/* Render the first-person player controller or the spectator camera based on the player's role. */}
      {ownPlayer?.role === 'CONTESTANT' ? (
        <Player setLock={setLock} socket={socket} />
      ) : (
        <SpectatorCamera gameState={gameState} />
      )}

      <mesh name="floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="gray" />
      </mesh>

      {/* Render a representation for every other player in the game. */}
      {otherPlayers.map((player) => (
        <OtherPlayer key={player.id} player={player} />
      ))}
    </>
  );
};


// --- Main Game Component ---
/**
 * @description The root component for the game experience. It handles socket connection,
 * game state updates, player input, and renders the appropriate UI (Lobby, HUD, Canvas).
 */
const Game = () => {
  const socket = useSocket("http://localhost:3001");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hasSetName, setHasSetName] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  // Effect for handling incoming socket events.
  useEffect(() => {
    if (!socket) return;

    // The server sends the full game state periodically.
    socket.on('gameState', (newGameState: GameState) => {
      setGameState(newGameState);
    });

    // To save bandwidth, individual player movements are sent separately.
    socket.on('playerMoved', (movedPlayer: PlayerState) => {
        setGameState(prev => {
            if (!prev || !prev.players[movedPlayer.id]) return prev;
            const updatedPlayer = { ...prev.players[movedPlayer.id], ...movedPlayer };
            const updatedPlayers = { ...prev.players, [movedPlayer.id]: updatedPlayer };
            return { ...prev, players: updatedPlayers };
        });
    });

    // Handles when a player disconnects.
    socket.on('playerLeft', (playerId: string) => {
        setGameState(prev => {
            if (!prev) return null;
            const newPlayers = { ...prev.players };
            delete newPlayers[playerId];
            return { ...prev, players: newPlayers };
        });
    });

    // Cleanup listeners on component unmount.
    return () => {
      socket.off('gameState');
      socket.off('playerMoved');
      socket.off('playerLeft');
    };
  }, [socket]);

  // Effect for handling shooting input.
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      // Only fire on left-click when the pointer is locked and the player is an active contestant.
      if (event.button !== 0 || !isPointerLocked || !socket || !gameState) return;
      const ownPlayer = gameState.players[socket.id];
      if (ownPlayer && ownPlayer.role === 'CONTESTANT' && gameState.phase === 'IN_ROUND') {
        socket.emit('playerShot');
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [socket, gameState, isPointerLocked]);

  // --- Callback Handlers ---

  const handleSetName = useCallback((name: string) => {
    if (socket) {
      socket.emit('setPlayerName', { name });
      setHasSetName(true); // Transition from Lobby to the main game view.
    }
  }, [socket]);

  const handleReady = useCallback(() => {
    if (socket) {
      socket.emit('playerReady');
    }
  }, [socket]);

  const handleBecomeContestant = useCallback(() => {
    if (socket) {
      socket.emit('playerWantsToPlay');
    }
  }, [socket]);

  // --- Render Logic ---

  // 1. If the player hasn't set their name yet, show the lobby.
  if (!hasSetName) {
    return <Lobby onSetName={handleSetName} />;
  }

  // 2. If the name is set but we haven't received the game state yet, show a connecting screen.
  if (!gameState || !socket?.id || !gameState.players[socket.id]) {
    return (
      <div style={{ width: "100vw", height: "100vh", display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#222', color: 'white' }}>
        <h2>Connecting...</h2>
      </div>
    );
  }

  const ownPlayer = gameState.players[socket.id];

  // 3. Once connected, render the main game UI.
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Hud
        gameState={gameState}
        ownId={socket.id}
        onReady={handleReady}
        onBecomeContestant={handleBecomeContestant}
      />

      {/* Crosshair - shown only to alive contestants during a round */}
      {isPointerLocked && ownPlayer?.role === 'CONTESTANT' && ownPlayer?.hp > 0 && gameState.phase === 'IN_ROUND' && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          color: "white", fontSize: "30px", pointerEvents: "none", userSelect: "none"
        }}>+</div>
      )}

      {/* "Click to start" message - shown to alive contestants when pointer is not locked */}
      {!isPointerLocked && ownPlayer?.role === 'CONTESTANT' && ownPlayer?.hp > 0 && (
         <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            color: "white", fontSize: "24px", pointerEvents: "none", userSelect: "none",
            textShadow: "2px 2px 4px rgba(0,0,0,0.7)",
          }}>Click to start</div>
      )}

      {/* General "Spectator" message */}
      {ownPlayer?.role === 'SPECTATOR' && (
         <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            color: "white", fontSize: "24px", pointerEvents: "none", userSelect: "none",
            backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px'
          }}>You are a Spectator</div>
      )}

      {/* "Defeated" message for players with 0 HP */}
      {ownPlayer?.hp === 0 && (
         <div style={{
            position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
            color: "red", fontSize: "36px", pointerEvents: "none", userSelect: "none",
            backgroundColor: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '10px'
          }}>YOU HAVE BEEN DEFEATED</div>
      )}

      <Canvas camera={{ fov: 75, position: [0, 1.7, 5] }}>
        <Scene gameState={gameState} socket={socket} setLock={setIsPointerLocked} ownPlayer={ownPlayer} />
      </Canvas>
    </div>
  );
};

export default Game;