import { test, expect, type Page } from "@playwright/test";
import { mockIpc, alpha } from "./mock-ipc";

// 흐름도(FlowBoard): 노드 건수 · 세션 상태 → 흐르는 화살표 · .forge 변화 → 펄스+로그 · 동작 줄이기 · 어두움 고정

const edge = (page: Page, e: string) => page.locator(`.edge[data-edge="${e}"]`);
const emit = (page: Page, event: string, payload: unknown) =>
  page.evaluate(([ev, p]) => (window as any).__emit(ev, p), [event, payload] as const);
const runWorking = { "/p/alpha-run": { state: "working", sessionId: null, alive: true } };

test.beforeEach(async ({ page }) => {
  await mockIpc(page);
  await page.goto("/");
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
});

test("노드 건수는 스냅샷 값", async ({ page }) => {
  await expect(page.locator('[data-node="backlog"]')).toHaveText(/백로그 2$/);
  await expect(page.locator('[data-node="done"]')).toHaveText(/최근 완료 1$/);
  await expect(page.locator('[data-node="followups"]')).toHaveText(/후속후보 2$/);
  await expect(page.locator('[data-node="run"]')).toContainText("#9");
});

test("실행 세션 작업 중 → 실행 화살표가 흐르고, 종료되면 멈춤", async ({ page }) => {
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "idle");
  await emit(page, "sessions", runWorking);
  await expect(edge(page, "e2")).toHaveAttribute("data-flow", "active");
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "active");
  await expect(edge(page, "e1")).toHaveAttribute("data-flow", "idle");
  const anim = await edge(page, "e3").locator(".dots").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toBe("none");
  await expect(page.locator(".log")).toContainText("실행 세션");

  await emit(page, "sessions", { "/p/alpha-run": { state: "ended", sessionId: null, alive: false } });
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "idle");
});

test("백로그가 늘면 계획→백로그 펄스 한 번 + 로그 한 줄", async ({ page }) => {
  await expect(edge(page, "e1").locator(".pulse")).toHaveCount(0);
  await expect(page.locator(".log .empty")).toBeVisible();
  const more = { ...alpha, backlog: [...alpha.backlog, { ...alpha.backlog[0], task: 12, slug: "b12", path: ".forge/backlog/b12.md" }] };
  await emit(page, "snapshot", more);
  await expect(page.locator('[data-node="backlog"]')).toHaveText(/백로그 3$/);
  await expect(edge(page, "e1").locator(".pulse")).toHaveCount(1);
  await expect(page.locator(".log li")).toHaveCount(1);
  await expect(page.locator(".log li").first()).toContainText("백로그 +1");
});

test("완료가 늘면 실행→완료 펄스 + 로그", async ({ page }) => {
  await emit(page, "snapshot", { ...alpha, doneTotal: 2 });
  await expect(edge(page, "e3").locator(".pulse")).toHaveCount(1);
  await expect(page.locator(".log li").first()).toContainText("봉인 +1");
});

test("동작 줄이기 설정이면 애니메이션 없음", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await emit(page, "sessions", runWorking);
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "active");
  const anim = await edge(page, "e3").locator(".dots").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe("none");
});

test("노드 클릭은 기존 목록 팝업을 연다", async ({ page }) => {
  await page.locator('[data-node="backlog"]').click();
  await expect(page.getByRole("dialog", { name: "백로그" })).toBeVisible();
});

test("OS가 밝음이어도 어두운 배경", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(13, 13, 13)");
});
