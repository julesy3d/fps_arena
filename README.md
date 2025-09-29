# MVP - Multiplayer Low-Poly FPS Arena

This project is a Minimum Viable Product (MVP) of a real-time, first-person, multiplayer, last-man-standing arena game. It features a direct client-server architecture designed for simplicity and robustness.

## Core Technologies

-   **Client:** Next.js, React, Three.js (`@react-three/fiber`)
-   **Server:** Node.js, Express, Socket.IO
-   **Communication:** Real-time via Socket.IO

## Features

-   **Lobby System:** Players enter a name and join a lobby. The first four become "Contestants," and others become "Spectators."
-   **Ready Check:** A round begins only after all four contestants are ready.
-   **Combat:** A simple, server-authoritative, ranged combat system where players have 3 HP.
-   **Last Man Standing:** The round ends when only one contestant remains.
-   **Spectator Mode:** Defeated players and late-joiners can watch the match, with the camera automatically cycling through active contestants.
-   **3D Player Names:** Player names are rendered in 3D space above their characters.

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

## Deployment

The server is a standard Node.js application that can be deployed to any service that supports Node, such as [Render.com](https://render.com/), Heroku, or a VPS.

When deploying, ensure you set the `origin` in the CORS configuration on the server (`server/server.js`) to match the URL of your deployed client application.