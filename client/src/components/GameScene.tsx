"use client";

import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { PlayerController } from "./PlayerController";
import { Grid } from "@react-three/drei";
import { useGameStore } from "@/store/useGameStore";
import { Opponent } from "./Opponent";
import { Impact } from "./Impact";
import { useState, useEffect } from "react";
import { MathUtils, Vector3 } from "three";
import * as THREE from 'three';
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

// We create a new component to hold the scene's contents
const SceneContent = ({ isDead }: { isDead: boolean }) => {
  const socket = useGameStore((state) => state.socket);
  const players = useGameStore((state) => state.players);
  const fighters = useGameStore((state) => state.gladiators); 
  const [impacts, setImpacts] = useState<ImpactData[]>([]);
  const selfId = socket?.id;

  // --- EVENT LISTENERS AND LOOPS ---
  useEffect(() => {
    const onEnvironmentHit = (data: { point: [number, number, number]; normal: [number, number, number] }) => {
      setImpacts((prev) => [
        ...prev, 
        { ...data, id: MathUtils.generateUUID(), timestamp: Date.now() }
      ]);
    };

    const onPlayerHit = (data: { shooterId: string; victimId: string }) => {
      console.log("Player Hit Event:", data);
      // TODO: Make the player mesh for `victimId` flash red
    };

    socket?.on('environment:hit', onEnvironmentHit);
    socket?.on('player:hit', onPlayerHit);
    
    return () => {
      socket?.off('environment:hit', onEnvironmentHit);
      socket?.off('player:hit', onPlayerHit);
    };
  }, [socket]);

  useFrame(() => {
    const now = Date.now();
    setImpacts((currentImpacts) => currentImpacts.filter(imp => now - imp.timestamp < 1000));
  });

  const handlePointerDown = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.button !== 0 || !socket) return;

    const camera = event.camera;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    socket.emit('player:shoot', { 
      origin: camera.position.toArray(),
      direction: direction.toArray() 
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
      <Grid infiniteGrid args={[10, 100]} sectionColor={"#555"}/>
      
      <PlayerController isDead={isDead}/>

      {fighters
        .filter((p) => p.id !== selfId)
        .map((fighter) => {
          const latestState = players[fighter.id];
          if (!latestState || typeof latestState.health !== 'number' || latestState.health <= 0) return null;          
          return <Opponent key={latestState.id} position={latestState.position} />;
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

const VictoryScreen = ({ winnerName, pot }: VictoryScreenProps) => (
  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
    <h1 className="text-6xl font-bold text-yellow-400">VICTORY</h1>
    <p className="text-2xl mt-4 text-white">You ({winnerName}) won the pot of {pot} TOKENS!</p>
  </div>
);

export const GameScene = () => {
  const roundTimer = useGameStore((state) => state.roundTimer);
  const roundWinner = useGameStore((state) => state.roundWinner);
  const self = useGameStore((state) => state.socket?.id ? state.players[state.socket.id] : null);
  const isWinner = roundWinner?.name === self?.name;
  const isDead = typeof self?.health === 'number' && self.health <= 0;


  return (
    <div className="absolute top-0 left-0 h-screen w-full">

      <HUD />
      <HitIndicator />
      <DeathScreen />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-4xl text-white">
        {roundTimer !== null && `00:${roundTimer.toString().padStart(2, '0')}`}
      </div>
      {isWinner && roundWinner && <VictoryScreen winnerName={roundWinner.name} pot={roundWinner.pot} />}
      
      <Canvas camera={{ fov: 75, position: [0, 1, 5] }}>
        <SceneContent isDead={isDead} />
      </Canvas>
    </div>
  );
};
