"use client";

import { ReactNode } from "react";
import { BOARD_SIZE } from "@/game/types";
import { PlayerBadge } from "./PlayerBadge";

const COLS = Array.from({ length: BOARD_SIZE }, (_, i) =>
  String.fromCharCode(65 + i),
);
const ROWS = Array.from({ length: BOARD_SIZE }, (_, i) => String(i + 1));

export interface BoardShellProps {
  title: string;
  subtitle?: string;
  tone: "navy" | "paper";
  shaking?: boolean;
  children: ReactNode;
}

/** HUD panel around a 10x10 grid: title bar plus A–J / 1–10 labels. */
export function BoardShell({
  title,
  subtitle,
  tone,
  shaking,
  children,
}: BoardShellProps) {
  const enemy = tone === "navy";

  return (
    <section className="animate-rise-in flex w-full max-w-[26rem] flex-col gap-2 lg:max-w-[30rem]">
      <header className="flex items-center justify-between px-2">
        <h2
          className={`flex items-center gap-2 font-display text-base font-bold tracking-wide ${
            enemy ? "text-devin-400" : "text-dutch-400"
          }`}
        >
          <PlayerBadge player={enemy ? "devin" : "dutch"} size="sm" />
          {title}
        </h2>
        {subtitle ? (
          <p className="rounded-full bg-navy-800/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-foam-300">
            {subtitle}
          </p>
        ) : null}
      </header>
      <div
        className={`rounded-2xl border p-2.5 shadow-panel backdrop-blur-sm sm:p-3.5 ${
          enemy
            ? "border-devin-400/30 bg-navy-900/85"
            : "border-dutch-500/30 bg-navy-900/85"
        } ${shaking ? "animate-board-shake" : ""}`}
      >
        <div className="grid grid-cols-[1.1rem_1fr] grid-rows-[1.1rem_1fr] gap-1">
          <div />
          <div className="grid grid-cols-10">
            {COLS.map((c) => (
              <span
                key={c}
                className="flex items-center justify-center text-[9px] font-semibold text-foam-400 sm:text-[10px]"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-10">
            {ROWS.map((r) => (
              <span
                key={r}
                className="flex items-center justify-center text-[9px] font-semibold text-foam-400 sm:text-[10px]"
              >
                {r}
              </span>
            ))}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
