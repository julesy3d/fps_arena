import { create } from "zustand";
import { io, Socket } from "socket.io-client";

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
  animationState?: 'idle' | 'draw' | 'armed' | 'shooting' | 'dodging' | 'death' | 'victory';

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
  fighters: Player[];
  isHydrated: boolean;
  roundPot: number; // ← ADDED
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
  isHydrated: false,
  roundPot: 0, // ← ADDED
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setHydrated: (isHydrated) => set({ isHydrated }),

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL!, {
      transports: ['websocket'],  // ← Add this
      upgrade: false,             // ← Add this
    });
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

      if (!get().isHydrated) {
        set({ isHydrated: true });
      }

      if (phase === "IN_ROUND") {
        set({ 
          fighters: data.fighters, 
          roundWinner: null,
          roundPot: data.roundPot || 0 // ← ADDED
        });
      } else if (phase === "POST_ROUND") {
        set({ roundWinner: data.winnerData });
      } else if (phase === "LOBBY") {
        const { socket, isConnected, isHydrated } = get();
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
    const { socket } = get();
    set({ ...initialState, socket, isConnected: false });
  },

  reconnectSocket: () => {
    get().socket?.connect();
  },
}));