// Windows 러너 전용 — 브라우저를 띄우지 않고 테스트 빌드의 웹뷰에 CDP로 붙는다(app.mjs).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  workers: 1,
  // 설치 단계가 네트워크로 node·claude·forge를 받는다
  timeout: 15 * 60 * 1000,
  reporter: [["list"]],
});
