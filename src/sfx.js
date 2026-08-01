let ctx = null;
let noiseBuf = null;

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable */ }
}

function tone(freq, type, dur, vol = 0.1, slide = 0, delay = 0) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* ignore */ }
}

function noise(dur, vol = 0.15, freq = 800, delay = 0) {
  if (!ctx || !noiseBuf) return;
  try {
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch { /* ignore */ }
}

// Soft-clipping curve: adds the raspy break a real voice gets at full volume.
let rasp = null;
function raspCurve() {
  if (!rasp) {
    rasp = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      rasp[i] = Math.tanh(x * 3.2);
    }
  }
  return rasp;
}

/**
 * A short human scream, synthesised: a detuned saw/square pair sweeping up and
 * back down with vibrato, pushed through three parallel band-passes tuned to the
 * vowel formants of an open "aaah", plus a breath-noise layer on top.
 */
function screamVoice(delay = 0, dur = 1.15, pitch = 1, vol = 0.42) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + 0.055);
    out.gain.setValueAtTime(vol, t0 + dur * 0.48);
    out.gain.exponentialRampToValueAtTime(vol * 0.55, t0 + dur * 0.78);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    out.connect(ctx.destination);

    const shaper = ctx.createWaveShaper();
    shaper.curve = raspCurve();
    shaper.connect(out);

    // Vowel formants for "aah" — this is what makes it read as a voice and not a siren.
    const targets = [[760, 7, 1.0], [1180, 9, 0.62], [2760, 11, 0.3]].map(([freq, q, gain]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      bp.connect(g).connect(shaper);
      return bp;
    });

    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.setValueAtTime(5.5, t0);
    vib.frequency.linearRampToValueAtTime(8.5, t0 + dur);
    const vibG = ctx.createGain();
    vibG.gain.value = 34 * pitch;
    vib.connect(vibG);

    for (const [type, mul, level] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.22], ['sawtooth', 1.01, 0.3]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      const f = osc.frequency;
      const base = 340 * pitch * mul;
      f.setValueAtTime(base, t0);
      f.exponentialRampToValueAtTime(base * 2.7, t0 + 0.11);
      f.exponentialRampToValueAtTime(base * 2.35, t0 + dur * 0.55);
      f.exponentialRampToValueAtTime(base * 0.85, t0 + dur);
      vibG.connect(f);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      for (const bp of targets) g.connect(bp);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
    vib.start(t0);
    vib.stop(t0 + dur + 0.05);

    // breath / throat rasp
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1900;
    hp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(vol * 0.3, t0 + 0.09);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(hp).connect(ng).connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  } catch { /* ignore */ }
}

export const sfx = {
  pew: () => tone(760, 'square', 0.09, 0.045, -350),
  puff: () => tone(420, 'sine', 0.1, 0.05, -150),
  plant: () => { tone(240, 'triangle', 0.08, 0.1); tone(320, 'triangle', 0.08, 0.08, 0, 0.06); },
  chime: () => { tone(1320, 'sine', 0.14, 0.08); tone(1760, 'sine', 0.18, 0.06, 0, 0.05); },
  boom: () => { noise(0.5, 0.28, 500); tone(64, 'sine', 0.45, 0.3, -30); },
  smallboom: () => { noise(0.3, 0.18, 700); tone(90, 'sine', 0.28, 0.2, -40); },
  fire: () => noise(0.45, 0.2, 1400),
  chomp: () => { tone(220, 'sawtooth', 0.1, 0.14, -120); noise(0.08, 0.1, 2000, 0.04); },
  groan: () => tone(105 + Math.random() * 25, 'sawtooth', 0.5, 0.05, -40),
  rage: () => { tone(130, 'sawtooth', 0.3, 0.12, 240); tone(65, 'square', 0.3, 0.08, 120); },
  vault: () => tone(300, 'triangle', 0.25, 0.09, 300),
  splat: () => { tone(280, 'triangle', 0.12, 0.12, -200); noise(0.12, 0.12, 900); },
  crack: () => { noise(0.1, 0.2, 3000); tone(500, 'square', 0.06, 0.08, -300); },
  mower: () => { noise(0.7, 0.2, 400); tone(85, 'sawtooth', 0.65, 0.12, 40); },
  thud: () => { tone(55, 'sine', 0.3, 0.3, -15); noise(0.15, 0.12, 300); },
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.22, 0.1, 0, i * 0.13)); },
  defeat: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 'sawtooth', 0.3, 0.09, -20, i * 0.18)); },

  // ---- house breach
  scream: (delay = 0) => screamVoice(delay, 1.2, 1, 0.42),
  // A second, more distant voice a beat later — the house sounds occupied.
  screamFar: (delay = 0) => screamVoice(delay, 0.85, 1.28, 0.16),
  doorBurst: () => {
    noise(0.55, 0.34, 420);
    tone(48, 'sine', 0.6, 0.34, -18);
    // splintering timber
    [0, 0.045, 0.1, 0.17].forEach((d, i) => {
      noise(0.09, 0.16 - i * 0.025, 2600 - i * 400, d);
      tone(340 - i * 55, 'square', 0.06, 0.05, -180, d);
    });
  },
  doorSlam: () => { tone(58, 'sine', 0.45, 0.32, -22); noise(0.22, 0.2, 700); },
  heartbeat: (delay = 0) => {
    tone(52, 'sine', 0.3, 0.3, -14, delay);
    tone(46, 'sine', 0.36, 0.24, -12, delay + 0.31);
  },
  crunch: (delay = 0) => {
    noise(0.2, 0.22, 1500, delay);
    tone(150, 'sawtooth', 0.16, 0.16, -90, delay);
    noise(0.14, 0.16, 800, delay + 0.16);
    tone(110, 'sawtooth', 0.14, 0.13, -60, delay + 0.16);
  },
};
