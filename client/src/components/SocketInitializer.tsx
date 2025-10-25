"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

function SocketInitializer() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Use the store's connectSocket which has the correct env var and all listeners
    useGameStore.getState().connectSocket();

    return () => {
      const socket = useGameStore.getState().socket;
      socket?.disconnect();
    };
  }, []);

  return null;
}

export default SocketInitializer;