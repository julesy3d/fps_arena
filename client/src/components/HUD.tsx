"use client";

import { useGameStore } from "@/store/useGameStore";

const HealthBar = ({ hp }: { hp: number }) => {
  const bars = [];
  for (let i = 0; i < 3; i++) {
    bars.push(
      <div
        key={i}
        className={`h-2 w-8 border border-white ${i < hp ? "bg-red-500" : "bg-black/50"}`}
      ></div>,
    );
  }
  return <div className="flex gap-1">{bars}</div>;
};

export const HUD = () => {
  const self = useGameStore((state) =>
    state.socket?.id ? state.players[state.socket.id] : null,
  );

  // Check that health is a valid number
  if (!self || typeof self.health !== "number") return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-10 text-white">
      <HealthBar hp={self.health} />
    </div>
  );
};
