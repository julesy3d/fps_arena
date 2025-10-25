"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useGameStore } from "@/store/useGameStore";

function SocketInitializer() {
  useEffect(() => {
    // This check prevents the socket from trying to connect on the server.
    if (typeof window === "undefined") {
      return;
    }

    // 1. Use the new env variable if it exists.
    // 2. Fall back to your local server URL if it doesn't.
    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "ws://localhost:8080";

    const socket = io(serverUrl, {
      transports: ["websocket"],
    });

    // --- THIS IS THE FIX ---
    // We call setState() on the store hook itself, not on the state object.
    useGameStore.setState({ socket: socket });
    // --- END OF FIX ---

    return () => {
      socket.disconnect();
    };
  }, []); // The empty array ensures this runs only once on mount.

  return null;
}

export default SocketInitializer;