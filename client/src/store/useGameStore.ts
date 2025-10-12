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
  animationState?: 'idle' | 'armed' | 'shooting' | 'dodging' | 'death' | 'victory' | 'defeat';

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
  roundWinner: { name: string; pot: number; isSplit?: boolean } | null;
  fighters: Player[]; // The 2 fighters in current duel
  isHydrated: boolean; // NEW: Flag to track if we have server state
}

interface StoreActions {
  connectSocket: () => void;
  setPlayerName: (name: string) => void;
  clearWinner: () => void;
  reset: () => void;
  reconnectSocket: () => void;
  setHydrated: (hydrated: boolean) => void;
  updateFighterAnimation: (fighterId: string, animationState: Player['animationState']) => void;
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
  roundWinner: null,
  fighters: [],
  isHydrated: false, // NEW: Starts as false
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  // NEW: Action to set the hydration flag
  setHydrated: (isHydrated) => set({ isHydrated }),

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL!);

    newSocket.on("connect", () =>
      set({ isConnected: true, socket: newSocket }),
    );
    newSocket.on("disconnect", () => get().reset());

    newSocket.on("lobby:state", (players) => set({ players }));
    
    newSocket.on("lobby:joined", ({ name, isVerified }) =>
      set({
        playerName: name,
        isVerified: isVerified,
        lobbyPhase: "BETTING",
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
    
    newSocket.on("game:state", (gamePlayers) =>
      set((state) => ({ players: { ...state.players, ...gamePlayers } })),
    );

    newSocket.on("game:phaseChange", (data) => {
      console.log("New game phase received:", data.phase);
      const phase = data.phase as StoreState["gamePhase"];
      set({ gamePhase: phase });

      // CRITICAL FIX: The first time we receive an authoritative game phase,
      // we know the app is "hydrated" with real data.
      if (!get().isHydrated) {
        set({ isHydrated: true });
      }

      if (phase === "IN_ROUND") {
        set({ fighters: data.fighters, roundWinner: null });
      } else if (phase === "POST_ROUND") {
        set({ roundWinner: data.winnerData });
      } else if (phase === "LOBBY") {
        const { socket, isConnected, isHydrated } = get(); // Keep isHydrated true
        set({ ...initialState, socket, isConnected, isHydrated, lobbyPhase: 'BETTING' });
      }
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit("player:setName", name);
    set({ playerName: name });
  },

  updateFighterAnimation: (fighterId: string, animationState: Player['animationState']) => {
    set((state) => ({
      fighters: state.fighters.map(f => 
        f.id === fighterId ? { ...f, animationState } : f
      )
    }));
  },


  clearWinner: () => {
    set({ roundWinner: null });
  },

  reset: () => {
    // Keep the socket and connection status on reset, but reset hydration
    const { socket } = get();
    set({ ...initialState, socket, isConnected: false });
  },

  reconnectSocket: () => {
    get().socket?.connect();
  },
}));