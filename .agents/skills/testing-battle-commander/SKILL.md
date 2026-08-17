---
name: testing-battle-commander
description: How to run and UI-test the battleship-ai Next.js app, including the Battle Commander campaign mode, upgrades, and responsive checks.
---

# Testing battleship-ai / Battle Commander campaign

## Run the app
- `source ~/.nvm/nvm.sh && nvm use 22 && npm run dev` → http://localhost:3000 (deps via `npm install`).
- Beware dev-server hot reloads: they reset in-memory game state mid-battle. Avoid editing files while a battle is in progress.

## Campaign state
- Persistent state lives in localStorage key `battleship-campaign-v1`.
- Seed for fast upgrade testing, then reload:
  `localStorage.setItem("battleship-campaign-v1", JSON.stringify({version:1,level:4,completed:false,records:{},upgrades:{0:1,1:1,2:1,3:1,4:1},unspentUpgradePoints:2}))`
- Ship indices 0–4 = Carrier, Battleship, Cruiser, Submarine, Destroyer. Tier 2 = Rapid-Fire, Tier 3 = Heavy Shell (2×2), Tier 4 = Guided Shot.

## UI flow
- Splash → "Deploy Fleet" → placement/mode screen (Classic/Admiral panels, Easy/Medium/Hard, gold Battle Commander card at bottom).
- Battle Commander card → Fleet Command/Armory (rank avatar, 1–20 progress map, 5 armory cards, "Start engagement N", Exit/Reset).
- Board fire buttons have accessible labels `Fire at A1` … `Fire at J10` — use them to target shots deterministically.
- Playing a level-1 battle to a win takes ~20–40 manual shots; the AI fleet is hidden, so use parity search and follow up on hits.

## Responsive checks
- Chrome's window min-width clamps around ~530px, so 375px must be tested via DevTools device toolbar (F12 → Ctrl+Shift+M → set width 375).

## Devin Secrets Needed
None.
