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
        {/* ASCII Title */}
        <div className="cursor-pointer transition-opacity duration-300 group-hover:opacity-0">
          <pre className="text-center text-text text-[10px] leading-tight">
{`
 ███████████     █████     █████       ███     █████         █████    ███████████      █████████    █████████ 
░░███░░░░░███  ███░░░███  ░░███       ██████  ░░███        ███░░░███ ░█░░░███░░░█     ███░░░░░███  ███░░░░░███
 ░███    ░███ ███   ░░███ ███████    ███░░░    ░███████   ███   ░░███░   ░███  ░     ███     ░░░  ███     ░░░ 
 ░██████████ ░███    ░███░░░███░    ░░█████    ░███░░███ ░███    ░███    ░███       ░███         ░███         
 ░███░░░░░░  ░███    ░███  ░███      ░░░░███   ░███ ░███ ░███    ░███    ░███       ░███    █████░███    █████
 ░███        ░░███   ███   ░███ ███  ██████    ░███ ░███ ░░███   ███     ░███       ░░███  ░░███ ░░███  ░░███ 
 █████        ░░░█████░    ░░█████  ░░░███     ████ █████ ░░░█████░      █████    ██ ░░█████████  ░░█████████ 
░░░░░           ░░░░░░      ░░░░░     ░░░     ░░░░ ░░░░░    ░░░░░░      ░░░░░    ░░   ░░░░░░░░░    ░░░░░░░░░  
`}
          </pre>
        </div>

        {/* Hover Content */}
        <div className="absolute top-0 left-0 w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
          <div className="border-dashed-ascii bg-ascii-shade p-4">
            <h2 className="text-lg uppercase tracking-widest text-amber">
              {/* Auction & Match Rules */}
            </h2>
            
            <div className="hr-dashed my-4" role="presentation" />
            
            <ul className="space-y-2 text-sm text-subtext0">
              <li>{'>'} Token commitment is required for auction entry.</li>
              <li>{'>'} Top 2 contributors are selected for the next duel.</li>
              <li>{'>'} The sole survivor wins the entire pot.</li>
              <li>{'>'} A 10% protocol fee is burned from winnings.</li>
            </ul>

            {!connected && mounted && (
              <>
                <div className="hr-dashed my-4" role="presentation" />
                <div className="flex flex-col items-center">
                  <p className="mb-2 text-xs uppercase text-subtext0">
                    {/* Connect Wallet */}
                  </p>
                  <WalletMultiButton />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};