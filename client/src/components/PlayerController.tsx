"use client";

import { useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { useRef } from "react";
import { useGameStore } from "@/store/useGameStore";

export const PlayerController = ({ isDead }: { isDead: boolean}) => {
  const controlsRef = useRef<any>(null);
  const movement = useKeyboardControls();
  const speed = 5;
  const socket = useGameStore((state) => state.socket);

  useFrame((_, delta) => {
    if (isDead || !controlsRef.current) { // <-- NEW: Freeze if dead
      // Optional: you can unlock the pointer when the player dies
      if (controlsRef.current?.isLocked) {
        controlsRef.current.unlock();
      }
      return;
    }
    const moveDistance = speed * delta;
    
    if (movement.moveForward) controlsRef.current.moveForward(moveDistance);
    if (movement.moveBackward) controlsRef.current.moveForward(-moveDistance); // Corrected typo here
    if (movement.moveLeft) controlsRef.current.moveRight(-moveDistance);
    if (movement.moveRight) controlsRef.current.moveRight(moveDistance);

    socket?.emit('player:input', movement);
  });

  return <PointerLockControls ref={controlsRef} />;
};