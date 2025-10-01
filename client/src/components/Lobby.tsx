"use client";

import { useGameStore, Player } from "@/store/useGameStore";
import { useMemo, useState, useEffect } from "react";
import { NameInput } from "./NameInput";

// Sub-component for the initial entry fee gate
const LobbyGate = () => {
  const socket = useGameStore((state) => state.socket);
  const [isPaying, setIsPaying] = useState(false);
  const [amount, setAmount] = useState("1000");

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);
    if (numAmount >= 1000) {
      setIsPaying(true);
      socket?.emit('player:enterLobby', numAmount);
    }
  };

  return (
    <form onSubmit={handleEnter} className="flex flex-col items-center gap-4">
      <h2 className="text-2xl font-bold">Join the Auction</h2>
      <p className="text-gray-400">Place an initial bet to enter (min. 1000)</p>
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
        <button type="submit" disabled={isPaying || !socket || parseInt(amount) < 1000} className="w-2/3 border border-yellow-700 bg-yellow-900 p-3 font-bold text-white hover:bg-yellow-800 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500">
          {isPaying ? 'PROCESSING...' : 'PAY & ENTER'}
        </button>
      </div>
    </form>
  );
};

// Sub-component for the betting controls
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
      socket.emit('player:placeBet', amount);
    }
  };

  return (
    <div className="flex gap-2">
      <input type="number" step={100} value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-1/3 border border-gray-700 bg-gray-900 p-3 text-center font-mono" disabled={isBetting} />
      <button onClick={handleIncreaseBet} disabled={isBetting || parseInt(betAmount) <= 0} className="w-2/3 border p-3 font-bold text-white enabled:border-green-700 enabled:bg-green-900 enabled:hover:bg-green-800 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500">
        {isBetting ? "INCREASING..." : "INCREASE BET"}
      </button>
    </div>
  );
};


// Main Lobby Component
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

  const { fighters, contenders } = useMemo(() => {
    const playerArray = Object.values(players);
    const allContenders = playerArray
      .filter((p) => p.role === 'CONTENDER')
      .sort((a, b) => b.betAmount - (a.betAmount || 0) || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0));

    const top4 = allContenders.slice(0, 4);
    const everyoneElse = playerArray.filter(p => !top4.some(top => top.id === p.id)).sort((a,b) => (b.betAmount || 0) - (a.betAmount || 0));
    
    return {
      fighters: top4,
      contenders: everyoneElse,
    };
  }, [players]);

  const renderActionPanel = () => {
    if (!isVerified) return <LobbyGate />;
    if (lobbyPhase === 'NAME_INPUT') return <NameInput />;
    // --- UPDATED: Pass `self` as a prop ---
    if (lobbyPhase === 'BETTING') return <BettingPanel self={self} />;
    return <LobbyGate />;
  };

  return (
    <div className="flex w-full max-w-2xl flex-col border border-gray-600 bg-black">
      <div className="flex items-center justify-between border-b border-gray-600 p-3">
        <h2 className="text-xl font-bold tracking-widest text-white">LOBBY</h2>
        {lobbyCountdown !== null && (
          <div className="font-mono text-2xl text-yellow-400">
            {lobbyCountdown > 0 ? `00:${lobbyCountdown.toString().padStart(2, '0')}` : 'FINALIZING'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-xs font-mono text-gray-400">CONNECTED</span>
          </>
        ) : (
          <button onClick={reconnectSocket} className="flex items-center gap-2 text-xs font-mono text-red-500 hover:text-white">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>OFFLINE (Click to reconnect)</span>
          </button>
        )}
      </div>

      {gamePhase === 'IN_ROUND' ? (
        <div className="flex w-full items-center justify-center border-b border-gray-600 bg-black aspect-video text-gray-400">
          STREAM OF CURRENT MATCH (pump.fun)
        </div>
      ) : (
        <div className="flex w-full items-center justify-center border-b border-gray-600 bg-gray-900 aspect-video text-gray-600">
          WAITING FOR NEXT MATCH
        </div>
      )}

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold text-red-500">Fighters ({fighters.length} / 4)</h3>
          <ul className="min-h-[120px] space-y-1 border border-gray-700 bg-gray-900 p-2">
            {fighters.map((p, index) => (
              <li key={p.id} className="flex justify-between bg-gray-800 p-2">
                <span>
                  {index + 1}. {p.name}
                  {p.id === self?.id && <span className="ml-2 text-green-400">(you)</span>}
                </span>
                <span className="font-mono text-yellow-400">{p.betAmount} TOKENS</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-lg font-semibold text-blue-400">Contenders ({contenders.length})</h3>
          <ul className="min-h-[120px] space-y-1 border border-gray-700 bg-gray-900 p-2">
            {contenders.map((p) => (
              <li key={p.id} className="flex justify-between bg-gray-800 p-2">
                <span>
                  {p.name}
                  {p.id === self?.id && <span className="ml-2 text-green-400">(you)</span>}
                </span>
                {p.betAmount > 0 && <span className="font-mono text-gray-500">{p.betAmount} TOKENS</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-600 p-4">
        {renderActionPanel()}
      </div>
    </div>
  );
};