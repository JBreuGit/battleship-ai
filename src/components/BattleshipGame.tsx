"use client";

import { useState } from "react";
import { Difficulty } from "@/game/ai";
import {
  AdmiralBattleScreen,
  AdmiralSession,
  createAdmiralSession,
} from "./AdmiralBattleScreen";
import { BattleScreen, Session, createSession } from "./BattleScreen";
import { GameMode, PlacementScreen } from "./PlacementScreen";
import { useSound } from "./useSound";

export default function BattleshipGame() {
  const [round, setRound] = useState(0);
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between border-b border-navy-line pb-4">
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-accent-400/90"
            aria-hidden
          >
            <path
              d="M12 2 a2.4 2.4 0 1 0 0 4.8 A2.4 2.4 0 0 0 12 2 Z M12 6.8 V20 M6 11 H18 M12 20 C8 20 4.8 17.4 4 14 L2.4 15 C3.4 19.6 7.3 22.6 12 22.6 C16.7 22.6 20.6 19.6 21.6 15 L20 14 C19.2 17.4 16 20 12 20 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-[0.35em] text-accent-400 sm:text-xl">
              Battleship
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-foam-400/70">
              Naval fire control console
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={sound.toggle}
          aria-pressed={sound.enabled}
          className={`rounded border px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors ${
            sound.enabled
              ? "border-accent-400/70 text-accent-300"
              : "border-navy-line text-foam-400/60"
          }`}
        >
          Sound {sound.enabled ? "on" : "off"}
        </button>
      </header>

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
  );
}
