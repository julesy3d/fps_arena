import { Html } from "@react-three/drei";

interface FighterNameLabelProps {
  name: string;
  position: [number, number, number];
}

export const FighterNameLabel = ({ name, position }: FighterNameLabelProps) => {
  return (
    <Html
      position={[position[0], position[1] + 2.5, position[2]]}
      center
      distanceFactor={8}
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div className="bg-black/80 border border-white px-3 py-1 text-white font-mono text-sm whitespace-nowrap">
        {name}
      </div>
    </Html>
  );
};