"use client";

import { useGameStore } from "@/store/useGameStore";
import { useEffect } from "react";

export const SocketInitializer = () => {
  const { connectSocket, socket } = useGameStore();

  useEffect(() => {
    connectSocket();
    
    // Cleanup function to disconnect when component unmounts
    return () => {
      if (socket) {
        console.log("🧹 Cleaning up socket connection");
        socket.disconnect();
      }
    };
  }, []);

  return null;
};