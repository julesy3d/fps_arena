import { create } from "zustand";
import { io, Socket } from "socket.io-client";

// Represents a single player in the game, whether they are a contender, a fighter, or just spectating.
export interface Player {
  id: string; // The socket ID of the player.
  walletAddress: string; // The player's Solana wallet address.
  name: string; // The display name chosen by the player.
  role: "SPECTATOR" | "CONTENDER"; // Role in the lobby auction.
  isVerified: boolean; // True if the player has paid the entry fee.
  betAmount: number; // The current amount this player has bet.
  lastBetTimestamp: number | null; // The timestamp of their last bet, used for tie-breaking.
  position: [number, number, number]; // Player's [x, y, z] position in the game world.
  rotation: [number, number, number, number]; // Player's quaternion rotation.
  health?: number; // Player's current health during a round.
  stats?: {
    kills: number;
    deaths: number;
    wins: number;
  };
}

// Defines the structure of the global client-side state managed by Zustand.
interface StoreState {
  socket: Socket | null; // The global Socket.IO client instance.
  isConnected: boolean; // True if the socket is currently connected to the server.
  gamePhase: "LOBBY" | "IN_ROUND" | "POST_ROUND"; // The overall phase of the game, dictated by the server.
  lobbyPhase: "GATE" | "NAME_INPUT" | "BETTING"; // The local client's UI state within the LOBBY game phase.
  playerName: string; // The name of the local player.
  isVerified: boolean; // True if the local player has successfully paid the entry fee.
  players: Record<string, Player>; // A map of all players in the game, keyed by their socket ID.
  lobbyCountdown: number | null; // The current auction countdown time.
  roundTimer: number | null; // The current in-round countdown time.
  roundWinner: { name: string; pot: number } | null; // Data for the winner of the last round.
  gladiators: Player[]; // A list of the official fighters for the current round.
}

// Defines the actions that can be called to modify the store's state.
interface StoreActions {
  connectSocket: () => void; // Initializes the connection to the server.
  setPlayerName: (name: string) => void; // Sets the player's name and informs the server.
  clearWinner: () => void; // Clears the winner data after the post-round phase.
  reset: () => void; // Resets the client state back to its initial values, used when returning to the lobby.
  reconnectSocket: () => void; // Attempts to reconnect the socket if it's disconnected.
}

// The final GameState is the combination of state and actions
type GameState = StoreState & StoreActions;

// The initial state of the store when the application loads.
const initialState: StoreState = {
  socket: null,
  isConnected: false,
  gamePhase: "LOBBY",
  lobbyPhase: "GATE", // Initial UI state is the entry fee gate.
  playerName: "",
  isVerified: false,
  players: {},
  lobbyCountdown: null,
  roundTimer: null,
  roundWinner: null,
  gladiators: [],
};

// Create the Zustand store, combining state and actions.
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
    newSocket.on("lobby:entrySuccess", ({ name }) =>
      set({
        isVerified: true,
        lobbyPhase: "NAME_INPUT",
        playerName: name,
      }),
    );
    // ** NEW: Listen for entry failure **
    newSocket.on("lobby:entryFailed", (message) => {
        alert(`Entry Failed: ${message}`);
        // This event will be used to reset the UI state in the component
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
        set({ gladiators: data.fighters, roundWinner: null });
      } else if (phase === "POST_ROUND") {
        set({ roundWinner: data.winnerData });
      } else if (phase === "LOBBY") {
        get().reset();
      }
    });
  },

  setPlayerName: (name: string) => {
    get().socket?.emit("player:join", name);
    set({ playerName: name, lobbyPhase: "BETTING" });
  },

  clearWinner: () => {
    set({ roundWinner: null });
  },

  reset: () => {
    set((state) => ({
      ...initialState,
      socket: state.socket,
      isConnected: state.isConnected,
    }));
  },

  reconnectSocket: () => {
    get().socket?.connect();
  },
}));