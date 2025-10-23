import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "@/store/useGameStore";
import { DuelStage3D } from "./DuelScene";
import * as THREE from "three";

export const Scene3D = () => {
    const { camera } = useThree();
    const { gamePhase, socket, fighters } = useGameStore();
    
    const targetPosition = useRef(new THREE.Vector3(-10, 2, 0));
    const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
    const isAnimating = useRef(false);
    
    const isFighter = fighters?.some((f) => f.id === socket?.id) ?? false;

    // Camera positioning logic
    useEffect(() => {
        let newPosition: THREE.Vector3;

        if (gamePhase === "LOBBY") {
            newPosition = new THREE.Vector3(-10, 2, 0);
        } else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
            if (isFighter && fighters && fighters.length >= 2) {
                const yourFighter = fighters.find(f => f.id === socket?.id);
                
                if (yourFighter) {
                    if (yourFighter.position[2] < 0) {
                        newPosition = new THREE.Vector3(-2, 2, -7);
                    } else {
                        newPosition = new THREE.Vector3(2, 2, 7);
                    }
                } else {
                    newPosition = new THREE.Vector3(2, 2, 7);
                }
            } else {
                newPosition = new THREE.Vector3(-7, 2, 0);
            }
        } else {
            return;
        }

        targetPosition.current.copy(newPosition);
        isAnimating.current = true;
    }, [gamePhase, isFighter, socket?.id, fighters]);

    // Simple camera animation
    useFrame(() => {
        if (isAnimating.current) {
            const distance = camera.position.distanceTo(targetPosition.current);
            
            if (distance > 0.01) {
                camera.position.lerp(targetPosition.current, 0.15);
                camera.lookAt(targetLookAt.current);
            } else {
                camera.position.copy(targetPosition.current);
                camera.lookAt(targetLookAt.current);
                isAnimating.current = false;
            }
        }
    });

    return <DuelStage3D />;
};