"use client";
import { GameScene } from "@/components/GameScene";
import { Lobby } from "@/components/Lobby";
import { useGameStore } from "@/store/useGameStore";
import { useEffect } from "react";

// Define prop types
interface BannerProps {
  winner: string;
  pot: number;
}

const WinnerBanner = ({ winner, pot }: BannerProps) => (
  <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-10 bg-yellow-400 text-black p-8 border-4 border-black text-center">
    <h2 className="text-4xl font-bold">WINNER!</h2>
    <p className="text-2xl mt-2">{winner} takes the pot of {pot} TOKENS!</p>
  </div>
);

export default function Home() {
  const socket = useGameStore((state) => state.socket);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const gladiators = useGameStore((state) => state.gladiators);
  const roundWinner = useGameStore((state) => state.roundWinner);
  const clearWinner = useGameStore((state) => state.clearWinner);

  // Check if the current client is one of the fighters for this round
  const isFighter = gladiators.some(g => g.id === socket?.id);

  useEffect(() => {
    if (roundWinner) {
      const timer = setTimeout(() => {
        clearWinner();
      }, 5000); // Show winner for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [roundWinner, clearWinner]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
      {roundWinner && <WinnerBanner winner={roundWinner.name} pot={roundWinner.pot} />}
      {gamePhase === 'IN_ROUND' && isFighter ? <GameScene /> : <Lobby />}
    </main>
  );
}