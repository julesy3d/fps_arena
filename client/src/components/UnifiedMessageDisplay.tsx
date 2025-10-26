"use client";

import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { formatTokenAmount } from '@/utils/FormatTokenAmount';

interface Message {
  text: string;
  duration: number;
  dramatic?: boolean;
}

const NARRATOR_MESSAGES: Message[] = [
  { text: "well, well, well...", duration: 2000 },
  { text: "looks like we got ourselves a situation.", duration: 4000 },
  { text: "at high noon, you will both draw your guns.", duration: 4000 },
  { text: "one dies,", duration: 4000 },
  { text: "one gets rich.", duration: 4000 },
  { text: "HIGH NOON APPROACHES.", duration: 0, dramatic: true },
];

export const UnifiedMessageDisplay = () => {
  const { gamePhase, roundWinner, socket, fighters } = useGameStore();
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [isDramatic, setIsDramatic] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const [narratorIndex, setNarratorIndex] = useState(0);
  const [showingNarrator, setShowingNarrator] = useState(false);
  const narratorHasPlayed = useRef(false);

  const activeTimers = useRef<NodeJS.Timeout[]>([]);

  const clearAllTimers = () => {
    activeTimers.current.forEach(timer => clearTimeout(timer));
    activeTimers.current = [];
  };

  const addTimer = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      callback();
      activeTimers.current = activeTimers.current.filter(t => t !== timer);
    }, delay);
    activeTimers.current.push(timer);
    return timer;
  };

  // Reset when returning to LOBBY
  useEffect(() => {
    if (gamePhase === "LOBBY") {
      clearAllTimers();
      narratorHasPlayed.current = false;
      setShowingNarrator(false);
      setNarratorIndex(0);
      setCurrentMessage("");
      setIsVisible(false);
    }
  }, [gamePhase]);

  // Start narrator when entering IN_ROUND
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
      return;
    }

    addTimer(() => {
      setIsVisible(false);
    }, message.duration);

    addTimer(() => {
      setNarratorIndex(narratorIndex + 1);
    }, message.duration + 500);

  }, [showingNarrator, narratorIndex]);

  // Listen for duel messages from socket
  useEffect(() => {
    if (!socket) return;

    const handleGong = () => {
      clearAllTimers();
      setShowingNarrator(false);
      setIsVisible(false);
      setCurrentMessage("");
    };

    const handleNewRound = ({ round }: { round: number }) => {
      clearAllTimers();
      
      setCurrentMessage(`═══ ROUND ${round} ═══`);
      setIsDramatic(true);
      setIsVisible(true);
      
      addTimer(() => {
        setIsVisible(false);
      }, 1500);
    };

    const handleBothHit = () => {
      clearAllTimers();
      
      setCurrentMessage("BOTH HIT — DODGE!");
      setIsDramatic(true);
      setIsVisible(true);
      
      addTimer(() => {
        setIsVisible(false);
      }, 1500);
    };

    const handleBothMiss = () => {
      clearAllTimers();
      
      setCurrentMessage("BOTH MISSED!");
      setIsDramatic(false);
      setIsVisible(true);
      
      addTimer(() => {
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

  // === WINNER/LOSER DISPLAY (POST_ROUND) ===
  useEffect(() => {
    if (gamePhase === "POST_ROUND" && roundWinner) {
      clearAllTimers();
      setShowingNarrator(false);
      
      // Check if current player won or lost
      const selfId = socket?.id;
      const wasFighter = fighters.some(f => f.id === selfId);
      const selfFighter = fighters.find(f => f.id === selfId);
      
      if (roundWinner.isSplit) {
        // DRAW - POT SPLIT
        const individualPayout = roundWinner.pot / 2;
        setCurrentMessage(`DRAW — POT SPLIT`);
        setIsDramatic(false);
        setIsVisible(true);
        
        addTimer(() => {
          setCurrentMessage(`Each receives ${formatTokenAmount(individualPayout, true)}`);
          setIsDramatic(false);
          setIsVisible(true);
        }, 2000);
        
      } else {
        const didWin = selfFighter && selfFighter.name === roundWinner.name;
        
        if (didWin) {
          // === WINNER VIEW ===
          setCurrentMessage(`YOU WON!`);
          setIsDramatic(true);
          setIsVisible(true);
          
          addTimer(() => {
            setCurrentMessage(`+${formatTokenAmount(roundWinner.pot, true)}`);
            setIsDramatic(false);
            setIsVisible(true);
          }, 2000);
          
        } else if (wasFighter) {
          // === LOSER VIEW ===
          const lostAmount = selfFighter?.betAmount || 0;
          
          setCurrentMessage(`YOU LOST`);
          setIsDramatic(true);
          setIsVisible(true);
          
          addTimer(() => {
            setCurrentMessage(`-${formatTokenAmount(lostAmount, true)}`);
            setIsDramatic(false);
            setIsVisible(true);
          }, 2000);
          
          addTimer(() => {
            setCurrentMessage(`${roundWinner.name} won the pot`);
            setIsDramatic(false);
            setIsVisible(true);
          }, 4000);
          
        } else {
          // === SPECTATOR VIEW ===
          setCurrentMessage(`${roundWinner.name} WINS!`);
          setIsDramatic(true);
          setIsVisible(true);
          
          addTimer(() => {
            setCurrentMessage(`+${roundWinner.pot.toLocaleString()} Lamports`);
            setIsDramatic(false);
            setIsVisible(true);
          }, 2000);
        }
      }
    }
  }, [gamePhase, roundWinner, socket, fighters]);

  if (gamePhase === "LOBBY") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex justify-center pt-20 pointer-events-none">
      <div
        className={`
          max-w-2xl px-16 py-4 text-center font-mono italic tracking-wider
          ${isDramatic ? 'text-4xl text-rose' : 'text-2xl text-subtext0'}
          ${isVisible ? 'block' : 'hidden'}
        `}
      >
        {currentMessage}
      </div>
    </div>
  );
};