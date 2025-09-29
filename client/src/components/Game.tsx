"use client";

import { useState, useEffect, useCallback } from "react";
import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Player } from "./Player";
import { useSocket } from "@/hooks/useSocket";
import { OtherPlayer } from "./OtherPlayer";
import Lobby from "./Lobby";
import Hud from "./Hud";
import { SpectatorCamera } from "./SpectatorCamera"; // Import the new component

// --- Type Definitions ---
interface PlayerState {
  id: string;
  name: string;
  hp: number;
  role: 'CONTESTANT' | 'SPECTATOR';
  isReady: boolean;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
}

interface GameState {
  phase: 'LOBBY' | 'IN_ROUND' | 'ROUND_OVER';
  players: Record<string, PlayerState>;
  roundWinner: string | null;
}

// --- Scene Component ---
const Scene = ({ gameState, socket, setLock, ownPlayer }: { gameState: GameState, socket: any, setLock: (locked: boolean) => void, ownPlayer: PlayerState | null }) => {
  const { camera } = useThree();
  const otherPlayers = Object.values(gameState.players).filter(p => p.id !== socket.id && p.hp > 0);

  useFrame(() => {
    // Only send movement data if the player is a contestant
    if (socket && socket.connected && ownPlayer?.role === 'CONTESTANT') {
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

      {/* Conditionally render Player controls or Spectator camera */}
      {ownPlayer?.role === 'CONTESTANT' ? (
        <Player setLock={setLock} socket={socket} />
      ) : (
        <SpectatorCamera gameState={gameState} />
      )}

      <mesh name="floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="gray" />
      </mesh>

      {otherPlayers.map((player) => (
        <OtherPlayer key={player.id} player={player} />
      ))}
    </>
  );
};


// --- Main Game Component ---
const Game = () => {
  const socket = useSocket("http://localhost:3001");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('gameState', (newGameState: GameState) => {
      setGameState(newGameState);
    });

    socket.on('playerMoved', (movedPlayer: PlayerState) => {
        setGameState(prev => {
            if (!prev || !prev.players[movedPlayer.id]) return prev;
            const updatedPlayer = { ...prev.players[movedPlayer.id], ...movedPlayer };
            const updatedPlayers = { ...prev.players, [movedPlayer.id]: updatedPlayer };
            return { ...prev, players: updatedPlayers };
        });
    });

    socket.on('playerLeft', (playerId: string) => {
        setGameState(prev => {
            if (!prev) return null;
            const newPlayers = { ...prev.players };
            delete newPlayers[playerId];
            return { ...prev, players: newPlayers };
        });
    });

    return () => {
      socket.off('gameState');
      socket.off('playerMoved');
      socket.off('playerLeft');
    };
  }, [socket]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !isPointerLocked || !socket || !gameState) return;
      const ownPlayer = gameState.players[socket.id];
      if (ownPlayer && ownPlayer.role === 'CONTESTANT' && gameState.phase === 'IN_ROUND') {
        socket.emit('playerShot');
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [socket, gameState, isPointerLocked]);


  const handleJoin = useCallback((name: string) => {
    if (socket) {
      socket.emit('joinGame', { name });
      setHasJoined(true);
    }
  }, [socket]);

  const handleReady = useCallback(() => {
    if (socket) {
      socket.emit('playerReady');
    }
  }, [socket]);

  if (!hasJoined || !gameState) {
    return <Lobby onJoin={handleJoin} />;
  }

  const ownPlayer = socket ? gameState.players[socket.id] : null;

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Hud
        players={gameState.players}
        ownId={socket?.id || null}
        onReady={handleReady}
        winner={gameState.roundWinner}
      />

      {isPointerLocked && ownPlayer?.role === 'CONTESTANT' && ownPlayer?.hp > 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          color: "white", fontSize: "30px", pointerEvents: "none", userSelect: "none"
        }}>+</div>
      )}

      {!isPointerLocked && ownPlayer?.role === 'CONTESTANT' && ownPlayer?.hp > 0 && (
         <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            color: "white", fontSize: "24px", pointerEvents: "none", userSelect: "none",
            textShadow: "2px 2px 4px rgba(0,0,0,0.7)",
          }}>Click to start</div>
      )}

      {ownPlayer?.role === 'SPECTATOR' && (
         <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            color: "white", fontSize: "24px", pointerEvents: "none", userSelect: "none",
            backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px'
          }}>You are a Spectator</div>
      )}

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