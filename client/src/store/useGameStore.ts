/**
 * @file useGameStore.ts
 * @description Zustand store for managing global client-side game state.
 * This store handles the WebSocket connection, player data, game phase transitions,
 * and all real-time updates received from the server.
 */

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

/**
 * @interface Player
 * @description Represents a single player in the game, including their identity,
 * state, and in-game attributes.
 */
export interface Player {
  /** The player's unique socket ID. */
  id: string;
  /** The player's Solana wallet address. */
  walletAddress: string;
  /** The player's chosen display name. */
  name: string;
  /** The player's current role in the lobby or game. */
  role: 'SPECTATOR' | 'CONTENDER';
  /** The amount the player has bet for the current round. */
  betAmount: number;
  /** Timestamp of the player's last bet, used for tie-breaking. */
  lastBetTimestamp: number | null;
  /** The player's 3D position in the game world. */
  position: [number, number, number];
  /** The player's rotation in the game world (in radians). */
  rotation: number;
  /** Current health of the player during a duel. */
  health?: number;
  /** The current animation state of the player's 3D model. */
  animationState?: 'idle' | 'draw' | 'armed' | 'shooting' | 'dodging' | 'death' | 'victory';
  /** The player's persistent statistics. */
  stats?: {
    kills: number;
    deaths: number;
    wins: number;
    totalGamesPlayed: number;
    netWinnings: number;
  };
}

/**
 * @interface StoreState
 * @description Defines the shape of the Zustand store's state.
 */
interface StoreState {
  /** The active Socket.IO client instance. */
  socket: Socket | null;
  /** Connection status of the WebSocket. */
  isConnected: boolean;
  /** The current high-level phase of the game. */
  gamePhase: 'LOBBY' | 'IN_ROUND' | 'POST_ROUND';
  /** The sub-phase within the LOBBY. */
  lobbyPhase: 'GATE' | 'NAME_INPUT' | 'BETTING';
  /** The name of the current local player. */
  playerName: string;
  /** Whether the player's bet for the upcoming round is verified. */
  isVerified: boolean;
  /** A record of all players in the game, keyed by their socket ID. */
  players: Record<string, Player>;
  /** The countdown timer for the start of a duel. */
  lobbyCountdown: number | null;
  /** Data about the winner of the last round. */
  roundWinner: { name: string; pot: number; isSplit?: boolean } | null;
  /** The two players currently fighting in the duel. */
  fighters: Player[];
  /** Flag to prevent UI rendering until the store is properly hydrated from the server. */
  isHydrated: boolean;
  /** The total pot for the current round. */
  roundPot: number;
}

/**
 * @interface StoreActions
 * @description Defines the actions that can be performed on the store.
 */
interface StoreActions {
  /** Initializes the WebSocket connection. */
  connectSocket: () => void;
  /** Sets the local player's name and emits it to the server. */
  setPlayerName: (name: string) => void;
  /** Clears the round winner data. */
  clearWinner: () => void;
  /** Resets the store to its initial state, preserving the socket connection. */
  reset: () => void;
  /** Manually reconnects the socket. */
  reconnectSocket: () => void;
  /** Sets the hydration state. */
  setHydrated: (hydrated: boolean) => void;
  /** Updates the animation state for a specific fighter. */
  updateFighterAnimation: (fighterId: string, animationState: Player['animationState']) => void;
}

type GameState = StoreState & StoreActions;

const initialState: StoreState = {
  socket: null,
  isConnected: false,
  gamePhase: 'LOBBY',
  lobbyPhase: 'GATE',
  playerName: '',
  isVerified: false,
  players: {},
  lobbyCountdown: null,
  roundWinner: null,
  fighters: [],
  isHydrated: false,
  roundPot: 0,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setHydrated: (isHydrated) => set({ isHydrated }),

  connectSocket: () => {
    if (get().socket) return;
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL!, {
      transports: ['websocket'],
      upgrade: false,
    });
    newSocket.on('connect', () =>
      set({ isConnected: true, socket: newSocket }),
    );
    newSocket.on('disconnect', () => get().reset());

    newSocket.on('lobby:state', (players) => set({ players }));

    newSocket.on('lobby:joined', ({ name, isVerified }) =>
      set({
        playerName: name,
        isVerified: isVerified,
        lobbyPhase: 'BETTING',
      }),
    );

    newSocket.on('lobby:betVerified', () => {
      set({ isVerified: true });
    });

    newSocket.on('lobby:betFailed', (message) => {
      alert(`Bet Failed: ${message}`);
    });

    newSocket.on('lobby:countdown', (countdown) =>
      set({ lobbyCountdown: countdown }),
    );

    newSocket.on('game:state', (gamePlayers) =>
      set((state) => ({ players: { ...state.players, ...gamePlayers } })),
    );

    newSocket.on('game:phaseChange', (data) => {
      const phase = data.phase as StoreState['gamePhase'];
      set({ gamePhase: phase });

      if (!get().isHydrated) {
        set({ isHydrated: true });
      }

      if (phase === 'IN_ROUND') {
        set({
          fighters: data.fighters,
          roundWinner: null,
          roundPot: data.roundPot || 0,
        });
      } else if (phase === 'POST_ROUND') {
        set({ roundWinner: data.winnerData });
      } else if (phase === 'LOBBY') {
        const { socket, isConnected, isHydrated } = get();
        set({ ...initialState, socket, isConnected, isHydrated, lobbyPhase: 'BETTING' });
      }
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit('player:setName', name);
    set({ playerName: name });
  },

  updateFighterAnimation: (fighterId: string, animationState: Player['animationState']) => {
    set((state) => ({
      fighters: state.fighters.map((f) =>
        f.id === fighterId ? { ...f, animationState } : f,
      ),
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
