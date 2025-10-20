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
  // NUCLEAR OPTION: Always keep idle as safety net
  // ============================================
  useEffect(() => {
    const idleAction = actions['Combat_Idle'];
    if (idleAction) {
      idleAction.reset();
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.setEffectiveWeight(0); // Zero weight = invisible but keeps skeleton alive
      idleAction.play();
      console.log('🛡️ Safety net: idle always playing at 0 weight');
    }
    
    return () => {
      idleAction?.stop();
    };
  }, [actions]);
  
  // ============================================
  // Main animation logic
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
    
    // Stop all OTHER animations (except safety net idle)
    Object.entries(actions).forEach(([name, a]) => {
      if (a && name !== targetAnim && name !== 'Combat_Idle') {
        a.stop();
      }
    });
    
    // Configure
    const loopingStates: typeof animationState[] = ['idle', 'armed', 'victory'];
    const shouldLoop = loopingStates.includes(animationState);
    
    action.setLoop(
      shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    
    action.clampWhenFinished = ['death', 'victory'].includes(animationState);
    
    // Rotation for combat animations
    const needsRotation = ['draw', 'armed', 'shooting', 'dodging'].includes(animationState);
    clonedScene.rotation.y = needsRotation ? -Math.PI / 2 : 0;
    
    // Play with full weight
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    
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