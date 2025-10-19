import { useGLTF, useAnimations } from "@react-three/drei";
import { useEffect, useRef, useMemo } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { useGameStore } from "@/store/useGameStore";

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
  
  const currentActionRef = useRef<string | null>(null);
  const fighterIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fighters = useGameStore.getState().fighters;
    const myFighter = fighters.find(f => 
      f.position[0] === position[0] && 
      f.position[2] === position[2]
    );
    if (myFighter) {
      fighterIdRef.current = myFighter.id;
    }
  }, [position]);

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
      console.warn(`Animation "${targetAnim}" not found. Available:`, names);
      return;
    }
    
    if (currentActionRef.current === targetAnim && action.isRunning()) {
      return;
    }
    
    if (currentActionRef.current && actions[currentActionRef.current]) {
      actions[currentActionRef.current]!.fadeOut(0.15);
    }
    
    const loopingStates: typeof animationState[] = ['idle', 'armed', 'victory'];
    action.setLoop(
      loopingStates.includes(animationState) ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    
    if (!loopingStates.includes(animationState)) {
      action.clampWhenFinished = true;
    }
    
    // Auto-transition draw → armed
    if (animationState === 'draw') {
      const onDrawFinished = () => {
        if (fighterIdRef.current) {
          console.log('🎯 Draw animation complete, transitioning to armed');
          useGameStore.getState().updateFighterAnimation(fighterIdRef.current, 'armed');
        }
        mixer?.removeEventListener('finished', onDrawFinished);
      };
      mixer?.addEventListener('finished', onDrawFinished);
    }
    
    // Apply -90° rotation ONLY for draw/armed/shooting
    const needsRotation = ['draw', 'armed', 'shooting'].includes(animationState);
    clonedScene.rotation.y = needsRotation ? -Math.PI / 2 : 0;
    
    action.reset().fadeIn(0.15).play();
    currentActionRef.current = targetAnim;
    
  }, [animationState, actions, names, mixer, clonedScene]);

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