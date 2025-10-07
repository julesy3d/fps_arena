"use client";

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import * as THREE from "three";
import { Opponent } from "./Opponent";

/**
 * STEP 3: CLIENT-SIDE DUEL SCENE
 * 
 * This component handles:
 * - Listening to server duel events
 * - Rendering both fighters in 3D
 * - Handling click inputs (draw/shoot)
 * - Showing bar animation and UI overlays
 * - Camera positioning (over-shoulder view)
 */

// ============================================
// CAMERA SETUP
// Fixed camera position behind your fighter
// ============================================
const DuelCamera = ({ selfId, fighters }: { selfId: string, fighters: any[] }) => {
  const { camera } = useThree();
  
  useEffect(() => {
    // Find which fighter is you (to position camera behind them)
    const selfIndex = fighters.findIndex(f => f.id === selfId);
    const selfFighter = fighters[selfIndex];
    
    if (!selfFighter) return;
    
    // Position camera behind and above your fighter, looking toward center
    // If you're at z=-5, camera goes behind you at z=-8, y=3
    // If you're at z=5, camera goes behind you at z=8, y=3
    const isFrontFighter = selfFighter.position[2] < 0;
    
    if (isFrontFighter) {
      // You're in front (z=-5), camera behind you
      camera.position.set(3, 3, -8); // Right side, elevated, behind
      camera.lookAt(0, 1.5, 0); // Look at center point between fighters
    } else {
      // You're in back (z=5), camera behind you
      camera.position.set(3, 3, 8); // Right side, elevated, behind
      camera.lookAt(0, 1.5, 0); // Look at center point
    }
    
    camera.updateProjectionMatrix();
  }, [camera, selfId, fighters]);
  
  return null;
};

// ============================================
// VERTICAL BAR COMPONENT (Bottom Right)
// Cycles from 0% to 100% in 2 seconds
// Target zone: 60-80% (green area)
// ============================================
const ShootingBar = ({ 
  visible, 
  startTime 
}: { 
  visible: boolean; 
  startTime: number | null;
}) => {
  const [barPosition, setBarPosition] = useState(0); // 0 to 1
  
  useFrame(() => {
    if (!visible || !startTime) {
      setBarPosition(0);
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const cycles = elapsed / 2000; // 2 second cycle
    const position = cycles % 1; // 0.0 to 1.0, loops
    setBarPosition(position);
  });
  
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center">
      {/* Bar Container */}
      <div className="relative h-64 w-12 bg-black/80 border-2 border-white">
        {/* Target Zone (60-80%) - Green Background */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-green-900/40"
          style={{
            height: '20%',
            bottom: '60%'
          }}
        />
        
        {/* Moving Indicator */}
        <div 
          className="absolute left-0 right-0 h-2 bg-red-500 transition-all duration-75"
          style={{
            bottom: `${barPosition * 100}%`,
            boxShadow: '0 0 10px rgba(255, 0, 0, 0.8)'
          }}
        />
      </div>
      
      {/* Label */}
      <div className="mt-2 text-sm text-white font-mono">
        TIMING
      </div>
    </div>
  );
};

// ============================================
// MAIN 3D SCENE CONTENT
// Renders both fighters and environment
// ============================================
const DuelSceneContent = ({ selfId, fighters }: { selfId: string, fighters: any[] }) => {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#8B7355" /> {/* Sandy ground */}
      </mesh>
      
      {/* Camera setup */}
      <DuelCamera selfId={selfId} fighters={fighters} />
      
      {/* Render both fighters */}
      {fighters.map(fighter => (
        <Opponent
          key={fighter.id}
          position={fighter.position}
          rotation={fighter.rotation}
          health={fighter.health}
        />
      ))}
      
      {/* TODO: Add clock model between fighters at (2, 2, 0) */}
    </>
  );
};

// ============================================
// UI OVERLAY COMPONENT
// Shows state messages and click prompts
// ============================================
const DuelOverlay = ({ 
  duelState, 
  message,
  canClick,
  hasDrawn
}: { 
  duelState: string;
  message: string;
  canClick: boolean;
  hasDrawn: boolean;
}) => {
  return (
    <>
      {/* Top Center Message */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-10 text-center">
        <h1 className="text-6xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]">
          {message}
        </h1>
      </div>
      
      {/* Click Prompt (bottom center) */}
      {canClick && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl text-yellow-400 font-mono animate-pulse">
            {hasDrawn ? "[CLICK TO SHOOT]" : "[CLICK TO DRAW]"}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================
// MAIN DUEL SCENE COMPONENT
// Orchestrates all duel logic and rendering
// ============================================
export const DuelScene = () => {
  const { socket, fighters } = useGameStore();
  const selfId = socket?.id || "";
  
  // Local duel state
  const [duelState, setDuelState] = useState<string>("WAITING");
  const [message, setMessage] = useState<string>("HIGH NOON APPROACHES...");
  const [canClick, setCanClick] = useState<boolean>(false);
  const [hasDrawn, setHasDrawn] = useState<boolean>(false);
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barStartTime, setBarStartTime] = useState<number | null>(null);
  const [opponentDrew, setOpponentDrew] = useState<boolean>(false);
  
  // ============================================
  // SOCKET EVENT LISTENERS
  // ============================================
  useEffect(() => {
    if (!socket) return;
    
    // Initial duel state from server
    const onDuelState = ({ state, fighters }: { state: string, fighters: any[] }) => {
      console.log("📡 Received duel:state", state);
      setDuelState(state);
      setMessage("HIGH NOON APPROACHES...");
      setCanClick(false);
      setHasDrawn(false);
      setBarVisible(false);
    };
    
    // GONG - the duel begins!
    const onGong = ({ timestamp }: { timestamp: number }) => {
      console.log("🔔 GONG! Duel is active");
      setDuelState("ACTIVE");
      setMessage("DRAW!");
      setCanClick(true);
      
      // Acknowledge GONG immediately (for ping measurement)
      socket.emit("duel:gongAck");
    };
    
    // Bar starts cycling (after you drew)
    const onBarStart = ({ startTime }: { startTime: number }) => {
      console.log("📊 Bar started at", startTime);
      setBarVisible(true);
      setBarStartTime(startTime);
      setMessage("SHOOT!");
    };
    
    // Opponent drew their weapon
    const onOpponentDrew = ({ playerId }: { playerId: string }) => {
      console.log("👁️ Opponent drew weapon");
      setOpponentDrew(true);
      // TODO: Trigger opponent draw animation
    };
    
    // Someone shot
    const onPlayerShot = ({ playerId, hit }: { playerId: string, hit: boolean }) => {
      console.log(`💥 Shot from ${playerId}, hit: ${hit}`);
      // TODO: Trigger shot animation/effects
      
      if (!hit && playerId === selfId) {
        setMessage("MISSED!");
      }
    };
    
    // Your gun dropped (penalty)
    const onGunDropped = () => {
      console.log("🔫💨 Gun dropped!");
      setMessage("PICK UP YOUR GUN!");
      setCanClick(false);
      setHasDrawn(false);
      setBarVisible(false);
      setBarStartTime(null);
    };
    
    // You can draw again after penalty
    const onCanDrawAgain = () => {
      console.log("🔫✅ Can draw again");
      setMessage("DRAW!");
      setCanClick(true);
    };
    
    // Standoff cinematic (both shot within 100ms)
    const onStandoff = () => {
      console.log("🎬 STANDOFF!");
      setDuelState("STANDOFF");
      setMessage("STANDOFF...");
      setCanClick(false);
      setBarVisible(false);
      // TODO: Trigger standoff cinematic
    };
    
    // Register all listeners
    socket.on("duel:state", onDuelState);
    socket.on("duel:gong", onGong);
    socket.on("duel:barStart", onBarStart);
    socket.on("duel:opponentDrew", onOpponentDrew);
    socket.on("duel:playerShot", onPlayerShot);
    socket.on("duel:gunDropped", onGunDropped);
    socket.on("duel:canDrawAgain", onCanDrawAgain);
    socket.on("duel:standoff", onStandoff);
    
    // Cleanup
    return () => {
      socket.off("duel:state", onDuelState);
      socket.off("duel:gong", onGong);
      socket.off("duel:barStart", onBarStart);
      socket.off("duel:opponentDrew", onOpponentDrew);
      socket.off("duel:playerShot", onPlayerShot);
      socket.off("duel:gunDropped", onGunDropped);
      socket.off("duel:canDrawAgain", onCanDrawAgain);
      socket.off("duel:standoff", onStandoff);
    };
  }, [socket, selfId]);
  
  // ============================================
  // CLICK HANDLER
  // Universal click - sends to server
  // ============================================
  const handleClick = () => {
    if (!canClick || !socket) return;
    
    console.log("🖱️ Click! HasDrawn:", hasDrawn);
    
    // Send click to server (it decides what happens)
    socket.emit("duel:click");
    
    // Optimistic update: if first click, assume we're drawing
    if (!hasDrawn) {
      setHasDrawn(true);
      setMessage("WAIT FOR THE RIGHT MOMENT...");
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
      {/* 3D Canvas */}
      <Canvas>
        <DuelSceneContent selfId={selfId} fighters={fighters} />
      </Canvas>
      
      {/* UI Overlays */}
      <DuelOverlay
        duelState={duelState}
        message={message}
        canClick={canClick}
        hasDrawn={hasDrawn}
      />
      
      {/* Shooting Bar (bottom right) */}
      <ShootingBar visible={barVisible} startTime={barStartTime} />
    </div>
  );
};