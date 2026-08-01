const z = (type, row = -1) => ({ type, row });
const many = (n, type) => Array.from({ length: n }, () => z(type));

// Difficulty pass: every level starts with less sun, waves arrive on shorter
// fuses, and the later waves are both bigger and tougher-statted (see ZOMBIES in
// constants.js). Early levels still open gently — the ramp is steeper, not the floor.
export const LEVELS = [
  {
    name: 'First light', theme: 'day', startSun: 125,
    plants: ['sunflower', 'peashooter'],
    unlocks: ['wallnut'],
    waves: [
      { delay: 7,  zombies: [z('basic', 2)] },
      { delay: 17, zombies: [z('basic', 1), z('basic', 3)] },
      { delay: 19, zombies: many(4, 'basic') },
      { delay: 20, zombies: [...many(4, 'basic'), z('basic', 2)] },
      { delay: 21, zombies: many(6, 'basic'), huge: true },
    ],
  },
  {
    name: 'Hold the line', theme: 'day', startSun: 125,
    plants: ['sunflower', 'peashooter', 'wallnut'],
    unlocks: ['potatomine'],
    waves: [
      { delay: 7,  zombies: [z('basic', 2)] },
      { delay: 16, zombies: [z('conehead', 2), z('basic', 0)] },
      { delay: 19, zombies: [z('basic', 4), z('basic', 1), z('conehead', 3)] },
      { delay: 19, zombies: [...many(3, 'basic'), ...many(2, 'conehead')] },
      { delay: 21, zombies: [...many(5, 'basic'), ...many(3, 'conehead')], huge: true },
    ],
  },
  {
    name: 'Minefield', theme: 'day', startSun: 100,
    plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine'],
    unlocks: ['snowpea'],
    waves: [
      { delay: 6,  zombies: [z('basic', 1)] },
      { delay: 14, zombies: [z('conehead', 3), z('basic', 1)] },
      { delay: 17, zombies: [z('conehead', 0), z('conehead', 2), z('basic', 4)] },
      { delay: 19, zombies: [...many(4, 'basic'), ...many(2, 'conehead')] },
      { delay: 20, zombies: [z('buckethead', 2), ...many(4, 'basic'), ...many(2, 'conehead')] },
      { delay: 21, zombies: [z('buckethead', 1), z('buckethead', 3), ...many(4, 'basic'), z('conehead')], huge: true },
    ],
  },
  {
    name: 'Cold snap', theme: 'day', startSun: 125,
    plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'snowpea'],
    unlocks: ['chomper'],
    waves: [
      { delay: 7,  zombies: [z('conehead', 2)] },
      { delay: 16, zombies: [z('polevault', 1), z('basic', 3)] },
      { delay: 18, zombies: [z('buckethead', 3), z('basic', 0), z('basic', 2), z('conehead', 4)] },
      { delay: 19, zombies: [z('polevault', 4), z('polevault', 2), z('conehead', 1), ...many(3, 'basic')] },
      { delay: 21, zombies: [z('buckethead', 2), z('buckethead', 0), z('polevault', 3), ...many(4, 'basic'), ...many(2, 'conehead')], huge: true },
    ],
  },
  {
    name: "Chompers' picnic", theme: 'day', startSun: 125,
    plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'snowpea', 'chomper'],
    unlocks: ['repeater', 'cherrybomb'],
    waves: [
      { delay: 7,  zombies: [z('basic', 2), z('basic', 2)] },
      { delay: 16, zombies: [z('polevault', 0), z('conehead', 4), z('basic', 2)] },
      { delay: 18, zombies: [z('buckethead', 1), z('polevault', 3), z('basic', 2), z('conehead', 0)] },
      { delay: 19, zombies: [...many(4, 'conehead'), ...many(2, 'polevault'), z('basic')] },
      { delay: 22, zombies: [...many(3, 'buckethead'), ...many(4, 'basic'), ...many(2, 'polevault'), z('conehead')], huge: true },
    ],
  },
  {
    name: 'Nightfall', theme: 'night', startSun: 75,
    plants: ['sunflower', 'puffshroom', 'peashooter', 'repeater', 'wallnut', 'cherrybomb'],
    unlocks: ['squash'],
    waves: [
      { delay: 7,  zombies: [z('basic', 2)] },
      { delay: 16, zombies: [z('newspaper', 1), z('basic', 3)] },
      { delay: 18, zombies: [z('newspaper', 3), z('conehead', 0), z('basic', 2), z('basic', 4)] },
      { delay: 19, zombies: [...many(4, 'basic'), ...many(2, 'newspaper'), z('conehead')] },
      { delay: 22, zombies: [...many(3, 'newspaper'), ...many(4, 'basic'), ...many(3, 'conehead')], huge: true },
    ],
  },
  {
    name: 'Graveyard shift', theme: 'night', startSun: 100,
    plants: ['sunflower', 'puffshroom', 'repeater', 'snowpea', 'wallnut', 'squash', 'cherrybomb'],
    unlocks: ['jalapeno', 'torchwood'],
    waves: [
      { delay: 7,  zombies: [z('screendoor', 2)] },
      { delay: 16, zombies: [z('screendoor', 0), z('newspaper', 4)] },
      { delay: 18, zombies: [z('buckethead', 2), z('screendoor', 1), z('basic', 3), z('newspaper', 0)] },
      { delay: 19, zombies: [...many(3, 'screendoor'), ...many(2, 'newspaper'), ...many(2, 'conehead')] },
      { delay: 22, zombies: [...many(4, 'screendoor'), ...many(2, 'buckethead'), ...many(3, 'basic'), z('newspaper')], huge: true },
    ],
  },
  {
    name: 'Fever pitch', theme: 'night', startSun: 125,
    plants: ['sunflower', 'repeater', 'snowpea', 'torchwood', 'wallnut', 'jalapeno', 'squash', 'cherrybomb'],
    unlocks: ['threepeater', 'tallnut'],
    waves: [
      { delay: 7,  zombies: [z('conehead', 2), z('basic', 0)] },
      { delay: 16, zombies: [z('football', 1)] },
      { delay: 18, zombies: [z('screendoor', 3), z('newspaper', 0), z('conehead', 2), z('basic', 4)] },
      { delay: 21, zombies: [z('football', 4), ...many(3, 'basic'), z('buckethead'), z('screendoor')] },
      { delay: 23, zombies: [...many(3, 'football'), ...many(2, 'screendoor'), ...many(3, 'basic'), ...many(2, 'buckethead')], huge: true },
    ],
  },
  {
    name: 'Iron lawn', theme: 'day', startSun: 150,
    plants: ['sunflower', 'threepeater', 'repeater', 'snowpea', 'torchwood', 'tallnut', 'jalapeno', 'cherrybomb'],
    unlocks: ['spikeweed', 'melonpult'],
    waves: [
      { delay: 7,  zombies: [z('buckethead', 2)] },
      { delay: 16, zombies: [z('polevault', 0), z('football', 4), z('conehead', 2)] },
      { delay: 19, zombies: [...many(3, 'buckethead'), z('screendoor'), z('conehead'), z('polevault')] },
      { delay: 21, zombies: [z('football', 2), ...many(2, 'polevault'), ...many(3, 'basic'), z('buckethead')] },
      { delay: 24, zombies: [...many(3, 'football'), ...many(3, 'buckethead'), ...many(2, 'screendoor'), ...many(2, 'conehead')], huge: true },
    ],
  },
  {
    name: 'The horde', theme: 'day', startSun: 175,
    plants: ['sunflower', 'melonpult', 'threepeater', 'repeater', 'snowpea', 'torchwood', 'tallnut', 'spikeweed', 'cherrybomb'],
    unlocks: [],
    waves: [
      { delay: 7,  zombies: [z('basic', 2), z('conehead', 2)] },
      { delay: 16, zombies: [...many(3, 'buckethead'), ...many(2, 'polevault')] },
      { delay: 19, zombies: [...many(2, 'football'), ...many(3, 'newspaper'), ...many(2, 'basic')] },
      { delay: 21, zombies: [...many(3, 'screendoor'), ...many(3, 'buckethead'), ...many(3, 'conehead')], huge: true },
      { delay: 23, zombies: [...many(3, 'football'), ...many(3, 'buckethead'), ...many(4, 'basic'), ...many(2, 'polevault')], huge: true },
      { delay: 25, zombies: [...many(4, 'football'), ...many(3, 'screendoor'), ...many(5, 'basic'), ...many(3, 'newspaper')], huge: true },
    ],
  },
  {
    name: 'Brute force', theme: 'dusk', startSun: 175,
    plants: ['sunflower', 'melonpult', 'threepeater', 'repeater', 'snowpea', 'torchwood', 'tallnut', 'spikeweed', 'jalapeno'],
    unlocks: [],
    waves: [
      { delay: 7,  zombies: [z('conehead', 1), z('conehead', 3)] },
      { delay: 18, zombies: [z('brute', 2)] },
      { delay: 14, zombies: [...many(3, 'buckethead'), ...many(2, 'basic')] },
      { delay: 18, zombies: [...many(2, 'football'), ...many(2, 'screendoor'), ...many(2, 'basic')] },
      { delay: 21, zombies: [...many(3, 'football'), ...many(3, 'buckethead'), ...many(3, 'basic'), ...many(2, 'polevault')], huge: true },
    ],
  },
];
