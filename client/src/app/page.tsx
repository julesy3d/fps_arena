"use client";

import { Canvas } from "@react-three/fiber";
import React, { Suspense, useEffect, useState } from "react";
import { Lobby } from "@/components/Lobby";
import { TitleOverlay } from "@/components/TitleOverlay";
import { GlobalStatusUI } from "@/components/GlobalStatusUI";
import { Scene3D } from "@/components/Scene3D";
import { useGameStore } from "@/store/useGameStore";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { DuelUI } from "@/components/DuelScene";
import { AsciiRenderer } from "@react-three/drei";
import { UnifiedMessageDisplay } from "@/components/UnifiedMessageDisplay";
import { MoneyTransferBreakdown } from "@/components/MoneyTransferBreakdown";

const Loader = () => (
  <div className="absolute inset-0 z-50 bg-black flex items-center justify-center text-white text-2xl font-bold">
    LOADING...
  </div>
);

const StreamPlaceholder = ({ isBlurred }: { isBlurred: boolean }) => (
  <div className="absolute inset-0 -z-20 bg-black">
    <img
      src="https://placehold.co/1920x1080/orange/white"
      alt="Stream Placeholder"
      className={`h-full w-full object-cover transition-all duration-300 ${
        isBlurred ? "filter blur-md grayscale" : ""
      }`}
    />
  </div>
);

export default function Home() {
  const { isHydrated, socket, gamePhase, fighters, roundPot } = useGameStore();
  const { connected } = useWallet();
  const [isLobbyVisible, setLobbyVisible] = useState(false);
  const [isTitleHovered, setTitleHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [walletReady, setWalletReady] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkWallet = setInterval(() => {
      if (window.solana || window.phantom) {
        setWalletReady(true);
        clearInterval(checkWallet);
      }
    }, 100);

    const timeout = setTimeout(() => {
      setWalletReady(true);
      clearInterval(checkWallet);
    }, 3000);

    return () => {
      clearInterval(checkWallet);
      clearTimeout(timeout);
    };
  }, []);

  const isFighter = fighters?.some((g) => g.id === socket?.id) ?? false;
  const isStreamBlurred = isLobbyVisible && !isFighter;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        
        if (gamePhase === "IN_ROUND" && isFighter) {
          return;
        }
        
        setLobbyVisible((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gamePhase, isFighter]);

  useEffect(() => {
    if (gamePhase === "LOBBY") {
      setLobbyVisible(true);
    }
  }, [gamePhase]);

  useEffect(() => {
    if (gamePhase === "IN_ROUND" && isFighter && isLobbyVisible) {
      setLobbyVisible(false);
    }
  }, [gamePhase, isFighter, isLobbyVisible]);

  return (
    <main className="font-body">
      <StreamPlaceholder isBlurred={isStreamBlurred} />

      <div className="fixed inset-0 top-[-10%] z-[-1]">
        <Suspense fallback={<Loader />}>
          <Canvas
            camera={{ fov: 75, position: [-10, 2, 0] }}
            frameloop="always"
            gl={{
              powerPreference: "high-performance",
              antialias: false,
            }}
            dpr={[1, 1.5]}
          >
            <color attach="background" args={["#ffffff"]} />
            <AsciiRenderer
              fgColor="black"
              bgColor="white"
              characters=" .:-+*=%@#"
              color={false}
              invert={false}
              resolution={0.25}
            />
            <Scene3D />
          </Canvas>
        </Suspense>
      </div>

      <GlobalStatusUI />

      {gamePhase === "LOBBY" ? (
        <TitleOverlay onHover={setTitleHovered} />
      ) : (
        <UnifiedMessageDisplay />
      )}

      {mounted && walletReady && !connected && !isTitleHovered && (
        <div className="fixed top-4 right-4 z-40 wallet-button-container">
          <WalletMultiButton />
        </div>
      )}

      {gamePhase === "IN_ROUND" && roundPot > 0 && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-30">
          <div className="border-dashed-ascii bg-ascii-shade px-6 py-3">
            <div className="font-mono text-center">
              <div className="text-xs text-subtext1 mb-1"></div>
              <div className="text-2xl font-bold text-amber tracking-wider">
                {roundPot.toLocaleString()} ◎
              </div>
            </div>
          </div>
        </div>
      )}

      <MoneyTransferBreakdown />

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        {connected ? (
          <>
            {!(gamePhase === "IN_ROUND" && isFighter) && (
              <button
                onClick={() => setLobbyVisible((prev) => !prev)}
                className="text-sm text-white opacity-50 hover:opacity-100"
              >
                {isLobbyVisible ? "[CLOSE LOBBY (TAB)]" : "[OPEN LOBBY (TAB)]"}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-center text-gray-500">
            [CONNECT YOUR WALLET AND BID TO FIGHT IN THE NEXT ROUND!]
          </p>
        )}
      </div>

      {!isHydrated && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-3xl animate-pulse">
          CONNECTING TO SERVER...
        </div>
      )}

      {isLobbyVisible && <Lobby />}

      {gamePhase === "IN_ROUND" && isFighter && <DuelUI />}

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-700 bg-black/80 p-1 text-center text-xs text-gray-400">
        Top 2 bidders fight. Winner takes 90% of the pot, 10% tax. Press [TAB] to bet.
      </footer>
    </main>
  );
}
