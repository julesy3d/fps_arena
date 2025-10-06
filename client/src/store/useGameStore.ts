import { create } from "zustand";
import { io, Socket } from "socket.io-client";

// Represents a single player in the game
export interface Player {
  id: string;
  walletAddress: string;
  name: string;
  role: "SPECTATOR" | "CONTENDER";
  betAmount: number;
  lastBetTimestamp: number | null;
  position: [number, number, number];
  rotation: number;
  health?: number;
  stats?: {
    kills: number;
    deaths: number;
    wins: number;
    totalGamesPlayed: number;
    netWinnings: number;
  };
}

interface StoreState {
  socket: Socket | null;
  isConnected: boolean;
  gamePhase: "LOBBY" | "IN_ROUND" | "POST_ROUND";
  lobbyPhase: "GATE" | "NAME_INPUT" | "BETTING";
  playerName: string;
  isVerified: boolean;
  players: Record<string, Player>;
  lobbyCountdown: number | null;
  roundTimer: number | null;
  roundWinner: { name: string; pot: number } | null;
  fighters: Player[]; // Renamed from gladiators
}

interface StoreActions {
  connectSocket: () => void;
  setPlayerName: (name: string) => void;
  clearWinner: () => void;
  reset: () => void;
  reconnectSocket: () => void;
}

type GameState = StoreState & StoreActions;

const initialState: StoreState = {
  socket: null,
  isConnected: false,
  gamePhase: "LOBBY",
  lobbyPhase: "GATE",
  playerName: "",
  isVerified: false,
  players: {},
  lobbyCountdown: null,
  roundTimer: null,
  roundWinner: null,
  fighters: [], // Renamed from gladiators
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL!);

    newSocket.on("connect", () =>
      set({ isConnected: true, socket: newSocket }),
    );
    newSocket.on("disconnect", () => get().reset());

    newSocket.on("lobby:state", (players) => set({ players }));
    
    // Server confirms the player has joined and provides their name
    newSocket.on("lobby:joined", ({ name, isVerified }) =>
      set({
        playerName: name,
        isVerified: isVerified, // isVerified will be true if betAmount > 0
        lobbyPhase: "BETTING", // Go straight to betting
      }),
    );
    
    newSocket.on("lobby:betVerified", () => {
        set({ isVerified: true });
    });

    newSocket.on("lobby:betFailed", (message) => {
        alert(`Bet Failed: ${message}`);
    });

    newSocket.on("lobby:countdown", (countdown) =>
      set({ lobbyCountdown: countdown }),
    );

    newSocket.on("round:timer", (timer) => set({ roundTimer: timer }));
    newSocket.on("game:state", (gamePlayers) =>
      set((state) => ({ players: { ...state.players, ...gamePlayers } })),
    );

    newSocket.on("game:phaseChange", (data) => {
      console.log("New game phase received:", data.phase);
      const phase = data.phase as StoreState["gamePhase"];
      set({ gamePhase: phase });

      if (phase === "IN_ROUND") {
        set({ fighters: data.fighters, roundWinner: null }); // Renamed
      } else if (phase === "POST_ROUND") {
        set({ roundWinner: data.winnerData });
      } else if (phase === "LOBBY") {
        const { socket, isConnected } = get();
        set({ ...initialState, socket, isConnected, lobbyPhase: 'BETTING' });
      }
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit("player:setName", name);
    set({ playerName: name });
  },

  clearWinner: () => {
    set({ roundWinner: null });
  },

  reset: () => {
    const { socket, isConnected } = get();
    set({ ...initialState, socket, isConnected });
  },

  reconnectSocket: () => {
    get().socket?.connect();
  },
}));