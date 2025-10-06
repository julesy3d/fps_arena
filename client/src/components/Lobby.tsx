"use client";

import { useGameStore, Player } from "@/store/useGameStore";
import { useMemo, useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

const BetControls = ({ 
  onBet, 
  onCancel,
  isProcessing,
  statusMessage 
}: { 
  onBet: (amount: number) => void; 
  onCancel: () => void;
  isProcessing: boolean;
  statusMessage: string;
}) => {
  const [amount, setAmount] = useState(1000);

  const handleBet = async () => {
    await onBet(amount);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min="1000"
        step="1000"
        value={amount}
        onChange={(e) => setAmount(parseInt(e.target.value, 10) || 1000)}
        className="w-24 border border-gray-600 bg-black p-1 text-center text-white"
        disabled={isProcessing}
      />
      <button 
        onClick={handleBet} 
        disabled={isProcessing} 
        className="px-2 py-1 text-xs text-green-400 opacity-75 hover:opacity-100 disabled:text-gray-500"
      >
        {isProcessing ? `[${statusMessage}]` : "[BET]"}
      </button>
      <button 
        onClick={onCancel} 
        disabled={isProcessing} 
        className="px-2 py-1 text-xs text-red-400 opacity-75 hover:opacity-100 disabled:text-gray-500"
      >
        [CANCEL]
      </button>
    </div>
  );
};

export const Lobby = () => {
  const { socket, players, lobbyCountdown } = useGameStore();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const selfId = socket?.id || null;

  const [hasMounted, setHasMounted] = useState(false);
  const [isBettingUiActive, setIsBettingUiActive] = useState(false);
  const [betStatus, setBetStatus] = useState<{
    isProcessing: boolean;
    message: string;
  }>({ isProcessing: false, message: "" });

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    if (socket && connected && publicKey && !players[selfId!]) {
      socket.emit("player:joinWithWallet", { walletAddress: publicKey.toBase58() });
    }
  }, [socket, connected, publicKey, players, selfId]);

  const { playerRanks, self } = useMemo(() => {
    const allPlayers = Object.values(players);
    const sortedByNetWinnings = [...allPlayers].sort((a, b) => (b.stats?.netWinnings ?? 0) - (a.stats?.netWinnings ?? 0));
    const ranks = new Map<string, number>();
    sortedByNetWinnings.forEach((p, i) => {
      if (p.stats) {
        ranks.set(p.id, i + 1);
      }
    });
    return { playerRanks: ranks, self: selfId ? players[selfId] : null };
  }, [players, selfId]);

  const sortedByBid = useMemo(() => {
      return Object.values(players).sort((a, b) => (b.betAmount ?? 0) - (a.betAmount ?? 0));
  }, [players]);

  const fighters = sortedByBid.slice(0, 4).filter(p => p.betAmount > 0);
  
  const contenders = useMemo(() => {
    let others = sortedByBid.filter(p => !fighters.some(f => f.id === p.id));
    if (self && !fighters.some(f => f.id === self.id)) {
        others = others.filter(p => p.id !== self.id);
        return [self, ...others];
    }
    return others;
  }, [sortedByBid, fighters, self]);

  const handleBet = async (amount: number) => {
    if (!publicKey || !socket || !signTransaction) return;
    
    setBetStatus({ isProcessing: true, message: "..." });
    socket.emit("player:requestBet", { amount });
  };

  // Socket event handlers for new bet flow
  useEffect(() => {
    if (!socket || !signTransaction) return;

    const handleSignatureRequest = async ({ serializedTx, amount }: { serializedTx: string; amount: number }) => {
      setBetStatus({ isProcessing: true, message: "SIGN IN WALLET" });
      
      try {
        const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));
        const signedTx = await signTransaction(tx);
        const serialized = signedTx.serialize().toString('base64');
        
        setBetStatus({ isProcessing: true, message: "CONFIRMING..." });
        socket.emit("player:submitSignedBet", { 
          serializedTx: serialized, 
          amount 
        });
      } catch (error) {
        console.error("Signing failed:", error);
        alert("Transaction cancelled or rejected by wallet");
        setBetStatus({ isProcessing: false, message: "" });
        setIsBettingUiActive(false);
      }
    };

    const handleBetVerified = ({ signature }: { signature: string }) => {
      console.log("✅ Bet confirmed on-chain:", signature);
      setBetStatus({ isProcessing: false, message: "" });
      setIsBettingUiActive(false);
    };

    const handleBetFailed = (errorMessage: string) => {
      console.error("Bet failed:", errorMessage);
      alert(`Bet failed: ${errorMessage}`);
      setBetStatus({ isProcessing: false, message: "" });
      setIsBettingUiActive(false);
    };

    socket.on("lobby:signatureRequest", handleSignatureRequest);
    socket.on("lobby:betVerified", handleBetVerified);
    socket.on("lobby:betFailed", handleBetFailed);

    return () => {
      socket.off("lobby:signatureRequest", handleSignatureRequest);
      socket.off("lobby:betVerified", handleBetVerified);
      socket.off("lobby:betFailed", handleBetFailed);
    };
  }, [socket, signTransaction]);
  
  const renderBidCell = (player: Player) => {
    const isSelf = player.id === selfId;
    if (!isSelf) {
        return player.betAmount > 0 ? player.betAmount : 'SPECTATING';
    }
    if (isBettingUiActive) {
        return (
          <BetControls 
            onBet={handleBet} 
            onCancel={() => {
              setIsBettingUiActive(false);
              setBetStatus({ isProcessing: false, message: "" });
            }}
            isProcessing={betStatus.isProcessing}
            statusMessage={betStatus.message}
          />
        );
    }
    if (player.betAmount > 0) {
        return (
          <div className="flex items-center justify-end gap-2">
            <span>{player.betAmount}</span> 
            <button 
              onClick={() => setIsBettingUiActive(true)} 
              className="text-yellow-400 opacity-75 hover:opacity-100"
            >
              [RAISE]
            </button>
          </div>
        );
    }
    return (
      <button 
        onClick={() => setIsBettingUiActive(true)} 
        className="w-full text-center text-green-400 opacity-75 hover:opacity-100"
      >
        [ PLACE A BID TO COMPETE ]
      </button>
    );
  }

  const PlayerRow = ({ player }: { player: Player }) => {
    const rank = playerRanks.get(player.id);
    return (
        <tr className={`border-b border-gray-800/50 ${player.id === selfId ? "bg-blue-900/40" : ""}`}>
            <td className="p-2 w-16 text-center text-gray-500">{rank ? `#${rank}` : '-'}</td>
            <td className="p-2">{player.name}</td>
            <td className="p-2 w-20 text-center">{player.stats?.kills ?? 0}</td>
            <td className="p-2 w-20 text-center">{player.stats?.deaths ?? 0}</td>
            <td className="p-2 w-20 text-center">{player.stats?.totalGamesPlayed ?? 0}</td>
            <td className={`p-2 w-40 text-right ${ (player.stats?.netWinnings ?? 0) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
              {player.stats?.netWinnings ?? 0}
            </td>
            <td className="p-2 w-64 text-right">{renderBidCell(player)}</td>
        </tr>
    );
  };

  if (!hasMounted) return null;

  return (
   <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-black/50 p-4 backdrop-blur-md">
      {/* Processing Overlay */}
      {betStatus.isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="border border-yellow-400 bg-black p-8 text-center">
            <div className="mb-4 text-xl text-yellow-400">{betStatus.message}</div>
            <div className="animate-pulse text-4xl">⏳</div>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-7xl flex-col border border-gray-600 bg-black/80">
        <header className="flex items-center justify-between border-b border-gray-600 p-3">
          <h1 className="font-title text-2xl tracking-[0.2em] text-white">POTSHOT.GG</h1>
          {lobbyCountdown !== null && (
            <div className="font-title text-3xl text-yellow-400">
              {lobbyCountdown > 0 ? `T-${lobbyCountdown.toString().padStart(2, "0")}` : "FINALIZING..."}
            </div>
          )}
        </header>

        <div className="flex items-center justify-end p-2 h-10" />

        <main className="flex flex-col gap-4 p-4">
          {connected ? (
            <>
              <div>
                  <h3 className="mb-2 text-lg font-semibold text-red-500">{'// NEXT MATCH: FIGHTERS [TOP 4 BIDS]'}</h3>
                  <table className="w-full border-collapse">
                      <thead>
                          <tr className="border-b border-gray-700 text-left text-xs text-gray-400">
                              <th className="p-2 w-16 text-center">RANK</th>
                              <th className="p-2">NAME</th>
                              <th className="p-2 w-20 text-center">KILLS</th>
                              <th className="p-2 w-20 text-center">DEATHS</th>
                              <th className="p-2 w-20 text-center">ROUNDS</th>
                              <th className="p-2 w-40 text-right">NET GAIN</th>
                              <th className="p-2 w-64 text-right">CURRENT BID</th>
                          </tr>
                      </thead>
                      <tbody>
                          {fighters.map(p => <PlayerRow key={p.id} player={p} />)}
                      </tbody>
                  </table>
              </div>
              <div>
                  <h3 className="mb-2 text-lg font-semibold text-blue-400">{'// AUCTION IN PROGRESS: CONTENDERS'}</h3>
                   <table className="w-full border-collapse">
                       <thead>
                          <tr className="border-b border-gray-700 text-left text-xs text-gray-400">
                              <th className="p-2 w-16 text-center">RANK</th>
                              <th className="p-2">NAME</th>
                              <th className="p-2 w-20 text-center">KILLS</th>
                              <th className="p-2 w-20 text-center">DEATHS</th>
                              <th className="p-2 w-20 text-center">ROUNDS</th>
                              <th className="p-2 w-40 text-right">NET GAIN</th>
                              <th className="p-2 w-64 text-right">CURRENT BID</th>
                          </tr>
                      </thead>
                      <tbody>
                          {contenders.map(p => <PlayerRow key={p.id} player={p} />)}
                      </tbody>
                  </table>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
                <p>Connect your wallet to participate in the auction.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};