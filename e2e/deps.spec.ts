import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 준비물 띠 — [다시 확인]은 직전 [설치]의 결과·오류를 지우고 새 상태만 보인다(v0.1.4)
const missing = { needs: ["tmux"], message: "필요: tmux", installable: true };

test("[다시 확인]이 항목별 설치 결과를 지운다", async ({ page }) => {
  await mockIpc(page);
  await page.addInitScript((deps) => {
    const w = window as any;
    w.__deps = deps;
    w.__depsInstall = [{ need: "xcode", label: "개발자 도구", outcome: "started", detail: null }];
  }, missing);
  await page.goto("/");
  const band = page.locator(".band.top");
  await band.getByRole("button", { name: "설치" }).click();
  await expect(band.locator("ul.steps")).toContainText("개발자 도구");
  await band.getByRole("button", { name: "다시 확인" }).click();
  await expect(band.locator("ul.steps")).toHaveCount(0);
  await expect(band).toContainText("필요: tmux");
});

test("[다시 확인]이 설치 오류 문구를 지운다", async ({ page }) => {
  await mockIpc(page);
  await page.addInitScript((deps) => {
    const w = window as any;
    w.__deps = deps;
    w.__depsInstallError = "설치 스크립트 오류";
  }, missing);
  await page.goto("/");
  const band = page.locator(".band.top");
  await band.getByRole("button", { name: "설치" }).click();
  await expect(band).toContainText("설치 스크립트 오류");
  await band.getByRole("button", { name: "다시 확인" }).click();
  await expect(band).not.toContainText("설치 스크립트 오류");
  await expect(band).toContainText("필요: tmux");
});

// v0.1.5 — node 준비물이 띠에 뜨고 [설치] 결과가 항목별로 보인다
test("node가 빠지면 띠에 뜨고 [설치] 결과에 node 항목이 보인다", async ({ page }) => {
  await mockIpc(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__deps = { needs: ["node"], message: "필요: node", installable: true };
    w.__depsInstall = [{ need: "node", label: "node", outcome: "failed", detail: "shasum 불일치" }];
  });
  await page.goto("/");
  const band = page.locator(".band.top");
  await expect(band).toContainText("필요: node");
  await band.getByRole("button", { name: "설치" }).click();
  await expect(band.locator("ul.steps")).toContainText("node");
  await expect(band.locator("ul.steps")).toContainText("shasum 불일치");
});

// v0.1.5 — [세션 열기] 직후 터미널에 초점이 가 바로 타이핑된다(첫 실행 신뢰 질문)
test("[세션 열기] 뒤 터미널에 초점이 간다", async ({ page }) => {
  await mockIpc(page);
  await page.goto("/");
  await page.locator(".term-plan").getByRole("button", { name: "세션 열기" }).click();
  await page.evaluate(() => (window as any).__emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } }));
  await expect(page.locator(".term-plan .xterm-helper-textarea")).toBeFocused();
});
