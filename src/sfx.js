let ctx = null;
let noiseBuf = null;

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
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
};
