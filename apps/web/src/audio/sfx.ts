// Sound effects (spec 14), synthesized with Web Audio: no audio files to license or download.
// iOS only lets audio start inside a user gesture, so the context is created/resumed on the
// first tap (unlockAudio) and every sound before that is silently skipped.
import { useSettings } from '../store/settings';

export type Sfx =
  | 'dice'
  | 'step'
  | 'buy'
  | 'rentPaid'
  | 'rentReceived'
  | 'coin'
  | 'card'
  | 'jail'
  | 'tick'
  | 'gavel'
  | 'turn'
  | 'build'
  | 'mortgage'
  | 'bankrupt'
  | 'win';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

/** Call from a user gesture. Installed once at startup (see installAudioUnlock). */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
}

export function installAudioUnlock(): void {
  const handler = () => unlockAudio();
  window.addEventListener('pointerdown', handler, { capture: true, passive: true });
  window.addEventListener('keydown', handler, { capture: true });
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.5);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) {
    // Deterministic LCG noise (no Math.random needed for a buffer of hiss).
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return noiseBuf;
}

interface Tone {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  dur: number;
  vol?: number;
}

function tone(c: AudioContext, out: AudioNode, t0: number, t: Tone): void {
  const start = t0 + (t.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = t.type ?? 'sine';
  o.frequency.setValueAtTime(t.freq, start);
  if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(t.vol ?? 0.5, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + t.dur + 0.02);
}

function hiss(
  c: AudioContext,
  out: AudioNode,
  t0: number,
  at: number,
  dur: number,
  freq: number,
  vol: number,
  to?: number,
): void {
  const start = t0 + at;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, start);
  if (to) f.frequency.exponentialRampToValueAtTime(to, start + dur);
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start);
  src.stop(start + dur + 0.02);
}

const SOUNDS: Record<Sfx, (c: AudioContext, out: AudioNode, t: number) => void> = {
  dice: (c, o, t) => {
    for (let i = 0; i < 7; i++)
      hiss(c, o, t, i * 0.055 + (i % 2) * 0.012, 0.045, 2200 + i * 150, 0.8);
  },
  step: (c, o, t) => tone(c, o, t, { freq: 720, to: 520, dur: 0.05, vol: 0.18, type: 'triangle' }),
  buy: (c, o, t) => {
    tone(c, o, t, { freq: 988, dur: 0.12, vol: 0.3, type: 'square' });
    tone(c, o, t, { freq: 1319, at: 0.09, dur: 0.35, vol: 0.3, type: 'square' });
    hiss(c, o, t, 0.08, 0.25, 6000, 0.25);
  },
  rentPaid: (c, o, t) => {
    tone(c, o, t, { freq: 523, dur: 0.14, vol: 0.35, type: 'triangle' });
    tone(c, o, t, { freq: 392, at: 0.12, dur: 0.28, vol: 0.35, type: 'triangle' });
  },
  rentReceived: (c, o, t) => {
    [659, 880, 1175].forEach((f, i) =>
      tone(c, o, t, { freq: f, at: i * 0.07, dur: 0.18, vol: 0.3, type: 'triangle' }),
    );
  },
  coin: (c, o, t) => {
    tone(c, o, t, { freq: 1568, dur: 0.08, vol: 0.2, type: 'square' });
    tone(c, o, t, { freq: 2093, at: 0.06, dur: 0.2, vol: 0.2, type: 'square' });
  },
  card: (c, o, t) => hiss(c, o, t, 0, 0.28, 900, 0.7, 4000),
  jail: (c, o, t) => {
    [110, 117, 165].forEach((f) => tone(c, o, t, { freq: f, dur: 0.9, vol: 0.3, type: 'square' }));
    hiss(c, o, t, 0, 0.12, 1800, 0.6);
  },
  tick: (c, o, t) => tone(c, o, t, { freq: 1500, dur: 0.035, vol: 0.2, type: 'square' }),
  gavel: (c, o, t) => {
    tone(c, o, t, { freq: 180, to: 60, dur: 0.18, vol: 0.9 });
    hiss(c, o, t, 0, 0.06, 1200, 0.9);
    tone(c, o, t, { freq: 180, to: 60, at: 0.22, dur: 0.22, vol: 0.9 });
    hiss(c, o, t, 0.22, 0.06, 1200, 0.9);
  },
  turn: (c, o, t) => {
    tone(c, o, t, { freq: 784, dur: 0.2, vol: 0.3 });
    tone(c, o, t, { freq: 1047, at: 0.1, dur: 0.35, vol: 0.3 });
  },
  build: (c, o, t) => {
    tone(c, o, t, { freq: 320, to: 260, dur: 0.07, vol: 0.5, type: 'triangle' });
    tone(c, o, t, { freq: 340, to: 270, at: 0.11, dur: 0.07, vol: 0.5, type: 'triangle' });
  },
  mortgage: (c, o, t) => {
    hiss(c, o, t, 0, 0.09, 3000, 0.5);
    hiss(c, o, t, 0.1, 0.12, 2400, 0.5);
  },
  bankrupt: (c, o, t) => {
    [392, 370, 349, 262].forEach((f, i) =>
      tone(c, o, t, {
        freq: f,
        at: i * 0.28,
        dur: i === 3 ? 0.8 : 0.3,
        vol: 0.3,
        type: 'sawtooth',
      }),
    );
  },
  win: (c, o, t) => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      tone(c, o, t, {
        freq: f,
        at: i * 0.12,
        dur: i === 5 ? 0.7 : 0.16,
        vol: 0.3,
        type: 'triangle',
      }),
    );
  },
};

/** Plays an effect unless muted or audio is not unlocked yet. Never throws. */
export function playSfx(name: Sfx): void {
  if (!useSettings.getState().sound) return;
  const c = ctx;
  if (!c || !master || c.state !== 'running') return;
  try {
    SOUNDS[name](c, master, c.currentTime + 0.01);
  } catch {
    /* audio is decoration; never break the game */
  }
}
