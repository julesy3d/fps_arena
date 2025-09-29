"use client";

import { useState, useEffect } from "react";
import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Player } from "./Player";
import * as THREE from "three";
import { useSocket } from "@/hooks/useSocket";
import { OtherPlayer } from "./OtherPlayer";

const PLAYER_HEIGHT = 1.7;

interface Hit {
  id: number;
  position: THREE.Vector3;
  timestamp: number;
}

interface Target {
  id: number;
  position: THREE.Vector3;
  ref: React.RefObject<THREE.Mesh | null>;
}

interface PlayerState {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
}

const Scene = ({ setLock }: { setLock: (locked: boolean) => void }) => {
  const { scene, camera } = useThree();
  const socket = useSocket("http://localhost:3001");
  const [hits, setHits] = useState<Hit[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<Record<string, PlayerState>>(
    {}
  );
  const [targets, setTargets] = useState<Target[]>(() =>
    [
      { id: 1, position: new THREE.Vector3(5, 0.5, -5) },
      { id: 2, position: new THREE.Vector3(0, 0.5, -10) },
      { id: 3, position: new THREE.Vector3(-5, 0.5, -5) },
    ].map((t) => ({ ...t, ref: React.createRef<THREE.Mesh>() }))
  );

  const pointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only left click

      raycaster.setFromCamera(pointer, camera); // Ray from center of screen
      const intersects = raycaster.intersectObjects(scene.children);

      if (intersects.length > 0) {
        const firstHit = intersects[0];

        // Add a visual hit marker
        setHits((prev) => [
          ...prev,
          {
            id: Date.now(),
            position: firstHit.point,
            rotation: new THREE.Euler().setFromQuaternion(
              new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, -1),
                firstHit.face!.normal
              )
            ),
            timestamp: Date.now(),
          },
        ]);

        // Check if the hit object is a target
        const hitObject = firstHit.object;
        // We also check t.ref.current to ensure we don't compare against a null ref
        const targetHit = targets.find((t) => t.ref.current && t.ref.current === hitObject);

        if (targetHit) {
          setTargets((prev) => prev.filter((t) => t.id !== targetHit.id));
        }
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [camera, scene.children, targets, raycaster, pointer]);

  useEffect(() => {
    if (!socket) return;

    socket.on("currentPlayers", (players: Record<string, PlayerState>) => {
      if (socket.id) {
        const filteredPlayers = { ...players };
        delete filteredPlayers[socket.id]; // Don't include self
        setOtherPlayers(filteredPlayers);
      }
    });

    socket.on("newPlayer", (player: PlayerState) => {
      if (player.id === socket.id) return;
      setOtherPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on("playerMoved", (player: PlayerState) => {
      if (player.id === socket.id) return;
      setOtherPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on("playerDisconnected", (id: string) => {
      setOtherPlayers((prev) => {
        const newPlayers = { ...prev };
        delete newPlayers[id];
        return newPlayers;
      });
    });

    return () => {
      socket.off("currentPlayers");
      socket.off("newPlayer");
      socket.off("playerMoved");
      socket.off("playerDisconnected");
    };
  }, [socket]);

  useFrame((_, delta) => {
    // Remove old hit markers
    const now = Date.now();
    setHits((prev) => prev.filter((h) => now - h.timestamp < 500));
  });

  useFrame(() => {
    if (socket && socket.connected) {
      socket.emit("playerMove", {
        id: socket.id,
        position: camera.position.toArray(),
        rotation: camera.quaternion.toArray(),
      });
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <Player setLock={setLock} socket={socket} />
      <mesh name="floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="gray" />
      </mesh>
      {/* Render Hit Markers */}
      {hits.map((h) => (
        <mesh key={h.id} position={h.position}>
          <planeGeometry args={[0.2, 0.2]} />
          <meshStandardMaterial color="red" transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Render Targets */}
      {targets.map((target) => (
        <mesh key={target.id} name={`target-${target.id}`} position={target.position} ref={target.ref}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="red" />
        </mesh>
      ))}

      {/* Render Other Players */}
      {Object.values(otherPlayers).map((player) => (
        <OtherPlayer key={player.id} player={player} />
      ))}
    </>
  );
};

const Game = () => {
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  return (
    <>
      {isPointerLocked && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontSize: "30px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          +
        </div>
      )}
      {!isPointerLocked && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontSize: "24px",
            pointerEvents: "none",
            userSelect: "none",
            textShadow: "2px 2px 4px rgba(0,0,0,0.7)",
          }}
        >
          Click to start
        </div>
      )}
      <Canvas camera={{ fov: 75, position: [0, PLAYER_HEIGHT, 5] }}>
        <Scene setLock={setIsPointerLocked} />
      </Canvas>
    </>
  );
};

export default Game;