/**
 * Web Audio API synthesized sound effects. No audio files are shipped; every sound is
 * built from oscillators so it works offline and adds no bytes to the bundle.
 */

type SoundName = 'select' | 'place' | 'remove' | 'submit' | 'error' | 'win' | 'lose' | 'match' | 'tick';

let context: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

interface ToneOptions {
  freq: number;
  start?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tone(ctx: AudioContext, { freq, start = 0, duration = 0.12, type = 'sine', gain = 0.15, slideTo }: ToneOptions): void {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

const recipes: Record<SoundName, (ctx: AudioContext) => void> = {
  select: (ctx) => tone(ctx, { freq: 660, duration: 0.06, type: 'triangle', gain: 0.08 }),
  place: (ctx) => {
    tone(ctx, { freq: 420, duration: 0.07, type: 'triangle', gain: 0.12, slideTo: 560 });
    tone(ctx, { freq: 1200, duration: 0.03, type: 'square', gain: 0.02 });
  },
  remove: (ctx) => tone(ctx, { freq: 380, duration: 0.08, type: 'triangle', gain: 0.1, slideTo: 240 }),
  submit: (ctx) => {
    tone(ctx, { freq: 520, duration: 0.08, type: 'sine', gain: 0.12 });
    tone(ctx, { freq: 780, start: 0.07, duration: 0.1, type: 'sine', gain: 0.12 });
  },
  error: (ctx) => {
    tone(ctx, { freq: 200, duration: 0.14, type: 'sawtooth', gain: 0.07 });
    tone(ctx, { freq: 160, start: 0.1, duration: 0.16, type: 'sawtooth', gain: 0.07 });
  },
  win: (ctx) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(ctx, { freq, start: i * 0.11, duration: 0.28, type: 'sine', gain: 0.16 }),
    );
    tone(ctx, { freq: 1318.5, start: 0.5, duration: 0.6, type: 'triangle', gain: 0.1 });
  },
  lose: (ctx) => {
    [392, 349.23, 311.13, 261.63].forEach((freq, i) =>
      tone(ctx, { freq, start: i * 0.16, duration: 0.3, type: 'triangle', gain: 0.12 }),
    );
  },
  match: (ctx) => {
    tone(ctx, { freq: 440, duration: 0.1, type: 'square', gain: 0.06 });
    tone(ctx, { freq: 660, start: 0.1, duration: 0.1, type: 'square', gain: 0.06 });
    tone(ctx, { freq: 880, start: 0.2, duration: 0.18, type: 'square', gain: 0.06 });
  },
  tick: (ctx) => tone(ctx, { freq: 900, duration: 0.03, type: 'square', gain: 0.03 }),
};

/** Plays a synthesized effect when sound is enabled. Safe to call anywhere; failures are swallowed. */
export function playSound(name: SoundName): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    recipes[name](ctx);
  } catch {
    /* audio is a nicety, never a failure */
  }
}

/** Browsers block audio until a user gesture; call from the first pointer/key event. */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export type { SoundName };
