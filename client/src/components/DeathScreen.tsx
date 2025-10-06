"use client";

import { useGameStore } from "@/store/useGameStore";

export const DeathScreen = () => {
  const self = useGameStore((state) =>
    state.socket?.id ? state.players[state.socket.id] : null,
  );

  // More robust check: ensure health is a number before comparing it
  if (!self || typeof self.health !== "number" || self.health > 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/80 text-white">
      <h2 className="text-5xl font-bold text-red-600">
        YOU HAVE BEEN DEFEATED
      </h2>
      <p className="mt-4 text-lg">
        Your wager will be distributed to the last survivor.
      </p>
    </div>
  );
};
