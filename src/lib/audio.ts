// Effets sonores synthétisés avec la Web Audio API (aucun fichier audio).
// Tout est discret, et entièrement désactivable dans « Paramètres audio ».

export type Sound = 'click' | 'flip' | 'night' | 'day' | 'vote' | 'alert' | 'message' | 'victory';

export interface AudioPrefs {
  enabled: boolean;
  volume: number; // 0..1
  ambience: boolean;
}

const STORAGE_KEY = 'lg-audio';

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { enabled: true, volume: 0.5, ambience: false, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible : valeurs par défaut */
  }
  return { enabled: true, volume: 0.5, ambience: false };
}

let prefs = loadPrefs();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambienceNodes: { stop: () => void } | null = null;
const listeners = new Set<(p: AudioPrefs) => void>();

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = prefs.volume * 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function getAudioPrefs(): AudioPrefs {
  return prefs;
}

export function setAudioPrefs(next: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignoré */
  }
  if (master) master.gain.value = prefs.volume * 0.6;
  if (!prefs.enabled || !prefs.ambience) stopAmbience();
  else startAmbience();
  listeners.forEach((l) => l(prefs));
}

export function subscribeAudio(fn: (p: AudioPrefs) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function tone(
  freq: number,
  start: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {},
) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + duration);
  const peak = opts.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.03, duration / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise(start: number, duration: number, gain = 0.08, filterFreq = 1200) {
  const c = ctx!;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(g).connect(master!);
  src.start(start);
}

export function play(sound: Sound) {
  if (!prefs.enabled) return;
  const c = ensureContext();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (sound) {
    case 'click':
      tone(660, t, 0.08, { type: 'triangle', gain: 0.08 });
      break;
    case 'flip':
      noise(t, 0.25, 0.1, 2400);
      tone(220, t + 0.15, 0.6, { type: 'sine', gain: 0.12, slideTo: 440 });
      tone(330, t + 0.25, 0.7, { type: 'sine', gain: 0.08 });
      break;
    case 'night':
      // Un hurlement lointain, très doux
      tone(330, t, 1.6, { type: 'sine', gain: 0.07, slideTo: 520 });
      tone(520, t + 1.4, 1.2, { type: 'sine', gain: 0.05, slideTo: 300 });
      tone(55, t, 2.4, { type: 'sine', gain: 0.12 });
      break;
    case 'day':
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.12, 0.9, { type: 'triangle', gain: 0.06 }));
      break;
    case 'vote':
      tone(180, t, 0.25, { type: 'square', gain: 0.05, slideTo: 90 });
      noise(t, 0.12, 0.08, 400);
      break;
    case 'alert':
      tone(440, t, 0.18, { type: 'sawtooth', gain: 0.05 });
      tone(415, t + 0.2, 0.3, { type: 'sawtooth', gain: 0.05 });
      break;
    case 'message':
      tone(880, t, 0.1, { type: 'sine', gain: 0.04 });
      break;
    case 'victory':
      [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.15, 1.1, { type: 'triangle', gain: 0.07 }));
      break;
  }
}

function startAmbience() {
  if (ambienceNodes || !prefs.enabled || !prefs.ambience) return;
  const c = ensureContext();
  if (!c) return;
  const g = c.createGain();
  g.gain.value = 0.035;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(g.gain);
  const oscs = [55, 82.4, 110.3].map((f) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start();
    return o;
  });
  lfo.start();
  g.connect(master!);
  ambienceNodes = {
    stop: () => {
      oscs.forEach((o) => o.stop());
      lfo.stop();
      g.disconnect();
    },
  };
}

function stopAmbience() {
  ambienceNodes?.stop();
  ambienceNodes = null;
}

/** À appeler après un premier geste de l'utilisateur (règle des navigateurs). */
export function unlockAudio() {
  ensureContext();
  startAmbience();
}
