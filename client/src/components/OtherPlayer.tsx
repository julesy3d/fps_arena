import * as THREE from "three";

interface PlayerState {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export const OtherPlayer = ({ player }: { player: PlayerState }) => {
  return (
    <mesh position={player.position} quaternion={new THREE.Quaternion(...player.rotation)}>
      <boxGeometry args={[1, 1.7, 1]} />
      <meshStandardMaterial color="lightblue" />
    </mesh>
  );
};