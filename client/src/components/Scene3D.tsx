import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "@/store/useGameStore";
import { DuelStage3D } from "./DuelScene";
import * as THREE from "three";

export const Scene3D = () => {
  const { camera, gl, scene } = useThree();
  const { gamePhase, socket, fighters } = useGameStore();
  
  const targetPosition = useRef(new THREE.Vector3(-10, 2, 0));
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const isAnimating = useRef(false);
  const frameCount = useRef(0);
  
  // 18 FPS throttle for retro aesthetic
  const TARGET_FPS = 18;
  const FRAME_SKIP = Math.round(60 / TARGET_FPS); // = 3 frames
  
  const isFighter = fighters?.some((f) => f.id === socket?.id) ?? false;

  // Debug logging
  useEffect(() => {
    console.log('🎮 Camera state change:', {
      gamePhase,
      isFighter,
      currentCameraPos: camera.position.toArray(),
      targetPos: targetPosition.current.toArray()
    });
  }, [gamePhase, isFighter, camera]);

  // Update target position when game state changes
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

    console.log('🎯 New target position:', newPosition.toArray());
    targetPosition.current.copy(newPosition);
    isAnimating.current = true;
  }, [gamePhase, isFighter]);

  // Manual render loop at 18fps with camera animation
  useFrame(() => {
    frameCount.current++;
    
    // Only render every 3rd frame (18fps)
    if (frameCount.current % FRAME_SKIP !== 0) return;
    
    // Camera animation (still smooth interpolation, just rendered at 18fps)
    if (isAnimating.current) {
      const distance = camera.position.distanceTo(targetPosition.current);
      
      if (distance > 0.01) {
        camera.position.lerp(targetPosition.current, 0.15); // Snappy movement
        camera.lookAt(targetLookAt.current);
        
        if (frameCount.current % (FRAME_SKIP * 10) === 0) {
          console.log('📹 Camera animating:', {
            current: camera.position.toArray(),
            target: targetPosition.current.toArray(),
            distance: distance.toFixed(3)
          });
        }
      } else {
        // Animation complete
        camera.position.copy(targetPosition.current);
        camera.lookAt(targetLookAt.current);
        isAnimating.current = false;
        console.log('✅ Camera arrived at target');
      }
    }
    
    // Manual render at 18fps
    gl.render(scene, camera);
  }, 1); // renderPriority = 1 takes over rendering

  return <DuelStage3D />;
};