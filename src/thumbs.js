import * as THREE from '../lib/three.module.js';
import { PLANT_BUILDERS } from './models.js';
import { skyEquirect } from './textures.js';
import { THEMES } from './constants.js';

let renderer = null;
let scene = null;
let camera = null;
const cache = {};

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(128, 128);
  renderer.setPixelRatio(2);
  // Match the game's grade so a card reads as the same plant you place on the lawn.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  const sky = skyEquirect(THEMES.day);
  if (sky) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(sky).texture;
    pmrem.dispose();
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff2d0, 2.6);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd8ff, 0.9);
  rim.position.set(-2.5, 1.5, -2);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
  camera.position.set(1.05, 1.05, 1.45);
  camera.lookAt(0, 0.42, 0);
}

export function thumbnail(type) {
  if (cache[type]) return cache[type];
  ensure();
  const model = PLANT_BUILDERS[type]();
  if (type === 'potatomine') {
    model.userData.potato.visible = true;
    model.userData.mound.visible = false;
  }
  scene.add(model);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL();
  scene.remove(model);
  cache[type] = url;
  return url;
}
