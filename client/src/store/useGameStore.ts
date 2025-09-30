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

interface GameState {
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
  
  connectSocket: () => void;
  setPlayerName: (name: string) => void;
  clearWinner: () => void;
  reset: () => void; // <-- 1. ADD RESET ACTION SIGNATURE
}

const initialState = {
  gamePhase: 'LOBBY' as 'LOBBY' | 'IN_ROUND',
  lobbyPhase: 'GATE' as 'GATE' | 'NAME_INPUT' | 'BETTING',
  playerName: '',
  isVerified: false,
  players: {},
  lobbyCountdown: null,
  roundTimer: null,
  roundWinner: null,
  gladiators: [],
};


export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  isConnected: false,
  ...initialState,

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io("http://localhost:3001");

    newSocket.on('connect', () => set({ isConnected: true, socket: newSocket }));
    newSocket.on('disconnect', () => {
      set({ isConnected: false, socket: null });
      get().reset(); // Reset state on disconnect
    });
    newSocket.on('lobby:state', (players) => set({ players }));
    newSocket.on('lobby:entrySuccess', () => set({ isVerified: true, lobbyPhase: 'NAME_INPUT' }));
    newSocket.on('lobby:countdown', (countdown) => set({ lobbyCountdown: countdown }));
    
    newSocket.on('round:start', (fighters: Player[]) => {
      set({ gamePhase: 'IN_ROUND', roundWinner: null, gladiators: fighters });
    });
    
    newSocket.on('round:timer', (timer) => set({ roundTimer: timer }));

    newSocket.on('game:state', (gamePlayers) => set((state) => ({ players: { ...state.players, ...gamePlayers }})));

    newSocket.on('round:end', (winnerData) => {
      set({ roundWinner: winnerData, gamePhase: 'LOBBY' });
    });

    // --- 2. ADD RESET LISTENER ---
    newSocket.on('lobby:reset', () => {
      console.log('Lobby is resetting...');
      get().reset();
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit('player:join', name);
    set({ playerName: name, lobbyPhase: 'BETTING' });
  },

  clearWinner: () => {
    set({ roundWinner: null });
  },

  // --- 3. ADD RESET ACTION IMPLEMENTATION ---
  reset: () => {
    set(state => ({
      ...initialState,
      socket: state.socket,
      isConnected: state.isConnected,
    }));
  },
}));