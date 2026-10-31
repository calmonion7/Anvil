import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 첫 실행 자동 설치(데스크톱 앱 3/6) — 준비물이 빠졌으면 버튼 없이 설치를 시작하고, 보드 대신 「준비 중」 화면이 진행·실패·완료를 보여 준다.

const missing = { needs: ["claude", "forge"], message: "필요: claude CLI · forge 플러그인", installable: true, platform: "macos" };
const item = (need: string, label: string, state: string, detail: string | null = null) => ({ need, label, state, detail });

test("준비물이 빠졌으면 버튼 없이 설치를 시작하고 「준비 중」에 항목별 진행을 보인 뒤, 끝나면 보드로 넘어간다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "준비 중" })).toBeVisible();
  await expect.poll(() => ipc.calls.filter((c) => c.cmd === "deps_install").length).toBe(1);
  await expect(page.locator('[data-node="backlog"]')).toHaveCount(0); // 보드 대신(사이드바는 남는다)

  await ipc.emit("deps_progress", { running: true, items: [item("claude", "claude CLI", "running"), item("forge", "forge 플러그인", "pending")] });
  await expect(page.getByRole("listitem").filter({ hasText: "claude CLI" })).toContainText("설치 중");
  await expect(page.getByRole("listitem").filter({ hasText: "forge 플러그인" })).toContainText("대기");

  ipc.deps = { needs: [], message: null, installable: false, platform: "macos" };
  await ipc.emit("deps_progress", { running: false, items: [item("claude", "claude CLI", "ok"), item("forge", "forge 플러그인", "ok")] });
  await expect(page.getByRole("heading", { name: "준비 중" })).toHaveCount(0);
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
});

test("설치가 실패하면 원문 오류 일부와 [다시 시도]를 보이고, 누르면 다시 설치한다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  await expect.poll(() => ipc.calls.filter((c) => c.cmd === "deps_install").length).toBe(1);
  await ipc.emit("deps_progress", {
    running: false,
    items: [item("claude", "claude CLI", "failed", "curl: (6) Could not resolve host: claude.ai"), item("forge", "forge 플러그인", "skipped", "claude CLI이(가) 먼저 필요합니다")],
  });
  await expect(page.getByText("Could not resolve host: claude.ai")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "forge 플러그인" })).toContainText("건너뜀");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => ipc.calls.filter((c) => c.cmd === "deps_install").length).toBe(2);
});

test("준비물이 다 있으면 「준비 중」 없이 보드가 뜨고 설치를 부르지 않는다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "준비 중" })).toHaveCount(0);
  expect(ipc.calls.some((c) => c.cmd === "deps_install")).toBe(false);
});

// 앱 전체는 360px에서 원래 가로로 넘친다(보드만 있을 때도 문서 폭 987px — 2026-10-31 실측). 여기서는 「준비 중」 화면 자체만 본다.
test("좁은 폭(360px)에서도 「준비 중」의 항목과 긴 오류가 화면 안에서 줄바꿈되고 [다시 시도]가 보인다", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  const ipc = await mockIpc(page);
  ipc.deps = missing;
  await page.goto("/");
  await expect.poll(() => ipc.calls.some((c) => c.cmd === "deps_install")).toBe(true);
  const long = "error: " + "x".repeat(300);
  await ipc.emit("deps_progress", { running: false, items: [item("claude", "claude CLI", "failed", long)] });
  const retry = page.getByRole("button", { name: "다시 시도" });
  await expect(retry).toBeInViewport();
  const box = page.locator(".prepare .box");
  const overflow = await box.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
});
