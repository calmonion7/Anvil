import { defineConfig } from "@playwright/test";

// 프런트만 브라우저에 띄우고 Node 서버(/api·/ws)는 e2e/mock-ipc.ts가 가짜로 응답한다.
// 포트 1430 — tauri dev가 쓰는 1420과 겹치지 않게. 화면 언어 자동(브라우저 언어)이라 spec 문구에 맞춰 한국어로 고정.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:1430", viewport: { width: 1280, height: 820 }, locale: "ko-KR" },
  webServer: {
    command: "npx vite dev --port 1430 --strictPort",
    url: "http://localhost:1430",
    reuseExistingServer: false,
  },
});
