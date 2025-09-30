"use client";

import { Canvas } from "@react-three/fiber";
import { PlayerController } from "./PlayerController";
import { Grid } from "@react-three/drei";
import { useGameStore } from "@/store/useGameStore";
import { Opponent } from "./Opponent";

interface VictoryScreenProps {
  winnerName: string;
  pot: number;
}

const VictoryScreen = ({ winnerName, pot }: VictoryScreenProps) => (
  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
    <h1 className="text-6xl font-bold text-yellow-400">VICTORY</h1>
    <p className="text-2xl mt-4 text-white">You ({winnerName}) won the pot of {pot} TOKENS!</p>
  </div>
);

export const GameScene = () => {
  const players = useGameStore((state) => state.players);
  const socket = useGameStore((state) => state.socket);
  const roundTimer = useGameStore((state) => state.roundTimer);
  const roundWinner = useGameStore((state) => state.roundWinner);
  const fighters = useGameStore((state) => state.gladiators); 

  const selfId = socket?.id;
  const self = selfId ? players[selfId] : null;

  // We check if the winner's name from the server matches our own player's name
  const isWinner = roundWinner?.name === self?.name;

  return (
    <div className="absolute top-0 left-0 h-screen w-full">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-4xl text-white">
        {roundTimer !== null && `00:${roundTimer.toString().padStart(2, '0')}`}
      </div>
        {isWinner && roundWinner && <VictoryScreen winnerName={roundWinner.name} pot={roundWinner.pot} />}
      <Canvas camera={{ fov: 75, position: [0, 1, 5] }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} />
        
        {/* --- Floor and Grid are back --- */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <Grid infiniteGrid args={[10, 100]} sectionColor={"#555"}/>
        
        <PlayerController />

        {fighters
          .filter((p) => p.id !== selfId)
          .map((fighter) => {
            const latestState = players[fighter.id];
            if (!latestState) return null;
            return <Opponent key={latestState.id} position={latestState.position} />;
          })}
      </Canvas>
    </div>
  );
};