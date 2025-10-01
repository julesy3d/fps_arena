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

const LobbyGate = () => {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const socket = useGameStore((state) => state.socket);

  const [isPaying, setIsPaying] = useState(false);
  const [amount, setAmount] = useState("1000");

  // ** NEW: Listen for server-side verification failure **
  useEffect(() => {
    if (!socket) return;
    
    const handleEntryFailed = () => {
        setIsPaying(false); // Reset button on failure
    };

    socket.on("lobby:entryFailed", handleEntryFailed);

    return () => {
        socket.off("lobby:entryFailed", handleEntryFailed);
    };
  }, [socket]);


  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !socket) return;

    const numAmount = parseInt(amount, 10);
    if (numAmount >= 1000) {
      setIsPaying(true);
      try {
        const lamportsToSend = numAmount;
        const treasuryAddress = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS!);

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: treasuryAddress,
            lamports: lamportsToSend,
          })
        );

        const signature = await sendTransaction(transaction, connection);
        console.log("Transaction sent:", signature);
        await connection.confirmTransaction(signature, "processed");
        console.log("Transaction confirmed:", signature);

        socket.emit("player:verifyEntry", {
          signature,
          walletAddress: publicKey.toBase58(),
          amount: lamportsToSend,
        });

      } catch (error) {
        console.error("Payment failed:", error);
        // User rejected or transaction failed before sending to server
        alert("Payment failed. Please try again.");
        setIsPaying(false); // Reset button
      }
    }
  };

  if (!connected || !publicKey) {
    return (
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold">Connect Wallet to Join</h2>
        <p className="text-gray-400">
          You need a Solana wallet to enter the Coliseum.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <form onSubmit={handleEnter} className="flex flex-col items-center gap-4">
      <h2 className="text-2xl font-bold">Join the Auction</h2>
      <p className="text-gray-400">
        Place an initial bet to enter (min. 1000 Lamports)
      </p>
      <div className="flex gap-2 w-full">
        <input
          type="number"
          min="1000"
          step="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-1/3 border border-gray-700 bg-gray-900 p-3 text-center font-mono"
          disabled={isPaying}
        />
        <button
          type="submit"
          disabled={isPaying || parseInt(amount) < 1000}
          className="w-2/3 border border-yellow-700 bg-yellow-900 p-3 font-bold text-white hover:bg-yellow-800 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
        >
          {isPaying ? "VERIFYING ON-CHAIN..." : "PAY & ENTER"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        This will send real SOL on Devnet. Make sure you have Devnet SOL.
      </p>
    </form>
  );
};


const BettingPanel = ({ self }: { self: Player | null }) => {
  const socket = useGameStore((state) => state.socket);
  const [betAmount, setBetAmount] = useState("100");
  const [isBetting, setIsBetting] = useState(false);

  useEffect(() => {
    if (isBetting) {
      setIsBetting(false);
    }
  }, [self?.betAmount]);

  const handleIncreaseBet = () => {
    const amount = parseInt(betAmount, 10);
    if (socket && amount > 0 && !isBetting) {
      setIsBetting(true);
      socket.emit("player:placeBet", amount);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2 w-full">
            <input
                type="number"
                step={100}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-1/3 border border-gray-700 bg-gray-900 p-3 text-center font-mono"
                disabled={isBetting}
            />
            <button
                onClick={handleIncreaseBet}
                disabled={isBetting || parseInt(betAmount) <= 0}
                className="w-2/3 border p-3 font-bold text-white enabled:border-green-700 enabled:bg-green-900 enabled:hover:bg-green-800 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
            >
                {isBetting ? "INCREASING..." : "INCREASE BET"}
            </button>
        </div>
        <p className="text-xs text-gray-500">
            (Note: Increasing bets is not yet on-chain)
        </p>
    </div>
  );
};

export const Lobby = () => {
  const socket = useGameStore((state) => state.socket);
  const players = useGameStore((state) => state.players);
  const lobbyCountdown = useGameStore((state) => state.lobbyCountdown);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const lobbyPhase = useGameStore((state) => state.lobbyPhase);
  const isVerified = useGameStore((state) => state.isVerified);
  const isConnected = useGameStore((state) => state.isConnected);
  const reconnectSocket = useGameStore((state) => state.reconnectSocket);
  const self = socket && socket.id ? players[socket.id] : null;

  // ** NEW: State to prevent hydration mismatch **
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const { fighters, contenders } = useMemo(() => {
    const playerArray = Object.values(players);
    const allContenders = playerArray
      .filter((p) => p.role === "CONTENDER")
      .sort(
        (a, b) =>
          b.betAmount - (a.betAmount || 0) ||
          (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0),
      );
    const top4 = allContenders.slice(0, 4);
    const everyoneElse = playerArray
      .filter((p) => !top4.some((top) => top.id === p.id))
      .sort((a, b) => (b.betAmount || 0) - (a.betAmount || 0));
    return { fighters: top4, contenders: everyoneElse };
  }, [players]);

  const renderActionPanel = () => {
    if (!hasMounted) return null; // Don't render wallet-dependent UI on the server
    if (!isVerified) return <LobbyGate />;
    if (lobbyPhase === "NAME_INPUT") return <NameInput />;
    if (lobbyPhase === "BETTING") return <BettingPanel self={self} />;
    return <LobbyGate />;
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
        {/* Only render the wallet button on the client */}
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