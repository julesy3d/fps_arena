/**
 * @file OtherPlayer.tsx
 * @description This component renders the 3D representation of other players in the game world.
 * It includes their character model and a name tag that always faces the camera.
 */
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";

/** @description The state of another player, received from the server. */
interface PlayerState {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  hp: number;
  role: 'CONTESTANT' | 'SPECTATOR';
}

/**
 * @description A component that renders another player's model and name tag based on their state.
 * @param {object} props - The component's props.
 * @param {PlayerState} props.player - The state of the player to render.
 */
export const OtherPlayer = ({ player }: { player: PlayerState }) => {
  // Safeguard: don't render if the player has no health.
  // This is already handled in Game.tsx, but it's good practice for component isolation.
  if (player.hp <= 0) {
    return null;
  }

  return (
    // A group allows us to move the player model and their name tag together.
    // The group's position is updated based on the player's world position from the server.
    <group position={player.position}>
      {/* The player's 3D model (a simple box), which is rotated according to their view direction. */}
      <mesh quaternion={new THREE.Quaternion(...player.rotation)}>
        <boxGeometry args={[1, 1.7, 1]} />
        <meshStandardMaterial color="lightblue" />
      </mesh>

      {/* The Billboard component ensures its children (the Text) always face the camera. */}
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