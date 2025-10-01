"use client";

import { useGameStore } from "@/store/useGameStore";
import { useEffect } from "react";

export const SocketInitializer = () => {
  const { connectSocket } = useGameStore();

  useEffect(() => {
    // This effect runs once when the app loads
    connectSocket();
  }, [connectSocket]);

  // This component renders nothing
  return null;
};
