# potshot.gg

potshot.gg is a real-time, multiplayer dueling game centered on timing and rhythm. Players compete in a skill-based shootout where the winner is awarded a prize pot funded by cryptocurrency wagers.

-----

## Gameplay

The core of the game is a synchronized, multi-round duel that tests player reaction and timing.

### 1\. The Lobby (Wager)

Players connect a Solana wallet and place a bet to enter the matchmaking pool. When the game countdown ends, the top two bidders are selected as fighters. All wagers are then pooled into the prize pot.

### 2\. The Duel (The Fight)

The two fighters are transported to the dueling grounds. The duel consists of a continuous, round-based shooting phase:

  * A **synchronized bar** appears, moving up and down in a rhythmic cycle.
  * Players must click when the bar is within the designated **target zone** to land a successful shot.
  * If a player fails to shoot before the bar completes its cycle, it is registered as a **miss** for that round.
  * The bar's cycle **accelerates with each subsequent round**, progressively increasing the difficulty.

### 3\. The Outcome

A winner is decided based on the round's results:

  * **One Hit, One Miss:** The player who landed the shot wins the duel and takes the pot (less a 10% protocol fee).
  * **Both Hit:** The round is declared a **DODGE**. Both players survive, and the duel advances to the next, faster round.
  * **Both Miss:** The duel advances to the next, faster round.

The duel continues with escalating speed until one player misses and a winner is declared.

-----

## Core Architecture

The game is built with a server-authoritative model to ensure fairness and prevent cheating, which is critical for a real-money application. It uses a hybrid architecture to separate real-time game logic from HTTP-based Web3 operations.

### Technology Stack

  * **Client:** Next.js, React, Zustand, Three.js (`@react-three/fiber`), Tailwind CSS
  * **Game Server:** Node.js, Express, Socket.IO
  * **Web3/API:** Vercel Serverless Functions
  * **Database:** Supabase (PostgreSQL)
  * **Blockchain:** Solana
  * **Deployment:** Fly.io (Game Server), Vercel (Client & Web3/API)

### Architectural Model

#### Game Server (Fly.io)

A stateful Node.js application running on a persistent Fly.io virtual machine. This server handles all critical, low-latency game logic.

  * **State Machine:** Manages the core game state (`LOBBY`, `CINEMATIC`, `AIM_PHASE`, `POST_ROUND`).
  * **Authoritative Timing:** Acts as the single source of truth for all game events and the synchronized bar's position.
  * **Game Loop:** A `setInterval` loop runs at 60fps during the `AIM_PHASE` to broadcast the bar's position to clients via Socket.IO.
  * **Database Writes:** Records all game results and state changes directly to the Supabase database.

#### Web3/API (Vercel)

A serverless Next.js application hosted on Vercel. It manages the client-facing application and all blockchain interactions.

  * **Web3 Operations:** Vercel Serverless Functions handle all wallet interactions, including processing initial bets and managing final payouts.
  * **HTTP/API:** Provides the primary API for user authentication and other non-real-time requests.
  * This separation ensures that costly or slow blockchain transactions do not interfere with the real-time game loop.

#### Client (Next.js & React Three Fiber)

The client application is rendered by Next.js and Vercel.

  * **State Management:** A global Zustand store (`useGameStore`) manages the client-side state, which is synchronized with the Game Server via Socket.IO events.
  * **Single Canvas Architecture:** A single, persistent `<Canvas>` component from `@react-three/fiber` is used to render the 3D world, ensuring smooth visual transitions between game states.

-----

## Getting Started

### Prerequisites

  * Node.js (v18 or higher)
  * npm or a compatible package manager
  * Access to a Supabase project
  * Fly.io and Vercel accounts for deployment

### Setup

1.  **Clone the Repository**

    ```bash
    git clone [your-repo-url]
    cd [your-repo-folder]
    ```

2.  **Install Game Server Dependencies**

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

You will need to create `.env.local` files for both the server and the client.

1.  **Game Server (`/server/.env.local`)**
    This server requires credentials to write to your database.

    ```env
    SUPABASE_URL=[Your-Supabase-Project-URL]
    SUPABASE_SERVICE_ROLE_KEY=[Your-Supabase-Service-Role-Key]
    ```

2.  **Client (`/client/.env.local`)**
    These variables are used by the Next.js application for both client-side logic and Vercel serverless functions.

    ```env
    # Public URL of your deployed Game Server (e.g., wss://your-app.fly.dev)
    NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:3001

    # Public Supabase credentials
    NEXT_PUBLIC_SUPABASE_URL=[Your-Supabase-Project-URL]
    NEXT_PUBLIC_SUPABASE_ANON_KEY=[Your-Supabase-Anon-Key]

    # Public key for the treasury wallet
    NEXT_PUBLIC_TREASURY_WALLET_ADDRESS=[Your-Solana-Treasury-Public-Key]
    ```

3.  **Vercel Environment Variables**
    For security, your treasury's private key must be set as a secret environment variable in your Vercel project settings, **not** in `.env.local`.

      * `TREASURY_PRIVATE_KEY=[Your-Solana-Treasury-Secret-Key]`

### Running the Application

You will need two separate terminals to run the server and the client locally.

1.  **Start the Game Server**

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