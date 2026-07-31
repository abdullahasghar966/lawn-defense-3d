import * as THREE from 'three';
import { Game, bootLevelIndex } from './game.js';

const game = new Game(document.getElementById('app'), bootLevelIndex());
window.game = game;
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.update(dt);
}
loop();
