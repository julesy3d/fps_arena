import { Capsule } from "@react-three/drei";

interface OpponentProps {
  position: [number, number, number];
}

export const Opponent = ({ position }: OpponentProps) => {
  return (
    <mesh position={position}>
      <Capsule args={[0.5, 1]}>
        <meshStandardMaterial color="mediumblue" />
      </Capsule>
    </mesh>
  );
};