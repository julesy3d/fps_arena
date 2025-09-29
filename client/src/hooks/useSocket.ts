import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const useSocket = (uri: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(uri);
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [uri]);

  return socket;
};