"use client";

import { useGameStore, Player } from "@/store/useGameStore";
import { useMemo, useState, useEffect } from "react";
import { NameInput } from "./NameInput";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  SystemProgram,
  Transaction,
  PublicKey,
} from "@solana/web3.js";


/**
 * The BettingPanel is now the primary action component for contenders.
 */
const BettingPanel = ({ self }: { self: Player | null }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const socket = useGameStore((state) => state.socket);

  const [betAmount, setBetAmount] = useState("1000"); // Default to 1000 lamports
  const [isBetting, setIsBetting] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const handleBetFailed = () => setIsBetting(false);
    socket.on("lobby:betFailed", handleBetFailed);
    return () => {
      socket.off("lobby:betFailed", handleBetFailed);
    };
  }, [socket]);

  useEffect(() => {
    // If the bet was successful, the server will update the player state,
    // which triggers a re-render here. We can reset the button.
    if (isBetting) {
      setIsBetting(false);
    }
  }, [self?.betAmount]);

  const handlePlaceBet = async () => {
    if (!publicKey || !socket) return;

    const amount = parseInt(betAmount, 10);
    if (amount > 0 && !isBetting) {
      setIsBetting(true);
      try {
        const treasuryAddress = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS!);
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: treasuryAddress,
            lamports: amount,
          })
        );

        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "processed");

        // Ask server to verify the bet transaction
        socket.emit("player:verifyBet", {
          signature,
          walletAddress: publicKey.toBase58(),
          amount,
        });
      } catch (error) {
        console.error("Betting failed:", error);
        alert("Bet transaction failed. Please try again.");
        setIsBetting(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-2xl font-bold">Place a Bet to Fight</h2>
      <p className="text-gray-400">Your bet determines your rank. Top 4 bidders get to fight.</p>
        <div className="flex gap-2 w-full">
            <input
                type="number"
                min="1000"
                step="100"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-1/3 border border-gray-700 bg-gray-900 p-3 text-center font-mono"
                disabled={isBetting}
            />
            <button
                onClick={handlePlaceBet}
                disabled={isBetting || parseInt(betAmount) <= 0}
                className="w-2/3 border p-3 font-bold text-white enabled:border-green-700 enabled:bg-green-900 enabled:hover:bg-green-800 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
            >
                {isBetting ? "VERIFYING BET..." : "PLACE BET"}
            </button>
        </div>
        <p className="text-xs text-gray-500">
          This will send real SOL on Devnet. Outbid bets are burned.
        </p>
    </div>
  );
};


export const Lobby = () => {
  const socket = useGameStore((state) => state.socket);
  const players = useGameStore((state) => state.players);
  const lobbyCountdown = useGameStore((state) => state.lobbyCountdown);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const isConnected = useGameStore((state) => state.isConnected);
  const reconnectSocket = useGameStore((state) => state.reconnectSocket);
  const { publicKey, connected } = useWallet();

  const self = socket && socket.id ? players[socket.id] : null;

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Effect to automatically join the lobby when wallet connects
  useEffect(() => {
    if (socket && connected && publicKey && !self) {
      socket.emit("player:joinWithWallet", { walletAddress: publicKey.toBase58() });
    }
  }, [socket, connected, publicKey, self]);

  const { fighters, contenders } = useMemo(() => {
    const playerArray = Object.values(players);
    const allContenders = playerArray
      .filter((p) => p.betAmount > 0) // Only players who have bet are contenders for a spot
      .sort(
        (a, b) =>
          b.betAmount - a.betAmount ||
          (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0),
      );
    const top4 = allContenders.slice(0, 4);
    const everyoneElse = Object.values(players)
      .filter((p) => !top4.some((top) => top.id === p.id))
      .sort((a, b) => (b.betAmount || 0) - (a.betAmount || 0));
    return { fighters: top4, contenders: everyoneElse };
  }, [players]);

  const renderActionPanel = () => {
    if (!hasMounted) return null;
    if (!connected) {
        return (
             <div className="flex flex-col items-center gap-4">
                <h2 className="text-2xl font-bold">Connect Wallet to Join</h2>
                <p className="text-gray-400">PotShot.gg is a web3 FPS arena.</p>
                <WalletMultiButton />
            </div>
        )
    }
    // Once connected, show the betting panel
    return <BettingPanel self={self} />;
  };

  return (
    <div className="flex w-full max-w-2xl flex-col border border-gray-600 bg-black">
      <div className="flex items-center justify-between border-b border-gray-600 p-3">
        <h2 className="text-xl font-bold tracking-widest text-white">LOBBY</h2>
        {lobbyCountdown !== null && (
          <div className="font-mono text-2xl text-yellow-400">
            {lobbyCountdown > 0
              ? `00:${lobbyCountdown.toString().padStart(2, "0")}`
              : "FINALIZING"}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-1">
        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-xs font-mono text-gray-400">CONNECTED</span>
          </div>
        ) : (
          <button
            onClick={reconnectSocket}
            className="flex items-center gap-2 text-xs font-mono text-red-500 hover:text-white"
          >
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>OFFLINE (Click to reconnect)</span>
          </button>
        )}
        {hasMounted && <WalletMultiButton />}
      </div>

      {gamePhase === "IN_ROUND" ? (
        <div className="flex w-full items-center justify-center border-y border-gray-600 bg-black aspect-video text-gray-400">
          STREAM OF CURRENT MATCH
        </div>
      ) : (
        <div className="flex w-full items-center justify-center border-y border-gray-600 bg-gray-900 aspect-video text-gray-600">
          WAITING FOR NEXT MATCH
        </div>
      )}

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold text-red-500">
            Fighters ({fighters.length} / 4)
          </h3>
          <ul className="min-h-[120px] space-y-1 border border-gray-700 bg-gray-900 p-2">
            {fighters.map((p, index) => (
              <li key={p.id} className="flex justify-between bg-gray-800 p-2">
                <span>
                  {index + 1}. {p.name}
                  {p.id === self?.id && (
                    <span className="ml-2 text-green-400">(you)</span>
                  )}
                </span>
                <span className="font-mono text-yellow-400">
                  {p.betAmount} Lamports
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-lg font-semibold text-blue-400">
            Contenders ({contenders.length})
          </h3>
          <ul className="min-h-[120px] space-y-1 border border-gray-700 bg-gray-900 p-2">
            {contenders.map((p) => (
              <li key={p.id} className="flex justify-between bg-gray-800 p-2">
                <span>
                  {p.name}
                  {p.id === self?.id && (
                    <span className="ml-2 text-green-400">(you)</span>
                  )}
                </span>
                {p.betAmount > 0 && (
                  <span className="font-mono text-gray-500">
                    {p.betAmount} Lamports
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-600 p-4">{renderActionPanel()}</div>
    </div>
  );
};