# Battleship AI

An online, single-player Battleship game played against an AI opponent.

Built with [Next.js](https://nextjs.org) (App Router), TypeScript, and Tailwind CSS.

## Getting Started

Requires Node.js >= 20.19 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

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
Test files live next to the code they cover as `*.test.ts(x)`.

## Continuous Integration

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and a
production build on every push and pull request.
