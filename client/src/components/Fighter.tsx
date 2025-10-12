import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useMemo } from "react";
import { Group, AnimationMixer, AnimationAction } from "three";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface FighterProps {
  position: [number, number, number];
  rotation?: number;
  animationState?: 'idle' | 'armed' | 'shooting' | 'dodging' | 'death' | 'victory' | 'defeat';
}

export const Fighter = ({ position, rotation = 0, animationState = 'idle' }: FighterProps) => {
  const group = useRef<Group>(null);
  
  const { scene, animations } = useGLTF('/character.glb');
  
  const clonedScene = useMemo(() => {
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);
  
  const mixer = useMemo(() => new AnimationMixer(clonedScene), [clonedScene]);
  
  // Frame ranges from asset documentation:
  // Catwalk Idle: 101 – 107
  // Defeat Idle: 108 – 185 (first half = sad/lost, second half = happy/won)
  // Walking: 186 – 209
  // Running: 210 – 225
  // Jumping: 226 – 272 (used for DODGE)
  // Turn Left: 273 – 297 (character with weapon - ARMED state)
  // Kicking: 298 – 334
  // Dying: 335 – 473
  
  const actions = useMemo(() => {
    const actionMap: Record<string, AnimationAction> = {};
    
    if (animations.length > 0) {
      const fullClip = animations[0];
      const fps = 30;
      
      const createSubclip = (name: string, startFrame: number, endFrame: number) => {
        try {
          const clip = THREE.AnimationUtils.subclip(
            fullClip,
            name,
            startFrame,
            endFrame,
            fps
          );
          return mixer.clipAction(clip, clonedScene);
        } catch (error) {
          console.warn(`Failed to create animation clip: ${name}`, error);
          return null;
        }
      };
      
      // Create all gameplay animations
      const idle = createSubclip('idle', 101, 107);
      const defeat = createSubclip('defeat', 108, 146);      // First half: sad/lost
      const victory = createSubclip('victory', 147, 185);    // Second half: celebrating
      const walking = createSubclip('walking', 186, 209);
      const running = createSubclip('running', 210, 225);
      const dodging = createSubclip('dodging', 226, 272);    // Jumping animation
      const armed = createSubclip('armed', 273, 297);        // Turn Left: holding weapon
      const kicking = createSubclip('kicking', 298, 334);
      const death = createSubclip('death', 335, 473);
      
      if (idle) actionMap['idle'] = idle;
      if (defeat) actionMap['defeat'] = defeat;
      if (victory) actionMap['victory'] = victory;
      if (walking) actionMap['walking'] = walking;
      if (running) actionMap['running'] = running;
      if (dodging) actionMap['dodging'] = dodging;
      if (armed) actionMap['armed'] = armed;
      if (kicking) actionMap['kicking'] = kicking;
      if (death) actionMap['death'] = death;
    }
    
    return actionMap;
  }, [animations, mixer, clonedScene]);
  
  const currentActionRef = useRef<AnimationAction | null>(null);

  const playAnimation = (animName: string, loop: boolean = true) => {
    const newAction = actions[animName];
    if (!newAction) {
      console.warn(`Animation '${animName}' not found`);
      return;
    }
    
    if (currentActionRef.current && currentActionRef.current !== newAction) {
      currentActionRef.current.fadeOut(0.2);
    }
    
    newAction.reset().fadeIn(0.2).play();
    newAction.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    if (!loop) {
      newAction.clampWhenFinished = true;
    }
    
    currentActionRef.current = newAction;
  };

  useEffect(() => {
    playAnimation('idle');
  }, []);

  useEffect(() => {
    switch (animationState) {
      case 'armed':
        playAnimation('armed'); // Turn Left: holding weapon
        break;
      case 'shooting':
        playAnimation('kicking', false); // Using kick as shooting placeholder
        break;
      case 'dodging':
        playAnimation('dodging', false); // Jumping animation
        break;
      case 'death':
        playAnimation('death', false);
        break;
      case 'victory':
        playAnimation('victory'); // Celebrating loop
        break;
      case 'defeat':
        playAnimation('defeat'); // Sad/defeated loop
        break;
      case 'idle':
      default:
        playAnimation('idle');
    }
  }, [animationState]);

  useFrame((_, delta) => {
    mixer.update(delta);
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

useGLTF.preload('/character.glb');