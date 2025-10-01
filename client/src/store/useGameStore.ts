import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface Player {
  id: string;
  name: string;
  role: 'SPECTATOR' | 'CONTENDER';
  isVerified: boolean;
  betAmount: number;
  lastBetTimestamp: number | null;
  position: [number, number, number];
  rotation: [number, number, number, number];
  health?: number;
}

// Define the type for the state properties first
interface StoreState {
  socket: Socket | null;
  isConnected: boolean;
  gamePhase: 'LOBBY' | 'IN_ROUND';
  lobbyPhase: 'GATE' | 'NAME_INPUT' | 'BETTING';
  playerName: string;
  isVerified: boolean;
  players: Record<string, Player>;
  lobbyCountdown: number | null;
  roundTimer: number | null;
  roundWinner: { name: string; pot: number } | null;
  gladiators: Player[];
}

// Define the type for the actions
interface StoreActions {
  connectSocket: () => void;
  setPlayerName: (name: string) => void;
  clearWinner: () => void;
  reset: () => void;
  reconnectSocket: () => void;
}

// The final GameState is the combination of state and actions
type GameState = StoreState & StoreActions;

// Now, define the initial state with the correct type
const initialState: StoreState = {
  socket: null,
  isConnected: false,
  gamePhase: 'LOBBY',
  lobbyPhase: 'GATE',
  playerName: '',
  isVerified: false,
  players: {},
  lobbyCountdown: null,
  roundTimer: null,
  roundWinner: null,
  gladiators: [],
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL!);

    newSocket.on('connect', () => set({ isConnected: true, socket: newSocket }));
    newSocket.on('disconnect', () => get().reset());
    newSocket.on('lobby:state', (players) => set({ players }));
    newSocket.on('lobby:entrySuccess', () => set({ isVerified: true, lobbyPhase: 'NAME_INPUT' }));
    newSocket.on('lobby:countdown', (countdown) => set({ lobbyCountdown: countdown }));
    newSocket.on('round:timer', (timer) => set({ roundTimer: timer }));
    newSocket.on('game:state', (gamePlayers) => set((state) => ({ players: { ...state.players, ...gamePlayers }})));
    
    // --- THE NEW UNIFIED HANDLER ---
    newSocket.on('game:phaseChange', (data) => {
      console.log('New game phase received:', data.phase);
      // Always update the main game phase
      set({ gamePhase: data.phase });

      if (data.phase === 'IN_ROUND') {
        set({ gladiators: data.fighters, roundWinner: null });
      } else if (data.phase === 'POST_ROUND') {
        set({ roundWinner: data.winnerData });
      } else if (data.phase === 'LOBBY') {
        get().reset(); // Perform a full client-side reset
      }
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit('player:join', name);
    set({ playerName: name, lobbyPhase: 'BETTING' });
  },

  clearWinner: () => {
    set({ roundWinner: null });
  },

  reset: () => {
    set(state => ({
      ...initialState,
      socket: state.socket,
      isConnected: state.isConnected,
    }));
  },

  reconnectSocket: () => {
    get().socket?.connect();
  },
}));