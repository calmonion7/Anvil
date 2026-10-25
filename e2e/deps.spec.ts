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

// v0.1.6 — Linux·WSL은 외부 로그인 창이 없다: claude를 깔면 '세션을 열면 로그인 안내' 문구만, [로그인] 버튼 없음
test("macOS가 아니면 claude 설치 뒤 로그인 버튼 없이 안내만 보인다", async ({ page }) => {
  await mockIpc(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__deps = { needs: ["claude"], message: "필요: claude CLI", installable: true, platform: "linux" };
    w.__depsInstall = [{ need: "claude", label: "claude CLI", outcome: "ok", detail: null }];
  });
  await page.goto("/");
  await page.locator(".band.top").getByRole("button", { name: "설치" }).click();
  // 준비물 띠의 항목 줄에도 같은 글자가 있어 ✕가 없는 띠(로그인 띠)만
  const login = page.locator(".band.top", { hasText: "claude CLI 설치됨", hasNot: page.locator(".crit") });
  await expect(login).toContainText("Anvil에서 세션을 열면 claude가 로그인을 안내합니다");
  await expect(login.getByRole("button", { name: "로그인" })).toHaveCount(0);
});

test("macOS는 claude 설치 뒤 [로그인] 버튼이 그대로 보인다", async ({ page }) => {
  await mockIpc(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__deps = { needs: ["claude"], message: "필요: claude CLI", installable: true, platform: "macos" };
    w.__depsInstall = [{ need: "claude", label: "claude CLI", outcome: "ok", detail: null }];
  });
  await page.goto("/");
  await page.locator(".band.top").getByRole("button", { name: "설치" }).click();
  await expect(page.locator(".band.top", { hasText: "claude CLI 설치됨", hasNot: page.locator(".crit") }).getByRole("button", { name: "로그인" })).toBeVisible();
});

// v0.1.5 — [세션 열기] 직후 터미널에 초점이 가 바로 타이핑된다(첫 실행 신뢰 질문)
test("[세션 열기] 뒤 터미널에 초점이 간다", async ({ page }) => {
  await mockIpc(page);
  await page.goto("/");
  await page.locator(".term-plan").getByRole("button", { name: "세션 열기" }).click();
  await page.evaluate(() => (window as any).__emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } }));
  await expect(page.locator(".term-plan .xterm-helper-textarea")).toBeFocused();
});
