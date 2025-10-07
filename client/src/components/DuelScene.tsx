"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import * as THREE from "three";
import { Opponent } from "./Opponent";

/**
 * ============================================
 * SYNCHRONIZED MULTI-ROUND DUEL - CLIENT
 * With metronome sound effects
 * ============================================
 */

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
    // Preload audio files
    clickAudioRef.current = new Audio('/click.aac');
    clackAudioRef.current = new Audio('/clack.aac');
    hammerAudioRef.current = new Audio('/hammer.aac');
    shootAudioRef.current = new Audio('/shoot.aac');
    gongAudioRef.current = new Audio('/gong.aac');
    
    // Preload them
    clickAudioRef.current.load();
    clackAudioRef.current.load();
    hammerAudioRef.current.load();
    shootAudioRef.current.load();
    gongAudioRef.current.load();
  }, []);
  
  const playClick = () => {
    if (clickAudioRef.current) {
      clickAudioRef.current.currentTime = 0;
      clickAudioRef.current.play().catch(e => console.warn('Click sound failed:', e));
    }
  };
  
  const playClack = () => {
    if (clackAudioRef.current) {
      clackAudioRef.current.currentTime = 0;
      clackAudioRef.current.play().catch(e => console.warn('Clack sound failed:', e));
    }
  };
  
  const playHammer = () => {
    if (hammerAudioRef.current) {
      hammerAudioRef.current.currentTime = 0;
      hammerAudioRef.current.play().catch(e => console.warn('Hammer sound failed:', e));
    }
  };
  
  const playShoot = () => {
    if (shootAudioRef.current) {
      shootAudioRef.current.currentTime = 0;
      shootAudioRef.current.play().catch(e => console.warn('Shoot sound failed:', e));
    }
  };
  
  const playGong = () => {
    if (gongAudioRef.current) {
      gongAudioRef.current.currentTime = 0;
      gongAudioRef.current.play().catch(e => console.warn('Gong sound failed:', e));
    }
  };
  
  return { playClick, playClack, playHammer, playShoot, playGong };
};

// ============================================
// CAMERA - STATIC POSITION (FORCED)
// ============================================
const DuelCamera = () => {
  const { camera } = useThree();
  const isLockedRef = useRef(false);
  
  useEffect(() => {
    // Force position immediately
    camera.position.set(2, 2, 7);
    camera.lookAt(0, 0, 0);
    
    // Lock it in for a few frames to override any other camera controllers
    const lockFrames = 10;
    let frameCount = 0;
    
    const ensurePosition = () => {
      if (frameCount < lockFrames) {
        camera.position.set(2, 2, 7);
        camera.lookAt(0, 0, 0);
        frameCount++;
        requestAnimationFrame(ensurePosition);
      } else {
        isLockedRef.current = true;
      }
    };
    
    ensurePosition();
  }, [camera]);
  
  return null;
};

// ============================================
// SHOOTING BAR - WITH METRONOME SOUNDS
// Click at 0%, Hammer at 20%, Clack at 70% (optimal zone)
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
  
  // Play sounds based on bar position
  useEffect(() => {
    if (!visible) {
      lastSoundRef.current = 'none';
      return;
    }
    
    // Tick at bottom (0-5%)
    if (barPosition >= 0 && barPosition < 0.05 && lastSoundRef.current !== 'tick') {
      onTick();
      lastSoundRef.current = 'tick';
    }
    // Hammer at 20% (18-22%) - cocking the hammer
    else if (barPosition >= 0.18 && barPosition < 0.22 && lastSoundRef.current !== 'hammer') {
      onHammer();
      lastSoundRef.current = 'hammer';
    }
    // Tock at optimal zone start (68-72%) - middle of target zone
    else if (barPosition >= 0.68 && barPosition < 0.72 && lastSoundRef.current !== 'tock') {
      onTock();
      lastSoundRef.current = 'tock';
    }
  }, [barPosition, visible, onTick, onHammer, onTock]);
  
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center">
      <div className="relative h-64 w-12 bg-black/80 border-2 border-white">
        {/* Green target zone (60-80%) */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-green-900/40 border-t-2 border-b-2 border-green-500"
          style={{
            height: '20%',
            bottom: '60%'
          }}
        />
        
        {/* Moving red indicator - SYNCHRONIZED */}
        <div 
          className="absolute left-0 right-0 h-2 bg-red-500"
          style={{
            bottom: `${barPosition * 100}%`,
            boxShadow: '0 0 10px rgba(255, 0, 0, 0.8)'
          }}
        />
        
        {/* Visual feedback for optimal timing */}
        {barPosition >= 0.68 && barPosition <= 0.72 && (
          <div className="absolute left-0 right-0 text-center text-xs text-green-400 font-bold"
               style={{ bottom: '70%' }}>
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
// 3D SCENE CONTENT
// ============================================
const DuelSceneContent = ({ selfId, fighters }: { selfId: string, fighters: any[] }) => {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#8B7355" />
      </mesh>
      
      {/* Camera */}
      <DuelCamera />
      
      {/* Fighters */}
      {fighters.map(fighter => (
        <Opponent
          key={fighter.id}
          position={fighter.position}
          rotation={fighter.rotation}
          health={fighter.health}
        />
      ))}
    </>
  );
};

// ============================================
// UI OVERLAY
// ============================================
const DuelOverlay = ({ 
  message,
  canClick,
  actionType
}: { 
  message: string;
  canClick: boolean;
  actionType: 'draw' | 'shoot' | 'pickup' | null;
}) => {
  return (
    <>
      {/* Main message */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-10 text-center">
        <h1 className="text-6xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]">
          {message}
        </h1>
      </div>
      
      {/* Action prompt */}
      {canClick && actionType && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl text-yellow-400 font-mono animate-pulse">
            {actionType === 'draw' && "[CLICK TO DRAW]"}
            {actionType === 'shoot' && "[CLICK TO SHOOT]"}
            {actionType === 'pickup' && "[CLICK TO PICKUP GUN]"}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export const DuelScene = () => {
  const { socket, fighters } = useGameStore();
  const selfId = socket?.id || "";
  const { playClick, playClack, playHammer, playShoot, playGong } = useAudio();
  
  // UI State
  const [message, setMessage] = useState<string>("HIGH NOON APPROACHES...");
  const [canClick, setCanClick] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'draw' | 'shoot' | 'pickup' | null>(null);
  const [currentRound, setCurrentRound] = useState<number>(1);
  
  // Bar State
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<number>(0);
  
  // Track if we've shot this round (prevent spam)
  const hasShotThisRound = useRef(false);
  
  // ============================================
  // SOCKET EVENT LISTENERS
  // ============================================
  useEffect(() => {
    if (!socket) return;
    
    // Initial state
    const onDuelState = ({ state }: { state: string }) => {
      console.log("📡 Received duel:state", state);
      setMessage("HIGH NOON APPROACHES...");
      setCanClick(false);
      setActionType(null);
      setBarVisible(false);
      setBarPosition(0);
      setCurrentRound(1);
    };
    
    // GONG - can now draw (ONCE!)
    const onGong = ({ barCycleDuration }: { barCycleDuration: number }) => {
      console.log(`🔔 GONG! (${barCycleDuration}ms cycle)`);
      playGong();
      setCurrentRound(1);
      setMessage("DRAW!");
      setCanClick(true);
      setActionType('draw');
      setBarVisible(false);
    };
    
    // Successfully drew weapon
    const onDrawSuccess = () => {
      console.log("🔫 Weapon drawn - waiting for opponent...");
      setMessage("WAITING FOR OPPONENT...");
      setCanClick(false);
      setActionType(null);
    };
    
    // Aim phase started (both players drew)
    const onAimPhase = ({ barCycleDuration }: { startTime: number, barCycleDuration: number }) => {
      console.log(`🎯 AIM PHASE (${barCycleDuration}ms cycle)`);
      setMessage("AIM!");
      setCanClick(true);
      setActionType('shoot');
      setBarVisible(true);
    };
    
    // Bar position update from server (synchronized)
    const onBarUpdate = ({ position }: { position: number }) => {
      setBarPosition(position);
    };
    
    // Both players hit - DODGE!
    const onBothHit = ({ round }: { round: number }) => {
      console.log(`🤺 BOTH HIT! Round ${round} complete - DODGE!`);
      setMessage("DODGE!");
      setCanClick(false);
      setActionType(null);
      // Bar continues, just brief pause
    };
    
    // Both players missed
    const onBothMiss = ({ round }: { round: number }) => {
      console.log(`❌ BOTH MISS! Round ${round} complete`);
      setMessage("BOTH MISSED!");
      setCanClick(false);
      setActionType(null);
      // Bar continues
    };
    
    // New round starting (bar speeds up, guns stay drawn)
    const onNewRound = ({ round, message: serverMessage }: { round: number, barCycleDuration: number, message: string }) => {
      console.log(`🔄 Round ${round} starting (${serverMessage})`);
      setCurrentRound(round);
      setMessage(serverMessage);
      setCanClick(true);
      setActionType('shoot');
      setBarVisible(true);
      hasShotThisRound.current = false; // Reset for new round
    };
    
    // Both failed to draw initially
    const onBothFailedDraw = () => {
      console.log(`❌ Both failed initial draw`);
      setMessage("BOTH FAILED - PICK UP GUNS!");
      setCanClick(true);
      setActionType('draw');
      setBarVisible(false);
    };
    
    // Someone shot (including auto-miss)
    const onShot = ({ shooterId, hit, autoMiss }: { shooterId: string, hit: boolean, autoMiss?: boolean }) => {
      if (autoMiss) {
        console.log(`⏰ ${shooterId === selfId ? 'You' : 'Opponent'} auto-missed (too slow)`);
      } else {
        console.log(`💥 Shot from ${shooterId}, hit: ${hit}`);
      }
      
      // Don't change UI - wait for round evaluation
    };
    
    // Gun dropped (early shot - shouldn't happen in shooting phase)
    const onGunDropped = () => {
      console.log("🔫💨 Gun dropped");
      setMessage("PICK UP YOUR GUN!");
      setCanClick(true);
      setActionType('pickup');
      setBarVisible(false);
      setBarPosition(0);
    };
    
    // Gun picked up
    const onPickupSuccess = () => {
      console.log("🔫✅ Gun picked up");
      setMessage("READY!");
      setCanClick(true);
      setActionType('shoot');
    };
    
    // Opponent drew
    const onOpponentDrew = ({ playerId }: { playerId: string }) => {
      console.log(`👁️ Opponent drew weapon`);
    };
    
    // Game phase change (for victory/defeat)
    const onGamePhaseChange = ({ phase, winnerData }: any) => {
      if (phase === "POST_ROUND" && winnerData) {
        const selfPlayer = fighters.find(f => f.id === selfId);
        if (selfPlayer && selfPlayer.health > 0) {
          setMessage("VICTORY!");
        } else {
          setMessage("DEFEATED!");
        }
        setCanClick(false);
        setActionType(null);
        setBarVisible(false);
      }
    };
    
    // Register listeners
    socket.on("duel:state", onDuelState);
    socket.on("duel:gong", onGong);
    socket.on("duel:drawSuccess", onDrawSuccess);
    socket.on("duel:aimPhase", onAimPhase);
    socket.on("duel:barUpdate", onBarUpdate);
    socket.on("duel:bothHit", onBothHit);
    socket.on("duel:bothMiss", onBothMiss);
    socket.on("duel:newRound", onNewRound);
    socket.on("duel:bothFailedDraw", onBothFailedDraw);
    socket.on("duel:gunDropped", onGunDropped);
    socket.on("duel:pickupSuccess", onPickupSuccess);
    socket.on("duel:shot", onShot);
    socket.on("duel:opponentDrew", onOpponentDrew);
    socket.on("game:phaseChange", onGamePhaseChange);
    
    return () => {
      socket.off("duel:state", onDuelState);
      socket.off("duel:gong", onGong);
      socket.off("duel:drawSuccess", onDrawSuccess);
      socket.off("duel:aimPhase", onAimPhase);
      socket.off("duel:barUpdate", onBarUpdate);
      socket.off("duel:bothHit", onBothHit);
      socket.off("duel:bothMiss", onBothMiss);
      socket.off("duel:newRound", onNewRound);
      socket.off("duel:bothFailedDraw", onBothFailedDraw);
      socket.off("duel:gunDropped", onGunDropped);
      socket.off("duel:pickupSuccess", onPickupSuccess);
      socket.off("duel:shot", onShot);
      socket.off("duel:opponentDrew", onOpponentDrew);
      socket.off("game:phaseChange", onGamePhaseChange);
    };
  }, [socket, selfId, playGong, fighters]);
  
  // ============================================
  // CLICK HANDLER - ROUTES TO CORRECT ACTION
  // ============================================
  const handleClick = () => {
    if (!canClick || !socket || !actionType) return;
    
    // Prevent multiple shots per round
    if (actionType === 'shoot' && hasShotThisRound.current) {
      console.log('⚠️ Already shot this round');
      return;
    }
    
    console.log(`🖱️ Click: ${actionType}`);
    
    if (actionType === 'draw') {
      socket.emit("duel:draw");
      setCanClick(false);
    } else if (actionType === 'shoot') {
      // Check if shot is in target zone (60-80%)
      const inTargetZone = barPosition >= 0.60 && barPosition <= 0.80;
      
      // Play shoot sound if in target zone (instant feedback!)
      if (inTargetZone) {
        playShoot();
      }
      
      socket.emit("duel:shoot");
      hasShotThisRound.current = true;
      setCanClick(false);
    } else if (actionType === 'pickup') {
      socket.emit("duel:pickup");
      setCanClick(false);
    }
  };
  
  // ============================================
  // RENDER
  // ============================================
  return (
    <div 
      className="absolute inset-0 cursor-crosshair"
      onClick={handleClick}
    >
      <Canvas camera={{ fov: 75 }}>
        <DuelSceneContent selfId={selfId} fighters={fighters} />
      </Canvas>
      
      <DuelOverlay
        message={message}
        canClick={canClick}
        actionType={actionType}
      />
      
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