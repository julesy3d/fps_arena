"use client";

import { useGameStore } from "@/store/useGameStore";
import React, { useState } from "react";

export const NameInput = () => {
  const [name, setName] = useState("");
  const setPlayerName = useGameStore((state) => state.setPlayerName);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (name.trim().length > 0) {
      setPlayerName(name.trim());
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-2xl font-semibold">Enter Your Name</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Gladiator..."
          maxLength={16}
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={name.trim().length === 0}
        >
          Join Game
        </button>
      </form>
    </div>
  );
};