"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type SoundName =
  | "fire"
  | "miss"
  | "hit"
  | "sunk"
  | "sonar"
  | "recon"
  | "evaded"
  | "victory"
  | "defeat"
  | "turn"
  | "click";

export type VoiceSpeaker = "navy" | "devin";
export type VoiceEvent = "hit" | "sunk";

/**
 * Per-play variation of a base sound, used for weapon-tier variants:
 * lower `rate` reads as a heavier gun, `gainMul` scales the mix level,
 * and `layers` re-fires the buffer with a short mechanical echo delay.
 */
export interface PlayVariant {
  rate?: number;
  gainMul?: number;
  layers?: number;
}

export interface SoundControls {
  enabled: boolean;
  toggle: () => void;
  play: (name: SoundName, variant?: PlayVariant) => void;
  /** Announcer voice line, layered shortly after the impact SFX. */
  voice: (speaker: VoiceSpeaker, event: VoiceEvent) => void;
}

const STORAGE_KEY = "battleship-sound-enabled";

interface SoundSpec {
  /** Path under /public. */
  src: string;
  /** Per-sound mix level so explosions don't drown out UI clicks. */
  gain: number;
  /** Minimum ms between plays, so rapid actions don't stack awkwardly. */
  throttleMs: number;
}

const SOUNDS: Record<SoundName, SoundSpec> = {
  fire: { src: "/sounds/cannon-fire.mp3", gain: 0.85, throttleMs: 90 },
  hit: { src: "/sounds/explosion-hit.mp3", gain: 0.9, throttleMs: 120 },
  miss: { src: "/sounds/water-splash.mp3", gain: 0.7, throttleMs: 120 },
  sunk: { src: "/sounds/ship-sunk.mp3", gain: 1.0, throttleMs: 200 },
  turn: { src: "/sounds/turn-notify.mp3", gain: 0.45, throttleMs: 300 },
  sonar: { src: "/sounds/turn-notify.mp3", gain: 0.55, throttleMs: 150 },
  recon: { src: "/sounds/turn-notify.mp3", gain: 0.5, throttleMs: 150 },
  evaded: { src: "/sounds/water-splash.mp3", gain: 0.6, throttleMs: 150 },
  victory: { src: "/sounds/victory-fanfare.mp3", gain: 0.8, throttleMs: 500 },
  defeat: { src: "/sounds/defeat-tone.mp3", gain: 0.7, throttleMs: 500 },
  click: { src: "/sounds/ui-click.mp3", gain: 0.4, throttleMs: 45 },
};

const FADE_IN = 0.008;
const FADE_OUT = 0.04;

/** Voice lands just after the explosion so the boom reads first. */
const VOICE_DELAY_MS = 120;
const VOICE_GAIN = 0.8;

const NAVY_VOICES: Record<VoiceEvent, string[]> = {
  hit: [
    "/sounds/voices/navy-hit-1.mp3",
    "/sounds/voices/navy-hit-2.mp3",
    "/sounds/voices/navy-hit-3.mp3",
  ],
  sunk: ["/sounds/voices/navy-sunk.mp3"],
};

const DEVIN_LINES: Record<VoiceEvent, string[]> = {
  hit: [
    "Target neutralized.",
    "Hit confirmed.",
    "Direct impact registered.",
    "Calculation successful.",
  ],
  sunk: ["Vessel eliminated.", "Enemy asset removed from the board."],
};

/** Random index, avoiding the previous pick when the pool allows it. */
function pickIndex(poolSize: number, last: number | undefined): number {
  if (poolSize <= 1) {
    return 0;
  }
  let index = Math.floor(Math.random() * poolSize);
  if (index === last) {
    index = (index + 1 + Math.floor(Math.random() * (poolSize - 1))) % poolSize;
  }
  return index;
}

/** Prefer en-US, then en-GB, then any English voice. */
function pickEnglishVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  for (const lang of ["en-US", "en-GB"]) {
    const match = voices.find((v) => v.lang.replace("_", "-") === lang);
    if (match) {
      return match;
    }
  }
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null
  );
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isSoundEnabled(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

/**
 * Module-level singleton audio engine (Web Audio). Decoded buffers play
 * through per-shot gain nodes, so any number of sounds can overlap.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private pending = new Map<SoundName, Promise<void>>();
  private failed = new Set<SoundName>();
  private lastPlayed = new Map<SoundName, number>();
  private unlocked = false;
  private voiceBuffers = new Map<string, AudioBuffer>();
  private voicePending = new Map<string, Promise<void>>();
  private voiceFailed = new Set<string>();
  private lastVoiceIndex = new Map<string, number>();
  private activeVoice: AudioBufferSourceNode | null = null;
  private voiceTimer: ReturnType<typeof setTimeout> | null = null;

  private context(): AudioContext | null {
    if (typeof window === "undefined" || !("AudioContext" in window)) {
      return null;
    }
    this.ctx ??= new AudioContext();
    return this.ctx;
  }

  /** Fetch and decode every sound so playback is instant during the game. */
  preload(): void {
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      if (
        this.buffers.has(name) ||
        this.pending.has(name) ||
        this.failed.has(name)
      ) {
        continue;
      }
      const load = fetch(SOUNDS[name].src)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.buffers.set(name, buffer);
        })
        .catch(() => {
          this.pending.delete(name);
          this.failed.add(name);
        });
      this.pending.set(name, load);
    }
    for (const src of [...NAVY_VOICES.hit, ...NAVY_VOICES.sunk]) {
      if (
        this.voiceBuffers.has(src) ||
        this.voicePending.has(src) ||
        this.voiceFailed.has(src)
      ) {
        continue;
      }
      const load = fetch(src)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.voiceBuffers.set(src, buffer);
        })
        .catch(() => {
          this.voicePending.delete(src);
          this.voiceFailed.add(src);
        });
      this.voicePending.set(src, load);
    }
    // Chrome populates getVoices() asynchronously; touching it here makes
    // the English voice list ready before the first Devin line plays.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }

  /**
   * Browsers keep the AudioContext suspended until a user gesture; resume
   * it on the first interaction so no sound ever tries to autoplay.
   */
  unlock(): void {
    if (this.unlocked) {
      return;
    }
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    this.unlocked = true;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  play(name: SoundName, variant?: PlayVariant): void {
    const ctx = this.context();
    if (!ctx || !isSoundEnabled()) {
      return;
    }
    if (ctx.state === "suspended") {
      if (!this.unlocked) {
        return;
      }
      void ctx.resume();
    }
    const spec = SOUNDS[name];
    const now = performance.now();
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < spec.throttleMs) {
      return;
    }
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.preload();
      return;
    }
    this.lastPlayed.set(name, now);

    const layers = Math.max(1, variant?.layers ?? 1);
    for (let layer = 0; layer < layers; layer++) {
      this.playBuffer(ctx, buffer, spec.gain, {
        rate: variant?.rate ?? 1,
        gainMul: (variant?.gainMul ?? 1) * (layer === 0 ? 1 : 0.45),
        delaySec: layer * 0.09,
      });
    }
  }

  private playBuffer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    baseGain: number,
    opts: { rate: number; gainMul: number; delaySec: number },
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate;
    const gain = ctx.createGain();
    // Slight random level variation keeps repeated shots from sounding canned.
    const level = Math.min(
      1.2,
      baseGain * opts.gainMul * (0.9 + Math.random() * 0.1),
    );
    const start = ctx.currentTime + opts.delaySec;
    const end = start + buffer.duration / opts.rate;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + FADE_IN);
    gain.gain.setValueAtTime(level, Math.max(start + FADE_IN, end - FADE_OUT));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(ctx.destination);
    source.start(start);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  /** Cut whatever line is talking so rapid hits never overlap voices. */
  private stopVoice(): void {
    if (this.voiceTimer !== null) {
      clearTimeout(this.voiceTimer);
      this.voiceTimer = null;
    }
    if (this.activeVoice) {
      try {
        this.activeVoice.stop();
      } catch {
        // Already stopped.
      }
      this.activeVoice = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  voice(speaker: VoiceSpeaker, event: VoiceEvent): void {
    const ctx = this.context();
    if (!ctx || !isSoundEnabled() || !this.unlocked) {
      return;
    }
    this.stopVoice();
    this.voiceTimer = setTimeout(() => {
      this.voiceTimer = null;
      if (!isSoundEnabled()) {
        return;
      }
      if (speaker === "navy") {
        this.playNavyVoice(ctx, event);
      } else {
        this.playDevinVoice(ctx, event);
      }
    }, VOICE_DELAY_MS);
  }

  private playNavyVoice(ctx: AudioContext, event: VoiceEvent): void {
    const pool = NAVY_VOICES[event];
    const key = `navy-${event}`;
    const index = pickIndex(pool.length, this.lastVoiceIndex.get(key));
    this.lastVoiceIndex.set(key, index);
    const buffer = this.voiceBuffers.get(pool[index]);
    if (!buffer) {
      this.preload();
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const level = VOICE_GAIN * (0.9 + Math.random() * 0.1);
    const start = ctx.currentTime;
    const end = start + buffer.duration;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + FADE_IN);
    gain.gain.setValueAtTime(level, Math.max(start + FADE_IN, end - FADE_OUT));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(ctx.destination);
    source.start(start);
    this.activeVoice = source;
    source.onended = () => {
      if (this.activeVoice === source) {
        this.activeVoice = null;
      }
      source.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Devin's lines come from the browser's SpeechSynthesis, pitched down for
   * a machine cadence. SpeechSynthesis output can't be routed through Web
   * Audio, so the synthetic character comes from a ring-modulated hum
   * layered underneath the speech for its estimated duration.
   */
  private playDevinVoice(ctx: AudioContext, event: VoiceEvent): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const pool = DEVIN_LINES[event];
    const key = `devin-${event}`;
    const index = pickIndex(pool.length, this.lastVoiceIndex.get(key));
    this.lastVoiceIndex.set(key, index);
    const line = pool[index];

    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = "en-US";
    const voice = pickEnglishVoice(window.speechSynthesis.getVoices());
    if (voice) {
      utterance.voice = voice;
    }
    utterance.pitch = 0.5;
    utterance.rate = 1.05;
    utterance.volume = Math.min(1, VOICE_GAIN * (0.9 + Math.random() * 0.1));
    window.speechSynthesis.speak(utterance);

    // Ring-modulated carrier under the speech makes it read as machine-born.
    const durationSec = Math.min(2.5, 0.35 + line.length * 0.055);
    const carrier = ctx.createOscillator();
    carrier.type = "sawtooth";
    carrier.frequency.value = 92;
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = 27;
    const modDepth = ctx.createGain();
    modDepth.gain.value = 0.5;
    const ring = ctx.createGain();
    ring.gain.value = 0.5;
    modulator.connect(modDepth).connect(ring.gain);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const out = ctx.createGain();
    const start = ctx.currentTime;
    const end = start + durationSec;
    out.gain.setValueAtTime(0, start);
    out.gain.linearRampToValueAtTime(0.045, start + 0.06);
    out.gain.setValueAtTime(0.045, end - 0.15);
    out.gain.linearRampToValueAtTime(0, end);
    carrier.connect(ring).connect(filter).connect(out).connect(ctx.destination);
    carrier.start(start);
    modulator.start(start);
    carrier.stop(end);
    modulator.stop(end);
    carrier.onended = () => {
      carrier.disconnect();
      modulator.disconnect();
      ring.disconnect();
      filter.disconnect();
      out.disconnect();
    };
  }
}

const engine = new SoundEngine();

/** File-based sound effects with preloading and a persisted on/off toggle. */
export function useSoundManager(): SoundControls {
  const enabled = useSyncExternalStore(subscribe, isSoundEnabled, () => true);

  useEffect(() => {
    engine.preload();
    const unlock = () => {
      engine.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggle = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(!isSoundEnabled()));
    listeners.forEach((listener) => listener());
  }, []);

  const play = useCallback((name: SoundName, variant?: PlayVariant) => {
    engine.play(name, variant);
  }, []);

  const voice = useCallback((speaker: VoiceSpeaker, event: VoiceEvent) => {
    engine.voice(speaker, event);
  }, []);

  return { enabled, toggle, play, voice };
}
