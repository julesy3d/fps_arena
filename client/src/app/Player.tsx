import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { PointerLockControls } from "@react-three/drei";

const MOVEMENT_SPEED = 5;
const JUMP_VELOCITY = 4;

export const Player = () => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const controlsRef = useRef<any>(null); // Using `any` for PointerLockControls from drei
  const { camera } = useThree();

  const { moveForward, moveBackward, moveLeft, moveRight } =
    useKeyboardControls();

  // Lock the pointer on click
  useEffect(() => {
    const handleClick = () => {
      controlsRef.current?.lock();
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  useFrame((_, delta) => {
    if (!controlsRef.current?.isLocked) return;

    const moveDirection = new THREE.Vector3();
    if (moveForward) moveDirection.z = -1;
    if (moveBackward) moveDirection.z = 1;
    if (moveLeft) moveDirection.x = -1;
    if (moveRight) moveDirection.x = 1;

    // Apply camera rotation to the movement direction
    moveDirection.normalize().applyEuler(camera.rotation);
    const moveVector = moveDirection.multiplyScalar(MOVEMENT_SPEED * delta);
    camera.position.add(moveVector);
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