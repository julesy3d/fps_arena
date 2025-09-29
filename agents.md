# Project Agent Log: MVP - Multiplayer Low-Poly FPS Arena

This document tracks the development progress and outlines the immediate and long-term goals for the project.

## Detailed Technology Stack

-   **Client Framework:** Next.js with React for a modern, component-based UI.
-   **3D Rendering:** Three.js, implemented via `@react-three/fiber` and `@react-three/drei` for a declarative and hook-based approach to 3D scenes in React.
-   **Server Application:** A lightweight Node.js server using the Express framework for basic HTTP routing.
-   **Real-Time Communication:** Socket.IO for low-latency, event-based, bidirectional communication.
-   **Languages:** TypeScript on the client for type safety; JavaScript on the server for simplicity.
-   **Deployment:** The architecture is designed for easy deployment to services like Render.com.

## Core Data Structures

To maintain simplicity and low latency, the data sent over the network is minimal. We only transit essential information, relying on the server as the single source of truth for game state.

### Player State
This is the most frequently updated object, sent from the client to the server on every frame.

```json
{
  "id": "string",       // The client's socket.id
  "position": "[x, y, z]",  // number[]
  "rotation": "[x, y, z, w]" // number[] (Quaternion)
}
```

### Game State
A larger object managed by the server and sent to clients when the overall game flow changes (e.g., round start, round end).

### Event-Based Data
Actions like shooting are not part of the continuous state update. Instead, they are sent as discrete, one-off events to the server.

-   **`playerShot`**: A client sends this when they fire. The server processes the raycast, determines if a hit occurred, and updates the game state accordingly. This prevents clients from cheating by falsely reporting a hit.
-   **`playerHit`**: The server broadcasts this event to all clients when a shot successfully hits a player, allowing clients to update their local state (e.g., show a hit marker, update the victim's HP).

## Current Status (As of last update)

We have successfully built a functional prototype that includes both single-player mechanics and the foundational layer for multiplayer gameplay.

### Core Mechanics Implemented:
-   **Player Controller:** A first-person character controller with:
    -   Standard WASD movement and mouse-look for aiming.
    -   Physics including gravity and jumping.
-   **Combat System (Prototype):**
    -   Instant "hitscan" (raycast-based) shooting, triggered by a left-click.
    -   Visual feedback for shots, including a crosshair and red hit-marker planes.
    -   Destructible target cubes placed in the scene for testing.
-   **Environment:**
    -   A simple, bounded plane for the arena floor.
    -   Basic lighting.

### Multiplayer Networking Implemented:
-   **Client-Server Architecture:**
    -   A Node.js server using Express and Socket.IO is running.
    -   The Next.js client successfully connects to the server via a `useSocket` hook.
-   **State Synchronization:**
    -   The client continuously sends its position and rotation data to the server.
    -   The server broadcasts this data to all other connected clients.
    -   Clients render other players as simple blue cuboids, updating their positions and rotations in real-time.

## What We Are Trying To Do Now (Immediate Goals)

The current focus is to transition from a technical prototype to the game loop defined in the project specification.

1.  **Implement the Lobby System:** This is the highest priority.
    -   Create the UI for a player to enter their name before joining the game.
    -   Update the server to manage player names and game states (Lobby, In-Round).
    -   Establish the "Contestant" vs. "Spectator" logic based on connection order.
2.  **Display Player Names:** Implement the system to render player names as text floating above each character model in the 3D scene.
3.  **Introduce Health & Defeat:**
    -   Give each player Health Points (HP).
    -   Make player-on-player shots decrease HP.
    -   Handle player defeat when HP reaches zero (removal from the map, transition to spectator).