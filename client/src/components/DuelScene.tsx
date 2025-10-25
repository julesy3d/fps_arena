/**
 * @file DuelScene.tsx
 * @description This file contains the primary components for rendering and managing the duel gameplay,
 * including the 3D stage, fighter models, UI elements, and client-side game logic for the duel.
 */

"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useGameStore, Player } from "@/store/useGameStore";
import { Fighter } from "./Fighter";
import { FighterNameLabel } from "./FighterNameLabel";

/**
 * @hook useAudio
 * @description Manages all audio playback for the duel scene.
 * Preloads audio assets and provides memoized playback functions.
 * @returns {object} An object containing functions to play various sound effects.
 */
const useAudio = () => {
  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const clackAudioRef = useRef<HTMLAudioElement | null>(null);
  const hammerAudioRef = useRef<HTMLAudioElement | null>(null);
  const shootAudioRef = useRef<HTMLAudioElement | null>(null);
  const gongAudioRef = useRef<HTMLAudioElement | null>(null);
  const cinematicIntroRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    // Initialize and load all audio files on component mount
    clickAudioRef.current = new Audio('/click.aac');
    clackAudioRef.current = new Audio('/clack.aac');
    hammerAudioRef.current = new Audio('/hammer.aac');
    shootAudioRef.current = new Audio('/shoot.aac');
    gongAudioRef.current = new Audio('/gong.aac');
    cinematicIntroRef.current = new Audio('/cinematic_intro.aac');
    
    clickAudioRef.current.load();
    clackAudioRef.current.load();
    hammerAudioRef.current.load();
    shootAudioRef.current.load();
    gongAudioRef.current.load();
    cinematicIntroRef.current.load();
  }, []);
  
  const playClick = useCallback(() => { 
    if (clickAudioRef.current) { 
      clickAudioRef.current.currentTime = 0; 
      clickAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); 
    } 
  }, []);
  
  const playClack = useCallback(() => { 
    if (clackAudioRef.current) { 
      clackAudioRef.current.currentTime = 0; 
      clackAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); 
    } 
  }, []);
  
  const playHammer = useCallback(() => { 
    if (hammerAudioRef.current) { 
      hammerAudioRef.current.currentTime = 0; 
      hammerAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); 
    } 
  }, []);
  
  const playShoot = useCallback(() => { 
    if (shootAudioRef.current) { 
      shootAudioRef.current.currentTime = 0; 
      shootAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); 
    } 
  }, []);
  
  const playGong = useCallback(() => { 
    if (gongAudioRef.current) { 
      gongAudioRef.current.currentTime = 0; 
      gongAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); 
    } 
  }, []);
  
  const playCinematicIntro = useCallback(() => {
    if (cinematicIntroRef.current) {
      cinematicIntroRef.current.currentTime = 0;
      cinematicIntroRef.current.volume = 1.0;
      cinematicIntroRef.current.play().catch(e => console.warn('Cinematic intro failed:', e));
    }
  }, []);
  
  const stopCinematicIntro = useCallback(() => {
    if (cinematicIntroRef.current && !cinematicIntroRef.current.paused) {
      cinematicIntroRef.current.pause();
      cinematicIntroRef.current.currentTime = 0;
    }
  }, []);
  
  return { playClick, playClack, playHammer, playShoot, playGong, playCinematicIntro, stopCinematicIntro };
};

/**
 * @component ShootingBar
 * @description A UI component that displays a vertical ASCII-style bar to indicate the timing for a shot.
 * It also triggers sound effects at specific points of the bar's progression.
 * @param {boolean} visible - Whether the bar is visible.
 * @param {number} barPosition - The current position of the indicator on the bar (0 to 1).
 * @param {() => void} onTick - Callback for the 'tick' sound effect.
 * @param {() => void} onHammer - Callback for the 'hammer' sound effect.
 * @param {() => void} onTock - Callback for the 'tock' sound effect.
 */
const ShootingBar = ({ 
  visible, 
  barPosition, 
  onTick, 
  onHammer, 
  onTock 
}: { 
  visible: boolean; 
  barPosition: number; 
  onTick: () => void; 
  onHammer: () => void; 
  onTock: () => void; 
}) => {
  const lastSoundRef = useRef<'none' | 'tick' | 'hammer' | 'tock'>('none');
  
  useEffect(() => {
    if (!visible) { 
      lastSoundRef.current = 'none'; 
      return; 
    }
    
    // Trigger sound effects based on the bar's position to provide audio cues.
    if (barPosition >= 0 && barPosition < 0.05 && lastSoundRef.current !== 'tick') { 
      onTick(); 
      lastSoundRef.current = 'tick'; 
    }
    else if (barPosition >= 0.18 && barPosition < 0.22 && lastSoundRef.current !== 'hammer') { 
      onHammer(); 
      lastSoundRef.current = 'hammer'; 
    }
    else if (barPosition >= 0.68 && barPosition < 0.72 && lastSoundRef.current !== 'tock') { 
      onTock(); 
      lastSoundRef.current = 'tock'; 
    }
  }, [barPosition, visible, onTick, onHammer, onTock]);
  
  if (!visible) return null;
  
  const rows = 20;
  const barPositionRow = Math.floor((1 - barPosition) * rows);
  // The 'target zone' is where the player is supposed to shoot.
  const targetZoneStart = Math.floor(rows * 0.20);
  const targetZoneEnd = Math.floor(rows * 0.40);
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center gap-2">
      <div 
        className="border-dashed-ascii font-mono text-sm leading-tight p-2 bg-overlay text-subtext1"
      >
        {Array.from({ length: rows }).map((_, i) => {
          const isBar = i === barPositionRow;
          const isInTargetZone = i >= targetZoneStart && i <= targetZoneEnd;
          
          let char = '│';
          let className = 'text-subtext1';
          
          if (isBar) {
            char = '█';
            className = 'text-rose';
          } else if (isInTargetZone) {
            char = '░';
            className = 'text-sage';
          }
          
          return (
            <div key={i} className={className}>
              {char}
            </div>
          );
        })}
      </div>
      
      <div 
        className={`font-mono text-sm font-bold ${barPosition >= 0.60 && barPosition <= 0.80 ? 'text-sage' : 'text-subtext1'}`}
      >
        {barPosition >= 0.60 && barPosition <= 0.80 ? 'NOW!' : `${(barPosition * 100).toFixed(0)}%`}
      </div>
    </div>
  );
};

/**
 * @component DuelSceneContent
 * @description Renders the 3D elements of the duel, including lights and fighters.
 * @param {Player[]} fighters - An array of the two players participating in the duel.
 */
const DuelSceneContent = ({ fighters }: { fighters: Player[] }) => {
  const { invalidate } = useThree();
  
  // Force a re-render of the scene when the fighters' data changes.
  useEffect(() => {
    invalidate();
  }, [fighters, invalidate]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} />
      
      {fighters?.map(fighter => (
        <group key={fighter.id}>
          <Fighter 
            position={fighter.position} 
            rotation={fighter.rotation} 
            animationState={fighter.animationState || 'idle'}
          />
          <FighterNameLabel 
            name={fighter.name} 
            position={fighter.position}
            betAmount={fighter.betAmount || 0}
          />
        </group>
      ))}
    </>
  );
};

/**
 * @component DuelStage3D
 * @description Determines which players to display as fighters based on the current game phase.
 * In the LOBBY, it shows the top two bidders. In other phases, it shows the active fighters.
 */
export const DuelStage3D = () => {
  const { socket, fighters, gamePhase, players } = useGameStore();
  
  const displayFighters = useMemo(() => {
    if (gamePhase === "LOBBY") {
      // In the lobby, show the top 2 bidders as a preview of the next duel.
      const allPlayers = Object.values(players || {});
      const topBidders = allPlayers
        .filter(p => p.betAmount > 0)
        .sort((a, b) => (b.betAmount ?? 0) - (a.betAmount ?? 0))
        .slice(0, 2);
      
      return topBidders.map((player, index) => ({
        ...player,
        position: [index === 0 ? 0 : 0, 0, index === 0 ? -3 : 3],
        rotation: index === 0 ? 0 : Math.PI,
        animationState: 'idle' as const
      } as Player));
    } 
    else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
      // During and after a round, show the actual fighters.
      if (fighters && fighters.length > 0) {
        return fighters;
      }
      return [];
    }
    return [];
  }, [gamePhase, players, fighters]);

  // Notify the server that the player is ready to start the duel.
  useEffect(() => {
    if (socket && gamePhase === "IN_ROUND") {
      socket.emit("duel:playerReady");
    }
  }, [socket, gamePhase]);

  return <DuelSceneContent fighters={displayFighters} />;
};

type RoundEndPayload = {
  outcome: 'hit' | 'dodge' | 'miss';
  winnerId?: string;
  loserId?: string;
  round: number;
};

type GamePhasePayload = {
  phase: string;
  winnerData?: { name: string; isSplit: boolean; };
};
/**
 * @component DuelUI
 * @description The main component that manages the duel's UI and client-side logic,
 * including player input, state transitions, and socket event handling.
 */
export const DuelUI = () => {
  const { socket, gamePhase } = useGameStore();
  const { playClick, playClack, playHammer, playShoot, playGong, playCinematicIntro, stopCinematicIntro } = useAudio();

  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(true);
  const [canClick, setCanClick] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'draw' | 'shoot' | null>(null);
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<number>(0);
  const hasShotThisRound = useRef(false);
  const [isAIMode, setIsAIMode] = useState(false);

  const shootingStartTime = useRef<number | null>(null);
  const MIN_SHOOTING_DURATION = 500;

  const activeTimers = useRef<NodeJS.Timeout[]>([]);

  const clearAllTimers = useCallback(() => {
    activeTimers.current.forEach(timer => clearTimeout(timer));
    activeTimers.current = [];
  }, []);

  const addTimer = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      callback();
      activeTimers.current = activeTimers.current.filter(t => t !== timer);
    }, delay);
    activeTimers.current.push(timer);
    return timer;
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  useEffect(() => {
    if (gamePhase === "LOBBY") {
      shootingStartTime.current = null;
    }
  }, [gamePhase]);
  
  const handleClick = useCallback(() => {
    if (!canClick || !socket || !socket.id || actionType !== 'shoot' || hasShotThisRound.current) {
      return;
    }
    
    const selfId = socket.id;
    
    playShoot();
    
    // Optimistically play the shooting animation on the client.
    useGameStore.getState().updateFighterAnimation(selfId, 'shooting');
    
    shootingStartTime.current = Date.now();
    
    socket.emit("duel:shoot");
    hasShotThisRound.current = true;
    setCanClick(false);
  }, [canClick, socket, actionType, barPosition, playShoot]);

  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      handleClick();
    };
    
    window.addEventListener('click', handleWindowClick);
    
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, [handleClick]);
  
  useEffect(() => {
    if (!socket) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'a' && !isAIMode) {
        socket.emit("duel:requestAIMode");
        setIsAIMode(true);
      }
      
      if (e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const onShot = ({ shooterId, autoMiss }: {
      shooterId: string;
      autoMiss?: boolean;
    }) => {
      if (autoMiss) {
        return;
      }
      
      if (shooterId === socket.id && hasShotThisRound.current) {
        return;
      }
      
      playShoot();
      useGameStore.getState().updateFighterAnimation(shooterId, 'shooting');
    };

    const onBothReady = () => {
      setIsWaitingForOpponent(false);
      playCinematicIntro();
    };
    
    const onGong = () => {
      playGong();
      stopCinematicIntro();

      setBarVisible(true);
      
      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'draw');
      });
      
      addTimer(() => {
        const fighters = useGameStore.getState().fighters;
        fighters.forEach(f => {
          useGameStore.getState().updateFighterAnimation(f.id, 'armed');
        });
        
        setCanClick(true);
        setActionType('shoot');
        
      }, 1200);
    };

    const onBarUpdate = ({ position }: { position: number }) => {
      setBarPosition(position);
    };

    const onNewRound = () => {
      hasShotThisRound.current = false;
      shootingStartTime.current = null;
      setCanClick(true);
      setActionType('shoot');
      
      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        if (f.animationState !== 'armed') {
          useGameStore.getState().updateFighterAnimation(f.id, 'armed');
        }
      });
    };

    const onRoundEnd = ({ outcome, winnerId, loserId, round }: RoundEndPayload) => {
      setCanClick(false);
      
      const weShot = shootingStartTime.current !== null;
      let delayNeeded = 0;
      
      if (weShot) {
        const elapsed = Date.now() - shootingStartTime.current!;
        delayNeeded = Math.max(0, MIN_SHOOTING_DURATION - elapsed);
      }
      
      addTimer(() => {
        applyRoundResult({ outcome, winnerId, loserId, round });
        shootingStartTime.current = null;
      }, delayNeeded);
    };
    
    const applyRoundResult = ({ outcome, winnerId, loserId }: RoundEndPayload) => {
      const currentFighters = useGameStore.getState().fighters;
      
      switch (outcome) {
        case 'hit':
          setBarVisible(false);
          setActionType(null);
          
          currentFighters.forEach(f => {
            if (f.id === winnerId) {
              useGameStore.getState().updateFighterAnimation(f.id, 'shooting');
            } else if (f.id === loserId) {
              useGameStore.getState().updateFighterAnimation(f.id, 'death');
            }
          });
          break;
          
        case 'dodge':
          addTimer(() => {
            const currentFighters = useGameStore.getState().fighters;
            currentFighters.forEach(f => {
              useGameStore.getState().updateFighterAnimation(f.id, 'dodging');
            });
          }, 300);
          break;
          
        case 'miss':
          break;
      }
    };

    const onGamePhaseChange = ({ phase, winnerData }: GamePhasePayload) => {
      if (phase === "POST_ROUND" && winnerData) {
        setBarVisible(false);
        setCanClick(false);
        setActionType(null);
        shootingStartTime.current = null;
        
        const currentFighters = useGameStore.getState().fighters;
        
        if (winnerData.isSplit) {
          currentFighters.forEach(f => {
            useGameStore.getState().updateFighterAnimation(f.id, 'death');
          });
        } else {
          currentFighters.forEach(f => {
            if (f.name === winnerData.name) {
              useGameStore.getState().updateFighterAnimation(f.id, 'victory');
            } else {
              useGameStore.getState().updateFighterAnimation(f.id, 'death');
            }
          });
        }
        
        setIsWaitingForOpponent(true);
      }
    };
        
    socket.on("duel:shot", onShot); 
    socket.on("duel:bothReady", onBothReady);
    socket.on("duel:gong", onGong);
    socket.on("duel:barUpdate", onBarUpdate);
    socket.on("duel:newRound", onNewRound);
    socket.on("duel:roundEnd", onRoundEnd);
    socket.on("game:phaseChange", onGamePhaseChange);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      socket.off("duel:shot", onShot);
      socket.off("duel:bothReady", onBothReady);
      socket.off("duel:gong", onGong);
      socket.off("duel:barUpdate", onBarUpdate);
      socket.off("duel:newRound", onNewRound);
      socket.off("duel:roundEnd", onRoundEnd);
      socket.off("game:phaseChange", onGamePhaseChange);
    };
  }, [socket, isAIMode, playGong, playCinematicIntro, stopCinematicIntro, playShoot, handleClick, addTimer]);
  
  return (
    <div 
      className="absolute inset-0" 
      style={{ 
        cursor: 'crosshair',
        opacity: canClick ? 1 : 0.6,
        pointerEvents: 'none'
      }}
    >
      {isWaitingForOpponent && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-base/90">
          <div className="border-dashed-ascii p-6 bg-surface">
            <h1 className="text-2xl font-normal font-mono text-subtext0">
              WAITING FOR OPPONENT...
            </h1>
          </div>
        </div>
      )}

      {isAIMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 border-dashed-ascii px-4 py-2 bg-overlay">
          <span className="font-mono text-sm font-normal text-rose">
            [🤖 AI OPPONENT ACTIVE]
          </span>
        </div>
      )}
      
      {canClick && actionType === 'shoot' && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl font-mono font-normal text-peach">
            [CLICK TO SHOOT]
          </div>
        </div>
      )}
      
      <ShootingBar 
        visible={barVisible} 
        barPosition={barPosition} 
        onTick={playClick} 
        onTock={playClack} 
        onHammer={playHammer} 
      />
    </div>
  );
};
