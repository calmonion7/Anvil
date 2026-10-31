import { defineConfig } from "@playwright/test";

// 실제 Electron 앱을 띄우는 스모크(데스크톱 앱 1/6 DoD 3). 화면은 build/를 서버가 낸다 — 먼저 `npm run build`.
// 브라우저 화면 e2e(playwright.config.ts · e2e/)와 따로 돈다: `npm run test:app`.
export default defineConfig({
  testDir: "e2e-app",
  timeout: 60_000,
  workers: 1,
});
