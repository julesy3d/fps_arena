import { useEffect, useState } from "react";

const actionByKey = (key: string) => {
  const keys = {
    KeyW: "moveForward",
    KeyS: "moveBackward",
    KeyA: "moveLeft",
    KeyD: "moveRight",
    ArrowUp: "moveForward",
    ArrowDown: "moveBackward",
    ArrowLeft: "moveLeft",
    ArrowRight: "moveRight",
    Space: "jump",
  };
  return keys[key as keyof typeof keys];
};

export const useKeyboardControls = () => {
  const [movement, setMovement] = useState({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setMovement((m) => ({ ...m, [actionByKey(e.code)]: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      setMovement((m) => ({ ...m, [actionByKey(e.code)]: false }));
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return movement;
};
