/**
 * @file Player.tsx
 * @description This component encapsulates the local player's controls, camera, and physics.
 * It uses PointerLockControls for a first-person perspective and handles keyboard input for movement.
 */
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { PointerLockControls } from "@react-three/drei";
import { Socket } from "socket.io-client";

// --- Constants for Player Physics ---
const MOVEMENT_SPEED = 8;
const GRAVITY = -20;
const JUMP_FORCE = 6;
const PLAYER_HEIGHT = 1.7; // The height of the camera from the ground.

/**
 * @description The main component for the local player's character controller.
 * @param {object} props - The component's props.
 * @param {function} props.setLock - A callback to update the pointer lock state in the parent component.
 * @param {Socket | null} props.socket - The socket instance for communication (currently unused here, but good for future features).
 */
export const Player = ({
  setLock,
}: {
  setLock: (locked: boolean) => void;
  socket: Socket | null;
}) => {
  const controlsRef = useRef<any>(null); // Ref for the PointerLockControls instance.
  const { camera } = useThree();
  const [velocity] = useState(() => new THREE.Vector3()); // Player's current velocity for physics simulation.
  const [onGround, setOnGround] = useState(false); // Tracks if the player is on the ground to control jumping.

  // Custom hook to get the current state of keyboard controls (W, A, S, D, Space).
  const { moveForward, moveBackward, moveLeft, moveRight, jump } =
    useKeyboardControls();

  // Effect to handle the locking and unlocking of the mouse pointer.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onLock = () => setLock(true);
    const onUnlock = () => setLock(false);

    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);

    return () => {
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
    };
  }, [setLock]);

  // The main game loop logic, executed on every frame.
  useFrame((_, delta) => {
    // Don't apply physics or movement if the controls are not locked.
    if (!controlsRef.current?.isLocked) {
      velocity.set(0, 0, 0); // Reset velocity when not locked to prevent sliding.
      return;
    }

    // --- Movement Calculation ---
    const moveDirection = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    camera.getWorldDirection(moveDirection); // This is the camera's forward vector.
    rightVector.crossVectors(camera.up, moveDirection).normalize(); // Calculate the right vector.

    const frontInput = Number(moveForward) - Number(moveBackward);
    const sideInput = Number(moveRight) - Number(moveLeft);

    // Combine inputs to get the final movement direction relative to the camera.
    moveDirection.set(0, 0, 0);
    moveDirection.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), frontInput);
    moveDirection.addScaledVector(rightVector, sideInput);
    moveDirection.normalize().multiplyScalar(MOVEMENT_SPEED);

    // --- Physics Simulation ---
    // Apply gravity.
    velocity.y += GRAVITY * delta;

    // Handle jumping.
    if (jump && onGround) {
      velocity.y = JUMP_FORCE;
      setOnGround(false); // Prevent multi-jumps in the air.
    }

    // Apply the calculated movement and gravity to the camera's position.
    camera.position.x += moveDirection.x * delta;
    camera.position.z += moveDirection.z * delta;
    camera.position.y += velocity.y * delta;

    // --- Collision Detection (Floor) ---
    // Simple floor boundary check.
    if (camera.position.y < PLAYER_HEIGHT) {
      camera.position.y = PLAYER_HEIGHT;
      velocity.y = 0;
      setOnGround(true);
    } else {
      setOnGround(false);
    }
  });

  return (
    <>
      <PointerLockControls ref={controlsRef} />
      {/* A mesh is not needed for the local player as we are the camera, but it could be added for a body representation. */}
    </>
  );
};
