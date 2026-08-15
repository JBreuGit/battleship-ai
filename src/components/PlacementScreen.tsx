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
  onStart: (fleet: ShipPlacement[]) => void;
}

export function PlacementScreen({
  difficulty,
  onDifficultyChange,
  onStart,
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

  useEffect(() => {
    placementsRef.current = placements;
    orientationsRef.current = orientations;
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
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragActive, cellFromPointer, tryPlace]);

  const rotateSelected = () => {
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
    const fleet = randomFleet(createRng(Math.floor(Math.random() * 2 ** 32)));
    setPlacements(fleet);
    setOrientations(fleet.map((p) => p.orientation));
    setMessage(null);
  };

  const clear = () => {
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
    <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
      <BoardShell title="Your grid" subtitle="Deploy fleet" tone="paper">
        <div className="relative">
          <div
            ref={boardRef}
            className="grid grid-cols-10 touch-none select-none rounded-sm border border-paper-line bg-paper-200"
          >
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
              const cell = { x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) };
              const key = coordKey(cell);
              const inPreview = previewCells.has(key);
              let cls =
                "relative aspect-square border border-paper-line/50 transition-colors";
              if (inPreview) {
                cls += previewValid ? " bg-accent-400/80" : " bg-ember-500/80";
              } else {
                cls += " hover:bg-paper-300/70";
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
                    ? "[filter:drop-shadow(0_0_5px_rgba(255,180,84,0.85))]"
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
        <div className="rounded-md border border-navy-line bg-navy-900/80 p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-accent-400">
            Fleet manifest
          </h2>
          <p className="mb-3 text-xs text-foam-400/80">
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
                    onClick={() => setSelected(shipId)}
                    className={`w-24 text-left font-mono text-[11px] uppercase tracking-wider ${
                      selected === shipId
                        ? "text-accent-400"
                        : "text-foam-400/80"
                    }`}
                  >
                    {name}
                  </button>
                  {placed || dragging ? (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-foam-400/50">
                      {dragging ? "Moving…" : "Deployed"}
                    </span>
                  ) : (
                    <div
                      className={`cursor-grab touch-none rounded-sm py-0.5 ${
                        selected === shipId
                          ? "[filter:drop-shadow(0_0_4px_rgba(255,180,84,0.8))]"
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={rotateSelected}
              className="rounded border border-navy-line bg-navy-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foam-300 transition-colors hover:border-accent-400/60 hover:text-accent-300"
            >
              ⟳ Rotate ({orientations[selected] === "horizontal" ? "H" : "V"})
            </button>
            <button
              type="button"
              onClick={randomize}
              className="rounded border border-navy-line bg-navy-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foam-300 transition-colors hover:border-accent-400/60 hover:text-accent-300"
            >
              Random fleet
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded border border-navy-line bg-navy-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foam-300 transition-colors hover:border-accent-400/60 hover:text-accent-300"
            >
              Clear
            </button>
          </div>
          <p
            aria-live="polite"
            className={`mt-3 min-h-[1.25rem] text-xs ${
              message?.kind === "error" ? "text-ember-400" : "text-foam-300"
            }`}
          >
            {message?.text ?? ""}
          </p>
        </div>

        <div className="rounded-md border border-navy-line bg-navy-900/80 p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-accent-400">
            Enemy commander
          </h2>
          <div className="flex gap-2">
            {DIFFICULTIES.map(({ value, label, blurb }) => (
              <button
                key={value}
                type="button"
                onClick={() => onDifficultyChange(value)}
                className={`flex-1 rounded border px-2 py-2 text-center transition-colors ${
                  difficulty === value
                    ? "border-accent-400 bg-navy-700 text-accent-300"
                    : "border-navy-line bg-navy-800 text-foam-400/80 hover:border-accent-400/50"
                }`}
              >
                <span className="block font-mono text-[11px] font-semibold uppercase tracking-widest">
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
          onClick={() =>
            onStart(placements.filter((p): p is ShipPlacement => p !== null))
          }
          className="rounded-md border border-accent-500 bg-accent-500/15 px-4 py-3 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-accent-300 transition-colors hover:bg-accent-500/30 disabled:cursor-not-allowed disabled:border-navy-line disabled:bg-navy-800 disabled:text-foam-400/40"
        >
          {allPlaced ? "Commence battle" : "Deploy all ships to begin"}
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
