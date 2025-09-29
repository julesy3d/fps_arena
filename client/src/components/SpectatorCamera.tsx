"use client";

import { useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Define the structure of a player object
interface PlayerState {
    id: string;
    name: string;
    hp: number;
    role: 'CONTESTANT' | 'SPECTATOR';
    isReady: boolean;
    position: [number, number, number];
    rotation: [number, number, number, number];
}

// Define the structure of the game state
interface GameState {
    phase: 'LOBBY' | 'IN_ROUND' | 'ROUND_OVER';
    players: Record<string, PlayerState>;
    roundWinner: string | null;
}

interface SpectatorCameraProps {
    gameState: GameState;
}

export const SpectatorCamera: React.FC<SpectatorCameraProps> = ({ gameState }) => {
    const { camera } = useThree();
    const [spectatorIndex, setSpectatorIndex] = useState(0);

    // Get a list of players who can be spectated
    const activeContestants = Object.values(gameState.players).filter(
        p => p.role === 'CONTESTANT' && p.hp > 0
    );

    // This effect sets up the timer to cycle through players every 5 seconds
    useEffect(() => {
        if (activeContestants.length === 0) return;

        const timer = setInterval(() => {
            setSpectatorIndex(prev => (prev + 1) % activeContestants.length);
        }, 5000); // 5-second interval

        return () => clearInterval(timer);
    }, [activeContestants.length]);

    // This effect resets the index if the spectated player is no longer valid
    useEffect(() => {
        if (spectatorIndex >= activeContestants.length) {
            setSpectatorIndex(0);
        }
    }, [activeContestants.length, spectatorIndex]);

    useFrame(() => {
        if (activeContestants.length > 0) {
            const targetPlayer = activeContestants[spectatorIndex];
            if (targetPlayer) {
                const targetPosition = new THREE.Vector3().fromArray(targetPlayer.position);
                const targetRotation = new THREE.Quaternion().fromArray(targetPlayer.rotation);

                // Smoothly move the camera to the target's position and orientation
                camera.position.lerp(targetPosition, 0.1);
                camera.quaternion.slerp(targetRotation, 0.1);
            }
        } else {
            // If there's no one to spectate, move to a default overhead view
            camera.position.lerp(new THREE.Vector3(0, 20, 0), 0.05);
            // Ensure the camera looks down at the center of the arena
            const targetLookAt = new THREE.Vector3(0, 0, 0);
            const targetRotation = new THREE.Quaternion().setFromRotationMatrix(
                new THREE.Matrix4().lookAt(camera.position, targetLookAt, new THREE.Vector3(0, 1, 0))
            );
            camera.quaternion.slerp(targetRotation, 0.05);
        }
    });

    return null; // This component only manipulates the camera, it doesn't render anything
};