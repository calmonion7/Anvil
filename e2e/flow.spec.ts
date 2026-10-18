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
  await expect(page.locator('[data-node="run"]')).not.toContainText("#9"); // 「지금」 띠와 중복이라 뺀다
});

test("실행 세션 작업 중 → 실행 화살표가 흐르고, 종료되면 멈춤", async ({ page }) => {
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "idle");
  await emit(page, "sessions", runWorking);
  await expect(edge(page, "e2")).toHaveAttribute("data-flow", "active");
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "active");
  await expect(edge(page, "e1")).toHaveAttribute("data-flow", "idle");
  const anim = await edge(page, "e3").locator(".dots").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toBe("none");

  await emit(page, "sessions", { "/p/alpha-run": { state: "ended", sessionId: null, alive: false } });
  await expect(edge(page, "e3")).toHaveAttribute("data-flow", "idle");
});

test("백로그가 늘면 계획→백로그 펄스 한 번", async ({ page }) => {
  await expect(edge(page, "e1").locator(".pulse")).toHaveCount(0);
  const more = { ...alpha, backlog: [...alpha.backlog, { ...alpha.backlog[0], task: 12, slug: "b12", path: ".forge/backlog/b12.md" }] };
  await emit(page, "snapshot", more);
  await expect(page.locator('[data-node="backlog"]')).toHaveText(/백로그 3$/);
  await expect(edge(page, "e1").locator(".pulse")).toHaveCount(1);
});

test("완료가 늘면 실행→완료 펄스", async ({ page }) => {
  await emit(page, "snapshot", { ...alpha, doneTotal: 2 });
  await expect(edge(page, "e3").locator(".pulse")).toHaveCount(1);
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

test("후속후보가 줄면 계획 세션으로 돌아가는 루프에 펄스", async ({ page }) => {
  await expect(page.locator(".loopback")).toBeVisible();
  await emit(page, "snapshot", { ...alpha, followups: alpha.followups.slice(1) });
  await expect(page.locator('.loopback[data-edge="e5"] .pulse')).toHaveCount(1);
});

test("터미널 유입 띠: 작업 중이면 흐르고, 보드 버튼이 명령을 채우면 펄스", async ({ page }) => {
  await expect(page.locator(".feed.run")).toHaveAttribute("data-flow", "idle");
  await emit(page, "sessions", runWorking);
  await expect(page.locator(".feed.run")).toHaveAttribute("data-flow", "active");
  await emit(page, "sessions", {});
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.locator(".feed.run .fpulse")).toHaveCount(1);
  await expect(page.locator(".feed.plan .fpulse")).toHaveCount(0);
});

test("로그 영역 없음 · 흐름도가 맨 위, 열 머리에 계획·지금 정보", async ({ page }) => {
  await expect(page.locator(".log")).toHaveCount(0);
  const flow = (await page.locator(".flow").boundingBox())!;
  const now = (await page.locator(".info-run .band").boundingBox())!;
  expect(now.y).toBeGreaterThan(flow.y + flow.height - 1);
  await expect(page.locator(".info-run")).toContainText("#9");
  await expect(page.locator(".info-run")).toContainText("활성 작업");
  await expect(page.locator(".info-plan .pband")).toContainText("#11");
  await expect(page.locator(".info-plan .pband")).toContainText("백로그 열하나");
  // 두 열 머리 높이가 같아야 아래 터미널 머리줄이 나란하다
  const ph = (await page.locator(".info-plan .pband").boundingBox())!.height;
  const rh = (await page.locator(".info-run .band").boundingBox())!.height;
  expect(Math.abs(ph - rh)).toBeLessThanOrEqual(1);
});

test("백로그가 비면 계획 열 머리에 안내", async ({ page }) => {
  await page.getByRole("button", { name: /^empty main/ }).click();
  await expect(page.locator(".info-plan .pband")).toContainText("쌓인 계획 없음");
});
