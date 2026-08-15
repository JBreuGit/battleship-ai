# Battleship AI

A browser-based, single-player Battleship game played against a computer
opponent, styled as a naval fire-control console.

**Play it live: https://battleship-ai-ruddy.vercel.app**

You place your fleet of five ships on a 10×10 grid (drag them onto the board,
rotate them, or let the game place them randomly), pick a difficulty — Easy,
Medium, or Hard — and take turns exchanging fire with the computer until one
fleet is sunk. Hits, misses, and sinkings each have their own animations and
naval sound effects (with a sound on/off toggle), and the game works on both
laptop and phone screens.

There are two ways to play:

- **Classic** — standard Battleship rules.
- **Admiral** — every ship class has a limited-use special ability
  (carrier recon flights, battleship barrage, cruiser active sonar,
  submarine silent running, destroyer rapid fire). The computer uses the
  same abilities against you.

Built with [Next.js](https://nextjs.org) (App Router), TypeScript, and
Tailwind CSS.

## Known bugs, found and fixed

A full quality-check pass was done on the game — see [BUGS.md](BUGS.md) for
every bug that was found, why it happened, and how it was fixed.

## Running it on your own computer

Requires [Node.js](https://nodejs.org) 22 (see `.nvmrc`).

```bash
git clone https://github.com/JBreuGit/battleship-ai.git
cd battleship-ai
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the development server         |
| `npm run build`     | Build for production                 |
| `npm start`         | Run the production build             |
| `npm test`          | Run tests once (Vitest)              |
| `npm run test:watch`| Run tests in watch mode              |
| `npm run lint`      | Lint with ESLint                     |
| `npm run typecheck` | Type-check with the TypeScript compiler |

## Testing

Tests are written with [Vitest](https://vitest.dev) and
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
Test files live next to the code they cover as `*.test.ts(x)`. They cover the
game rules, the AI (including 200-game simulations per difficulty), and full
start-to-finish games in both modes.

## Continuous Integration and Deployment

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and a
production build on every push and pull request. The `main` branch deploys
automatically to Vercel at https://battleship-ai-ruddy.vercel.app.

## License

[MIT](LICENSE)
