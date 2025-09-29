/**
 * @file SpectatorCamera.tsx
 * @description This component manages the camera for players in spectator mode. It automatically
 * cycles through active contestants or defaults to an overhead view if no one is available to spectate.
 */
"use client";

import { useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** @description Defines the structure of a player object, used for spectating. */
interface PlayerState {
    id: string;
    name: string;
    hp: number;
    role: 'CONTESTANT' | 'SPECTATOR';
    isReady: boolean;
    position: [number, number, number];
    rotation: [number, number, number, number];
}

/** @description Defines the structure of the game state, used for finding contestants. */
interface GameState {
    phase: 'LOBBY' | 'IN_ROUND' | 'ROUND_OVER';
    players: Record<string, PlayerState>;
    roundWinner: string | null;
}

/** @description Defines the props for the SpectatorCamera component. */
interface SpectatorCameraProps {
    gameState: GameState;
}

/**
 * @description A component that controls the main scene camera for spectators.
 */
export const SpectatorCamera: React.FC<SpectatorCameraProps> = ({ gameState }) => {
    const { camera } = useThree();
    const [spectatorIndex, setSpectatorIndex] = useState(0);

    // Get a list of players who can be spectated (alive contestants).
    const activeContestants = Object.values(gameState.players).filter(
        p => p.role === 'CONTESTANT' && p.hp > 0
    );

    // Effect to set up a timer that cycles through the spectatable players.
    useEffect(() => {
        if (activeContestants.length === 0) return;

        const timer = setInterval(() => {
            setSpectatorIndex(prev => (prev + 1) % activeContestants.length);
        }, 5000); // Cycle every 5 seconds.

        return () => clearInterval(timer);
    }, [activeContestants.length]);

    // Effect to reset the spectator index if the current target becomes invalid (e.g., they are defeated).
    useEffect(() => {
        if (spectatorIndex >= activeContestants.length) {
            setSpectatorIndex(0);
        }
    }, [activeContestants.length, spectatorIndex]);

    // Main camera logic, executed on every frame.
    useFrame(() => {
        if (activeContestants.length > 0) {
            const targetPlayer = activeContestants[spectatorIndex];
            if (targetPlayer) {
                const targetPosition = new THREE.Vector3().fromArray(targetPlayer.position);
                const targetRotation = new THREE.Quaternion().fromArray(targetPlayer.rotation);

                // Smoothly interpolate the camera's position and rotation towards the target.
                camera.position.lerp(targetPosition, 0.1);
                camera.quaternion.slerp(targetRotation, 0.1);
            }
        } else {
            // If there's no one to spectate, move to a default overhead "skybox" view.
            camera.position.lerp(new THREE.Vector3(0, 20, 0), 0.05);
            // Ensure the camera looks down at the center of the arena.
            const targetLookAt = new THREE.Vector3(0, 0, 0);
            const targetRotation = new THREE.Quaternion().setFromRotationMatrix(
                new THREE.Matrix4().lookAt(camera.position, targetLookAt, new THREE.Vector3(0, 1, 0))
            );
            camera.quaternion.slerp(targetRotation, 0.05);
        }
    });

    // This component only manipulates the camera, it doesn't render any visible elements itself.
    return null;
};