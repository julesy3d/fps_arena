import * as THREE from "three";

const scene = new THREE.Scene();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // Color doesn't matter
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.5;
floor.name = "floor"; // Give it a name so we can identify it
scene.add(floor);

// This function will update the positions of hitboxes in the virtual scene
export const updatePlayerHitbox = (player) => {
  let hitbox = scene.getObjectByName(player.id);
  if (!hitbox) {
    // Create a simple capsule hitbox for the player
    const geometry = new THREE.CapsuleGeometry(0.5, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    hitbox = new THREE.Mesh(geometry, material);
    hitbox.name = player.id;
    scene.add(hitbox);
  }
  // Position the hitbox. We lift it slightly so it's centered.
  hitbox.position.set(
    player.position[0],
    player.position[1] + 1,
    player.position[2],
  );
};

export const removePlayerHitbox = (playerId) => {
  const hitbox = scene.getObjectByName(playerId);
  if (hitbox) {
    scene.remove(hitbox);
  }
};

// This is the core hit detection function
export const performRaycast = (shooter, shotData) => {
  const raycaster = new THREE.Raycaster();

  const origin = new THREE.Vector3().fromArray(shotData.origin);
  const direction = new THREE.Vector3().fromArray(shotData.direction);

  raycaster.set(origin, direction);

  const objectsToTest = scene.children.filter((obj) => obj.name !== shooter.id);

  // Force every object to update its internal world matrix before the raycast.
  objectsToTest.forEach((obj) => obj.updateMatrixWorld());

  const intersections = raycaster.intersectObjects(objectsToTest);

  if (intersections.length > 0 && intersections[0].distance < 100) {
    return intersections[0];
  }

  return null;
};
