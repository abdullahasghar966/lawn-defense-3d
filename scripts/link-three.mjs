// The game loads Three.js in the browser via an import map pointing at lib/three.module.js.
// Node has no import map, so the headless test suite needs the bare "three" specifier to
// resolve. This recreates a minimal node_modules/three package from the vendored build.
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'lib', 'three.module.js');
const dest = join(root, 'node_modules', 'three');

if (!existsSync(src)) {
  console.error('Missing lib/three.module.js — re-download it from https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
copyFileSync(src, join(dest, 'three.module.js'));
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify({ name: 'three', version: '0.160.0', type: 'module', exports: { '.': './three.module.js' } }, null, 2)
);
console.log('three resolved for Node from lib/three.module.js');
