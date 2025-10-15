import { useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGameStore } from "@/store/useGameStore";
import { DuelStage3D } from "./DuelScene";
import * as THREE from "three";


export const Scene3D = () => {
  const { camera } = useThree();
  const { gamePhase, socket, fighters } = useGameStore();
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const isTransitioning = useRef(false);

  const isFighter = fighters?.some((f) => f.id === socket?.id) ?? false;

  useEffect(() => {
    console.log('🎬 Scene3D - gamePhase changed:', gamePhase, 'isFighter:', isFighter);
  }, [gamePhase, isFighter]);


  // Camera positioning logic
  useEffect(() => {
    let newPosition: THREE.Vector3;

    if (gamePhase === "LOBBY") {
      newPosition = new THREE.Vector3(-10, 2, 0); // Distant side view
    } else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
      newPosition = isFighter 
        ? new THREE.Vector3(2, 2, 7)   // TPS for fighters
        : new THREE.Vector3(-6, 2, 0);  // Closer side view for spectators
    } else {
      return;
    }

    targetPosition.current.copy(newPosition);
    isTransitioning.current = true;
  }, [gamePhase, isFighter]);

  // Smooth camera transition
  const { invalidate } = useThree();
  
  useEffect(() => {
    if (!isTransitioning.current) return;

    const animate = () => {
      const distance = camera.position.distanceTo(targetPosition.current);
      
      if (distance > 0.01) {
        camera.position.lerp(targetPosition.current, 0.05);
        camera.lookAt(targetLookAt.current);
        invalidate();
        requestAnimationFrame(animate);
      } else {
        camera.position.copy(targetPosition.current);
        camera.lookAt(targetLookAt.current);
        isTransitioning.current = false;
        invalidate();
      }
    };

    animate();
  }, [camera, invalidate]);

  return <DuelStage3D />;
};