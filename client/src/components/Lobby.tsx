/**
 * @file Lobby.tsx
 * @description This component renders the initial lobby screen where players can enter their name
 * before joining the game session.
 */
"use client";

import React, { useState } from 'react';

/** @description Defines the props for the Lobby component. */
interface LobbyProps {
  /** Callback function that is triggered when the user submits their name. */
  onSetName: (name: string) => void;
}

/**
 * @description A simple UI component for the player to enter their name.
 */
const Lobby: React.FC<LobbyProps> = ({ onSetName }) => {
  const [name, setName] = useState('');

  const handleSetName = () => {
    if (name.trim()) {
      onSetName(name.trim());
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
        onKeyPress={(e) => e.key === 'Enter' && handleSetName()}
        style={{
          padding: '10px',
          fontSize: '18px',
          marginBottom: '20px',
          width: '300px',
          textAlign: 'center',
        }}
      />
      <button
        onClick={handleSetName}
        style={{
          padding: '10px 20px',
          fontSize: '18px',
          cursor: 'pointer',
        }}
      >
        Set Name
      </button>
    </div>
  );
};

export default Lobby;