"use client";

import { useState } from "react";
import { Difficulty } from "@/game/ai";
import { BattleScreen, Session, createSession } from "./BattleScreen";
import { PlacementScreen } from "./PlacementScreen";
import { useSound } from "./useSound";

export default function BattleshipGame() {
  const [round, setRound] = useState(0);
  return <GameRound key={round} onPlayAgain={() => setRound((r) => r + 1)} />;
}

function GameRound({ onPlayAgain }: { onPlayAgain: () => void }) {
  const sound = useSound();
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [session, setSession] = useState<Session | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between border-b border-navy-line pb-4">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-[0.35em] text-accent-400 sm:text-xl">
            Battleship
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-foam-400/70">
            Fire control console
          </p>
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
        <BattleScreen
          session={session}
          difficulty={difficulty}
          sound={sound}
          onPlayAgain={onPlayAgain}
        />
      ) : (
        <PlacementScreen
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onStart={(fleet) => setSession(createSession(fleet, difficulty))}
        />
      )}
    </div>
  );
}
