"use client";

import { Canvas } from "@react-three/fiber";
import React, { Suspense, useEffect, useState, useRef } from "react";
import { Scene3D } from "@/components/Scene3D";
import { useGameStore } from "@/store/useGameStore";
import { AsciiRenderer } from "@react-three/drei";
import { MoneyTransferBreakdown } from "@/components/MoneyTransferBreakdown";
import { TitleOverlay } from "@/components/TitleOverlay";

// ============================================
// STREAM PAGE - REUSING EXISTING COMPONENTS
// Split screen: Lobby (left) + 3D Canvas (right)
// ============================================

const Loader = () => (
  <div className="absolute inset-0 z-50 bg-black flex items-center justify-center text-white text-2xl font-bold">
    LOADING STREAM...
  </div>
);

// ============================================
// STREAM ANIMATION CONTROLLER
// Listens to socket events and updates fighter animations
// ============================================
const StreamAnimationController = () => {
  const { socket } = useGameStore();
  const cinematicAudioRef = useRef<HTMLAudioElement | null>(null);
  const gongAudioRef = useRef<HTMLAudioElement | null>(null);
  const shootAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    console.log("🎵 STREAM CONTROLLER: Loading audio files...");
    cinematicAudioRef.current = new Audio('/cinematic_intro.aac');
    gongAudioRef.current = new Audio('/gong.aac');
    shootAudioRef.current = new Audio('/shoot.aac');
    
    cinematicAudioRef.current.load();
    gongAudioRef.current.load();
    shootAudioRef.current.load();
    console.log("✅ STREAM CONTROLLER: Audio files loaded");
  }, []);

  useEffect(() => {
    if (!socket) {
      console.log("⚠️ STREAM CONTROLLER: No socket available yet");
      return;
    }

    console.log("🎬 STREAM CONTROLLER: Socket found, initializing event listeners...");
    console.log(`🔌 STREAM CONTROLLER: Socket ID: ${socket.id}, Connected: ${socket.connected}`);

    const onBothReady = () => {
      console.log("🎬 STREAM: Both players ready, playing cinematic");
      console.log("🎵 STREAM: Cinematic audio ref exists:", !!cinematicAudioRef.current);
      
      if (cinematicAudioRef.current) {
        cinematicAudioRef.current.currentTime = 0;
        console.log("🎵 STREAM: Starting cinematic playback...");
        cinematicAudioRef.current.play()
          .then(() => console.log("✅ STREAM: Cinematic audio playing successfully"))
          .catch(e => console.error('❌ STREAM: Cinematic playback failed:', e));
      } else {
        console.error("❌ STREAM: Cinematic audio ref is NULL!");
      }
    };

    const onGong = () => {
      console.log("🔔 STREAM: GONG - Setting fighters to DRAW");
      if (gongAudioRef.current) {
        gongAudioRef.current.currentTime = 0;
        gongAudioRef.current.play().catch(e => console.warn('Gong failed:', e));
      }
      if (cinematicAudioRef.current && !cinematicAudioRef.current.paused) {
        cinematicAudioRef.current.pause();
        cinematicAudioRef.current.currentTime = 0;
      }

      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'draw');
      });

      setTimeout(() => {
        console.log("🔫 STREAM: Draw complete - Setting to ARMED");
        const fighters = useGameStore.getState().fighters;
        fighters.forEach(f => {
          useGameStore.getState().updateFighterAnimation(f.id, 'armed');
        });
      }, 1200);
    };

    const onShot = ({ shooterId, autoMiss }: { shooterId: string; autoMiss?: boolean }) => {
      if (autoMiss) {
        console.log(`⏰ STREAM: ${shooterId} auto-missed (no animation)`);
        return;
      }
      
      console.log(`💥 STREAM: ${shooterId} is shooting!`);
      if (shootAudioRef.current) {
        shootAudioRef.current.currentTime = 0;
        shootAudioRef.current.play().catch(e => console.warn('Shoot sound failed:', e));
      }
      useGameStore.getState().updateFighterAnimation(shooterId, 'shooting');
    };

    const onNewRound = ({ round }: { round: number }) => {
      console.log(`🔄 STREAM: NEW ROUND ${round} - Re-arming fighters`);
      const currentFighters = useGameStore.getState().fighters;
      currentFighters.forEach(f => {
        useGameStore.getState().updateFighterAnimation(f.id, 'armed');
      });
    };

    const onRoundEnd = ({ outcome, winnerId, loserId, round }: { 
      outcome: 'hit' | 'dodge' | 'miss'; 
      winnerId?: string; 
      loserId?: string;
      round: number;
    }) => {
      console.log(`📊 STREAM: ROUND END - outcome: ${outcome}, round: ${round}`);
      
      // Delay to let shooting animations play
      setTimeout(() => {
        const currentFighters = useGameStore.getState().fighters;
        
        switch (outcome) {
          case 'hit':
            console.log(`💥 STREAM: ${winnerId} hit ${loserId}`);
            currentFighters.forEach(f => {
              if (f.id === winnerId) {
                useGameStore.getState().updateFighterAnimation(f.id, 'shooting');
              } else if (f.id === loserId) {
                useGameStore.getState().updateFighterAnimation(f.id, 'death');
              }
            });
            break;
            
          case 'dodge':
            console.log(`🤺 STREAM: BOTH HIT - DODGE!`);
            setTimeout(() => {
              const currentFighters = useGameStore.getState().fighters;
              currentFighters.forEach(f => {
                useGameStore.getState().updateFighterAnimation(f.id, 'dodging');
              });
            }, 300);
            break;
            
          case 'miss':
            console.log(`❌ STREAM: BOTH MISSED`);
            break;
        }
      }, 300);
    };

    const onGamePhaseChange = ({ phase, winnerData }: { 
      phase: string; 
      winnerData?: { name: string; isSplit: boolean; };
    }) => {
      console.log(`🎮 STREAM: GAME PHASE: ${phase}`);
      
      if (phase === "POST_ROUND" && winnerData) {
        const currentFighters = useGameStore.getState().fighters;
        
        if (winnerData.isSplit) {
          console.log("💀 STREAM: Split pot - both death animations");
          currentFighters.forEach(f => {
            useGameStore.getState().updateFighterAnimation(f.id, 'death');
          });
        } else {
          console.log(`🏆 STREAM: ${winnerData.name} wins`);
          currentFighters.forEach(f => {
            if (f.name === winnerData.name) {
              useGameStore.getState().updateFighterAnimation(f.id, 'victory');
            } else {
              useGameStore.getState().updateFighterAnimation(f.id, 'death');
            }
          });
        }
      }
    };

    socket.on("duel:bothReady", onBothReady);
    socket.on("duel:gong", onGong);
    socket.on("duel:shot", onShot);
    socket.on("duel:newRound", onNewRound);
    socket.on("duel:roundEnd", onRoundEnd);
    socket.on("game:phaseChange", onGamePhaseChange);

    console.log("✅ STREAM CONTROLLER: All 6 event listeners registered successfully");
    
    // Test that socket can receive events
    socket.on("connect", () => {
      console.log("🔌 STREAM: Socket connected! ID:", socket.id);
    });
    
    socket.on("disconnect", () => {
      console.log("⚠️ STREAM: Socket disconnected!");
    });

    return () => {
      console.log("🧹 STREAM CONTROLLER: Cleaning up event listeners");
      socket.off("duel:bothReady", onBothReady);
      socket.off("duel:gong", onGong);
      socket.off("duel:shot", onShot);
      socket.off("duel:newRound", onNewRound);
      socket.off("duel:roundEnd", onRoundEnd);
      socket.off("game:phaseChange", onGamePhaseChange);
      socket.off("connect");
      socket.off("disconnect");
    };
  }, [socket]);

  return null;
};

// ============================================
// STREAM MESSAGE DISPLAY - Centered in right panel
// Adapted from UnifiedMessageDisplay for stream layout
// ============================================

// Narrator messages from UnifiedMessageDisplay
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

const StreamMessageDisplay = () => {
  const { gamePhase, socket, roundWinner } = useGameStore();
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
      
      if (roundWinner.isSplit) {
        // DRAW - POT SPLIT
        const individualPayout = roundWinner.pot / 2;
        setCurrentMessage(`DRAW — POT SPLIT`);
        setIsDramatic(false);
        setIsVisible(true);
        
        addTimer(() => {
          setCurrentMessage(`Each receives ${individualPayout.toLocaleString()} Lamports`);
          setIsDramatic(false);
          setIsVisible(true);
        }, 2000);
        
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
  }, [gamePhase, roundWinner, socket]);

  if (gamePhase === "LOBBY" || !isVisible) return null;

  return (
    <div className="absolute top-0 left-0 right-0 flex justify-center pt-20 pointer-events-none z-30">
      <div
        className={`
          max-w-2xl px-16 py-4 text-center font-mono italic tracking-wider
          ${isDramatic ? 'text-4xl text-rose' : 'text-2xl text-subtext0'}
        `}
      >
        {currentMessage}
      </div>
    </div>
  );
};

// ============================================
// SPECTATOR LOBBY - FIXED TO SHOW ALL PLAYERS
// ============================================
const SpectatorLobby = () => {
  const { players, lobbyCountdown, gamePhase, socket, isConnected } = useGameStore();
  
  // Debug: Log player count with full details
  useEffect(() => {
    const playerArray = Object.values(players);
    console.log(`👥 STREAM LOBBY UPDATE:`, {
      totalPlayers: playerArray.length,
      playersObject: players,
      playersList: playerArray.map(p => ({
        id: p.id,
        name: p.name,
        betAmount: p.betAmount,
        role: p.role
      })),
      socketConnected: isConnected,
      socketId: socket?.id
    });
    
    if (playerArray.length === 0) {
      console.error('⚠️ STREAM LOBBY: Players object is EMPTY!');
      console.log('🔍 Checking socket listeners...');
      console.log('Socket exists:', !!socket);
      console.log('Socket connected:', socket?.connected);
    }
  }, [players, socket, isConnected]);
  
  // FIX: Show ALL players, sorted by bet amount
  const sortedByBid = Object.values(players).sort(
    (a, b) => (b.betAmount ?? 0) - (a.betAmount ?? 0) || (a.lastBetTimestamp || 0) - (b.lastBetTimestamp || 0)
  );
  
  const fighters = sortedByBid.slice(0, 2).filter(p => p.betAmount > 0);
  const contenders = sortedByBid.slice(2);

  console.log(`🥊 STREAM LOBBY SPLIT:`, {
    totalSorted: sortedByBid.length,
    fighters: fighters.length,
    contenders: contenders.length,
    fightersData: fighters.map(f => ({ name: f.name, bet: f.betAmount })),
    contendersData: contenders.map(c => ({ name: c.name, bet: c.betAmount }))
  });

  // Player ranks by net winnings
  const allPlayers = Object.values(players);
  const sortedByNetWinnings = [...allPlayers].sort((a, b) => (b.stats?.netWinnings ?? 0) - (a.stats?.netWinnings ?? 0));
  const playerRanks = new Map<string, number>();
  sortedByNetWinnings.forEach((p, i) => {
    if (p.stats) {
      playerRanks.set(p.id, i + 1);
    }
  });

  const PlayerRow = ({ player, isFighter }: { player: any, isFighter: boolean }) => {
    const rank = playerRanks.get(player.id);
    
    return (
      <div
        className={`grid grid-cols-12 gap-2 p-2 text-xs ${isFighter ? 'bg-surface text-text font-bold' : 'text-subtext0'}`}
        role="row"
      >
        <div className="col-span-1 text-center text-subtext1" role="gridcell">
          {rank ? `#${rank}` : '-'}
        </div>
        <div className="col-span-3" role="gridcell">
          {player.name}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.kills ?? 0}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.deaths ?? 0}
        </div>
        <div className="col-span-1 text-center text-subtext0" role="gridcell">
          {player.stats?.totalGamesPlayed ?? 0}
        </div>
        <div
          className={`col-span-1 text-right ${(player.stats?.netWinnings ?? 0) > 0 ? 'text-success' : 'text-subtext1'}`}
          role="gridcell"
        >
          {player.stats?.netWinnings ?? 0}
        </div>
        <div className="col-span-4 text-right text-amber font-mono" role="gridcell">
          {player.betAmount > 0 ? player.betAmount.toLocaleString() : 'SPECTATING'}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen overflow-y-auto bg-base p-4 pt-[20%] pb-[10%]">
      <div className="border-dashed-ascii bg-ascii-shade">
        {/* Header */}
        <header className="flex items-center justify-between p-3">
          {lobbyCountdown !== null ? (
            <div className="font-title text-2xl text-lavender">
              {lobbyCountdown > 0 ? `T-${lobbyCountdown.toString().padStart(2, "0")}` : "FINALIZING..."}
            </div>
          ) : gamePhase === "IN_ROUND" ? (
            <div className="font-title text-xl text-rose">
              // DUEL IN PROGRESS - NEXT ROUND SOON
            </div>
          ) : gamePhase === "POST_ROUND" ? (
            <div className="font-title text-xl text-sage">
              // ROUND COMPLETE - NEXT DUEL SOON
            </div>
          ) : (
            <div className="font-title text-xl text-subtext1">
              // WAITING FOR DUELISTS
            </div>
          )}
        </header>
        
        <div className="hr-dashed" role="presentation" />

        <main className="flex flex-col gap-4 p-4">
          {/* Fighters Table */}
          <div role="grid">
            <h3 className="mb-2 text-base font-semibold text-subtext1">
              {gamePhase === "IN_ROUND" 
                ? "// CURRENT DUEL: FIGHTERS [TOP 2 BIDS]"
                : "// NEXT DUEL: FIGHTERS [TOP 2 BIDS]"
              }
            </h3>
            <div className="text-xs text-subtext1" role="row">
              <div className="grid grid-cols-12 gap-2 p-2" role="rowheader">
                <div className="col-span-1 text-center" role="columnheader">RANK</div>
                <div className="col-span-3" role="columnheader">NAME</div>
                <div className="col-span-1 text-center" role="columnheader">KILLS</div>
                <div className="col-span-1 text-center" role="columnheader">DEATHS</div>
                <div className="col-span-1 text-center" role="columnheader">ROUNDS</div>
                <div className="col-span-1 text-right" role="columnheader">NET GAIN</div>
                <div className="col-span-4 text-right" role="columnheader">CURRENT BID</div>
              </div>
            </div>
            <div className="hr-dashed" role="presentation" />
            <div role="rowgroup">
              {fighters.length === 0 ? (
                <div className="p-4 text-center text-xs italic text-subtext1">
                  No active bidders yet. Players can visit POTSHOT.GG to bet!
                </div>
              ) : (
                fighters.map(p => <PlayerRow key={p.id} player={p} isFighter={true} />)
              )}
            </div>
          </div>

          {/* Contenders Table */}
          <div role="grid">
            <h3 className="mb-2 text-base font-semibold text-subtext1">
              // AUCTION IN PROGRESS: CONTENDERS
            </h3>
            <div className="text-xs text-subtext1" role="row">
              <div className="grid grid-cols-12 gap-2 p-2" role="rowheader">
                <div className="col-span-1 text-center" role="columnheader">RANK</div>
                <div className="col-span-3" role="columnheader">NAME</div>
                <div className="col-span-1 text-center" role="columnheader">KILLS</div>
                <div className="col-span-1 text-center" role="columnheader">DEATHS</div>
                <div className="col-span-1 text-center" role="columnheader">ROUNDS</div>
                <div className="col-span-1 text-right" role="columnheader">NET GAIN</div>
                <div className="col-span-4 text-right" role="columnheader">CURRENT BID</div>
              </div>
            </div>
            <div className="hr-dashed" role="presentation" />
            <div className="max-h-[400px] overflow-hidden" role="rowgroup">
              {contenders.length === 0 ? (
                <div className="p-4 text-center text-xs italic text-subtext0">
                  Waiting for more contenders...
                </div>
              ) : (
                contenders.map(p => <PlayerRow key={p.id} player={p} isFighter={false} />)
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// ============================================
// SPECTATOR SHOOTING BARS - ADAPTED FROM DuelUI
// Shows both players' bars with individual tracking
// ============================================
const SpectatorShootingBars = () => {
  const { socket, fighters, gamePhase } = useGameStore();
  const [barVisible, setBarVisible] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<number>(0);
  const [shotData, setShotData] = useState<Record<string, { position: number; hit: boolean } | null>>({});

  useEffect(() => {
    if (!socket) return;

    const onGong = () => {
      console.log("🔔 GONG - Showing bars");
      setBarVisible(true);
      setShotData({});
    };

    const onBarUpdate = ({ position }: { position: number }) => {
      setBarPosition(position);
    };

    const onShot = ({ shooterId, hit, barPosition }: { 
      shooterId: string; 
      hit: boolean; 
      barPosition: number;
    }) => {
      console.log(`💥 Shot: ${shooterId}, hit: ${hit}, position: ${barPosition.toFixed(3)}`);
      setShotData(prev => ({
        ...prev,
        [shooterId]: { position: barPosition, hit }
      }));
    };

    const onRoundEnd = () => {
      console.log("🏁 Round end - Hiding bars after delay");
      setTimeout(() => {
        setBarVisible(false);
        setShotData({});
      }, 2000);
    };

    const onNewRound = () => {
      console.log("🔄 New round - Resetting shot data");
      setShotData({});
      setBarVisible(true); // Keep bars visible for new round
    };

    const onPhaseChange = ({ phase }: { phase: string }) => {
      if (phase === "LOBBY" || phase === "POST_ROUND") {
        setBarVisible(false);
        setShotData({});
      }
    };

    socket.on("duel:gong", onGong);
    socket.on("duel:barUpdate", onBarUpdate);
    socket.on("duel:shot", onShot);
    socket.on("duel:roundEnd", onRoundEnd);
    socket.on("duel:newRound", onNewRound);
    socket.on("game:phaseChange", onPhaseChange);

    return () => {
      socket.off("duel:gong", onGong);
      socket.off("duel:barUpdate", onBarUpdate);
      socket.off("duel:shot", onShot);
      socket.off("duel:roundEnd", onRoundEnd);
      socket.off("duel:newRound", onNewRound);
      socket.off("game:phaseChange", onPhaseChange);
    };
  }, [socket]);

  if (!barVisible || gamePhase !== "IN_ROUND" || !fighters || fighters.length < 2) {
    return null;
  }

  const [fighter1, fighter2] = fighters;
  const shot1 = shotData[fighter1.id];
  const shot2 = shotData[fighter2.id];

  const rows = 20;
  const targetZoneStart = Math.floor(rows * 0.20);
  const targetZoneEnd = Math.floor(rows * 0.40);

  const renderBar = (fighter: any, shotInfo: { position: number; hit: boolean } | null | undefined) => {
    const displayPosition = shotInfo?.position ?? barPosition;
    const barPositionRow = Math.floor((1 - displayPosition) * rows);
    const hasShot = shotInfo !== null && shotInfo !== undefined;

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-xs font-mono text-text font-bold mb-1">
          {fighter.name}
        </div>
        
        <div className="border-dashed-ascii font-mono text-sm leading-tight p-2 bg-overlay text-subtext1">
          {Array.from({ length: rows }).map((_, i) => {
            const isBar = i === barPositionRow;
            const isInTarget = i >= targetZoneStart && i <= targetZoneEnd;
            
            let char = '│';
            let className = 'text-subtext1';
            
            if (isBar && hasShot) {
              char = '◉';
              className = shotInfo.hit ? 'text-success font-bold' : 'text-error font-bold';
            } else if (isBar) {
              char = '█';
              className = 'text-rose';
            } else if (isInTarget) {
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
        
        <div className={`font-mono text-xs font-bold ${
          hasShot
            ? (shotInfo.hit ? 'text-success' : 'text-error')
            : (displayPosition >= 0.60 && displayPosition <= 0.80 ? 'text-sage' : 'text-subtext1')
        }`}>
          {hasShot
            ? (shotInfo.hit ? '✓ HIT!' : '✗ MISS')
            : (displayPosition >= 0.60 && displayPosition <= 0.80 ? 'SHOOT!' : `${(displayPosition * 100).toFixed(0)}%`)
          }
        </div>
      </div>
    );
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex gap-16 items-end">
      {renderBar(fighter1, shot1)}
      {renderBar(fighter2, shot2)}
    </div>
  );
};

// ============================================
// CONNECTION STATUS
// ============================================
const ConnectionStatus = () => {
  const { isConnected } = useGameStore();
  
  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2 border-dashed-ascii bg-ascii-shade px-3 py-1.5">
      <div className={`h-2 w-2 ${isConnected ? "animate-pulse bg-success" : "bg-error"}`} />
      <span className={`text-xs font-mono ${isConnected ? "text-success" : "text-error"}`}>
        {isConnected ? "LIVE" : "RECONNECTING"}
      </span>
    </div>
  );
};

// ============================================
// MAIN STREAM PAGE
// ============================================
export default function StreamPage() {
  const { gamePhase, isHydrated, roundPot, fighters, players, socket, isConnected } = useGameStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.log("🎬 STREAM PAGE: Component mounted");
    setMounted(true);
    //
    // 🔴 REMOVED REDUNDANT connectSocket() CALL
    // The root layout's SocketInitializer is responsible for the connection.
    // Calling it here was preventing new listeners from being attached.
    //
  }, []); // Removed connectSocket from dependency array

  // Debug: Log connection status
  useEffect(() => {
    console.log(`📡 STREAM: Connection status - isConnected: ${isConnected}, socket exists: ${!!socket}`);
  }, [isConnected, socket]);

  // Debug: Log player state changes in real-time
  useEffect(() => {
    console.log(`👥 STREAM: Players in store:`, {
      count: Object.keys(players).length,
      players: Object.values(players).map(p => ({ id: p.id, name: p.name, betAmount: p.betAmount }))
    });
    
    if (Object.keys(players).length === 0 && isConnected) {
      console.error("🚨 STREAM CRITICAL: Socket connected but players object is EMPTY!");
      console.log("🔍 This means server isn't sending 'lobby:state' or 'game:state' events");
      console.log("💡 Check server-side: Does it emit these events to new connections?");
    }
  }, [players, isConnected]);

  // Debug logging for animations
  useEffect(() => {
    console.log('🎮 Stream - Game state:', {
      gamePhase,
      fightersCount: fighters?.length ?? 0,
      fighters: fighters?.map(f => ({ id: f.id, name: f.name, animationState: f.animationState }))
    });
  }, [gamePhase, fighters]);

  if (!mounted) {
    console.log("⏳ STREAM: Waiting for mount...");
    return null;
  }

  console.log("✅ STREAM: Rendering main content");

  return (
    <main className="font-body">
      {/* Animation controller - invisible but listens to socket events */}
      <StreamAnimationController />

      {/* Split Screen Layout */}
      <div className="grid grid-cols-2 h-screen w-screen overflow-hidden">
        {/* LEFT: Spectator Lobby (reusing your table logic) */}
        <div className="col-span-1">
          <SpectatorLobby />
        </div>

        {/* RIGHT: 3D Canvas with all your existing components */}
        <div className="col-span-1 relative">
          {/* 3D Canvas - Shows ALL animations */}
          <div className="absolute inset-0 z-[-1]">
            <Suspense fallback={<Loader />}>
              <Canvas
                camera={{ fov: 75, position: [-10, 2, 0] }}
                frameloop="always"
                gl={{
                  powerPreference: "high-performance",
                  antialias: false,
                }}
                dpr={[1, 1.5]}
              >
                <color attach="background" args={["#ffffff"]} />
                <AsciiRenderer
                  fgColor="black"
                  bgColor="white"
                  characters=" .:-+*=%@#"
                  color={false}
                  invert={false}
                  resolution={0.25}
                />
                <Scene3D />
              </Canvas>
            </Suspense>
          </div>

          {/* TITLE OVERLAY - Your TitleOverlay component (always visible, hover disabled in stream) */}
          <TitleOverlay onHover={() => {}} />

          {/* CINEMATIC MESSAGES - Centered in right panel */}
          <StreamMessageDisplay />

          {/* SHOOTING BARS - Adapted from your DuelUI */}
          <SpectatorShootingBars />

          {/* POT DISPLAY - During duel */}
          {gamePhase === "IN_ROUND" && roundPot > 0 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
              <div className="border-dashed-ascii bg-ascii-shade px-6 py-3">
                <div className="font-mono text-center">
                  <div className="text-xs text-subtext1 mb-1">// TOTAL POT</div>
                  <div className="text-2xl font-bold text-amber tracking-wider">
                    {roundPot.toLocaleString()} ◎
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MONEY BREAKDOWN - Your existing component */}
          <MoneyTransferBreakdown />
        </div>
      </div>

      {/* Connection Status */}
      <ConnectionStatus />

      {/* Hydration Check */}
      {!isHydrated && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center text-white text-3xl animate-pulse z-50">
          CONNECTING TO LIVE STREAM...
        </div>
      )}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-subtext1 bg-black/90 p-2 text-center text-xs text-subtext0 z-30">
        🎮 POTSHOT.GG - Live Duel Arena | Top 2 bidders fight | Winner takes 90% | Visit POTSHOT.GG to play
      </footer>
    </main>
  );
}