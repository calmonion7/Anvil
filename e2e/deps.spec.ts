import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 자동으로 설치할 수 없는 준비물·늦게 온 확인 — 띠는 「준비 중」 화면으로 바뀌었다(데스크톱 앱 3/6, 자동 설치 흐름은 setup.spec.ts).
// 앱 안 [설치]·[로그인] 버튼은 여전히 없다: 설치는 버튼 없이 시작되고, 로그인은 첫 세션 안에서 claude가 받는다.
const missing = { needs: ["claude"], message: "필요: claude CLI", installable: true };

test("자동으로 설치할 수 없는 준비물(node)은 「준비 중」에 안내 문구와 [다시 시도]만 — [설치]·[로그인] 버튼은 없다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = { needs: ["node"], message: "필요: node", installable: false, platform: "macos" };
  await page.goto("/");
  await expect.poll(() => ipc.calls.some((c) => c.cmd === "deps_install")).toBe(true);
  await ipc.emit("deps_progress", { running: false, items: [] }); // 서버가 설치할 항목이 없었다
  await expect(page.locator(".prepare")).toContainText("필요: node");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(설치|로그인)$/ })).toHaveCount(0);
});

test("먼저 시작한 확인이 늦게 와도 나중 확인의 결과가 남는다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "준비 중" })).toBeVisible();
  ipc.hold();
  await ipc.emit("deps_progress", { running: false, items: [] }); // 확인 0(설치가 끝나 다시 확인)
  await page.getByRole("button", { name: "⚙ 설정" }).click();
  await page.getByLabel("언어").selectOption("ko"); // 확인 1
  await expect.poll(() => ipc.pending.length).toBe(2);
  ipc.pending[1]({ needs: [], message: null, installable: false });
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
  ipc.pending[0]({ needs: ["claude"], message: "필요: 옛 결과", installable: true });
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "준비 중" })).toHaveCount(0);
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
});

// v0.1.5 — [세션 열기] 직후 터미널에 초점이 가 바로 타이핑된다(첫 실행 신뢰 질문)
test("[세션 열기] 뒤 터미널에 초점이 간다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await page.locator(".term-plan").getByRole("button", { name: "세션 열기" }).click();
  await ipc.emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } });
  await expect(page.locator(".term-plan .xterm-helper-textarea")).toBeFocused();
});
