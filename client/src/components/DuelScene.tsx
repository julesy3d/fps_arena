"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useGameStore } from "@/store/useGameStore";
import { Fighter } from "./Fighter";
import { FighterNameLabel } from "./FighterNameLabel";

// ============================================
// AUDIO MANAGER
// ============================================
const useAudio = () => {
  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const clackAudioRef = useRef<HTMLAudioElement | null>(null);
  const hammerAudioRef = useRef<HTMLAudioElement | null>(null);
  const shootAudioRef = useRef<HTMLAudioElement | null>(null);
  const gongAudioRef = useRef<HTMLAudioElement | null>(null);
  const cinematicIntroRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
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

// ============================================
// SHOOTING BAR - ASCII-style Visual timing indicator
// ============================================
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
    
    // Play sounds at specific bar positions
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
  
  // Create 20 rows for the bar
  const rows = 20;
  const barPositionRow = Math.floor((1 - barPosition) * rows);
  const targetZoneStart = Math.floor(rows * 0.20);
  const targetZoneEnd = Math.floor(rows * 0.40);
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center gap-2">
      {/* ASCII Bar */}
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
      
      {/* Percentage indicator OR "NOW!" */}
      <div 
        className={`font-mono text-sm font-bold ${barPosition >= 0.60 && barPosition <= 0.80 ? 'text-sage' : 'text-subtext1'}`}
      >
        {barPosition >= 0.60 && barPosition <= 0.80 ? 'NOW!' : `${(barPosition * 100).toFixed(0)}%`}
      </div>
    </div>
  );
};

// ============================================
// 3D SCENE CONTENT - Renders fighters
// ============================================
const DuelSceneContent = ({ fighters }: { fighters: any[] }) => {
  const { invalidate } = useThree();
  
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

// ============================================
// DUEL STAGE 3D - Manages which fighters to show
// ============================================
export const DuelStage3D = () => {
  const { socket, fighters, gamePhase, players } = useGameStore();
  
  const displayFighters = useMemo(() => {
    if (gamePhase === "LOBBY") {
      const allPlayers = Object.values(players || {});
      const topBidders = allPlayers
        .filter(p => p.betAmount > 0)
        .sort((a, b) => (b.betAmount ?? 0) - (a.betAmount ?? 0))
        .slice(0, 2);
      
      console.log('🏛️ LOBBY staging:', {
        totalPlayers: allPlayers.length,
        playersWithBets: allPlayers.filter(p => p.betAmount > 0).length,
        topBidders: topBidders.map(p => ({ name: p.name, bet: p.betAmount }))
      });
      
      return topBidders.map((player, index) => ({
        id: player.id,
        name: player.name,
        betAmount: player.betAmount,
        position: index === 0 ? [0, 0, -3] : [0, 0, 3] as [number, number, number],
        rotation: index === 0 ? 0 : Math.PI,
        animationState: 'idle' as const
      }));
    } 
    else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
      if (fighters && fighters.length > 0) {
        return fighters;
      }
      console.warn('⚠️ Fighters array empty during', gamePhase);
      return [];
    }
    return [];
  }, [gamePhase, players, fighters]);

  useEffect(() => {
    if (socket && gamePhase === "IN_ROUND") {
      console.log("🎬 Duel phase started, telling server we are ready.");
      socket.emit("duel:playerReady");
    }
  }, [socket, gamePhase]);

  useEffect(() => {
    console.log('🎯 DuelStage3D state:', {
      gamePhase,
      displayFightersCount: displayFighters.length,
      displayFighters: displayFighters.map(f => ({ 
        id: f.id, 
        name: f.name, 
        betAmount: f.betAmount
      }))
    });
  }, [gamePhase, displayFighters]);

  return <DuelSceneContent fighters={displayFighters} />;
};

// ============================================
// DUEL UI - Main duel interface logic
// ============================================
export const DuelUI = () => {
  const { socket, fighters, gamePhase } = useGameStore();
  const { playClick, playClack, playHammer, playShoot, playGong, playCinematicIntro, stopCinematicIntro } = useAudio();

  // UI State
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(true);
  const [canClick, setCanClick] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'draw' | 'shoot' | null>(null);
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<number>(0);
  const hasShotThisRound = useRef(false);
  const [isAIMode, setIsAIMode] = useState(false);

  // Narrator State
  const [showNarrator, setShowNarrator] = useState(false);
  const [narratorComplete, setNarratorComplete] = useState(false);

  // Shooting animation timing
  const shootingStartTime = useRef<number | null>(null);
  const MIN_SHOOTING_DURATION = 500;

  // Timer management
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

  // ✅ FIX: Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Reset narrator when returning to lobby
  useEffect(() => {
    if (gamePhase === "LOBBY") {
      setShowNarrator(false);
      setNarratorComplete(false);
      shootingStartTime.current = null;
    }
  }, [gamePhase]);
  
  // ✅ FIX: Use useCallback for handleClick with proper dependencies
  const handleClick = useCallback(() => {
    console.log(`🖱️ CLICK HANDLER CALLED`);
    
    if (!canClick || !socket || !socket.id || actionType !== 'shoot' || hasShotThisRound.current) {
      return;
    }
    
    // ✅ FIX: Type-safe socket.id access
    const selfId = socket.id;
    
    console.log(`✅ SHOOTING at position ${barPosition.toFixed(3)}`);
    
    // Play sound immediately
    playShoot();
    
    // Play YOUR shooting animation immediately (optimistic)
    useGameStore.getState().updateFighterAnimation(selfId, 'shooting');
    
    // Record when we started shooting
    shootingStartTime.current = Date.now();
    console.log(`🎬 Shooting animation started at ${shootingStartTime.current}`);
    
    // Tell server (authoritative)
    socket.emit("duel:shoot");
    hasShotThisRound.current = true;
    setCanClick(false);
  }, [canClick, socket, actionType, barPosition, playShoot]); // ✅ FIX: Proper dependencies

  // ✅ FIX: Simplified click event listener
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      console.log(`📍 WINDOW CLICKED at x:${e.clientX} y:${e.clientY}`);
      handleClick();
    };
    
    window.addEventListener('click', handleWindowClick);
    
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, [handleClick]); // ✅ FIX: Only depends on handleClick
  
  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    console.log('🔌 Socket handlers registered');

    // AI MODE
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'a' && !isAIMode) {
        console.log("🤖 Requesting AI opponent...");
        socket.emit("duel:requestAIMode");
        setIsAIMode(true);
      }
      
      if (e.key === ' ') {
        e.preventDefault();
        console.log("⌨️ SPACEBAR PRESSED - attempting to shoot");
        handleClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const onShot = ({ shooterId, hit, barPosition }: { 
      shooterId: string; 
      hit: boolean; 
      barPosition: number;
    }) => {
      // If it's YOUR shot and you already played it optimistically, skip
      if (shooterId === socket.id && hasShotThisRound.current) {
        console.log(`💥 My shot (already played optimistically)`);
        return;
      }
      
      // Otherwise, play the animation (opponent OR your AI-controlled shot from server)
      console.log(`💥 ${shooterId === socket.id ? 'My AI' : 'Opponent'} is shooting!`);
      playShoot();
      useGameStore.getState().updateFighterAnimation(shooterId, 'shooting');
    };

    // Both players ready
    const onBothReady = () => {
      console.log("🤝 Both players are ready. Starting narrator sequence.");
      setIsWaitingForOpponent(false);
      playCinematicIntro();
    };
    
    // GONG
    const onGong = () => {
      console.log("🔔 GONG! Starting draw sequence");
      playGong();
      stopCinematicIntro();

      setBarVisible(true);
      
      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'draw');
      });
      
      console.log("⏰ Setting 1200ms timer for draw→armed");
      addTimer(() => {
        console.log("✅ Draw complete, enabling shooting");
        
        const fighters = useGameStore.getState().fighters;
        fighters.forEach(f => {
          useGameStore.getState().updateFighterAnimation(f.id, 'armed');
        });
        
        setCanClick(true);
        setActionType('shoot');
        
        console.log(`📊 State: canClick=true, actionType=shoot, barVisible=true`);
      }, 1200);
    };

    // Bar position update
    const onBarUpdate = ({ position }: { position: number }) => {
      setBarPosition(position);
    };

    // New round
    const onNewRound = ({ round, message }: { round: number, message?: string }) => {
      console.log(`🔄 NEW ROUND ${round} - Re-enabling controls`);
      
      hasShotThisRound.current = false;
      shootingStartTime.current = null;
      setCanClick(true);
      setActionType('shoot');
      
      console.log(`📊 State: canClick=true, actionType=shoot, hasShotThisRound=false`);
      
      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        if (f.animationState !== 'armed') {
          useGameStore.getState().updateFighterAnimation(f.id, 'armed');
        }
      });
    };

    // Round end - WITH MINIMUM DURATION CHECK
    const onRoundEnd = ({ outcome, winnerId, loserId, round }: { 
      outcome: 'hit' | 'dodge' | 'miss',
      winnerId?: string,
      loserId?: string,
      round: number
    }) => {
      console.log(`📊 ROUND END: outcome=${outcome}, round=${round}`);
      
      setCanClick(false);
      
      // Check if WE shot and need to wait for animation
      const weShot = shootingStartTime.current !== null;
      let delayNeeded = 0;
      
      if (weShot) {
        const elapsed = Date.now() - shootingStartTime.current!;
        delayNeeded = Math.max(0, MIN_SHOOTING_DURATION - elapsed);
        console.log(`⏱️ Shot ${elapsed}ms ago, delaying server result by ${delayNeeded}ms`);
      }
      
      // Apply result after delay (or immediately if no delay needed)
      addTimer(() => {
        applyRoundResult({ outcome, winnerId, loserId, round });
        shootingStartTime.current = null;
      }, delayNeeded);
    };
    
    // Extracted round result logic
    const applyRoundResult = ({ outcome, winnerId, loserId, round }: any) => {
      const currentFighters = useGameStore.getState().fighters;
      
      switch (outcome) {
        case 'hit':
          setBarVisible(false);
          setActionType(null);
          
          console.log(`💥 Round ${round}: ${winnerId} hit ${loserId}`);
          
          currentFighters.forEach(f => {
            if (f.id === winnerId) {
              useGameStore.getState().updateFighterAnimation(f.id, 'shooting');
            } else if (f.id === loserId) {
              useGameStore.getState().updateFighterAnimation(f.id, 'death');
            }
          });
          break;
          
        case 'dodge':
          console.log(`🤺 Round ${round}: BOTH HIT - DODGE!`);
          
          // ✅ 300ms delay so we see both shooting animations first
          addTimer(() => {
            const currentFighters = useGameStore.getState().fighters;
            currentFighters.forEach(f => {
              useGameStore.getState().updateFighterAnimation(f.id, 'dodging');
            });
          }, 300);
          break;
          
        case 'miss':
          console.log(`❌ Round ${round}: BOTH MISSED`);
          break;
      }
    };

    // Game phase change
    const onGamePhaseChange = ({ phase, winnerData }: any) => {
      console.log(`🎮 GAME PHASE: ${phase}`);
      
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
        
    // Register listeners
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
  }, [socket, isAIMode, playGong, playCinematicIntro, stopCinematicIntro, playShoot, handleClick, addTimer]); // ✅ FIX: Added missing dependencies
  
  return (
    <div 
      className="absolute inset-0" 
      style={{ 
        cursor: 'crosshair',
        opacity: canClick ? 1 : 0.6,
        pointerEvents: 'none'
      }}
    >
      {/* Waiting for opponent */}
      {isWaitingForOpponent && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-base/90">
          <div className="border-dashed-ascii p-6 bg-surface">
            <h1 className="text-2xl font-normal font-mono text-subtext0">
              WAITING FOR OPPONENT...
            </h1>
          </div>
        </div>
      )}

      {/* AI mode indicator */}
      {isAIMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 border-dashed-ascii px-4 py-2 bg-overlay">
          <span className="font-mono text-sm font-normal text-rose">
            [🤖 AI OPPONENT ACTIVE]
          </span>
        </div>
      )}
      
      {/* Click to shoot prompt */}
      {canClick && actionType === 'shoot' && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl font-mono font-normal text-peach">
            [CLICK TO SHOOT]
          </div>
        </div>
      )}
      
      {/* Shooting timing bar */}
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