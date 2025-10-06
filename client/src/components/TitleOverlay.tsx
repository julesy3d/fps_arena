"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect } from "react";

interface TitleOverlayProps {
  onHover: (isHovering: boolean) => void;
}

export const TitleOverlay = ({ onHover }: TitleOverlayProps) => {
  const { connected } = useWallet();
  const [mounted, setMounted] = useState(false);

  // Only render wallet button after client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex justify-center pt-4">
      <div
        className="relative group"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <h1 className="cursor-pointer font-title text-6xl font-medium tracking-[0.4em] text-white transition-opacity duration-300 group-hover:opacity-0">
          POTSHOT.GG
        </h1>

        <div className="pointer-events-none absolute top-2 left-1/2 w-[600px] -translate-x-1/2 opacity-0 transition-all duration-500 ease-in-out group-hover:pointer-events-auto group-hover:opacity-100">
          
          <div className="bg-black/80 p-6 backdrop-blur-sm border border-white/50">
            
            <h2 className="font-mono text-lg uppercase tracking-widest text-white">
              Auction & Match Rules
            </h2>

            <div className="mt-4 border-t border-white/50 pt-4">
                <ul className="space-y-2 font-mono text-sm text-gray-300">
                    <li>- Token commitment is required for auction entry.</li>
                    <li>- Top 4 contributors in the auction are selected for the match.</li>
                    <li>- The sole survivor wins the entire pot.</li>
                    <li>- A 10% protocol fee is burned from the winnings.</li>
                </ul>
            </div>
          </div>

          {!connected && mounted && (
            <div className="mt-4 flex flex-col items-center">
              <p className="mb-2 font-mono text-xs uppercase text-white/70">
                Connect Wallet
              </p>
              <WalletMultiButton />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};