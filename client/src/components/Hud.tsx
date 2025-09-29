/**
 * @file Hud.tsx
 * @description This component renders the Heads-Up Display (HUD), which shows game information
 * like player lists, game status, and provides interactive buttons for players.
 */
"use client";

import React from 'react';

/** @description Defines the structure of a player object used within the HUD. */
interface Player {
    id: string;
    name: string;
    hp: number;
    role: 'CONTESTANT' | 'SPECTATOR';
    isReady: boolean;
}

/** @description Defines the props required by the Hud component. */
interface HudProps {
    /** The entire game state object from the server. */
    gameState: {
        phase: 'LOBBY' | 'COUNTDOWN' | 'IN_ROUND' | 'ROUND_OVER';
        players: Record<string, Player>;
        roundWinner: string | null;
        countdown: number;
    };
    /** The socket ID of the local player. */
    ownId: string | null;
    /** Callback function for when a contestant clicks the "Ready" button. */
    onReady: () => void;
    /** Callback function for when a spectator clicks the "Become a Contestant" button. */
    onBecomeContestant: () => void;
}

/**
 * @description The main HUD component. It displays player lists, game status, and action buttons.
 */
const Hud: React.FC<HudProps> = ({ gameState, ownId, onReady, onBecomeContestant }) => {
    const { players, phase, roundWinner, countdown } = gameState;
    // Find the local player's data from the players list.
    const ownPlayer = ownId ? players[ownId] : null;

    // Separate players into contestants and spectators for easier rendering.
    const contestants = Object.values(players).filter(p => p.role === 'CONTESTANT');
    const spectators = Object.values(players).filter(p => p.role === 'SPECTATOR');

    return (
        <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: '15px',
            borderRadius: '10px',
            fontFamily: 'monospace',
            fontSize: '16px',
            width: '300px',
            userSelect: 'none',
        }}>
            {phase === 'ROUND_OVER' && roundWinner && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '48px',
                    color: 'gold',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: '20px',
                    borderRadius: '15px',
                    textAlign: 'center',
                }}>
                    {roundWinner} Wins!
                </div>
            )}

            {phase === 'COUNTDOWN' && (
                 <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '72px',
                    color: 'white',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    textAlign: 'center',
                }}>
                    {countdown}
                </div>
            )}

            <h2 style={{ marginTop: 0, borderBottom: '1px solid white', paddingBottom: '5px' }}>Contestants ({contestants.length}/4)</h2>
            <ul>
                {contestants.map(p => (
                    <li key={p.id} style={{ color: p.isReady ? 'lime' : 'white', listStyle: 'none', padding: '5px 0' }}>
                        {p.name} {p.id === ownId && "(You)"} - HP: {p.hp} {p.isReady ? '(Ready)' : ''}
                    </li>
                ))}
            </ul>

            <h3 style={{ marginTop: '20px', borderBottom: '1px solid white', paddingBottom: '5px' }}>Spectators ({spectators.length})</h3>
            <ul>
                {spectators.map(p => (
                    <li key={p.id} style={{ listStyle: 'none', padding: '5px 0' }}>
                        {p.name} {p.id === ownId && "(You)"}
                    </li>
                ))}
            </ul>

            {ownPlayer && ownPlayer.role === 'CONTESTANT' && !ownPlayer.isReady && phase === 'LOBBY' && (
                <button
                    onClick={onReady}
                    style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '18px',
                        cursor: 'pointer',
                        backgroundColor: 'green',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        marginTop: '15px',
                    }}
                >
                    Ready
                </button>
            )}

            {ownPlayer && ownPlayer.role === 'SPECTATOR' && contestants.length < 4 && phase === 'LOBBY' && (
                 <button
                    onClick={onBecomeContestant}
                    style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '18px',
                        cursor: 'pointer',
                        backgroundColor: 'blue',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        marginTop: '15px',
                    }}
                >
                    Become a Contestant
                </button>
            )}
        </div>
    );
};

export default Hud;