"use client";

import { useState } from "react";
import { Difficulty } from "@/game/ai";
import {
  AdmiralBattleScreen,
  AdmiralSession,
  createAdmiralSession,
} from "./AdmiralBattleScreen";
import { BattleScreen, Session, createSession } from "./BattleScreen";
import { BridgeHeader, CoordinateReadout } from "./BridgeHeader";
import { GameMode, PlacementScreen } from "./PlacementScreen";
import { AmbientParticles, SplashScreen } from "./SplashScreen";
import { useSound } from "./useSound";

export default function BattleshipGame() {
  const [deployed, setDeployed] = useState(false);
  const [round, setRound] = useState(0);

  if (!deployed) {
    return (
      <div className="relative flex min-h-screen w-full flex-1 flex-col">
        <WaveBackdrop />
        <AmbientParticles />
        <SplashScreen onDeploy={() => setDeployed(true)} />
        <CoordinateReadout />
      </div>
    );
  }

  return <GameRound key={round} onPlayAgain={() => setRound((r) => r + 1)} />;
}

function GameRound({ onPlayAgain }: { onPlayAgain: () => void }) {
  const sound = useSound();
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<GameMode>("classic");
  const [session, setSession] = useState<Session | AdmiralSession | null>(
    null,
  );

  return (
    <div className="relative flex min-h-screen w-full flex-1 flex-col">
      <WaveBackdrop />
      <AmbientParticles />

      <BridgeHeader>
        <button
          type="button"
          onClick={sound.toggle}
          aria-pressed={sound.enabled}
          aria-label={`Sound ${sound.enabled ? "on" : "off"}`}
          title={`Sound ${sound.enabled ? "on" : "off"}`}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-btn transition-all duration-200 ease-out active:scale-95 ${
            sound.enabled
              ? "border-cyan-cta/50 bg-navy-800 text-cyan-cta hover:shadow-glow-cyan"
              : "border-navy-line bg-navy-900 text-foam-400 hover:text-foam-300"
          }`}
        >
          <SoundIcon on={sound.enabled} />
        </button>
      </BridgeHeader>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {session ? (
          "game" in session ? (
            <AdmiralBattleScreen
              session={session}
              difficulty={difficulty}
              sound={sound}
              onPlayAgain={onPlayAgain}
            />
          ) : (
            <BattleScreen
              session={session}
              difficulty={difficulty}
              sound={sound}
              onPlayAgain={onPlayAgain}
            />
          )
        ) : (
          <PlacementScreen
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            mode={mode}
            onModeChange={setMode}
            onStart={(fleet) =>
              setSession(
                mode === "admiral"
                  ? createAdmiralSession(fleet, difficulty)
                  : createSession(fleet, difficulty),
              )
            }
          />
        )}
      </div>

      <CoordinateReadout />
    </div>
  );
}

/** Slow-drifting wave lines behind the boards. */
function WaveBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-64 overflow-hidden opacity-[0.14]"
    >
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="animate-waves-drift h-full w-[200%]"
      >
        <path
          d="M0 120 Q75 90 150 120 T300 120 T450 120 T600 120 T750 120 T900 120 T1050 120 T1200 120 V200 H0 Z"
          fill="#22d3ee"
        />
        <path
          d="M0 155 Q100 130 200 155 T400 155 T600 155 T800 155 T1000 155 T1200 155 V200 H0 Z"
          fill="#0ea5e9"
        />
      </svg>
    </div>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M4 9 H8 L13 5 V19 L8 15 H4 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {on ? (
        <>
          <path
            d="M16 9 Q18 12 16 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M18.5 7 Q21.5 12 18.5 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          d="M16 9.5 L21 14.5 M21 9.5 L16 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
