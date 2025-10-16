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
    <div className="flex items-center justify-end gap-2">
      <input
        type="number"
        min="1000"
        step="1000"
        value={amount}
        onChange={(e) => setAmount(parseInt(e.target.value, 10) || 1000)}
        className="w-24 bg-transparent text-center focus:outline-none blinking-cursor"
        disabled={isProcessing}
      />
      <button
        onClick={handleBet}
        disabled={isProcessing}
        className="text-green-400 opacity-75 hover:opacity-100 disabled:text-gray-500"
      >
        <span className="text-subtext0">[</span>BET<span className="text-subtext0">]</span>
      </button>
      <button
        onClick={onCancel}
        disabled={isProcessing}
        className="text-maroon opacity-75 hover:opacity-100 disabled:text-gray-500"
      >
        <span className="text-subtext0">[</span>CANCEL<span className="text-subtext0">]</span>
      </button>
    </div>
  );
};

export const Lobby = () => {
  const { socket, players, lobbyCountdown, gamePhase } = useGameStore();
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
              <span className="text-subtext0">[</span>RAISE<span className="text-subtext0">]</span>
            </button>
          </div>
        );
    }
    return (
      <button 
        onClick={() => setIsBettingUiActive(true)} 
        className="w-full text-center text-green-400 opacity-75 hover:opacity-100"
      >
        <span className="text-subtext0">[</span> PLACE A BID TO COMPETE <span className="text-subtext0">]</span>
      </button>
    );
  }

  const PlayerTable = ({ players, title, color }: { players: Player[], title: string, color: string }) => (
    <div role="grid">
      <h3 className={`mb-2 text-lg font-semibold ${color} typing-effect`}>{title}</h3>
      <div className="text-xs text-subtext0" role="row">
        <div className="grid grid-cols-12 gap-2 p-2" role="rowheader">
          <div className="col-span-1 text-center" role="columnheader">RANK</div>
          <div className="col-span-4" role="columnheader">NAME</div>
          <div className="col-span-1 text-center" role="columnheader">KILLS</div>
          <div className="col-span-1 text-center" role="columnheader">DEATHS</div>
          <div className="col-span-1 text-center" role="columnheader">ROUNDS</div>
          <div className="col-span-2 text-right" role="columnheader">NET GAIN</div>
          <div className="col-span-2 text-right" role="columnheader">CURRENT BID</div>
        </div>
      </div>
      <div className="hr-dashed" role="presentation" />
      <div role="rowgroup">
        {players.map(p => <PlayerRow key={p.id} player={p} />)}
      </div>
    </div>
  );

  const PlayerRow = ({ player }: { player: Player }) => {
    const rank = playerRanks.get(player.id);
    return (
      <div className={`grid grid-cols-12 gap-2 p-2 ${player.id === selfId ? "bg-surface1" : ""}`} role="row">
        <div className="col-span-1 text-center text-subtext0" role="gridcell">{rank ? `#${rank}` : '-'}</div>
        <div className="col-span-4" role="gridcell">{player.name}</div>
        <div className="col-span-1 text-center" role="gridcell">{player.stats?.kills ?? 0}</div>
        <div className="col-span-1 text-center" role="gridcell">{player.stats?.deaths ?? 0}</div>
        <div className="col-span-1 text-center" role="gridcell">{player.stats?.totalGamesPlayed ?? 0}</div>
        <div className={`col-span-2 text-right ${(player.stats?.netWinnings ?? 0) > 0 ? 'text-green' : 'text-subtext0'}`} role="gridcell">
          {player.stats?.netWinnings ?? 0}
        </div>
        <div className="col-span-2 text-right" role="gridcell">{renderBidCell(player)}</div>
      </div>
    );
  };

  if (!hasMounted) return null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-end pb-16 bg-base p-4">      {betStatus.isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="border border-yellow-400 bg-black p-8 text-center">
            <div className="mb-4 text-xl text-yellow-400">{betStatus.message}</div>
            <div className="animate-pulse text-4xl">⏳</div>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-7xl flex-col bg-crust border-dashed-ascii">
        <header className="flex items-center justify-between p-3">
          {lobbyCountdown !== null ? (
            <div className="font-title text-3xl text-yellow">
              {lobbyCountdown > 0 ? `T-${lobbyCountdown.toString().padStart(2, "0")}` : "FINALIZING..."}
            </div>
          ) : gamePhase === "IN_ROUND" ? (
            <div className="font-title text-2xl text-red">
              // DUEL IN PROGRESS - PLACE BETS FOR NEXT ROUND
            </div>
          ) : gamePhase === "POST_ROUND" ? (
            <div className="font-title text-2xl text-green">
              // ROUND COMPLETE - NEXT DUEL SOON
            </div>
          ) : null}
        </header>
        <div className="hr-dashed" role="presentation" />

        <main className="flex flex-col gap-4 p-4">
            <>
              <PlayerTable players={fighters} title="// NEXT MATCH: FIGHTERS [TOP 4 BIDS]" color="text-red" />
              <PlayerTable players={contenders} title="// AUCTION IN PROGRESS: CONTENDERS" color="text-teal" />
            </>
            {!connected && (
                <div className="text-center text-subtext0 mt-4">
                    <p>Connect your wallet to participate in the auction.</p>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};