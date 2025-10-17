"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo } from "react";
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
  
  useEffect(() => {
    clickAudioRef.current = new Audio('/click.aac');
    clackAudioRef.current = new Audio('/clack.aac');
    hammerAudioRef.current = new Audio('/hammer.aac');
    shootAudioRef.current = new Audio('/shoot.aac');
    gongAudioRef.current = new Audio('/gong.aac');
    
    clickAudioRef.current.load();
    clackAudioRef.current.load();
    hammerAudioRef.current.load();
    shootAudioRef.current.load();
    gongAudioRef.current.load();
  }, []);
  
  const playClick = () => { if (clickAudioRef.current) { clickAudioRef.current.currentTime = 0; clickAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); } };
  const playClack = () => { if (clackAudioRef.current) { clackAudioRef.current.currentTime = 0; clackAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); } };
  const playHammer = () => { if (hammerAudioRef.current) { hammerAudioRef.current.currentTime = 0; hammerAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); } };
  const playShoot = () => { if (shootAudioRef.current) { shootAudioRef.current.currentTime = 0; shootAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); } };
  const playGong = () => { if (gongAudioRef.current) { gongAudioRef.current.currentTime = 0; gongAudioRef.current.play().catch(e => console.warn('Sound failed:', e)); } };
  
  return { playClick, playClack, playHammer, playShoot, playGong };
};

// ============================================
// SHOOTING BAR - Visual timing indicator
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
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center">
      <div className="relative h-64 w-12 bg-black/80 border-2 border-white">
        {/* Green target zone */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-green-900/40 border-t-2 border-b-2 border-green-500" 
          style={{ height: '20%', bottom: '60%' }} 
        />
        {/* Moving red bar */}
        <div 
          className="absolute left-0 right-0 h-2 bg-red-500" 
          style={{ 
            bottom: `${barPosition * 100}%`, 
            boxShadow: '0 0 10px rgba(255, 0, 0, 0.8)' 
          }} 
        />
        {/* "NOW!" indicator when in perfect zone */}
        {barPosition >= 0.68 && barPosition <= 0.72 && (
          <div className="absolute left-0 right-0 text-center text-xs text-green-400 font-bold" style={{ bottom: '70%' }}>
            NOW!
          </div>
        )}
      </div>
      <div className="mt-2 text-sm text-white font-mono">
        {(barPosition * 100).toFixed(0)}%
      </div>
    </div>
  );
};

// ============================================
// 3D SCENE CONTENT - Renders fighters
// ============================================
const DuelSceneContent = ({ fighters }: { fighters: any[] }) => {
  const { invalidate } = useThree();
  
  // Force re-render when fighters change
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
  
  // Determine which fighters to display based on game phase
  const displayFighters = useMemo(() => {
    if (gamePhase === "LOBBY") {
      // LOBBY: Show top 2 bidders as preview
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
      
      // Position them facing each other
      return topBidders.map((player, index) => ({
        id: player.id,
        name: player.name,
        position: index === 0 ? [0, 0, -3] : [0, 0, 3] as [number, number, number],
        rotation: index === 0 ? 0 : Math.PI,
        animationState: 'idle' as const
      }));
    } 
    else if (gamePhase === "IN_ROUND" || gamePhase === "POST_ROUND") {
      // IN_ROUND/POST_ROUND: Show actual fighters from store
      if (fighters && fighters.length > 0) {
        return fighters;
      }
      console.warn('⚠️ Fighters array empty during', gamePhase);
      return [];
    }
    return [];
  }, [gamePhase, players, fighters]);

  // Tell server we're ready when IN_ROUND starts
  useEffect(() => {
    if (socket && gamePhase === "IN_ROUND") {
      console.log("🎬 Duel phase started, telling server we are ready.");
      socket.emit("duel:playerReady");
    }
  }, [socket, gamePhase]);

  // Debug logging
  useEffect(() => {
    console.log('🎯 DuelStage3D state:', {
      gamePhase,
      displayFightersCount: displayFighters.length,
      displayFighters: displayFighters.map(f => ({ id: f.id, name: f.name }))
    });
  }, [gamePhase, displayFighters]);

  return <DuelSceneContent fighters={displayFighters} />;
};

// ============================================
// DUEL UI - Main duel interface logic
// This handles all the UI, socket events, and user interactions
// ============================================
export const DuelUI = () => {
  // Get store data - ADDED gamePhase here (was missing!)
  const { socket, fighters, gamePhase } = useGameStore();
  const selfId = socket?.id || "";
  const { playClick, playClack, playHammer, playShoot, playGong } = useAudio();

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

  // Reset narrator when returning to lobby
  useEffect(() => {
    if (gamePhase === "LOBBY") {
      setShowNarrator(false);
      setNarratorComplete(false);
    }
  }, [gamePhase]);
  
  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // === AI MODE ACTIVATION ===
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'a' && !isAIMode) {
        console.log("🤖 Requesting AI opponent...");
        socket.emit("duel:requestAIMode");
        setIsAIMode(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // === SOCKET EVENT HANDLERS ===
    
    // Both players ready → Start narrator sequence
    const onBothReady = () => {
      console.log("🤝 Both players are ready. Starting narrator sequence.");
      setIsWaitingForOpponent(false);
      setShowNarrator(true);
    };

    // Duel state update
    const onDuelState = () => { 
      setCanClick(false); 
      setActionType(null); 
      setBarVisible(false); 
    };
    
    // GONG! → Hide narrator, start draw phase
    const onGong = () => { 
      playGong();
      
      // Hide narrator if still showing
      setShowNarrator(false);
      setNarratorComplete(true);
      
      // Go straight to shooting (no draw phase)
      setCanClick(true); 
      setActionType('shoot'); 
      setBarVisible(true);
      
      // Set all fighters to armed state immediately
      fighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'armed');
      });
    };

    // Start aiming phase
    const onAimPhase = () => { 
      setCanClick(true); 
      setActionType('shoot'); 
      setBarVisible(true);
    };

    // Bar position update (60fps from server)
    const onBarUpdate = ({ position }: { position: number }) => {
      setBarPosition(position);
    };

    // Someone shot
    const onShot = ({ shooterId, hit }: { shooterId: string, hit: boolean }) => { 
      if (shooterId === selfId && hit) { 
        playShoot(); 
      }
      useGameStore.getState().updateFighterAnimation(shooterId, 'shooting');
    };

    // Both hit → Dodge!
    const onBothHit = () => { 
      setCanClick(false); 
      setActionType(null);
      fighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'dodging');
      });
    };

    // Both missed → Try again
    const onBothMiss = () => { 
      setCanClick(false); 
      setActionType(null); 
    };

    // New round (after both miss or dodge)
    const onNewRound = ({ message: serverMessage }: { message: string }) => { 
      setCanClick(true); 
      setActionType('shoot'); 
      setBarVisible(true); 
      hasShotThisRound.current = false; 
    };

    // Game phase changed (used for POST_ROUND animations)
    const onGamePhaseChange = ({ phase, winnerData }: any) => {
      if (phase === "POST_ROUND" && winnerData) {
        if (winnerData.isSplit) {
          // Draw → Both look defeated
          fighters.forEach(f => {
            useGameStore.getState().updateFighterAnimation(f.id, 'defeat');
          });
        } else {
          // Winner celebrates, loser dies
          fighters.forEach(f => {
            if (f.name === winnerData.name) {
              useGameStore.getState().updateFighterAnimation(f.id, 'victory');
            } else {
              useGameStore.getState().updateFighterAnimation(f.id, 'death');
            }
          });
        }
        
        setIsWaitingForOpponent(true); 
        setCanClick(false); 
        setActionType(null); 
        setBarVisible(false);
      }
    };
        
    // Register all listeners
    socket.on("duel:bothReady", onBothReady);
    socket.on("duel:state", onDuelState);
    socket.on("duel:gong", onGong);
    socket.on("duel:aimPhase", onAimPhase);
    socket.on("duel:barUpdate", onBarUpdate);
    socket.on("duel:bothHit", onBothHit);
    socket.on("duel:bothMiss", onBothMiss);
    socket.on("duel:newRound", onNewRound);
    socket.on("duel:shot", onShot);
    socket.on("game:phaseChange", onGamePhaseChange);
    
    // Cleanup function
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      socket.off("duel:bothReady", onBothReady);
      socket.off("duel:state", onDuelState);
      socket.off("duel:gong", onGong);
      socket.off("duel:aimPhase", onAimPhase);
      socket.off("duel:barUpdate", onBarUpdate);
      socket.off("duel:bothHit", onBothHit);
      socket.off("duel:bothMiss", onBothMiss);
      socket.off("duel:newRound", onNewRound);
      socket.off("duel:shot", onShot);
      socket.off("game:phaseChange", onGamePhaseChange);
    };
  }, [socket, selfId, playGong, fighters, isAIMode]);
  
  // Handle user clicks (shoot)
  const handleClick = () => {
    if (!canClick || !socket || !actionType) return;
    if (actionType === 'shoot' && hasShotThisRound.current) return;
    
    // Only shooting now, no draw
    if (actionType === 'shoot') {
      console.log(`CLIENT CLICK: Shooting at bar position ${barPosition.toFixed(2)}`);
      socket.emit("duel:shoot");
      hasShotThisRound.current = true;
      setCanClick(false);
    }
  };
  
  return (
    <div className="absolute inset-0 cursor-crosshair" onClick={handleClick}>
      {/* === WAITING FOR OPPONENT === */}
      {isWaitingForOpponent && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <h1 className="text-3xl font-bold text-white animate-pulse">
            WAITING FOR OPPONENT...
          </h1>
        </div>
      )} 

      {/* === AI MODE INDICATOR === */}
      {isAIMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600 text-white font-bold px-3 py-1 text-sm">
          AI OPPONENT ACTIVE
        </div>
      )}
      
      {/* === CLICK TO SHOOT PROMPT === */}
      {canClick && actionType === 'shoot' && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl font-mono animate-pulse" style={{ color: '#fe640b' }}>
            [CLICK TO SHOOT]
          </div>
        </div>
      )}
      
      {/* === SHOOTING TIMING BAR === */}
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