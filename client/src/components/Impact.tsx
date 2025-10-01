import * as THREE from "three";
import { Billboard, Plane } from "@react-three/drei"; // <-- Import Billboard and Plane

const IMPACT_COLOR = "#ff0000";

interface ImpactProps {
  point: [number, number, number];
  normal: [number, number, number];
}

export const Impact = ({ point, normal }: ImpactProps) => {
  // Calculate the final position with a tiny offset to prevent flickering
  const finalPosition = new THREE.Vector3()
    .fromArray(point)
    .addScaledVector(new THREE.Vector3().fromArray(normal), 0.001);

  return (
    <Billboard position={finalPosition}>
      <Plane args={[0.5, 0.5]}>
        <meshStandardMaterial
          color={IMPACT_COLOR}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </Plane>
    </Billboard>
  );
};
