"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export type SoundName =
  | "fire"
  | "miss"
  | "hit"
  | "sunk"
  | "sonar"
  | "recon"
  | "evaded"
  | "victory"
  | "defeat";

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
  opts: {
    duration: number;
    gain: number;
    filterFreq: number;
    filterType?: BiquadFilterType;
    /** Sweep the filter down to this frequency over the duration. */
    filterTo?: number;
    delay?: number;
  },
): void {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const length = Math.floor(ctx.sampleRate * opts.duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? "lowpass";
  filter.frequency.setValueAtTime(opts.filterFreq, start);
  if (opts.filterTo) {
    filter.frequency.exponentialRampToValueAtTime(
      opts.filterTo,
      start + opts.duration,
    );
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

const EFFECTS: Record<SoundName, (ctx: AudioContext) => void> = {
  // Big naval cannon: sharp muzzle crack into a deep rolling boom.
  fire: (ctx) => {
    noise(ctx, { duration: 0.07, gain: 0.65, filterFreq: 3200 });
    noise(ctx, {
      duration: 0.9,
      gain: 1.0,
      filterFreq: 420,
      filterTo: 60,
      delay: 0.02,
    });
    tone(ctx, {
      type: "sine",
      from: 120,
      to: 32,
      duration: 0.8,
      gain: 0.55,
      delay: 0.02,
    });
  },
  // Shell splashing into the sea.
  miss: (ctx) => {
    noise(ctx, {
      duration: 0.55,
      gain: 0.4,
      filterFreq: 1400,
      filterTo: 350,
    });
    tone(ctx, { type: "sine", from: 300, to: 130, duration: 0.4, gain: 0.1 });
  },
  // Shell striking steel: cracking explosion with a hard low thump.
  hit: (ctx) => {
    noise(ctx, { duration: 0.1, gain: 0.8, filterFreq: 5200 });
    noise(ctx, {
      duration: 1.1,
      gain: 0.95,
      filterFreq: 800,
      filterTo: 70,
      delay: 0.03,
    });
    tone(ctx, {
      type: "sawtooth",
      from: 180,
      to: 34,
      duration: 0.7,
      gain: 0.4,
      delay: 0.02,
    });
    tone(ctx, { type: "sine", from: 90, to: 28, duration: 0.9, gain: 0.5 });
  },
  // Magazine detonation: double explosion and a long groaning rumble.
  sunk: (ctx) => {
    noise(ctx, { duration: 0.12, gain: 0.85, filterFreq: 5200 });
    noise(ctx, {
      duration: 1.4,
      gain: 1.0,
      filterFreq: 900,
      filterTo: 60,
      delay: 0.04,
    });
    noise(ctx, {
      duration: 1.8,
      gain: 0.8,
      filterFreq: 500,
      filterTo: 45,
      delay: 0.4,
    });
    tone(ctx, {
      type: "sawtooth",
      from: 160,
      to: 24,
      duration: 1.6,
      gain: 0.4,
      delay: 0.05,
    });
    // hull groan as she goes down
    tone(ctx, {
      type: "triangle",
      from: 70,
      to: 26,
      duration: 2.0,
      gain: 0.3,
      delay: 0.6,
    });
  },
  // Active sonar: two clean pings with a fading echo.
  sonar: (ctx) => {
    for (const delay of [0, 0.55]) {
      tone(ctx, {
        type: "sine",
        from: 1180,
        to: 880,
        duration: 0.45,
        gain: 0.25,
        delay,
      });
      tone(ctx, {
        type: "sine",
        from: 1180,
        to: 620,
        duration: 0.9,
        gain: 0.06,
        delay: delay + 0.05,
      });
    }
  },
  // Recon flight: propeller aircraft passing overhead.
  recon: (ctx) => {
    noise(ctx, {
      duration: 1.3,
      gain: 0.3,
      filterFreq: 900,
      filterType: "bandpass",
      filterTo: 260,
    });
    tone(ctx, {
      type: "sawtooth",
      from: 95,
      to: 55,
      duration: 1.3,
      gain: 0.14,
    });
    tone(ctx, {
      type: "square",
      from: 190,
      to: 110,
      duration: 1.3,
      gain: 0.05,
    });
  },
  // Submarine evasion: a rushing wake as she slips away.
  evaded: (ctx) => {
    noise(ctx, {
      duration: 0.8,
      gain: 0.35,
      filterFreq: 500,
      filterType: "bandpass",
      filterTo: 2200,
    });
    tone(ctx, {
      type: "sine",
      from: 180,
      to: 420,
      duration: 0.7,
      gain: 0.12,
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
  const enabled = useSyncExternalStore(subscribe, isSoundEnabled, () => true);
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
