"use client";

import React, { useState } from 'react';

interface LobbyProps {
  onJoin: (name: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [name, setName] = useState('');

  const handleJoin = () => {
    if (name.trim()) {
      onJoin(name.trim());
    } else {
      alert('Please enter a name.');
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      fontFamily: 'sans-serif',
    }}>
      <h1>Multiplayer Arena</h1>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
        style={{
          padding: '10px',
          fontSize: '18px',
          marginBottom: '20px',
          width: '300px',
          textAlign: 'center',
        }}
      />
      <button
        onClick={handleJoin}
        style={{
          padding: '10px 20px',
          fontSize: '18px',
          cursor: 'pointer',
        }}
      >
        Join Game
      </button>
    </div>
  );
};

export default Lobby;