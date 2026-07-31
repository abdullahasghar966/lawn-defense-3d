import * as THREE from 'three';
import { PLANT_BUILDERS } from './models.js';

let renderer = null;
let scene = null;
let camera = null;
const cache = {};

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(96, 96);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const d = new THREE.DirectionalLight(0xfff2d0, 1.4);
  d.position.set(2, 3, 2.5);
  scene.add(d);
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
