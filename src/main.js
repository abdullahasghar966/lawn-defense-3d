import * as THREE from '../lib/three.module.js';
import { Game, bootLevelIndex } from './game.js';
import { loadSession } from './session.js';
import { authGate } from './auth-ui.js';

// Resolve who is playing before building the scene, so the level grid opens with
// the right progress. Both calls fall back to guest mode if there is no backend.
await loadSession();
await authGate();

const game = new Game(document.getElementById('app'), bootLevelIndex());
window.game = game;

// Signing in or out from the menu re-renders it under the new identity.
addEventListener('ld3d:auth-changed', () => {
  if (game.status === 'menu') game.showMenu();
});

const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.update(dt);
}
loop();
