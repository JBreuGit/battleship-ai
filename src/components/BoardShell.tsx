"use client";

import { ReactNode } from "react";
import { BOARD_SIZE } from "@/game/types";

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

/** Chart frame around a 10x10 grid: title bar plus A–J / 1–10 labels. */
export function BoardShell({
  title,
  subtitle,
  tone,
  shaking,
  children,
}: BoardShellProps) {
  const label =
    tone === "navy" ? "text-foam-400/80" : "text-paper-300/90";

  return (
    <section className="flex w-full max-w-[26rem] flex-col gap-2 lg:max-w-[30rem]">
      <header className="flex items-baseline justify-between px-1">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-accent-400">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-foam-400/70">
            {subtitle}
          </p>
        ) : null}
      </header>
      <div
        className={`rounded-md border border-navy-line bg-navy-900/80 p-2 shadow-[0_0_30px_rgba(8,22,37,0.8)] sm:p-3 ${
          shaking ? "animate-board-shake" : ""
        }`}
      >
        <div className="grid grid-cols-[1.1rem_1fr] grid-rows-[1.1rem_1fr] gap-1">
          <div />
          <div className="grid grid-cols-10">
            {COLS.map((c) => (
              <span
                key={c}
                className={`flex items-center justify-center font-mono text-[9px] sm:text-[10px] ${label}`}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-10">
            {ROWS.map((r) => (
              <span
                key={r}
                className={`flex items-center justify-center font-mono text-[9px] sm:text-[10px] ${label}`}
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
