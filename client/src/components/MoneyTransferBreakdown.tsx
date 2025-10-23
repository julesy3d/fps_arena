"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Player, useGameStore } from "@/store/useGameStore";
import { formatTokenAmount, formatTokenChange } from "@/utils/FormatTokenAmount";
import gsap from "gsap";

// Custom scramble text effect
const scrambleText = (
  element: HTMLElement,
  finalText: string,
  duration: number = 0.8,
  chars: string = "0123456789KM.$SHOT +- "
) => {
  const steps = Math.floor(duration * 60); // 60fps
  let currentStep = 0;
  const originalText = finalText;
  const textLength = originalText.length;
  
  const interval = setInterval(() => {
    currentStep++;
    const progress = currentStep / steps;
    
    let scrambled = "";
    for (let i = 0; i < textLength; i++) {
      if (progress * textLength > i) {
        scrambled += originalText[i];
      } else {
        scrambled += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    
    element.textContent = scrambled;
    
    if (currentStep >= steps) {
      clearInterval(interval);
      element.textContent = originalText;
    }
  }, 1000 / 60);
};

export const MoneyTransferBreakdown = () => {
  const { gamePhase, roundWinner, socket, fighters, roundPot } = useGameStore();
  const breakdownRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLDivElement>(null);
  const winnerAmountRef = useRef<HTMLDivElement>(null);
  const protocolAmountRef = useRef<HTMLDivElement>(null);
  const playerResultRef = useRef<HTMLDivElement>(null);
  
  const [isVisible, setIsVisible] = useState(false);

  const animateBreakdown = useCallback(() => {
    if (!breakdownRef.current) return;
    
    // Slide in the container
    gsap.fromTo(
      breakdownRef.current,
      { y: 100, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
    );

    // Scramble effects with delays
    setTimeout(() => {
      if (totalRef.current) {
        scrambleText(totalRef.current, formatTokenAmount(roundPot, true), 0.8, "0123456789KM.$ SHOT");
      }
    }, 300);

    setTimeout(() => {
      if (winnerAmountRef.current && roundWinner) {
        const winnerAmount = roundWinner.isSplit 
          ? Math.floor((roundPot * 0.9) / 2)
          : Math.floor(roundPot * 0.9);
        scrambleText(winnerAmountRef.current, formatTokenAmount(winnerAmount, false), 0.8, "0123456789KM.");
      }
    }, 400);

    setTimeout(() => {
      if (protocolAmountRef.current) {
        const protocolFee = Math.floor(roundPot * 0.1);
        scrambleText(protocolAmountRef.current, formatTokenAmount(protocolFee, false), 0.8, "0123456789KM.");
      }
    }, 400);

    setTimeout(() => {
      if (playerResultRef.current) {
        const originalText = playerResultRef.current.textContent || "";
        
        // Emphasize with scale animation
        gsap.to(playerResultRef.current, {
          scale: 1.1,
          duration: 0.2,
          onComplete: () => {
            if (playerResultRef.current) {
              scrambleText(playerResultRef.current, originalText, 1.0, "0123456789KM.+- $SHOT");
              gsap.to(playerResultRef.current, {
                scale: 1,
                duration: 0.3,
                delay: 0.5,
                ease: "back.out(2)"
              });
            }
          }
        });
      }
    }, 600);
  }, [roundPot, roundWinner]);

  useEffect(() => {
    if (gamePhase === "POST_ROUND" && roundWinner && roundPot > 0) {
      setIsVisible(true);

      // Animate in after a short delay
      setTimeout(() => {
        animateBreakdown();
      }, 100);
    } else {
      setIsVisible(false);
    }
  }, [gamePhase, roundWinner, roundPot, animateBreakdown]);

  if (!isVisible || gamePhase !== "POST_ROUND" || !roundWinner || roundPot <= 0) {
    return null;
  }

  const selfId = socket?.id;
  const wasFighter = fighters.some((f: Player) => f.id === selfId);
  const selfFighter = fighters.find((f: Player) => f.id === selfId);
  
  const protocolFee = Math.floor(roundPot * 0.1);
  
  let playerResultText = "";
  let playerResultColor = "text-subtext1";
  let winnerAmount = 0;

  if (roundWinner.isSplit) {
    winnerAmount = Math.floor((roundPot * 0.9) / 2);
    if (wasFighter) {
      playerResultText = formatTokenChange(winnerAmount - (selfFighter?.betAmount || 0), true);
      playerResultColor = winnerAmount > (selfFighter?.betAmount || 0) ? "text-success" : "text-error";
    }
  } else {
    winnerAmount = Math.floor(roundPot * 0.9);
    const didWin = selfFighter && selfFighter.name === roundWinner.name;
    
    if (didWin) {
      playerResultText = formatTokenChange(winnerAmount - (selfFighter?.betAmount || 0), true);
      playerResultColor = "text-success";
    } else if (wasFighter) {
      const lostAmount = -(selfFighter?.betAmount || 0);
      playerResultText = formatTokenChange(lostAmount, true);
      playerResultColor = "text-error";
    }
  }

  return (
    <div 
      ref={breakdownRef}
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-30"
      style={{ opacity: 0 }}
    >
      <div className="border-dashed-ascii bg-ascii-shade px-6 py-4">
        <div className="font-mono text-sm">
          {/* Header */}
          <div className="text-xs text-subtext1 mb-3">{/* POT BREAKDOWN */}</div>
          
          {/* Total */}
          <div className="mb-3">
            <span className="text-amber font-bold">TOTAL: </span>
            <span ref={totalRef} className="text-amber font-bold">
              {formatTokenAmount(roundPot, true)}
            </span>
          </div>
          
          {/* Breakdown */}
          <div className="text-subtext0 text-xs space-y-1 mb-3">
            <div>
              <span>├─ WINNER ({roundWinner.isSplit ? '45' : '90'}%): </span>
              <span ref={winnerAmountRef}>
                {formatTokenAmount(winnerAmount, false)}
              </span>
            </div>
            <div>
              <span>└─ PROTOCOL (10%): </span>
              <span ref={protocolAmountRef}>
                {formatTokenAmount(protocolFee, false)}
              </span>
            </div>
          </div>
          
          {/* Player Result */}
          {wasFighter && playerResultText && (
            <>
              <div className="hr-dashed my-2" />
              <div 
                ref={playerResultRef}
                className={`font-bold text-base ${playerResultColor}`}
              >
                {playerResultText.startsWith('+') ? 'YOU WON: ' : 'YOU LOST: '}
                {playerResultText}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};