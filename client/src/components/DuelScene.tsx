"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { Fighter } from "./Fighter";


// ============================================
// AUDIO MANAGER (No changes)
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
// SHOOTING BAR (No changes)
// ============================================
const ShootingBar = ({ visible, barPosition, onTick, onHammer, onTock }: { visible: boolean; barPosition: number; onTick: () => void; onHammer: () => void; onTock: () => void; }) => {
  const lastSoundRef = useRef<'none' | 'tick' | 'hammer' | 'tock'>('none');
  
  useEffect(() => {
    if (!visible) { lastSoundRef.current = 'none'; return; }
    if (barPosition >= 0 && barPosition < 0.05 && lastSoundRef.current !== 'tick') { onTick(); lastSoundRef.current = 'tick'; }
    else if (barPosition >= 0.18 && barPosition < 0.22 && lastSoundRef.current !== 'hammer') { onHammer(); lastSoundRef.current = 'hammer'; }
    else if (barPosition >= 0.68 && barPosition < 0.72 && lastSoundRef.current !== 'tock') { onTock(); lastSoundRef.current = 'tock'; }
  }, [barPosition, visible, onTick, onHammer, onTock]);
  
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col items-center">
      <div className="relative h-64 w-12 bg-black/80 border-2 border-white">
        <div className="absolute bottom-0 left-0 right-0 bg-green-900/40 border-t-2 border-b-2 border-green-500" style={{ height: '20%', bottom: '60%' }} />
        <div className="absolute left-0 right-0 h-2 bg-red-500" style={{ bottom: `${barPosition * 100}%`, boxShadow: '0 0 10px rgba(255, 0, 0, 0.8)' }} />
        {barPosition >= 0.68 && barPosition <= 0.72 && ( <div className="absolute left-0 right-0 text-center text-xs text-green-400 font-bold" style={{ bottom: '70%' }}>NOW!</div> )}
      </div>
      <div className="mt-2 text-sm text-white font-mono">{(barPosition * 100).toFixed(0)}%</div>
    </div>
  );
};

// ============================================
// UI OVERLAY (No changes)
// ============================================
const DuelOverlay = ({ message, canClick, actionType }: { message: string; canClick: boolean; actionType: 'draw' | 'shoot' | null; }) => {
  return (
    <>
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-10 text-center">
        <h1 className="text-6xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]">{message}</h1>
      </div>
      {canClick && actionType && (
        <div className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-10">
          <div className="text-2xl text-yellow-400 font-mono animate-pulse">
            {actionType === 'draw' && "[CLICK TO DRAW]"}
            {actionType === 'shoot' && "[CLICK TO SHOOT]"}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================
// 3D SCENE CONTENT (No changes)
// ============================================
const DuelSceneContent = ({ selfId, fighters }: { selfId: string, fighters: any[] }) => {

    console.log('🎯 RENDERING SCENE WITH FIGHTERS:', 
        fighters.map(f => ({ 
            name: f.name, 
            position: f.position,
            rotation: f.rotation 
        }))
    );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#8B7355" />
      </mesh>
        {fighters.map(fighter => (
          <Fighter 
            key={fighter.id} 
            position={fighter.position} 
            rotation={fighter.rotation} 
            animationState={fighter.animationState}
          />
        ))}
    </>
  );
};


// ============================================
// NEW: The 3D content for the duel
// This is what will be rendered inside the main Canvas in page.tsx
// ============================================
export const DuelStage3D = () => {
  const socket = useGameStore((state) => state.socket);
  const fighters = useGameStore((state) => state.fighters);
  const selfId = useGameStore((state) => state.socket?.id || "");

  // NEW: Tell the server we are ready once the 3D scene has mounted.
  useEffect(() => {
    if (socket) {
      console.log("🎬 3D Scene loaded, telling server we are ready.");
      socket.emit("duel:playerReady");
    }
  }, [socket]);

  return <DuelSceneContent selfId={selfId} fighters={fighters} />;
};


// ============================================
// REFACTORED: The main component is now just the UI and logic
// ============================================
export const DuelUI = () => {
  const { socket, fighters } = useGameStore();
  const selfId = socket?.id || "";
  const { playClick, playClack, playHammer, playShoot, playGong } = useAudio();

  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [canClick, setCanClick] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'draw' | 'shoot' | null>(null);
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<number>(0);
  const hasShotThisRound = useRef(false);
  const [isAIMode, setIsAIMode] = useState(false);

  // FIXED: Consolidated both useEffect hooks into one to resolve the scope issue.
  useEffect(() => {
    if (!socket) return;

    // --- AI Mode Key Listener ---
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'a' && !isAIMode) {
        console.log("🤖 Requesting AI opponent...");
        socket.emit("duel:requestAIMode");
        setIsAIMode(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // --- Socket Event Handlers ---
    const onBothReady = () => {
      console.log("🤝 Both players are ready. Starting cinematic.");
      setIsWaitingForOpponent(false);
      setMessage("HIGH NOON APPROACHES...");
    };

    const onDuelState = () => { setMessage("HIGH NOON APPROACHES..."); setCanClick(false); setActionType(null); setBarVisible(false); };
    //const onGong = () => { playGong(); setMessage("DRAW!"); setCanClick(true); setActionType('draw'); setBarVisible(false); };
    //const onDrawSuccess = () => { setMessage("WAITING FOR OPPONENT..."); setCanClick(false); setActionType(null); };
    //const onAimPhase = () => { setMessage("AIM!"); setCanClick(true); setActionType('shoot'); setBarVisible(true); };
    const onBarUpdate = ({ position }: { position: number }) => setBarPosition(position);
    //const onBothHit = () => { setMessage("DODGE!"); setCanClick(false); setActionType(null); };
    const onBothMiss = () => { setMessage("BOTH MISSED!"); setCanClick(false); setActionType(null); };
    const onNewRound = ({ message: serverMessage }: { message: string }) => { setMessage(serverMessage); setCanClick(true); setActionType('shoot'); setBarVisible(true); hasShotThisRound.current = false; };
    const onBothFailedDraw = () => { setMessage("BOTH FAILED - PICK UP GUNS!"); setCanClick(true); setActionType('draw'); setBarVisible(false); };
    //const onShot = ({ shooterId, hit }: { shooterId: string, hit: boolean }) => { if (shooterId === selfId && hit) { playShoot(); } };
    //const onOpponentDrew = () => console.log(`👁️ Opponent drew weapon`);
    
    const onGong = () => { 
      playGong(); 
      setMessage("DRAW!"); 
      setCanClick(true); 
      setActionType('draw'); 
      setBarVisible(false); 
    };

    const onDrawSuccess = () => { 
      setMessage("WAITING FOR OPPONENT..."); 
      setCanClick(false); 
      setActionType(null);
      useGameStore.getState().updateFighterAnimation(selfId, 'armed'); // Changed from 'draw'
    };

    const onOpponentDrew = ({ playerId }: { playerId: string }) => {
      useGameStore.getState().updateFighterAnimation(playerId, 'armed'); // Changed from 'draw'
    };

    const onAimPhase = () => { 
      setMessage("AIM!"); 
      setCanClick(true); 
      setActionType('shoot'); 
      setBarVisible(true);
      fighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'armed'); // Changed from 'aiming'
      });
    };

    const onShot = ({ shooterId, hit }: { shooterId: string, hit: boolean }) => { 
      if (shooterId === selfId && hit) { 
        playShoot(); 
      }
      
      // NEW: Trigger shooting animation
      useGameStore.getState().updateFighterAnimation(shooterId, 'shooting');
    };

    const onBothHit = () => { 
      setMessage("DODGE!"); 
      setCanClick(false); 
      setActionType(null);
      
      // NEW: Both dodge
      fighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'dodging');
      });
    };

    const onGamePhaseChange = ({ phase, winnerData }: any) => {
      if (phase === "POST_ROUND" && winnerData) {
        if (winnerData.isSplit) {
          // Both players show defeat (sad)
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
        setMessage("");
        setCanClick(false); 
        setActionType(null); 
        setBarVisible(false);
      }
    };

        
        // Register all listeners
        socket.on("duel:bothReady", onBothReady);
        socket.on("duel:state", onDuelState);
        socket.on("duel:gong", onGong);
        socket.on("duel:drawSuccess", onDrawSuccess);
        socket.on("duel:aimPhase", onAimPhase);
        socket.on("duel:barUpdate", onBarUpdate);
        socket.on("duel:bothHit", onBothHit);
        socket.on("duel:bothMiss", onBothMiss);
        socket.on("duel:newRound", onNewRound);
        socket.on("duel:bothFailedDraw", onBothFailedDraw);
        socket.on("duel:shot", onShot);
        socket.on("duel:opponentDrew", onOpponentDrew);
        socket.on("game:phaseChange", onGamePhaseChange);
        
        // Cleanup function
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
          socket.off("duel:bothReady", onBothReady);
          socket.off("duel:state", onDuelState);
          socket.off("duel:gong", onGong);
          socket.off("duel:drawSuccess", onDrawSuccess);
          socket.off("duel:aimPhase", onAimPhase);
          socket.off("duel:barUpdate", onBarUpdate);
          socket.off("duel:bothHit", onBothHit);
          socket.off("duel:bothMiss", onBothMiss);
          socket.off("duel:newRound", onNewRound);
          socket.off("duel:bothFailedDraw", onBothFailedDraw);
          socket.off("duel:shot", onShot);
          socket.off("duel:opponentDrew", onOpponentDrew);
          socket.off("game:phaseChange", onGamePhaseChange);
        };
      }, [socket, selfId, playGong, fighters, isAIMode]); // Added isAIMode to dependency array
      
      const handleClick = () => {
        if (!canClick || !socket || !actionType) return;
        if (actionType === 'shoot' && hasShotThisRound.current) return;
        
        if (actionType === 'draw') {
            socket.emit("duel:draw");
            setCanClick(false);
        } else if (actionType === 'shoot') {
            console.log(`CLIENT CLICK: Shooting at bar position ${barPosition.toFixed(2)}`);
            socket.emit("duel:shoot");
            hasShotThisRound.current = true;
            setCanClick(false);
        }
      };
  
  return (
    <div className="absolute inset-0 cursor-crosshair" onClick={handleClick}>
        {isWaitingForOpponent && (
         <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
           <h1 className="text-3xl font-bold text-white animate-pulse">
             WAITING FOR OPPONENT...
           </h1>
         </div>
         )}   

        {isAIMode && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600 text-white font-bold px-3 py-1 text-sm">
            AI OPPONENT ACTIVE
            </div>
        )}
      <DuelOverlay message={message} canClick={canClick} actionType={actionType} />
      <ShootingBar visible={barVisible} barPosition={barPosition} onTick={playClick} onTock={playClack} onHammer={playHammer} />
    </div>
  );
};