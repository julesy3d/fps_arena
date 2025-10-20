import { useGLTF, useAnimations } from "@react-three/drei";
import { useEffect, useRef, useMemo } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

interface FighterProps {
  position: [number, number, number];
  rotation?: number;
  animationState?: 'idle' | 'draw' | 'armed' | 'shooting' | 'dodging' | 'death' | 'victory';
}

export const Fighter = ({ position, rotation = 0, animationState = 'idle' }: FighterProps) => {
  const group = useRef<Group>(null);
  
  const { scene, animations } = useGLTF('/character_v7.glb');
  
  const clonedScene = useMemo(() => {
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);
  
  const { actions, names, mixer } = useAnimations(animations, group);
  
  // ============================================
  // FIX 1: Safety net ALWAYS active at meaningful weight
  // ============================================
  useEffect(() => {
    const idleAction = actions['Combat_Idle'];
    if (idleAction) {
      idleAction.reset();
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.setEffectiveWeight(0.15); // NEVER disable this
      idleAction.play();
      console.log('🛡️ Safety net: Combat_Idle always at 0.15');
    }
    
    return () => {
      idleAction?.stop();
    };
  }, [actions]);
  
  // ============================================
  // FIX 2: Make shooting/dodging hold final frame
  // ============================================
  useEffect(() => {
    const animationMap: Record<typeof animationState, string> = {
      'idle': 'Combat_Idle',
      'draw': 'draw',
      'armed': 'drawn_idle',
      'shooting': 'shooting',
      'dodging': 'dodge',
      'death': 'Death',
      'victory': 'Victory'
    };
    
    const targetAnim = animationMap[animationState];
    const action = actions[targetAnim];
    
    if (!action) {
      console.warn(`❌ Animation "${targetAnim}" not found. Available:`, names);
      return;
    }
    
    console.log(`🎬 Playing: ${animationState} (${targetAnim})`);
    
    // Stop all OTHER animations (except safety net)
    Object.entries(actions).forEach(([name, a]) => {
      if (a && name !== targetAnim && name !== 'Combat_Idle') {
        a.stop();
      }
    });
    
    // Configure loop mode
    const loopingStates: typeof animationState[] = ['idle', 'armed', 'victory'];
    const shouldLoop = loopingStates.includes(animationState);
    
    action.setLoop(
      shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    
    // CRITICAL: Add 'shooting' and 'dodging' to clampWhenFinished
    // This makes them hold their final frame instead of ending abruptly
    action.clampWhenFinished = ['death', 'victory', 'shooting', 'dodging'].includes(animationState);
    
    // Rotation for combat animations
    const needsRotation = ['draw', 'armed', 'shooting', 'dodging'].includes(animationState);
    clonedScene.rotation.y = needsRotation ? -Math.PI / 2 : 0;
    
    // Play with full weight
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    
    console.log(`✅ ${targetAnim} playing (clampWhenFinished: ${action.clampWhenFinished})`);
    
    return () => {
      action.stop();
    };
    
  }, [animationState, actions, names, clonedScene]);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.set(...position);
    group.current.rotation.y = rotation;
  });

  return (
    <group ref={group}>
      <primitive object={clonedScene} scale={1} />
    </group>
  );
};

useGLTF.preload('/character_v7.glb');