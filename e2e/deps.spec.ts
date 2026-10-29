import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 준비물 띠 — 빠진 항목과 [다시 확인]만(앱 안 [설치]·[로그인]은 없앴다: 설치는 한 줄 설치 스크립트 몫, ADR 261029-121641)
const missing = { needs: ["claude"], message: "필요: claude CLI", installable: false };

test("node가 빠지면 띠에 뜨고 [설치]·[로그인] 버튼은 없다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = { needs: ["node"], message: "필요: node", installable: false, platform: "macos" };
  await page.goto("/");
  const band = page.locator(".band.top");
  await expect(band).toContainText("필요: node");
  await expect(band.getByRole("button", { name: "다시 확인" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^(설치|다시 시도|로그인)$/ })).toHaveCount(0);
});

// v0.1.7 — 확인이 도는 동안 띠는 '확인 중…'을 보이고 옛 '필요: …'를 숨기며 버튼을 끈다
test("[다시 확인] 응답에서 준비물이 다 갖춰지면 띠가 사라진다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  const band = page.locator(".band.top");
  await expect(band).toContainText("필요: claude CLI");
  ipc.hold();
  await band.getByRole("button", { name: "다시 확인" }).click();
  await expect(band).toContainText("확인 중…");
  await expect(band).not.toContainText("필요: claude CLI");
  await expect(band.getByRole("button", { name: "다시 확인" })).toBeDisabled();
  ipc.pending[0]({ needs: [], message: null, installable: false });
  await expect(band).toHaveCount(0);
});

test("[다시 확인]도 응답 전에는 '확인 중…'을 보인다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  const band = page.locator(".band.top");
  await expect(band).toContainText("필요: claude CLI");
  ipc.hold();
  await band.getByRole("button", { name: "다시 확인" }).click();
  await expect(band).toContainText("확인 중…");
  await expect(band).not.toContainText("필요: claude CLI");
  await expect(band.getByRole("button", { name: "다시 확인" })).toBeDisabled();
  ipc.pending[0]({ needs: ["git"], message: "필요: git", installable: false });
  await expect(band).toContainText("필요: git");
  await expect(band).not.toContainText("확인 중…");
});

test("먼저 시작한 확인이 늦게 와도 나중 확인의 결과가 남는다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  const band = page.locator(".band.top");
  await expect(band).toContainText("필요: claude CLI");
  ipc.hold();
  await band.getByRole("button", { name: "다시 확인" }).click(); // 확인 0
  // 버튼은 꺼져 있으니 다른 확인 경로(설정 > 언어 변경)로 두 번째 확인을 띄운다
  await page.getByRole("button", { name: "⚙ 설정" }).click();
  await page.getByLabel("언어").selectOption("ko"); // 확인 1
  await expect.poll(() => ipc.pending.length).toBe(2);
  ipc.pending[1]({ needs: ["git"], message: "필요: 새 결과", installable: false });
  await expect(band).toContainText("필요: 새 결과");
  ipc.pending[0]({ needs: ["claude"], message: "필요: 옛 결과", installable: false });
  await page.waitForTimeout(100);
  await expect(band).toContainText("필요: 새 결과");
  await expect(band).not.toContainText("필요: 옛 결과");
});

// v0.1.5 — [세션 열기] 직후 터미널에 초점이 가 바로 타이핑된다(첫 실행 신뢰 질문)
test("[세션 열기] 뒤 터미널에 초점이 간다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await page.locator(".term-plan").getByRole("button", { name: "세션 열기" }).click();
  await ipc.emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } });
  await expect(page.locator(".term-plan .xterm-helper-textarea")).toBeFocused();
});
