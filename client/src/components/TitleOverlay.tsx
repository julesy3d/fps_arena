"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface TitleOverlayProps {
  onHover: (isHovering: boolean) => void;
}

export const TitleOverlay = ({ onHover }: TitleOverlayProps) => {
  const { connected } = useWallet();

  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex justify-center pt-4">
      {/* This parent remains the stable hover trigger */}
      <div
        className="relative group"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        {/* The Title: Simplified, no glow. */}
        <h1 className="cursor-pointer font-title text-6xl font-medium tracking-[0.4em] text-white transition-opacity duration-300 group-hover:opacity-0">
          POTSHOT.GG
        </h1>

        {/* The Hover Overlay:
            - FIXED CENTERING with 'left-1/2 -translate-x-1/2'.
            - Y2K aesthetic: transparent, no rounded corners, white outline.
        */}
        <div className="pointer-events-none absolute top-2 left-1/2 w-[600px] -translate-x-1/2 opacity-0 transition-all duration-500 ease-in-out group-hover:pointer-events-auto group-hover:opacity-100">
          
          {/* Main Content Panel */}
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

          {!connected && (
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