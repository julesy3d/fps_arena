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

    // Camera positioning logic
    useEffect(() => {
    let newPosition: THREE.Vector3;

    if (gamePhase === "LOBBY") {
        newPosition = new THREE.Vector3(-10, 2, 0); // Distant side view
    } else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
        if (isFighter && fighters && fighters.length >= 2) {
        // Find YOUR fighter object
        const yourFighter = fighters.find(f => f.id === socket?.id);
        
        if (yourFighter) {
            // Use the fighter's actual 3D position from server as source of truth
            // Server assigns position based on bet order:
            //   Highest bidder  → [0, 0, -3]
            //   Second bidder   → [0, 0, 3]
            
            if (yourFighter.position[2] < 0) {
            // You're at negative Z (-3) → Camera behind you at negative Z
            newPosition = new THREE.Vector3(2, 2, 7);
            console.log('📹 You are fighter at Z=-3, camera at Z=-7');
            } else {
            // You're at positive Z (3) → Camera behind you at positive Z
            newPosition = new THREE.Vector3(2, 2, -7);
            console.log('📹 You are fighter at Z=+3, camera at Z=+7');
            }
        } else {
            // Fallback - shouldn't happen if isFighter is true
            console.warn('⚠️ isFighter true but fighter not found in array');
            newPosition = new THREE.Vector3(2, 2, 7);
        }
        } else {
        // Spectator view
        newPosition = new THREE.Vector3(-6, 2, 0);
        }
    } else {
        return;
    }

    console.log('🎯 New target position:', newPosition.toArray());
    targetPosition.current.copy(newPosition);
    isAnimating.current = true;
    }, [gamePhase, isFighter, socket?.id, fighters]);

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