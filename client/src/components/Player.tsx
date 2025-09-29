import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { PointerLockControls } from "@react-three/drei";

import { Socket } from "socket.io-client";

const MOVEMENT_SPEED = 8;
const GRAVITY = -20;
const JUMP_FORCE = 6;
const PLAYER_HEIGHT = 1.7;

export const Player = ({
  setLock,
}: {
  setLock: (locked: boolean) => void;
  socket: Socket | null;
}) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const controlsRef = useRef<any>(null); // Using `any` for PointerLockControls from drei
  const { camera } = useThree();
  const [velocity] = useState(() => new THREE.Vector3());
  const [onGround, setOnGround] = useState(false);

  const { moveForward, moveBackward, moveLeft, moveRight, jump } =
    useKeyboardControls();

  // Handle pointer lock state changes
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onLock = () => setLock(true);
    const onUnlock = () => setLock(false);

    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);

    // The `PointerLockControls` component from drei adds its own click
    // listener to the canvas to handle locking. We don't need our own.

    return () => {
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
    };
  }, [setLock]);

  useFrame((_, delta) => {
    if (!controlsRef.current?.isLocked) return;

    const moveDirection = new THREE.Vector3();
    // Use a helper vector to prevent mutation of camera's world direction
    const rightVector = new THREE.Vector3();
    camera.getWorldDirection(moveDirection); // This is the forward vector
    rightVector.crossVectors(camera.up, moveDirection).normalize(); // Get the right vector

    const frontVector = new THREE.Vector3(
      0,
      0,
      Number(moveForward) - Number(moveBackward)
    );
    const sideVector = new THREE.Vector3(
      Number(moveRight) - Number(moveLeft),
      0,
      0
    );

    // Reset moveDirection and apply movement based on world axes relative to camera
    moveDirection.set(0, 0, 0);
    moveDirection.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), frontVector.z);
    moveDirection.addScaledVector(rightVector, sideVector.x);
    moveDirection.normalize().multiplyScalar(MOVEMENT_SPEED);

    // Apply gravity
    velocity.y += GRAVITY * delta;

    // Jumping
    if (jump && onGround) {
      velocity.y = JUMP_FORCE;
      setOnGround(false); // Prevent multi-jumps
    }

    // Apply movement and gravity
    camera.position.x += moveDirection.x * delta;
    camera.position.z += moveDirection.z * delta;
    camera.position.y += velocity.y * delta;

    // Enforce floor boundary
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
      <mesh ref={meshRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={"mediumpurple"} />
      </mesh>
    </>
  );
};
