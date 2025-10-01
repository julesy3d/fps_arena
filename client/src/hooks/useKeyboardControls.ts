"use client";

import { useEffect, useState } from "react";

// Define the shape of our map so TypeScript knows what to expect.
// It maps any string key to a string value.
const keyActionMap: Record<string, string> = {
  KeyW: "moveForward",
  KeyS: "moveBackward",
  KeyA: "moveLeft",
  KeyD: "moveRight",
  Space: "jump",
};

const actionByKey = (key: string) => {
  return keyActionMap[key];
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
      const action = actionByKey(e.code);
      if (action) {
        setMovement((state) => ({ ...state, [action]: true }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const action = actionByKey(e.code);
      if (action) {
        setMovement((state) => ({ ...state, [action]: false }));
      }
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
