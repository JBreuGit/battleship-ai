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

export interface SoundControls {
  enabled: boolean;
  toggle: () => void;
  play: (name: SoundName) => void;
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

  play(name: SoundName): void {
    const ctx = this.context();
    if (!ctx || !isSoundEnabled()) {
      console.log(`[sound] blocked ${name} (muted)`);
      return;
    }
    if (ctx.state === "suspended") {
      if (!this.unlocked) {
        console.log(`[sound] blocked ${name} (locked)`);
        return;
      }
      void ctx.resume();
    }
    const spec = SOUNDS[name];
    const now = performance.now();
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < spec.throttleMs) {
      console.log(`[sound] blocked ${name} (throttled)`);
      return;
    }
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.preload();
      return;
    }
    this.lastPlayed.set(name, now);
    console.log(`[sound] play ${name}`);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    // Slight random level variation keeps repeated shots from sounding canned.
    const level = spec.gain * (0.9 + Math.random() * 0.1);
    const start = ctx.currentTime;
    const end = start + buffer.duration;
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

  const play = useCallback((name: SoundName) => {
    engine.play(name);
  }, []);

  return { enabled, toggle, play };
}
