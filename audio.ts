// Procedural 8-bit-style sound effects via the Web Audio API --- no external
// audio files, no new dependencies. This module is the only place that
// touches AudioContext; game.ts calls the exported play* functions purely as
// side effects when it detects a gameplay transition, the same way it
// already handles cosmetic animation timers. Never imported by or fed back
// into game-core.ts.

const MUTE_KEY = "pixelRuinsMuted";

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function toggleMute(): boolean {
  const next = !isMuted();
  localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  return next;
}

// One oscillator + a short attack/decay gain envelope --- the basic building
// block for every blip/chime/tone effect below. `glideTo`, if given, slides
// the oscillator's frequency linearly over the note's duration (used for the
// jump "rising" and stomp/lose "falling" feel).
function playTone(freq: number, durationMs: number, type: OscillatorType, peakGain: number, glideTo?: number, delayMs = 0): void {
  if (isMuted()) return;
  const audio = getContext();
  if (!audio) return;
  const duration = durationMs / 1000;
  const start = audio.currentTime + delayMs / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo !== undefined) {
    osc.frequency.linearRampToValueAtTime(glideTo, start + duration);
  }
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// A short burst of white noise through a decaying envelope, for the
// brick-break "crunch" --- the one effect a pure tone can't sell. The
// sample buffer is generated once (fixed length, not per-call) and reused.
function getNoiseBuffer(audio: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.floor(audio.sampleRate * 0.3);
    noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playNoiseBurst(durationMs: number, peakGain: number): void {
  if (isMuted()) return;
  const audio = getContext();
  if (!audio) return;
  const duration = durationMs / 1000;
  const source = audio.createBufferSource();
  source.buffer = getNoiseBuffer(audio);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(peakGain, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  source.connect(gain);
  gain.connect(audio.destination);
  source.start();
  source.stop(audio.currentTime + duration + 0.02);
}

export function playJump(): void {
  playTone(320, 110, "square", 0.12, 560);
}

export function playLand(): void {
  playTone(180, 70, "square", 0.08, 90);
}

export function playMysteryTrigger(): void {
  playTone(520, 90, "square", 0.14, 780);
  playTone(880, 120, "triangle", 0.1);
}

export function playBrickBreak(): void {
  playNoiseBurst(140, 0.18);
  playTone(140, 90, "square", 0.08, 70);
}

export function playStomp(): void {
  playTone(240, 140, "sawtooth", 0.12, 60);
}

export function playLose(): void {
  playTone(300, 500, "sawtooth", 0.14, 90);
}

export function playWin(): void {
  playTone(523, 110, "square", 0.12, undefined, 0);
  playTone(659, 110, "square", 0.12, undefined, 110);
  playTone(784, 220, "square", 0.14, undefined, 220);
}
