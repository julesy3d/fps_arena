"use client";

import { useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { useRef } from "react";
import { useGameStore } from "@/store/useGameStore";

export const PlayerController = () => {
  const controlsRef = useRef<any>(null);
  const movement = useKeyboardControls();
  const speed = 5;
  const socket = useGameStore((state) => state.socket);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const moveDistance = speed * delta;
    
    if (movement.moveForward) controlsRef.current.moveForward(moveDistance);
    if (movement.moveBackward) controlsRef.current.moveForward(-moveDistance);
    if (movement.moveLeft) controlsRef.current.moveRight(-moveDistance);
    if (movement.moveRight) controlsRef.current.moveRight(moveDistance);

    // --- SEND INPUT TO SERVER ---
    socket?.emit('player:input', movement);
  });

  return <PointerLockControls ref={controlsRef} />;
};