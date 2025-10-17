"use client";

import { useEffect, useState } from "react";

interface Message {
  text: string;
  duration: number;
  dramatic?: boolean;
}

interface NarratorSequenceProps {
  onComplete: () => void;
}

const MESSAGES: Message[] = [
  { text: "well, well, well...", duration: 2000 },
  { text: "looks like we got ourselves a situation.", duration: 2500 },
  { text: "at high noon, you will both draw your guns.", duration: 2200 },
  { text: "one dies, one gets rich.", duration: 2800 },
  { text: "HIGH NOON APPROACHES.", duration: 0, dramatic: true }, // duration: 0 = stays until gong
];

export const NarratorSequence = ({ onComplete }: NarratorSequenceProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (currentIndex >= MESSAGES.length) {
      // Sequence complete
      onComplete();
      return;
    }

    const message = MESSAGES[currentIndex];
    
    // Fade in
    setIsVisible(true);
    
    // Special case: duration 0 means "stay visible until next event"
    if (message.duration === 0) {
      // Don't fade out, don't auto-advance
      // This message will stay until onComplete is called externally (by GONG)
      return;
    }
    
    // Normal case: Fade out after duration
    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
    }, message.duration);
    
    // Move to next message after fade out completes
    const nextMessageTimer = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
    }, message.duration + 500); // 500ms pause between messages
    
    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(nextMessageTimer);
    };
  }, [currentIndex, onComplete]);

  if (currentIndex >= MESSAGES.length) return null;

  const currentMessage = MESSAGES[currentIndex];

  return (
    <div
    className={`
        text-center px-8 py-4 font-normal italic
        ${currentMessage.dramatic 
        ? 'text-5xl' 
        : 'text-3xl'
        }
        transition-all duration-700
        ${isVisible ? 'opacity-100' : 'opacity-0'}
    `}
    style={{
        color: currentMessage.dramatic ? '#d20f39' : '#6c6f85', // --red or --subtext0
        textShadow: currentMessage.dramatic 
        ? '0 2px 8px rgba(210, 15, 57, 0.3)' 
        : '0 2px 4px rgba(108, 111, 133, 0.2)',
        fontFamily: 'IBM Plex Mono, monospace',
        letterSpacing: '0.05em'
    }}
    >
    {currentMessage.text}
    </div>
  );
};