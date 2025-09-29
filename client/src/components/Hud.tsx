"use client";

import React from 'react';

// Define the structure of a player object
interface Player {
    id: string;
    name: string;
    hp: number;
    role: 'CONTESTANT' | 'SPECTATOR';
    isReady: boolean;
}

// Define the props for the Hud component
interface HudProps {
    players: Record<string, Player>;
    ownId: string | null;
    onReady: () => void;
    winner: string | null;
}

const Hud: React.FC<HudProps> = ({ players, ownId, onReady, winner }) => {
    const ownPlayer = ownId ? players[ownId] : null;

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
            {winner && (
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
                    {winner} Wins!
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

            {ownPlayer && ownPlayer.role === 'CONTESTANT' && !ownPlayer.isReady && (
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
        </div>
    );
};

export default Hud;