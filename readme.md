# Multiplayer FPS Arena - The Coliseum

The Coliseum is a real-time, multiplayer, first-person shooter built on a continuous "winner-takes-all" model. Players participate in a timed auction to win one of four spots in a fast-paced, last-man-standing deathmatch. The game's state is authoritatively managed by the server and broadcast to all clients.

## The Game Flow: A State-Driven Cycle

The game operates in a perpetual loop between three explicit server states: `LOBBY`, `IN_ROUND`, and `POST_ROUND`.

### 1. The LOBBY Phase (The Auction)

This is the default state of the game, focused on assembling the next round's fighters.

-   **Initial State**: The server is in the `LOBBY` state, waiting for players. The UI shows a "Waiting for next match" message, and there is no active countdown.
-   **Entry**: A new user connects. They see the lobby in a read-only "ghost" mode. To participate, they must pay a 1000 token entry fee, which also serves as their initial bet.
-   **Becoming a Contender**: Upon successful payment, the user is prompted for a name and becomes a `Contender`. They are now officially in the auction, appearing in the player lists with their 1000 token bet.
-   **The Auction**: The lobby UI displays two lists derived from the master list of `Contenders`:
    -   **Fighters (Top 4 Bidders)**: The four `Contenders` with the highest current bets.
    -   **Contenders (All Others)**: All other paid players, sorted by their bet amount.
-   **Countdown Trigger**: An auction countdown begins only when there are enough players. If the number of `Contenders` drops below the minimum, the countdown stops.
    -   *Note: For production, this requires 4 contenders. For testing, it is currently set to 2.*
-   **Overtime**: If a `Contender`'s bet moves them into the Top 4 while the timer is active, 10 seconds are added to the clock.
-   **Transition**: When the auction timer reaches zero, the server transitions to the `IN_ROUND` phase.

### 2. The IN\_ROUND Phase (The Fight)

The auction is over, and the fight begins.

-   **Lock-In**: The server sets its state to `IN_ROUND` and "locks in" the Top 4 bidders as the official Fighters.
-   **The "Burn" & The Pot**: The bets of all `Contenders` who were not in the Top 4 are "burned" (reset to zero). The bets of the 4 Fighters are pooled into the prize pot.
-   **State Broadcast**: The server emits a `game:phaseChange` event to all clients with the payload `{ phase: 'IN_ROUND', fighters: [...] }`.
-   **Player Experience**:
    -   The 4 Fighters are transitioned to the 3D Game Scene.
    -   All other players remain in the Lobby, where the UI now shows an embedded stream of the live match.
-   **Gameplay**:
    -   A 60-second round timer begins.
    -   The server runs its high-frequency game loop (20 ticks/sec), processing player inputs, performing authoritative hit detection, and broadcasting game state (positions, health).
-   **Transition**: The round ends when only one Fighter remains, or when the 60-second timer expires. The server then transitions to the `POST_ROUND` phase.

### 3. The POST\_ROUND Phase (The Aftermath)

The fight is over, and a winner is declared.

-   **State Change**: The server sets its state to `POST_ROUND` and stops the game loop.
-   **Winner Determination**: The server identifies the winner (the last one alive, or a random choice among survivors if the timer ran out).
-   **State Broadcast**: The server emits a `game:phaseChange` event with the payload `{ phase: 'POST_ROUND', winnerData: { winner: 'Name', pot: 1234 } }`.
-   **10-Second Celebration**: This phase lasts for a server-controlled 10 seconds.
    -   The winning Fighter sees a "VICTORY" screen overlayed on their frozen game world.
    -   All players in the Lobby see a large winner announcement banner.
-   **Transition**: After 10 seconds, the server sends a final `game:phaseChange` event (`{ phase: 'LOBBY' }`), transitioning all clients back to the `LOBBY` phase. The server resets its internal state (clears player lists, etc.) and waits for a new group of `Contenders` to begin the cycle anew.

## Core Architecture

**Guiding Principle: Server-Authoritative**
The server is the single source of truth for all game logic, state, and events. Clients are responsible for sending user input and rendering the state provided by the server.

### Technology Stack

-   **Client**: Next.js, React, Zustand, Three.js (@react-three/fiber, @react-three/drei), Tailwind CSS
-   **Server**: Node.js, Express, Socket.IO, Three.js (for headless physics)
-   **Communication**: Real-time via Socket.IO

### Server Architecture (Node.js)

-   **State Machine**: The server manages an explicit `gamePhase` variable (`LOBBY`, `IN_ROUND`, `POST_ROUND`) that dictates the state of the entire game.
-   **Game Loop**: The server runs a high-frequency `setInterval` (20 ticks/sec) during the `IN_ROUND` phase to process player inputs and update game state. A separate, low-frequency loop manages the round timer.
-   **Hit Detection**: A headless three.js scene is maintained on the server. When a `player:shoot` event is received, the server performs a raycast within this scene to determine hits authoritatively.
-   **Event System**: A unified `game:phaseChange` event is used to manage major state transitions, ensuring all clients are synchronized. Other events (`game:state`, `player:hit`, etc.) handle high-frequency updates.

### Client Architecture (Next.js & React Three Fiber)

-   **State Management**: A global Zustand store (`useGameStore`) serves as the central client-side state manager. It listens for server events and updates its state, causing the UI to react.
-   **Component Structure**: The root `page.tsx` acts as a router, conditionally rendering the `<Lobby />` or `<GameScene />` based on the `gamePhase` and whether the local player is a Fighter.
-   **UI Overlays**: All 2D UI (HUD, winner screens, crosshair) are HTML/CSS elements rendered on top of the main 3D canvas.

### Data Persistence (Hybrid Model)

*Note: This section describes the planned architecture. The current implementation uses a simulated betting service and does not persist data.*

-   **Database (Off-Chain)**: For performance, all high-frequency stats (kills, deaths, player history) will be written to a fast, traditional database. The lobby leaderboard will read from this database.
-   **Blockchain (On-Chain)**: For trust and transparency, high-value events are recorded on-chain. After each round, the full JSON result is written to the blockchain, and prize money is distributed via smart contract.

### Streaming & Spectating

The game uses a "TV Studio" model.

-   **Broadcast Client**: A dedicated instance of the game client is run, captured by OBS, and streamed to a platform like pump.fun. This client may have special cinematic camera controls.
-   **Player Client**: The public application is an "audition room" for the next match. During a live round, users see the lobby auction for the next round alongside an embedded view of the current round's stream.

## Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm

### Setup

1.  Clone the repository.
2.  Install Server Dependencies:
    ```bash
    cd server
    npm install
    ```
3.  Install Client Dependencies:
    ```bash
    cd ../client
    npm install
    ```

### Environment Variables

For development in a cloud environment (like GitHub Codespaces), the client needs to know the public URL of the server.

1.  In the `/client` directory, create a file named `.env.local`.
2.  Add the public URL of your server (running on port 3001) to this file:
    ```
    NEXT_PUBLIC_SERVER_URL=https://your-public-server-url-for-port-3001
    ```

### Running the Application

You will need two separate terminals.

1.  **Start the Server**:
    ```bash
    cd server
    npm start
    ```
2.  **Start the Client**:
    ```bash
    cd ../client
    npm run dev
    ```