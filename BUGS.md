# Bugs Found and Fixed

This file documents every real bug found during a full quality-check pass of
the game. The QA pass covered: rapid repeated clicking, double-clicking,
resizing the browser mid-game, refreshing mid-game, placing ships right at
the edges of the board, playing complete games to the end in both Classic and
Admiral mode, and pressing "Play again" — plus new automated tests that play
full games start to finish (one where the human wins, one where the computer
wins).

## Bug 1: Sinking one of the two length-3 ships could cross off (and draw) the wrong ship

**What was wrong.** The fleet contains two ships of the same length: the
cruiser and the submarine are both 3 squares long. When a length-3 ship sank,
the fleet-status panel could cross off the wrong one, and the wreck drawn on
the board could show the wrong ship's artwork. For example, sinking the
submarine first could cross the cruiser off the fleet list and draw a cruiser
wreck where the submarine actually was. The same problem existed in both
Classic and Admiral mode, for both your fleet and the enemy's.

**Why it happened.** When a ship sank, the game only recorded its *length*
(e.g. "a 3-long ship sank") instead of *which* ship it was. The fleet-status
panel then crossed off the first ship in the list with a matching length, and
the wreck artwork was picked by matching sinking order against the fleet list
— both of which guess wrong whenever the submarine sinks before the cruiser.

**How it was fixed.** The game engine already knows exactly which ship
occupies any square (`Board.shipIdAt`). Sinking now records the ship's actual
fleet index alongside its footprint, the fleet-status panel crosses off ships
by index instead of by length, and each wreck stores which ship it is so the
right hull artwork is always drawn over the right squares.

**Test coverage.** A regression test renders the fleet status with only the
submarine sunk and asserts the submarine — not the cruiser — is crossed off.
The new full-game tests also sink every ship and verify the end state.

## Bug 2: A cancelled drag could leave a ship stuck off the board

**What was wrong.** On the placement screen, if a drag was interrupted by the
browser instead of ending normally — which happens on touch screens when the
OS takes over the gesture (e.g. an incoming notification, a palm touch, or
the browser deciding the gesture is a scroll) — the ship being dragged was
never put back. It vanished from the dock and was not placed on the board, so
the fleet could no longer be fully deployed without refreshing the page.

**Why it happened.** The drag logic listened for `pointermove` and
`pointerup` but not `pointercancel`, the event browsers fire when they abort
a pointer interaction. On cancellation the ship had already been picked up
(removed from its old spot) but no code path ever restored it.

**How it was fixed.** The placement screen now also listens for
`pointercancel` and treats it like dropping the ship in an invalid spot: the
drag state is cleared and the ship is restored to wherever it came from (its
previous board position or the dock).

## Things actively tested that turned out to work correctly

For completeness, these suspected failure modes were tested and no bug was
found — no fix was needed:

- **Rapid clicking / double-clicking during battle** cannot fire twice in one
  turn or steal the enemy's turn; input is locked while a shot resolves.
- **The computer never re-targets a square it already fired at**, on any
  difficulty. Verified by the full-game tests (every AI shot is unique) and
  the existing 200-game simulation suite.
- **Neither side ever gets an extra turn.** The full-game tests assert one
  shot per side per round for entire games in both modes.
- **Firing at an already-shot square** is ignored with a "shot already
  fired at that square" notice, in both modes.
- **Ships placed right at the board edges** (including corners) are accepted,
  and rotating a ship near an edge that would push it off the board is
  rejected with clear feedback instead of breaking the layout.
- **Resizing the browser mid-game** (down to phone width and back) keeps the
  game fully playable.
- **Refreshing mid-game** returns cleanly to the placement screen with no
  stale state.
- **"Play again" fully resets the game**: fresh placement screen, empty
  boards, zeroed shot counters, and new AI state in both modes.
