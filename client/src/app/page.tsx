"use client";
import { GameScene } from "@/components/GameScene";
import { Lobby } from "@/components/Lobby";
import { TitleOverlay } from "@/components/TitleOverlay";
import { useGameStore } from "@/store/useGameStore";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

const ConnectionStatus = () => {
  const isConnected = useGameStore((state) => state.isConnected);
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 ${isConnected ? "animate-pulse bg-green-500" : "bg-red-500"}`} />
      <span className={`text-xs ${isConnected ? "text-green-500" : "text-red-500"}`}>
        {isConnected ? "CONNECTED" : "OFFLINE"}
      </span>
    </div>
  );
};

const StreamPlaceholder = ({ isBlurred }: { isBlurred: boolean }) => (
  <div className="absolute inset-0 -z-10 bg-black">
    <img 
      src="https://placehold.co/1920x1080/orange/white"
      alt="Stream Placeholder"
      className={`h-full w-full object-cover transition-all duration-300 ${isBlurred ? "filter blur-md grayscale" : ""}`}
    />
  </div>
);


export default function Home() {
  const { socket, gamePhase, fighters, connectSocket, roundWinner } = useGameStore();
  const { connected } = useWallet();
  const [isLobbyVisible, setLobbyVisible] = useState(false);
  const [isTitleHovered, setTitleHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    connectSocket();
  }, [connectSocket]);

  const isFighter = fighters?.some((g) => g.id === socket?.id) ?? false;
  const isStreamBlurred = isLobbyVisible && !isFighter;
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (connected) {
            setLobbyVisible((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connected]);

  return (
    <main className="font-body">

      <StreamPlaceholder isBlurred={isStreamBlurred} />

      <div className="fixed top-4 left-4 z-40">
        <ConnectionStatus />
      </div>

      <TitleOverlay onHover={setTitleHovered} />
      
      {mounted && !connected && !isTitleHovered && (
        <div className="fixed top-4 right-4 z-40 wallet-button-container">
          <WalletMultiButton />
        </div>
      )}

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        {connected ? (
            <button 
                onClick={() => setLobbyVisible(prev => !prev)}
                className="text-sm text-white opacity-50 hover:opacity-100"
            >
                {isLobbyVisible ? "[CLOSE LOBBY (TAB)]" : "[OPEN LOBBY (TAB)]"}
            </button>
        ) : (
            <p className="text-sm text-center text-gray-500">
                [CONNECT YOUR WALLET AND BID TO FIGHT IN THE NEXT ROUND!]
            </p>
        )}
      </div>

      {isFighter && gamePhase === "IN_ROUND" ? (
        <>
          <div className="crosshair">+</div>
          <GameScene />
        </>
      ) : (
        isLobbyVisible && connected && <Lobby />
      )}
      
      {roundWinner && (
        <div className="absolute top-1/3 left-1/2 z-20 -translate-x-1/2 border-4 border-black bg-yellow-400 p-8 text-center">
           <h2 className="font-title text-4xl font-bold">WINNER!</h2>
           <p className="mt-2 text-2xl">
           {roundWinner.name} takes the pot of {roundWinner.pot} Lamports!
           </p>
       </div>
     )}

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-700 bg-black/80 p-1 text-center text-xs text-gray-400">
        Top 4 bidders fight to the last. All bids go to the winner, minus a 10% burn.
      </footer>
    </main>
  );
}