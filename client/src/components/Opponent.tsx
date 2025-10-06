import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState, useMemo } from "react";
import { Group, Vector3, AnimationMixer, AnimationAction } from "three";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface OpponentProps {
  position: [number, number, number];
  rotation?: number;
  health?: number;
}

export const Opponent = ({ position, rotation = 0, health = 3 }: OpponentProps) => {
  const group = useRef<Group>(null);
  
  const { scene, animations } = useGLTF('/character.glb');
  
  const clonedScene = useMemo(() => {
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);
  
  // Manually create mixer and actions
  const mixer = useMemo(() => new AnimationMixer(clonedScene), [clonedScene]);
  const actions = useMemo(() => {
    const actionMap: Record<string, AnimationAction> = {};
    animations.forEach((clip) => {
      actionMap[clip.name] = mixer.clipAction(clip, clonedScene);
    });
    return actionMap;
  }, [animations, mixer, clonedScene]);
  
  const [targetPos] = useState(() => new Vector3(...position));
  const [currentPos] = useState(() => new Vector3(...position));
  const [targetRot, setTargetRot] = useState(rotation);
  const [currentRot, setCurrentRot] = useState(rotation);
  const [currentAnimation, setCurrentAnimation] = useState<string>('idle');

  const ANIM = {
    IDLE: 'Armature|Catwalk_Idle|BaseLayer',
    WALK: 'Walking_Object_4',
    RUN: 'Armature|Running|BaseLayer',
    DEATH: 'Armature|Dying|BaseLayer',
    TURN_LEFT: 'Armature|Turn_Left|BaseLayer',
  };

  useEffect(() => {
    if (actions[ANIM.IDLE]) {
      actions[ANIM.IDLE].play();
      setCurrentAnimation('idle');
    }
  }, [actions, ANIM.IDLE]);

  useEffect(() => {
    if (health !== undefined && health <= 0 && currentAnimation !== 'death') {
      const currentAction = actions[currentAnimation];
      if (currentAction) {
        currentAction.fadeOut(0.2);
      }
      
      const deathAction = actions[ANIM.DEATH];
      if (deathAction) {
        deathAction.reset().fadeIn(0.2).play();
        deathAction.clampWhenFinished = true;
        deathAction.loop = THREE.LoopOnce;
      }
      setCurrentAnimation('death');
    }
  }, [health, currentAnimation, actions, ANIM.DEATH]);

  useEffect(() => {
    targetPos.set(...position);
  }, [position, targetPos]);

  useEffect(() => {
    setTargetRot(rotation);
  }, [rotation]);

  useFrame((_, delta) => {
    // Update mixer - log to verify it's being called
    const updated = mixer.update(delta);
    
    if (!group.current) return;

    const currentAction = actions[currentAnimation];
  if (currentAction) {
    console.log(`Animation: ${currentAnimation}, Weight: ${currentAction.getEffectiveWeight()}, Running: ${currentAction.isRunning()}`);
  }
    
    if (health !== undefined && health <= 0) {
      group.current.position.set(...position);
      group.current.rotation.y = rotation;
      return;
    }
    
    const lerpFactor = Math.min(delta * 10, 1);
    currentPos.lerp(targetPos, lerpFactor);
    group.current.position.copy(currentPos);
    
    let angleDiff = targetRot - currentRot;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    const newRot = currentRot + angleDiff * delta * 8;
    setCurrentRot(newRot);
    group.current.rotation.y = newRot;
    
    const distance = currentPos.distanceTo(targetPos);
    const isMoving = distance > 0.05;

    // Simplified: just walk when moving, idle when not
    if (isMoving && currentAnimation === 'idle') {
      const idleAction = actions[ANIM.IDLE];
      const walkAction = actions[ANIM.WALK];
      
      console.log('Switching to walk', walkAction);
      
      if (idleAction) idleAction.fadeOut(0.2);
      if (walkAction) {
        walkAction.reset().fadeIn(0.2).play();
        console.log('Walk action playing:', walkAction.isRunning(), 'time:', walkAction.time);
      }
      setCurrentAnimation('walk');
    } else if (!isMoving && currentAnimation === 'walk') {
      const walkAction = actions[ANIM.WALK];
      const idleAction = actions[ANIM.IDLE];
      
      if (walkAction) walkAction.fadeOut(0.2);
      if (idleAction) idleAction.reset().fadeIn(0.2).play();
      setCurrentAnimation('idle');
    }
  });

  return (
    <group ref={group}>
      <primitive object={clonedScene} scale={1} />
    </group>
  );
};

useGLTF.preload('/character.glb');