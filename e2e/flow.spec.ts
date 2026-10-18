import { test, expect, type Page } from "@playwright/test";
import { mockIpc, alpha } from "./mock-ipc";

// 흐름도(FlowBoard): 노드 건수 · 세션 상태 → 흐르는 화살표 · .forge 변화 → 펄스+로그 · 동작 줄이기 · 어두움 고정

const edge = (page: Page, e: string) => page.locator(`.edge[data-edge="${e}"]`);
/** 노드 ↔ 터미널 열 머리 세로 화살표(FlowLinks) */
const link = (page: Page, id: string) => page.locator(`[data-link="${id}"]`);
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

test("실행 세션 작업 중 → 실행 쪽 화살표(백로그→실행, 실행 터미널→완료)가 흐르고, 종료되면 멈춤", async ({ page }) => {
  await expect(link(page, "r-out")).toHaveAttribute("data-flow", "idle");
  await emit(page, "sessions", runWorking);
  await expect(edge(page, "e2")).toHaveAttribute("data-flow", "active");
  await expect(link(page, "r-out")).toHaveAttribute("data-flow", "active");
  await expect(link(page, "p-out")).toHaveAttribute("data-flow", "idle");
  const anim = await link(page, "r-out").locator(".dots").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toBe("none");

  await emit(page, "sessions", { "/p/alpha-run": { state: "ended", sessionId: null, alive: false } });
  await expect(link(page, "r-out")).toHaveAttribute("data-flow", "idle");
});

test("백로그가 늘면 계획 터미널→백로그 펄스 한 번", async ({ page }) => {
  await expect(link(page, "p-out").locator(".pulse")).toHaveCount(0);
  const more = { ...alpha, backlog: [...alpha.backlog, { ...alpha.backlog[0], task: 12, slug: "b12", path: ".forge/backlog/b12.md" }] };
  await emit(page, "snapshot", more);
  await expect(page.locator('[data-node="backlog"]')).toHaveText(/백로그 3$/);
  await expect(link(page, "p-out").locator(".pulse")).toHaveCount(1);
});

test("완료가 늘면 실행 터미널→완료 펄스", async ({ page }) => {
  await emit(page, "snapshot", { ...alpha, doneTotal: 2 });
  await expect(link(page, "r-out").locator(".pulse")).toHaveCount(1);
});

test("동작 줄이기 설정이면 애니메이션 없음", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await emit(page, "sessions", runWorking);
  await expect(link(page, "r-out")).toHaveAttribute("data-flow", "active");
  const anim = await link(page, "r-out").locator(".dots").evaluate((el) => getComputedStyle(el).animationName);
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
  await expect(page.locator(".info-plan .pband")).toContainText("후속후보에서 착수하거나 새 계획을 시작하세요");
  await expect(page.locator(".info-plan .pband")).not.toContainText("백로그 열"); // 백로그는 실행 쪽 몫
  // 두 열 머리 높이가 같아야 아래 터미널 머리줄이 나란하다
  const ph = (await page.locator(".info-plan .pband").boundingBox())!.height;
  const rh = (await page.locator(".info-run .band").boundingBox())!.height;
  expect(Math.abs(ph - rh)).toBeLessThanOrEqual(1);
});

test("실행 중인 작업이 없으면 실행 열 머리에 다음 백로그(우선순위 순)", async ({ page }) => {
  await emit(page, "snapshot", { ...alpha, active: null });
  const head = page.locator(".info-run .band");
  await expect(head).toContainText("다음");
  await expect(head).toContainText("#10");
  await expect(head).toContainText("백로그 열");
  await expect(head).toContainText("실행 대기 · 백로그 2건");
});

test("백로그도 비면 실행 열 머리에 '백로그 비어 있음'", async ({ page }) => {
  await page.getByRole("button", { name: /^empty main/ }).click();
  await expect(page.locator(".info-run .band")).toContainText("백로그 비어 있음");
});

test("계획 열 머리의 후속후보 링크는 후속후보 목록을 연다", async ({ page }) => {
  await page.locator(".info-plan").getByRole("button", { name: "후속후보 2건 보기" }).click();
  await expect(page.getByRole("dialog", { name: "후속후보" })).toBeVisible();
});

test("세션 노드 ↓ 터미널 ↑ 다음 노드 — 직행 가로 화살표는 없음, 귀환 루프는 줄 위", async ({ page }) => {
  await expect(page.locator('.edge[data-edge="e1"], .edge[data-edge="e3"]')).toHaveCount(0);
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const [plan, backlog, run, done, ip, ir] = await Promise.all(
    ['[data-node="plan"]', '[data-node="backlog"]', '[data-node="run"]', '[data-node="done"]', ".info-plan", ".info-run"].map(box),
  );
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(3);
  // 각 화살표: 위쪽 끝은 노드 아래, 아래쪽 끝은 열 머리 위, 가로 위치는 노드 가운데
  for (const [id, node, col] of [["p-in", plan, ip], ["p-out", backlog, ip], ["r-in", run, ir], ["r-out", done, ir]] as const) {
    const b = (await link(page, id).locator(".base").boundingBox())!;
    near(b.y, node.y + node.height);
    near(b.y + b.height, col.y);
    expect(b.x).toBeGreaterThanOrEqual(Math.min(node.x, col.x) - 4);
    expect(b.x + b.width).toBeLessThanOrEqual(Math.max(node.x + node.width, col.x + col.width) + 4);
  }
  await emit(page, "sessions", { "/p/alpha-plan": { state: "working", sessionId: null, alive: true } });
  await expect(link(page, "p-in")).toHaveAttribute("data-flow", "active");
  await expect(link(page, "r-in")).toHaveAttribute("data-flow", "idle");
  const loop = await box(".loopback");
  expect(loop.y + loop.height).toBeLessThanOrEqual(plan.y + 1);
});
