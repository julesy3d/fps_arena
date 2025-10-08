# 🤠 PotShot.gg - A High-Stakes Western Duel Game

**PotShot.gg** is a real-time, multiplayer dueling game where timing, rhythm, and nerve are key. Two players face off in a high-noon shootout where the first to make a mistake loses. The winner takes the entire pot, funded by cryptocurrency wagers.

-----

## \#\# Gameplay: The Duel

The core of the game is a synchronized, multi-round duel that tests both reaction and rhythm.

### 1\. The Lobby (The Wager) 💰

Players connect their Solana wallets and place bets to enter the next duel. The top two bidders are selected as the fighters when the countdown ends. All bets are pooled into the prize pot.

### 2\. The Duel (The Fight) 🔫

The two fighters are transported to the dueling grounds. The gameplay unfolds in two main phases:

  * **Phase 1: The Draw**

      * After a tense, randomized pause, a **GONG** sounds.
      * Both players have **1.5 seconds** to click and draw their weapon.
      * Success in this phase is critical. Failing to draw gives your opponent a significant advantage.

  * **Phase 2: The Aiming (Continuous Shooting)**

      * A **synchronized bar** appears, moving up and down in a rhythmic cycle.
      * Players must click when the bar is within the green **target zone (60%-80%)** to land a shot.
      * If a player doesn't shoot before the bar passes 80%, they **auto-miss** the round.
      * The bar **speeds up with each round**, making the timing progressively harder.

### 3\. The Outcome 🏆

A winner is decided based on the round's results:

  * **One Hits, One Misses:** The player who hit wins the duel and takes **90% of the pot** (10% is a protocol fee).
  * **Both Hit:** It's a **DODGE\!** Both players survive, and the duel advances to the next, faster round.
  * **Both Miss:** The duel also advances to the next, faster round.

The duel continues with escalating speed until one player makes a mistake and a winner is declared.

-----

## \#\# Core Architecture

The game is built with a **server-authoritative** model to ensure fairness and prevent cheating, which is critical for a real-money game.

### Technology Stack

  * **Client:** Next.js, React, Zustand, Three.js (`@react-three/fiber`), Tailwind CSS
  * **Server:** Node.js, Express, Socket.IO
  * **Blockchain:** Solana for wallet connections and payouts.

### Server Architecture (Node.js)

  * **State Machine:** Manages the game's state (`LOBBY`, `CINEMATIC`, `DRAW_PHASE`, `AIM_PHASE`, `POST_ROUND`).
  * **Authoritative Timing:** The server is the single source of truth for all timing, including the GONG, draw window, and the synchronized bar's position.
  * **Game Loop:** A `setInterval` loop runs at 60fps during the `AIM_PHASE` to calculate and broadcast the bar's position to all players simultaneously.
  * **Event System:** Socket.IO is used for real-time communication. The server emits events like `duel:gong` to start the draw and `duel:barUpdate` to synchronize the aiming phase.

### Client Architecture (Next.js & React Three Fiber)

  * **State Management:** A global Zustand store (`useGameStore`) manages the client-side state, reacting to events sent by the server.
  * **Single Canvas Architecture:** A single, persistent `<Canvas>` component is used to render the 3D world. This prevents jarring reloads and ensures a stable rendering context between game states.
  * **Component Structure:** The main `page.tsx` acts as a controller, conditionally rendering different 3D stages (`<DuelStage3D>`, `<DefaultStage3D>`) and 2D UI overlays (`<DuelUI>`, `<Lobby>`) based on the game's state.

-----

## \#\# Getting Started

### Prerequisites

  * Node.js (v18 or higher)
  * npm or a compatible package manager

### Setup

1.  **Clone the Repository**

    ```bash
    git clone [your-repo-url]
    cd [your-repo-folder]
    ```

2.  **Install Server Dependencies**

    ```bash
    cd server
    npm install
    ```

3.  **Install Client Dependencies**

    ```bash
    cd ../client
    npm install
    ```

### Environment Variables

You will need to create `.env.local` files for both the server and the client to store your secret keys and configuration.

1.  **Server (`/server/.env.local`)**

    ```env
    TREASURY_WALLET_ADDRESS=[Your-Solana-Treasury-Public-Key]
    TREASURY_PRIVATE_KEY=[Your-Solana-Treasury-Secret-Key]
    ```

2.  **Client (`/client/.env.local`)**
    The client needs to know the public URL of the server.

    ```env
    NEXT_PUBLIC_SERVER_URL=http://localhost:3001
    ```

    *Note: If running in a cloud environment like GitHub Codespaces, replace `http://localhost:3001` with the public URL for your server port.*

### Running the Application

You will need two separate terminals to run the server and the client.

1.  **Start the Server**

    ```bash
    cd server
    npm start
    ```

2.  **Start the Client**

    ```bash
    cd client
    npm run dev
    ```

Open `http://localhost:3000` in two separate browser tabs to simulate a duel.
