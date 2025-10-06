"use client";

import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { PlayerController } from "./PlayerController";
import { Grid } from "@react-three/drei";
import { useGameStore } from "@/store/useGameStore";
import { Opponent } from "./Opponent";
import { Impact } from "./Impact";
import { useState, useEffect } from "react";
import { MathUtils, Vector3 } from "three";
import * as THREE from "three";
import { HUD } from "./HUD";
import { HitIndicator } from "./HitIndicator";
import { DeathScreen } from "./DeathScreen";

interface ImpactData {
  id: string;
  point: [number, number, number];
  normal: [number, number, number];
  timestamp: number;
}

interface VictoryScreenProps {
  winnerName: string;
  pot: number;
}

/**
 * SceneContent contains the actual 3D elements of the game, managed by React Three Fiber.
 * It is responsible for setting up the environment, rendering players, handling shooting,
 * and displaying visual effects like impacts.
 * @param {object} props - The component's props.
 * @param {boolean} props.isDead - A boolean indicating if the local player is dead.
 */
const SceneContent = ({ isDead }: { isDead: boolean }) => {
  const socket = useGameStore((state) => state.socket);
  const players = useGameStore((state) => state.players);
  const fighters = useGameStore((state) => state.fighters);
  const [impacts, setImpacts] = useState<ImpactData[]>([]);
  const selfId = socket?.id;

  // This `useEffect` hook sets up and tears down listeners for server-sent game events.
  useEffect(() => {
    // Listener for when a shot hits the environment (not a player).
    const onEnvironmentHit = (data: {
      point: [number, number, number];
      normal: [number, number, number];
    }) => {
      // Add a new impact effect to the scene.
      setImpacts((prev) => [
        ...prev,
        { ...data, id: MathUtils.generateUUID(), timestamp: Date.now() },
      ]);
    };

    // Listener for when a player is hit.
    const onPlayerHit = (data: { shooterId: string; victimId: string }) => {
      console.log("Player Hit Event:", data);
      // TODO: Make the player mesh for `victimId` flash red to indicate damage.
    };

    socket?.on("environment:hit", onEnvironmentHit);
    socket?.on("player:hit", onPlayerHit);

    // Cleanup function to remove listeners when the component unmounts.
    return () => {
      socket?.off("environment:hit", onEnvironmentHit);
      socket?.off("player:hit", onPlayerHit);
    };
  }, [socket]);

  // The `useFrame` hook from R3F runs on every rendered frame (typically 60fps).
  useFrame(() => {
    const now = Date.now();
    // This cleans up old impact effects, removing them from the scene after 1 second.
    setImpacts((currentImpacts) =>
      currentImpacts.filter((imp) => now - imp.timestamp < 1000),
    );
  });

  // This function handles the shooting mechanic.
  const handlePointerDown = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.button !== 0 || !socket) return; // Only process left clicks.

    const camera = event.camera;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction); // Get the direction the camera is facing.

    // Emit the shot data to the server for authoritative hit detection.
    socket.emit("player:shoot", {
      origin: camera.position.toArray(),
      direction: direction.toArray(),
    });
  };

  return (
    <>
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <Grid infiniteGrid args={[10, 100]} sectionColor={"#555"} />

      <PlayerController isDead={isDead} />

      {fighters
        .filter((p) => p.id !== selfId)
        .map((fighter) => {
          const latestState = players[fighter.id];
          if (
            !latestState ||
            typeof latestState.health !== "number" ||
            latestState.health <= 0
          )
            return null;
          return (
            <Opponent 
              key={latestState.id} 
              position={latestState.position}
              rotation={latestState.rotation}
            />
          );
        })}

      {impacts.map((imp) => (
        <Impact key={imp.id} point={imp.point} normal={imp.normal} />
      ))}

      {/* --- THE EVENT CATCHER --- */}
      {/* An invisible plane that covers the background to catch clicks */}
      <mesh onPointerDown={handlePointerDown} position={[0, 0, 0]}>
        <sphereGeometry args={[100, 8, 8]} />
        <meshStandardMaterial side={THREE.BackSide} transparent opacity={0} />
      </mesh>
    </>
  );
};

/**
 * A simple UI overlay to announce to the winning player that they have won the round.
 */
const VictoryScreen = ({ winnerName, pot }: VictoryScreenProps) => (
  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
    <h1 className="text-6xl font-bold text-yellow-400">VICTORY</h1>
    <p className="text-2xl mt-4 text-white">
      You ({winnerName}) won the pot of {pot} TOKENS!
    </p>
  </div>
);

/**
 * The GameScene component is the top-level container for the in-game experience.
 * It is responsible for rendering the 3D canvas and all the 2D HTML UI overlays
 * that are displayed during a match, such as the HUD, timers, and death screens.
 */
export const GameScene = () => {
  // Subscribing to relevant state from the Zustand store.
  const roundTimer = useGameStore((state) => state.roundTimer);
  const roundWinner = useGameStore((state) => state.roundWinner);
  const self = useGameStore((state) =>
    state.socket?.id ? state.players[state.socket.id] : null,
  );

  // Deriving boolean flags from the state to control UI rendering.
  const isWinner = roundWinner?.name === self?.name;
  const isDead = typeof self?.health === "number" && self.health <= 0;

  return (
    <div className="absolute top-0 left-0 h-screen w-full">
      {/* Renders all the 2D UI elements that are layered on top of the 3D scene. */}
      <HUD />
      <HitIndicator />
      <DeathScreen />

      {/* The main round timer display. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-4xl text-white">
        {roundTimer !== null && `00:${roundTimer.toString().padStart(2, "0")}`}
      </div>

      {/* Conditionally render the victory screen if the local player is the winner. */}
      {isWinner && roundWinner && (
        <VictoryScreen winnerName={roundWinner.name} pot={roundWinner.pot} />
      )}

      {/* The main R3F Canvas where the 3D world is rendered. */}
      <Canvas camera={{ fov: 75, position: [0, 1, 5] }}>
        <SceneContent isDead={isDead} />
      </Canvas>
    </div>
  );
};
