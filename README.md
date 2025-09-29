# Multiplayer FPS Arena - The Coliseum

This project is a real-time, multiplayer, first-person shooter built on a "Coliseum" or "Gladiator" model. There is one continuous game session where players can either watch as Spectators or fight as Contestants in a last-man-standing arena.

## The Game Flow: A Cycle of Combat

The game operates in a continuous cycle, moving between two main phases: the **Lobby** and the **Round**.

### 1. Joining the Game
When you first connect, you will be prompted to **enter your name**. After submitting your name, you enter the game world as a **Spectator**.

### 2. The Lobby Phase
The Lobby is the central hub. Here, all connected players are gathered between matches. The UI will show two lists:
-   **Contestants:** Players who have signed up to fight in the next round.
-   **Spectators:** Players who are currently watching.

As a Spectator, you will see a button to **"Become a Contestant"**.

### 3. Becoming a Contestant & Getting Ready
-   If there are fewer than 4 contestants, you can click **"Become a Contestant"** to join the queue for the next match.
-   Once you are a contestant, the button changes to **"Ready"**. Clicking this signals that you are prepared to fight. Your status will be updated in the lobby UI for all players to see.

### 4. Starting the Round
-   A round can only begin when there are **exactly 4 contestants**, and **all 4 have marked themselves as "Ready"**.
-   Once these conditions are met, a short **countdown** will begin, visible to everyone.
-   When the countdown ends, the `IN_ROUND` phase begins. The 4 contestants are teleported into the arena to fight. All other players are automatically assigned to spectate the match.

### 5. The Round Phase
-   Contestants fight in a last-man-standing battle. Each player has 3 HP.
-   The round ends when only one contestant remains.
-   Defeated players and late-joiners automatically become spectators for the remainder of the round, cycling through the perspectives of the remaining fighters.

### 6. End of Round & Return to Lobby
-   The winner is declared to everyone.
-   After a short delay, the game returns to the **Lobby Phase**.
-   **Crucially, all players are reset to Spectators.** To fight in the next round, you must once again choose to become a contestant and ready up. This ensures a fair and continuous cycle of combat.

## Core Technologies

-   **Client:** Next.js, React, Three.js (`@react-three/fiber`)
-   **Server:** Node.js, Express, Socket.IO
-   **Communication:** Real-time via Socket.IO

## Getting Started

Follow these instructions to run the game on your local machine for development and testing.

### Prerequisites

You need to have [Node.js](https://nodejs.org/) (which includes npm) installed on your system.

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install Server Dependencies:**
    Navigate to the `server` directory and install the required packages.
    ```bash
    cd server
    npm install
    ```

3.  **Install Client Dependencies:**
    Navigate to the `client` directory and install its packages.
    ```bash
    cd ../client
    npm install
    ```

### Running the Application

You will need two separate terminal windows to run both the server and the client simultaneously.

1.  **Start the Server:**
    In the first terminal, navigate to the `server` directory and run the start script.
    ```bash
    cd server
    npm start
    ```
    The server will start on `http://localhost:3001` by default.

2.  **Start the Client:**
    In the second terminal, navigate to the `client` directory and run the development server.
    ```bash
    cd client
    npm run dev
    ```
    The client application will be available at `http://localhost:3000`.

3.  **Play the Game:**
    Open multiple browser tabs and navigate to `http://localhost:3000` to simulate multiple players. Enter a unique name in each tab to join the game.