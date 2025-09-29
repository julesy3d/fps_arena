import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";

// The full player state, including properties needed for display
interface PlayerState {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  hp: number;
  role: 'CONTESTANT' | 'SPECTATOR';
}

export const OtherPlayer = ({ player }: { player: PlayerState }) => {
  // Safeguard: don't render if the player has no health.
  // This is already handled in Game.tsx, but it's good practice.
  if (player.hp <= 0) {
    return null;
  }

  return (
    // A group allows us to move the player model and their name tag together.
    // The group is set to the player's world position.
    <group position={player.position}>
      {/* The player's 3D model, which is rotated according to their view direction. */}
      <mesh quaternion={new THREE.Quaternion(...player.rotation)}>
        <boxGeometry args={[1, 1.7, 1]} />
        <meshStandardMaterial color="lightblue" />
      </mesh>

      {/* The player's name, rendered above their head. The Billboard ensures it always faces the camera. */}
      <Billboard position={[0, 1.2, 0]}>
        <Text
          fontSize={0.25}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="black"
        >
          {player.name}
        </Text>
      </Billboard>
    </group>
  );
};