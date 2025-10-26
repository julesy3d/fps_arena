import { Html } from "@react-three/drei";
import { formatTokenAmount } from "@/utils/FormatTokenAmount";

interface FighterNameLabelProps {
  name: string;
  position: [number, number, number];
  betAmount: number;
}

export const FighterNameLabel = ({ name, position, betAmount }: FighterNameLabelProps) => {
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
      <div className="bg-black/80 border border-white px-3 py-1 text-white font-mono text-xs whitespace-nowrap">
        <div className="text-center">{name}</div>
        <div className="text-center text-amber mt-1">
          {formatTokenAmount(betAmount, false)}
        </div>
      </div>
    </Html>
  );
};