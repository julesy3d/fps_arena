"use client";

import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";

interface Message {
  text: string;
  duration: number;
  dramatic?: boolean;
}

const NARRATOR_MESSAGES: Message[] = [
  { text: "well, well, well...", duration: 2000 },
  { text: "looks like we got ourselves a situation.", duration: 2500 },
  { text: "at high noon, you will both draw your guns.", duration: 2200 },
  { text: "one dies, one gets rich.", duration: 2800 },
  { text: "HIGH NOON APPROACHES.", duration: 0, dramatic: true },
];

export const UnifiedMessageDisplay = () => {
  const { gamePhase, roundWinner, socket } = useGameStore();
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [isDramatic, setIsDramatic] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  // Narrator state
  const [narratorIndex, setNarratorIndex] = useState(0);
  const [showingNarrator, setShowingNarrator] = useState(false);
  const narratorHasPlayed = useRef(false); // Track if narrator played this duel

  // Duel message state
  const [duelMessage, setDuelMessage] = useState<string>("");
  const [currentRound, setCurrentRound] = useState<number>(1);

  // Reset narrator flag when returning to LOBBY
  useEffect(() => {
    if (gamePhase === "LOBBY") {
      narratorHasPlayed.current = false;
      setShowingNarrator(false);
      setNarratorIndex(0);
      setDuelMessage("");
      setCurrentRound(1);
    }
  }, [gamePhase]);

  // Start narrator ONLY ONCE when entering IN_ROUND
  useEffect(() => {
    if (gamePhase === "IN_ROUND" && !narratorHasPlayed.current && !showingNarrator) {
      narratorHasPlayed.current = true;
      setShowingNarrator(true);
      setNarratorIndex(0);
    }
  }, [gamePhase, showingNarrator]);

  // Handle narrator sequence
  useEffect(() => {
    if (!showingNarrator || narratorIndex >= NARRATOR_MESSAGES.length) return;

    const message = NARRATOR_MESSAGES[narratorIndex];
    setCurrentMessage(message.text);
    setIsDramatic(message.dramatic || false);
    setIsVisible(true);

    if (message.duration === 0) {
      // Last message stays until GONG
      return;
    }

    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
    }, message.duration);

    const nextMessageTimer = setTimeout(() => {
      setNarratorIndex(narratorIndex + 1);
    }, message.duration + 500);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(nextMessageTimer);
    };
  }, [showingNarrator, narratorIndex]);

  // Listen for duel messages from socket
  useEffect(() => {
    if (!socket) return;

    const handleGong = () => {
      setShowingNarrator(false);
      setDuelMessage(""); // Don't show "SHOOT!" - it's implied
      setIsVisible(false);
    };

    const handleNewRound = ({ round }: { round: number; message: string }) => {
      setCurrentRound(round);
      setDuelMessage(`═══ ROUND ${round} ═══`);
      setIsDramatic(true);
      setIsVisible(true);
      
      // Fade out round indicator after 1.5s
      setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    };

    const handleBothHit = () => {
      setDuelMessage("BOTH HIT — DODGE!");
      setIsDramatic(true);
      setIsVisible(true);
      
      setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    };

    const handleBothMiss = () => {
      setDuelMessage("BOTH MISSED!");
      setIsDramatic(false);
      setIsVisible(true);
      
      setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    };

    socket.on("duel:gong", handleGong);
    socket.on("duel:newRound", handleNewRound);
    socket.on("duel:bothHit", handleBothHit);
    socket.on("duel:bothMiss", handleBothMiss);

    return () => {
      socket.off("duel:gong", handleGong);
      socket.off("duel:newRound", handleNewRound);
      socket.off("duel:bothHit", handleBothHit);
      socket.off("duel:bothMiss", handleBothMiss);
    };
  }, [socket]);

  // Show winner announcement in POST_ROUND
  useEffect(() => {
    if (gamePhase === "POST_ROUND" && roundWinner) {
      setShowingNarrator(false);
      
      if (roundWinner.isSplit) {
        // Split pot - each gets 45% of total
        const individualPayout = roundWinner.pot / 2;
        setCurrentMessage(`DRAW — POT SPLIT`);
        setIsDramatic(false);
        setIsVisible(true);
        
        // Show payout after a moment
        setTimeout(() => {
          setCurrentMessage(`Each receives ${individualPayout.toLocaleString()} Lamports`);
          setIsDramatic(false);
        }, 1500);
      } else {
        setCurrentMessage(`${roundWinner.name} WINS!`);
        setIsDramatic(true);
        setIsVisible(true);
        
        // Show payout after a moment
        setTimeout(() => {
          setCurrentMessage(`+${roundWinner.pot.toLocaleString()} Lamports`);
          setIsDramatic(false);
        }, 1500);
      }
    }
  }, [gamePhase, roundWinner]);

  // Determine what to display
  const displayMessage = showingNarrator ? currentMessage : duelMessage || currentMessage;
  const displayDramatic = showingNarrator ? isDramatic : isDramatic;

  // Don't render during LOBBY phase
  if (gamePhase === "LOBBY") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex justify-center pt-20 pointer-events-none">
      <div
        className={`
          text-center px-16 py-4 font-normal italic max-w-2xl
          ${displayDramatic ? 'text-4xl' : 'text-2xl'}
          transition-all duration-700
          ${isVisible ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          color: displayDramatic ? '#d20f39' : '#6c6f85',
          textShadow: displayDramatic 
            ? '0 2px 8px rgba(210, 15, 57, 0.3)' 
            : '0 2px 4px rgba(108, 111, 133, 0.2)',
          fontFamily: 'IBM Plex Mono, monospace',
          letterSpacing: '0.05em'
        }}
      >
        {displayMessage}
      </div>
    </div>
  );
};