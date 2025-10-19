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
  
  const { actions, names } = useAnimations(animations, group);
  const triggerCountRef = useRef(0);
  
  // ALWAYS keep armed animation playing as base layer
  useEffect(() => {
    const armedAction = actions['drawn_idle'];
    if (armedAction) {
      armedAction.reset();
      armedAction.setLoop(THREE.LoopRepeat, Infinity);
      armedAction.setEffectiveWeight(1.0);
      armedAction.play();
      console.log('🔫 Base layer: armed animation always looping');
    }
    
    return () => {
      armedAction?.stop();
    };
  }, [actions]); // Only run once when actions are ready
  
  useEffect(() => {
    triggerCountRef.current++;
    
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
    const armedAction = actions['drawn_idle'];
    
    if (!action || !armedAction) {
      console.warn(`❌ Animation "${targetAnim}" not found. Available:`, names);
      return;
    }
    
    // If we're explicitly in 'armed' state, just use the base layer
    if (animationState === 'armed') {
      armedAction.setEffectiveWeight(1.0);
      console.log(`⚡ Armed state (base layer only)`);
      return;
    }
    
    // SPECIAL CASE: Dodge blends with armed base
    if (animationState === 'dodging') {
      const dodgeAction = actions['dodge'];
      
      if (dodgeAction) {
        // Stop other overlays
        Object.values(actions).forEach(a => {
          if (a && a !== armedAction && a !== dodgeAction) {
            a.stop();
            a.reset();
          }
        });
        
        // Armed stays at 40%
        armedAction.setEffectiveWeight(0.4);
        
        // Dodge plays on top at 60%
        dodgeAction.setLoop(THREE.LoopOnce, 1);
        dodgeAction.clampWhenFinished = false;
        dodgeAction.reset().play();
        dodgeAction.setEffectiveWeight(0.6);
        
        console.log(`⚡ Dodge blend #${triggerCountRef.current}`);
        
        return () => {
          dodgeAction.stop();
        };
      }
    }
    
    // NORMAL CASE: Play animation ON TOP of armed base
    // Stop other animations (but NOT armed)
    Object.values(actions).forEach(a => {
      if (a && a !== armedAction && a !== action) {
        a.stop();
        a.reset();
      }
    });
    
    // Configure the overlay animation
    const loopingStates: typeof animationState[] = ['idle', 'victory'];
    const shouldLoop = loopingStates.includes(animationState);
    
    action.setLoop(
      shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    
    // Only clamp terminal states
    if (['death', 'victory'].includes(animationState)) {
      action.clampWhenFinished = true;
    } else {
      action.clampWhenFinished = false;
    }
    
    // Apply rotation for combat animations
    const needsRotation = ['draw', 'armed', 'shooting', 'dodging'].includes(animationState);
    clonedScene.rotation.y = needsRotation ? -Math.PI / 2 : 0;
    
    // Play overlay at full weight, armed stays underneath at lower weight
    armedAction.setEffectiveWeight(0.2); // Keep armed subtle underneath
    action.reset().play();
    action.setEffectiveWeight(1.0);
    
    console.log(`⚡ ${animationState} → ${targetAnim} (trigger #${triggerCountRef.current})`);
    
    return () => {
      // Don't stop armed, only the overlay
      if (action !== armedAction) {
        action.stop();
      }
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