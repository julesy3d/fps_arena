import { Canvas } from "@react-three/fiber";
import { Player } from "./Player";
import { PointerLockControls } from "@react-three/drei";

const Game = () => {
  return (
    <>
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
      <Canvas camera={{ fov: 75, position: [0, 1, 5] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Player />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial color="gray" />
        </mesh>
      </Canvas>
    </>
  );
};

export default Game;