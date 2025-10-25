"use client";

import { useGameStore, Player } from "@/store/useGameStore";
import { useMemo, useState, useEffect, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { authenticateWallet } from "@/utils/walletAuth";


const BetControls = ({
  onBet,
  onCancel,
  isProcessing
}: {
  onBet: (amount: number) => void;
  onCancel: () => void;
  isProcessing: boolean;
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
        className="w-20 text-center text-xs focus:outline-none blinking-cursor px-1 bg-overlay text-text"
        disabled={isProcessing}
      />
      <button
        onClick={handleBet}
        disabled={isProcessing}
        className={`opacity-75 hover:opacity-100 text-xs ${isProcessing ? 'text-subtext1' : 'text-success'}`}
      >
        <span className="text-subtext1">[</span>BET<span className="text-subtext1">]</span>
      </button>
      <button
        onClick={onCancel}
        disabled={isProcessing}
        className={`opacity-75 hover:opacity-100 text-xs ${isProcessing ? 'text-subtext1' : 'text-error'}`}
      >
        <span className="text-subtext1">[</span>CANCEL<span className="text-subtext1">]</span>
      </button>
    </div>
  );
};

export const Lobby = () => {
  const { socket, players, lobbyCountdown, gamePhase } = useGameStore();
  const { connected, publicKey, signTransaction } = useWallet();
  useConnection();
  const selfId = socket?.id || null;

  const [hasMounted, setHasMounted] = useState(false);
  const [isBettingUiActive, setIsBettingUiActive] = useState(false);
  const [betStatus, setBetStatus] = useState<{
    isProcessing: boolean;
    message: string;
  }>({ isProcessing: false, message: "" });

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const wallet = useWallet();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
      const attemptAuth = async () => {
        // Don't attempt if not ready
        if (!socket || !connected || !publicKey || isAuthenticating) {
          return;
        }
        
        // Already authenticated?
        if (selfId && players[selfId]) {
          return;
        }
        
        setIsAuthenticating(true);
        
        try {
          await authenticateWallet(socket, wallet);
          console.log('✅ Wallet authenticated successfully');
        } catch (error) {
          console.error('❌ Wallet authentication failed:', error);
          alert('Failed to authenticate wallet. Please try reconnecting.');
        } finally {
          setIsAuthenticating(false);
        }
      };
      
      attemptAuth();
    }, [socket, connected, publicKey, players, selfId, isAuthenticating, wallet]);

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
      return Object.values(players).sort((a, b) => (b.betAmount ?? 0) - (a.betAmount ?? 0) || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0));
  }, [players]);

  const fighters = sortedByBid.slice(0, 4).filter(p => p.betAmount > 0);
  
  const contenders = useMemo(() => {
    let others = sortedByBid.filter(p => !fighters.some(f => f.id === p.id));
    if (self && !fighters.some(f => f.id === self.id)) {
        others = others.filter(p => p.id !== self.id);
        return [self, ...others].slice(0, 100);
    }
    return others.slice(0, 100);
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
        if (error instanceof Error) {
          alert(`Transaction failed: ${error.message}`);
        } else {
          alert("An unknown error occurred during the transaction.");
        }
        setBetStatus({ isProcessing: false, message: "" });
        setIsBettingUiActive(false);
      }
    };

    const handleBetVerified = () => {
      setBetStatus({ isProcessing: false, message: "" });
      setIsBettingUiActive(false);
    };

    const handleBetFailed = (errorMessage: string) => {
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

  const handleNameClick = () => {
    if (!self) return;
    setIsEditingName(true);
    setEditedName(self.name);
  };

  const handleNameSubmit = () => {
    if (socket && editedName.trim() && editedName.trim() !== self?.name) {
      socket.emit("player:setName", editedName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);
  
  const renderBidCell = (player: Player) => {
    const isSelf = player.id === selfId;
    if (!isSelf) {
        return <span className="text-subtext0">{player.betAmount > 0 ? player.betAmount : 'SPECTATING'}</span>;
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
          />
        );
    }
    if (player.betAmount > 0) {
        return (
          <div className="flex items-center justify-end gap-2 text-text">
            <span>{player.betAmount}</span> 
            <button 
              onClick={() => setIsBettingUiActive(true)} 
              className="opacity-75 hover:opacity-100 text-xs text-warning"
            >
              <span className="text-subtext1">[</span>RAISE<span className="text-subtext1">]</span>
            </button>
          </div>
        );
    }
    return (
      <button 
        onClick={() => setIsBettingUiActive(true)} 
        className="w-full text-right opacity-75 hover:opacity-100 text-xs whitespace-nowrap text-success"
      >
        <span className="text-subtext1">[</span>BET TO PLAY<span className="text-subtext1">]</span>
      </button>
    );
  }

  const PlayerTable = ({ players, title, titleClassName }: { players: Player[], title: string, titleClassName: string }) => (
    <div role="grid">
      <h3 className={`mb-2 text-base font-semibold ${titleClassName}`}>{title}</h3>
      <div className="text-xs text-subtext1" role="row">
              <div className="grid grid-cols-12 gap-2 p-2" role="rowheader">
                <div className="col-span-1 text-center" role="columnheader">RANK</div>
                <div className="col-span-3" role="columnheader">NAME</div>
                <div className="col-span-1 text-center" role="columnheader">KILLS</div>
                <div className="col-span-1 text-center" role="columnheader">DEATHS</div>
                <div className="col-span-1 text-center" role="columnheader">ROUNDS</div>
                <div className="col-span-1 text-right" role="columnheader">NET GAIN</div>
                <div className="col-span-4 text-right" role="columnheader">CURRENT BID</div>
              </div>
      </div>
      <div className="hr-dashed" role="presentation" />
      <div role="rowgroup">
        {players.length === 0 ? (
          <div className="p-4 text-center text-xs italic text-subtext1">
            No active bidders yet. Place a bet to enter the arena!
          </div>
        ) : (
          players.map(p => <PlayerRow key={p.id} player={p} />)
        )}
      </div>
    </div>
  );

  const PlayerRow = ({ player }: { player: Player }) => {
    const rank = playerRanks.get(player.id);
    const isSelf = player.id === selfId;
    
    return (
      <div
        className={`grid grid-cols-12 gap-2 p-2 text-xs ${isSelf ? 'bg-surface text-text' : 'text-subtext0'}`}
        role="row"
      >
        <div className="col-span-1 text-center text-subtext1" role="gridcell">
          {rank ? `#${rank}` : '-'}
        </div>
        <div className="col-span-3" role="gridcell">
          {isSelf && isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              className="w-full border-b border-lavender bg-overlay px-1 text-xs text-text focus:outline-none"
              maxLength={16}
            />
          ) : (
            <span
              onClick={isSelf ? handleNameClick : undefined}
              className={isSelf ? "cursor-pointer hover:opacity-80" : ""}
            >
              {player.name}
              {isSelf && <span className="ml-1 text-subtext1">(YOU)</span>}
            </span>
          )}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.kills ?? 0}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.deaths ?? 0}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.totalGamesPlayed ?? 0}
        </div>
        <div
          className={`col-span-1 text-right ${(player.stats?.netWinnings ?? 0) > 0 ? 'text-success' : 'text-subtext1'}`}
          role="gridcell"
        >
          {player.stats?.netWinnings ?? 0}
        </div>
        <div className="col-span-4 text-right" role="gridcell">
          {renderBidCell(player)}
        </div>
      </div>
    );
  };

  if (!hasMounted) return null;
  
  if (isAuthenticating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="border-dashed-ascii bg-ascii-shade p-8">
          <div className="text-lg text-subtext0 mb-4">
            Authenticating Wallet...
          </div>
          <div className="text-sm text-subtext1">
            Please sign the message in your wallet
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-end bg-base/2 p-4 pb-16 text-text">
      {betStatus.isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="border border-lavender bg-base p-8 text-center">
            <div className="mb-4 text-xl text-lavender">{betStatus.message}</div>
            <div className="animate-pulse text-4xl">⏳</div>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-[90%] flex-col border-dashed-ascii bg-ascii-shade">
        <header className="flex items-center justify-between p-3">
          {lobbyCountdown !== null ? (
            <div className="font-title text-2xl text-lavender">
              {lobbyCountdown > 0 ? `T-${lobbyCountdown.toString().padStart(2, "0")}` : "FINALIZING..."}
            </div>
          ) : gamePhase === "IN_ROUND" ? (
            <div className="font-title text-xl text-rose">
            </div>
          ) : gamePhase === "POST_ROUND" ? (
            <div className="font-title text-xl text-sage">
            </div>
          ) : (
            <div className="font-title text-xl text-subtext1">
            </div>
          )}
        </header>
        <div className="hr-dashed" role="presentation" />

        <main className="flex flex-col gap-4 p-4">
          <PlayerTable 
            players={fighters} 
            title={
              gamePhase === "IN_ROUND" 
                ? "// CURRENT DUEL: FIGHTERS [TOP 2 BIDS]"
                : "// NEXT DUEL: FIGHTERS [TOP 2 BIDS]"
            }
            titleClassName="text-subtext1" 
          />
          
          <div>
            <h3 className="mb-2 text-base font-semibold text-subtext1">
            </h3>
            <div className="text-xs text-subtext1" role="row">
              <div className="grid grid-cols-12 gap-2 p-2" role="rowheader">
                <div className="col-span-1 text-center" role="columnheader">RANK</div>
                <div className="col-span-3" role="columnheader">NAME</div>
                <div className="col-span-1 text-center" role="columnheader">KILLS</div>
                <div className="col-span-1 text-center" role="columnheader">DEATHS</div>
                <div className="col-span-1 text-center" role="columnheader">ROUNDS</div>
                <div className="col-span-1 text-right" role="columnheader">NET GAIN</div>
                <div className="col-span-4 text-right" role="columnheader">CURRENT BID</div>
              </div>
            </div>
            <div className="hr-dashed" role="presentation" />
            <div className="max-h-[300px] overflow-y-auto" role="rowgroup">
              {contenders.length === 0 ? (
                <div className="p-4 text-center text-xs italic text-subtext0">
                  Waiting for contenders to join...
                </div>
              ) : (
                contenders.map(p => <PlayerRow key={p.id} player={p} />)
              )}
            </div>
          </div>

          {!connected && (
            <div className="mt-4 text-center text-xs text-subtext0">
              <p>Connect your wallet to participate in the auction.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
