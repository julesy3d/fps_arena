import { useGameStore } from "@/store/useGameStore";

export const GlobalStatusUI = () => {
  const { isConnected, gamePhase, lobbyCountdown } = useGameStore();

  const getGameStatus = () => {
    switch (gamePhase) {
      case "LOBBY":
        if (lobbyCountdown !== null && lobbyCountdown > 0) {
          return `DUEL STARTING IN ${lobbyCountdown}s`;
        }
        return "WAITING FOR DUELISTS";
      case "IN_ROUND":
        return "DUEL IN PROGRESS";
      case "POST_ROUND":
        return "ROUND COMPLETE";
      default:
        return "INITIALIZING";
    }
  };

  return (
    <div className="fixed top-4 left-4 z-40 flex flex-col gap-2 font-mono text-xs">
      {/* Connection Status */}
    <div className="flex items-center gap-2 border-dashed-ascii bg-ascii-shade px-3 py-1.5">
        <div 
          className={`h-2 w-2 ${isConnected ? "animate-pulse bg-success" : "bg-error"}`}
        />
        <span className={isConnected ? "text-success" : "text-error"}>
          {isConnected ? "CONNECTED" : "OFFLINE"}
        </span>
      </div>

      {/* Game Status */}
      <div className="border-dashed-ascii bg-ascii-shade px-3 py-1.5">
        <div className="text-warning">
          {getGameStatus()}
        </div>
      </div>
    </div>
  );
};