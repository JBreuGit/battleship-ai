"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export type SoundName = "miss" | "hit" | "sunk" | "victory" | "defeat";

export interface SoundControls {
  enabled: boolean;
  toggle: () => void;
  play: (name: SoundName) => void;
}

const STORAGE_KEY = "battleship-sound-enabled";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isSoundEnabled(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

function tone(
  ctx: AudioContext,
  opts: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    gain: number;
    delay?: number;
  },
): void {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, start);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(opts.to, 1),
    start + opts.duration,
  );
  gain.gain.setValueAtTime(opts.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + opts.duration);
}

function noise(
  ctx: AudioContext,
  opts: { duration: number; gain: number; filterFreq: number; delay?: number },
): void {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const length = Math.floor(ctx.sampleRate * opts.duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

const EFFECTS: Record<SoundName, (ctx: AudioContext) => void> = {
  miss: (ctx) => {
    noise(ctx, { duration: 0.3, gain: 0.25, filterFreq: 900 });
    tone(ctx, { type: "sine", from: 320, to: 160, duration: 0.25, gain: 0.12 });
  },
  hit: (ctx) => {
    noise(ctx, { duration: 0.22, gain: 0.5, filterFreq: 2600 });
    tone(ctx, { type: "square", from: 170, to: 55, duration: 0.28, gain: 0.3 });
  },
  sunk: (ctx) => {
    noise(ctx, { duration: 0.25, gain: 0.5, filterFreq: 2600 });
    noise(ctx, { duration: 1.0, gain: 0.45, filterFreq: 380, delay: 0.08 });
    tone(ctx, {
      type: "sawtooth",
      from: 220,
      to: 40,
      duration: 0.9,
      gain: 0.25,
      delay: 0.05,
    });
  },
  victory: (ctx) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) =>
      tone(ctx, {
        type: "triangle",
        from: freq,
        to: freq,
        duration: 0.35,
        gain: 0.2,
        delay: i * 0.16,
      }),
    );
  },
  defeat: (ctx) => {
    const notes = [392, 311.13, 233.08];
    notes.forEach((freq, i) =>
      tone(ctx, {
        type: "triangle",
        from: freq,
        to: freq * 0.97,
        duration: 0.5,
        gain: 0.22,
        delay: i * 0.28,
      }),
    );
    noise(ctx, { duration: 1.2, gain: 0.2, filterFreq: 300, delay: 0.2 });
  },
};

/** Synthesized sound effects (Web Audio) with a persisted on/off toggle. */
export function useSound(): SoundControls {
  const enabled = useSyncExternalStore(
    subscribe,
    isSoundEnabled,
    () => true,
  );
  const ctxRef = useRef<AudioContext | null>(null);

  const toggle = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(!isSoundEnabled()));
    listeners.forEach((listener) => listener());
  }, []);

  const play = useCallback((name: SoundName) => {
    if (typeof window === "undefined" || !("AudioContext" in window)) {
      return;
    }
    if (!isSoundEnabled()) {
      return;
    }
    ctxRef.current ??= new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    EFFECTS[name](ctx);
  }, []);

  return { enabled, toggle, play };
}
