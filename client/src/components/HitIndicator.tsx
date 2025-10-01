"use client";

import { useGameStore } from "@/store/useGameStore";
import { useState, useEffect } from "react";

export const HitIndicator = () => {
  const socket = useGameStore((state) => state.socket);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onPlayerHit = ({ victimId }: { victimId: string }) => {
      if (victimId === socket?.id) {
        setShow(true);
        setTimeout(() => setShow(false), 200);
      }
    };
    socket?.on("player:hit", onPlayerHit);
    return () => {
      socket?.off("player:hit", onPlayerHit);
    };
  }, [socket]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-20 bg-red-700 transition-opacity duration-200 ${show ? "opacity-30" : "opacity-0"}`}
    />
  );
};
