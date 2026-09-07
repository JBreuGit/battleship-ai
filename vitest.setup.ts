import "@testing-library/jest-dom/vitest";

// Game tokens are sealed with this key in tests; production sets its own.
process.env.GAME_SECRET ??= "vitest-only-game-secret-do-not-use-in-production";
