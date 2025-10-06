// PlayerController.tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import * as THREE from "three";

export const PlayerController = ({ isDead }: { isDead: boolean }) => {
  const controlsRef = useRef<any>(null);
  const movement = useKeyboardControls();
  const socket = useGameStore((state) => state.socket);
  const players = useGameStore((state) => state.players);
  const selfId = socket?.id;
  const { camera } = useThree();

  useFrame(() => {
    if (isDead || !controlsRef.current || !selfId) {
      if (controlsRef.current?.isLocked) {
        controlsRef.current.unlock();
      }
      return;
    }

    // Get player's server-authoritative position
    const serverPlayer = players[selfId];
    if (serverPlayer) {
      // Camera follows server position with eye-height offset
      camera.position.set(
        serverPlayer.position[0],
        serverPlayer.position[1] + 1.6, // Eye height
        serverPlayer.position[2]
      );
    }

    // Get camera rotation (where player is looking)
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    const cameraYaw = euler.y;

    // Send input to server
    socket?.emit("player:input", {
      ...movement,
      cameraYaw
    });
  });

  return <PointerLockControls ref={controlsRef} />;
};