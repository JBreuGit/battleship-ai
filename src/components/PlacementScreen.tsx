"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Difficulty } from "@/game/ai";
import { coordKey, isOnBoard, shipCells } from "@/game/board";
import { canPlaceShip, randomFleet } from "@/game/placement";
import { createRng } from "@/game/rng";
import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  Orientation,
  ShipPlacement,
} from "@/game/types";
import { BoardShell } from "./BoardShell";
import { ShipId, ShipOverlay, ShipSprite } from "./ShipSprite";
import { SoundControls } from "./useSoundManager";

const SHIP_NAMES = [
  "Carrier",
  "Battleship",
  "Cruiser",
  "Submarine",
  "Destroyer",
] as const;

const DIFFICULTIES: { value: Difficulty; label: string; blurb: string }[] = [
  { value: "easy", label: "Easy", blurb: "Fires blind" },
  { value: "medium", label: "Medium", blurb: "Hunts wounded ships" },
  { value: "hard", label: "Hard", blurb: "Predicts your fleet" },
];

export type GameMode = "classic" | "admiral";

const MODES: { value: GameMode; label: string; blurb: string }[] = [
  { value: "classic", label: "Classic", blurb: "Standard rules — one shot per turn" },
  {
    value: "admiral",
    label: "Admiral",
    blurb: "Every ship carries a special ability",
  },
];

interface DragState {
  shipId: number;
  grabIndex: number;
  pointer: { x: number; y: number };
  cell: Coordinate | null;
  origin: ShipPlacement | null;
}

function bowFrom(
  cell: Coordinate,
  grabIndex: number,
  orientation: Orientation,
): Coordinate {
  return orientation === "horizontal"
    ? { x: cell.x - grabIndex, y: cell.y }
    : { x: cell.x, y: cell.y - grabIndex };
}

function othersOf(
  placements: (ShipPlacement | null)[],
  shipId: number,
): ShipPlacement[] {
  return placements.filter(
    (p, id): p is ShipPlacement => p !== null && id !== shipId,
  );
}

export interface PlacementScreenProps {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onStart: (fleet: ShipPlacement[]) => void;
  sound?: SoundControls;
}

export function PlacementScreen({
  difficulty,
  onDifficultyChange,
  mode,
  onModeChange,
  onStart,
  sound,
}: PlacementScreenProps) {
  const [placements, setPlacements] = useState<(ShipPlacement | null)[]>(() =>
    Array.from(FLEET_LENGTHS, () => null),
  );
  const [orientations, setOrientations] = useState<Orientation[]>(() =>
    Array.from(FLEET_LENGTHS, () => "horizontal"),
  );
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    kind: "error" | "info";
  } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const placementsRef = useRef<(ShipPlacement | null)[]>(placements);
  const orientationsRef = useRef<Orientation[]>(orientations);
  const soundRef = useRef<SoundControls | undefined>(sound);

  useEffect(() => {
    placementsRef.current = placements;
    orientationsRef.current = orientations;
    soundRef.current = sound;
  });

  const cellFromPointer = useCallback(
    (px: number, py: number): Coordinate | null => {
      const el = boardRef.current;
      if (!el) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      const size = rect.width / BOARD_SIZE;
      const cell = {
        x: Math.floor((px - rect.left) / size),
        y: Math.floor((py - rect.top) / size),
      };
      return isOnBoard(cell) ? cell : null;
    },
    [],
  );

  const tryPlace = useCallback(
    (shipId: number, candidate: ShipPlacement): boolean => {
      const cells = shipCells(candidate);
      if (!cells.every(isOnBoard)) {
        setMessage({
          text: "Off the chart — ships must fit entirely on the grid.",
          kind: "error",
        });
        return false;
      }
      if (!canPlaceShip(othersOf(placementsRef.current, shipId), candidate)) {
        setMessage({
          text: "Too close — ships can't overlap or touch another ship.",
          kind: "error",
        });
        return false;
      }
      setPlacements((prev) => {
        const next = [...prev];
        next[shipId] = candidate;
        return next;
      });
      setMessage(null);
      soundRef.current?.play("click");
      return true;
    },
    [],
  );

  const startDrag = useCallback(
    (
      e: ReactPointerEvent,
      shipId: number,
      grabIndex: number,
      origin: ShipPlacement | null,
    ) => {
      e.preventDefault();
      setSelected(shipId);
      if (origin) {
        setOrientations((prev) => {
          const next = [...prev];
          next[shipId] = origin.orientation;
          return next;
        });
        setPlacements((prev) => {
          const next = [...prev];
          next[shipId] = null;
          return next;
        });
      }
      const d: DragState = {
        shipId,
        grabIndex,
        pointer: { x: e.clientX, y: e.clientY },
        cell: cellFromPointer(e.clientX, e.clientY),
        origin,
      };
      dragRef.current = d;
      setDrag(d);
    },
    [cellFromPointer],
  );

  const dragActive = drag !== null;

  useEffect(() => {
    if (!dragActive) {
      return;
    }
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      const next = {
        ...d,
        pointer: { x: e.clientX, y: e.clientY },
        cell: cellFromPointer(e.clientX, e.clientY),
      };
      dragRef.current = next;
      setDrag(next);
    };
    const restore = (d: DragState) => {
      if (d.origin) {
        setPlacements((prev) => {
          const next = [...prev];
          next[d.shipId] = d.origin;
          return next;
        });
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) {
        return;
      }
      const cell = cellFromPointer(e.clientX, e.clientY);
      if (!cell) {
        restore(d);
        return;
      }
      const orientation = orientationsRef.current[d.shipId];
      const candidate: ShipPlacement = {
        bow: bowFrom(cell, d.grabIndex, orientation),
        length: FLEET_LENGTHS[d.shipId],
        orientation,
      };
      if (!tryPlace(d.shipId, candidate)) {
        restore(d);
      }
    };
    const cancel = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d) {
        restore(d);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragActive, cellFromPointer, tryPlace]);

  const rotateSelected = () => {
    sound?.play("click");
    const placement = placements[selected];
    if (!placement) {
      setOrientations((prev) => {
        const next = [...prev];
        next[selected] =
          next[selected] === "horizontal" ? "vertical" : "horizontal";
        return next;
      });
      setMessage(null);
      return;
    }
    const rotated: ShipPlacement = {
      ...placement,
      orientation:
        placement.orientation === "horizontal" ? "vertical" : "horizontal",
    };
    if (tryPlace(selected, rotated)) {
      setOrientations((prev) => {
        const next = [...prev];
        next[selected] = rotated.orientation;
        return next;
      });
    }
  };

  const handleCellClick = (cell: Coordinate) => {
    if (placements[selected]) {
      return;
    }
    tryPlace(selected, {
      bow: cell,
      length: FLEET_LENGTHS[selected],
      orientation: orientations[selected],
    });
  };

  const randomize = () => {
    sound?.play("click");
    const fleet = randomFleet(createRng(Math.floor(Math.random() * 2 ** 32)));
    setPlacements(fleet);
    setOrientations(fleet.map((p) => p.orientation));
    setMessage(null);
  };

  const clear = () => {
    sound?.play("click");
    setPlacements(Array.from(FLEET_LENGTHS, () => null));
    setMessage(null);
  };

  const candidate: ShipPlacement | null =
    drag && drag.cell
      ? {
          bow: bowFrom(drag.cell, drag.grabIndex, orientations[drag.shipId]),
          length: FLEET_LENGTHS[drag.shipId],
          orientation: orientations[drag.shipId],
        }
      : null;
  const previewValid =
    candidate !== null &&
    drag !== null &&
    shipCells(candidate).every(isOnBoard) &&
    canPlaceShip(othersOf(placements, drag.shipId), candidate);
  const previewCells = new Set(
    candidate
      ? shipCells(candidate)
          .filter(isOnBoard)
          .map((c) => coordKey(c))
      : [],
  );

  const allPlaced = placements.every((p) => p !== null);

  return (
    <div className="flex w-full flex-col items-center gap-6 pb-24 sm:pb-0 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
      <BoardShell title="Your grid" subtitle="Deploy fleet" tone="paper">
        <div className="relative">
          <div
            ref={boardRef}
            className="grid grid-cols-10 touch-none select-none overflow-hidden rounded-xl bg-navy-950/70"
          >
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
              const cell = { x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) };
              const key = coordKey(cell);
              const inPreview = previewCells.has(key);
              let cls =
                "relative aspect-square rounded-md shadow-[inset_0_0_0_1px_rgba(6,14,28,0.55),inset_0_2px_3px_rgba(6,14,28,0.35)] transition-all duration-150 ease-out";
              if (inPreview) {
                cls += previewValid ? " bg-cyan-cta/80" : " bg-coral-500/80";
              } else {
                cls += " water-cell-light hover:brightness-125";
              }
              return (
                <div
                  key={key}
                  className={cls}
                  onClick={() => handleCellClick(cell)}
                />
              );
            })}
          </div>
          {placements.map((placement, shipId) =>
            placement ? (
              <ShipOverlay
                key={shipId}
                shipId={shipId as ShipId}
                placement={placement}
                className={`cursor-grab touch-none ${
                  selected === shipId
                    ? "[filter:drop-shadow(0_0_6px_rgba(34,211,238,0.9))]"
                    : ""
                }`}
                onPointerDown={(e) => {
                  const cell = cellFromPointer(e.clientX, e.clientY);
                  const raw = cell
                    ? placement.orientation === "horizontal"
                      ? cell.x - placement.bow.x
                      : cell.y - placement.bow.y
                    : 0;
                  const grabIndex = Math.max(
                    0,
                    Math.min(placement.length - 1, raw),
                  );
                  startDrag(e, shipId, grabIndex, placement);
                }}
              />
            ) : null,
          )}
        </div>
      </BoardShell>

      <div className="flex w-full max-w-[26rem] flex-col gap-4 lg:max-w-sm">
        <div className="animate-rise-in rounded-2xl border border-navy-line/70 bg-navy-900/85 p-4 shadow-panel">
          <h2 className="mb-3 font-display text-base font-bold tracking-wide text-lagoon-300">
            Fleet manifest
          </h2>
          <p className="mb-3 text-xs text-foam-300">
            Drag a ship onto your grid (or select it and tap a square). Ships
            can&apos;t overlap, touch, or leave the grid.
          </p>
          <ul className="flex flex-col gap-2">
            {SHIP_NAMES.map((name, shipId) => {
              const placed = placements[shipId] !== null;
              const dragging = drag?.shipId === shipId;
              return (
                <li key={shipId} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      sound?.play("click");
                      setSelected(shipId);
                    }}
                    className={`w-24 rounded-lg px-1 text-left text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 ${
                      selected === shipId
                        ? "text-cyan-cta"
                        : "text-foam-400 hover:text-foam-300"
                    }`}
                  >
                    {name}
                  </button>
                  {placed || dragging ? (
                    <span className="rounded-full bg-navy-800 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lagoon-300/80">
                      {dragging ? "Moving…" : "Deployed"}
                    </span>
                  ) : (
                    <div
                      className={`cursor-grab touch-none rounded-lg bg-gradient-to-b from-navy-700/60 to-navy-800/60 px-1 py-0.5 shadow-btn transition-transform duration-150 hover:-translate-y-0.5 ${
                        selected === shipId
                          ? "[filter:drop-shadow(0_0_5px_rgba(34,211,238,0.85))]"
                          : ""
                      }`}
                      style={{
                        width: `${FLEET_LENGTHS[shipId] * 1.6}rem`,
                        height: "1.9rem",
                      }}
                      onPointerDown={(e) => startDrag(e, shipId, 0, null)}
                    >
                      <ShipSprite shipId={shipId as ShipId} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
            <button
              type="button"
              onClick={rotateSelected}
              className="rounded-xl border border-navy-line bg-navy-800 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-foam-300 shadow-btn transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-cyan-cta/60 hover:text-cyan-cta active:scale-95"
            >
              ⟳ Rotate ({orientations[selected] === "horizontal" ? "H" : "V"})
            </button>
            <button
              type="button"
              onClick={randomize}
              className="rounded-xl border border-navy-line bg-navy-800 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-foam-300 shadow-btn transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-cyan-cta/60 hover:text-cyan-cta active:scale-95"
            >
              Random fleet
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-xl border border-navy-line bg-navy-800 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-foam-300 shadow-btn transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-cyan-cta/60 hover:text-cyan-cta active:scale-95"
            >
              Clear
            </button>
          </div>
          <p
            aria-live="polite"
            className={`mt-3 min-h-[1.25rem] text-xs font-medium ${
              message?.kind === "error" ? "text-coral-400" : "text-foam-300"
            }`}
          >
            {message?.text ?? ""}
          </p>
        </div>

        <div className="radar-panel animate-rise-in rounded-2xl border border-navy-line/70 bg-navy-900/85 p-4 shadow-panel">
          <h2 className="mb-3 font-display text-base font-bold tracking-wide text-lagoon-300">
            Rules of engagement
          </h2>
          <div className="flex gap-2">
            {MODES.map(({ value, label, blurb }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  sound?.play("click");
                  onModeChange(value);
                }}
                className={`flex-1 rounded-xl border px-2 py-2 text-center shadow-btn transition-all duration-200 ease-out active:scale-95 ${
                  mode === value
                    ? "border-cyan-cta bg-navy-700 text-cyan-cta shadow-glow-cyan"
                    : "border-navy-line bg-navy-800 text-foam-400 hover:-translate-y-0.5 hover:border-cyan-cta/50"
                }`}
              >
                <span className="block text-[11px] font-bold uppercase tracking-wider">
                  {label}
                </span>
                <span className="mt-1 block text-[10px] opacity-70">
                  {blurb}
                </span>
              </button>
            ))}
          </div>
          {mode === "admiral" && (
            <ul className="mt-3 flex flex-col gap-1 text-[10px] text-foam-400">
              <li>Carrier — recon flight reveals ship cells in a 3×3 area</li>
              <li>Battleship — one 5-shell barrage cross</li>
              <li>Cruiser — 5×5 sonar ping counts contacts, but exposes one of your cells</li>
              <li>Submarine — silently evades the first hit</li>
              <li>Destroyer — rapid fire: two shots in a turn</li>
            </ul>
          )}
        </div>

        <div className="radar-panel animate-rise-in rounded-2xl border border-navy-line/70 bg-navy-900/85 p-4 shadow-panel">
          <h2 className="mb-3 font-display text-base font-bold tracking-wide text-lagoon-300">
            Enemy commander
          </h2>
          <div className="flex gap-2">
            {DIFFICULTIES.map(({ value, label, blurb }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  sound?.play("click");
                  onDifficultyChange(value);
                }}
                className={`flex-1 rounded-xl border px-2 py-2 text-center shadow-btn transition-all duration-200 ease-out active:scale-95 ${
                  difficulty === value
                    ? "border-cyan-cta bg-navy-700 text-cyan-cta shadow-glow-cyan"
                    : "border-navy-line bg-navy-800 text-foam-400 hover:-translate-y-0.5 hover:border-cyan-cta/50"
                }`}
              >
                <span className="block text-[11px] font-bold uppercase tracking-wider">
                  {label}
                </span>
                <span className="mt-1 block text-[10px] opacity-70">
                  {blurb}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!allPlaced}
          onClick={() => {
            sound?.play("click");
            onStart(placements.filter((p): p is ShipPlacement => p !== null));
          }}
          className="hidden rounded-xl bg-gradient-to-b from-amber-cta to-amber-deep px-4 py-3 font-display text-base font-bold tracking-wide text-navy-950 shadow-glow-amber transition-all duration-200 ease-out hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-navy-800 disabled:text-foam-400/40 disabled:shadow-none sm:block"
        >
          {allPlaced ? "Commence battle" : "Deploy all ships to begin"}
        </button>
      </div>

      {/* Mobile bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-navy-line/60 bg-navy-950/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:hidden">
        <button
          type="button"
          onClick={rotateSelected}
          className="flex-1 rounded-xl border border-navy-line bg-navy-800 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-foam-300 shadow-btn transition-all duration-200 ease-out active:scale-95"
        >
          ⟳ Rotate
        </button>
        <button
          type="button"
          onClick={randomize}
          className="flex-1 rounded-xl border border-navy-line bg-navy-800 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-foam-300 shadow-btn transition-all duration-200 ease-out active:scale-95"
        >
          Random
        </button>
        <button
          type="button"
          disabled={!allPlaced}
          onClick={() => {
            sound?.play("click");
            onStart(placements.filter((p): p is ShipPlacement => p !== null));
          }}
          className="flex-[1.4] rounded-xl bg-gradient-to-b from-amber-cta to-amber-deep px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-navy-950 shadow-glow-amber transition-all duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-navy-800 disabled:text-foam-400/40 disabled:shadow-none"
        >
          {allPlaced ? "Battle!" : "Deploy all"}
        </button>
      </div>

      {drag &&
        (() => {
          const length = FLEET_LENGTHS[drag.shipId];
          const horizontal = orientations[drag.shipId] === "horizontal";
          const cellPx = 30;
          return (
            <div
              className="pointer-events-none fixed z-50 opacity-90 [filter:drop-shadow(0_2px_6px_rgba(5,13,23,0.7))]"
              style={{
                left: drag.pointer.x + 12,
                top: drag.pointer.y + 12,
                width: horizontal ? length * cellPx : cellPx,
                height: horizontal ? cellPx : length * cellPx,
              }}
            >
              <div
                style={{
                  width: horizontal ? "100%" : `${length * 100}%`,
                  height: horizontal ? "100%" : `${100 / length}%`,
                  transformOrigin: "top left",
                  transform: horizontal
                    ? undefined
                    : "rotate(90deg) translateY(-100%)",
                }}
              >
                <ShipSprite shipId={drag.shipId as ShipId} />
              </div>
            </div>
          );
        })()}
    </div>
  );
}
