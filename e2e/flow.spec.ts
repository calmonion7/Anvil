import { test, expect, type Page } from "@playwright/test";
import { mockIpc, alpha } from "./mock-ipc";

// 흐름도(FlowBoard): 노드 건수 · 세션 상태 → 흐르는 화살표 · .forge 변화 → 펄스+로그 · 동작 줄이기 · 어두움 고정

/** 흐름도의 관(FlowLinks) */
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
  await expect(link(page, "e2")).toHaveAttribute("data-flow", "active");
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
  await expect(link(page, "loop")).toHaveCount(1);
  await emit(page, "snapshot", { ...alpha, followups: alpha.followups.slice(1) });
  await expect(link(page, "loop").locator(".pulse")).toHaveCount(1);
});

test("터미널 유입 띠: 작업 중이면 흐르고, 보드 버튼이 명령을 채우면 펄스", async ({ page }) => {
  await expect(page.locator(".feed.run")).toHaveAttribute("data-flow", "idle");
  await emit(page, "sessions", runWorking);
  await expect(page.locator(".feed.run")).toHaveAttribute("data-flow", "active");
  await emit(page, "sessions", {});
  await page.getByRole("group", { name: "실행 세션 단축 버튼" }).getByRole("button", { name: "/forge:fg-next", exact: true }).click();
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
  // 각 화살표: 위쪽 끝은 노드 아래, 아래쪽 끝은 열 머리 위, 가로 위치는 노드 가운데
  for (const [id, node, col] of [["p-in", plan, ip], ["p-out", backlog, ip], ["r-in", run, ir], ["r-out", done, ir]] as const) {
    // 관 굵기(12px)만큼 경계 상자가 양쪽으로 6px 넓다
    const b = (await link(page, id).locator(".wall").boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(node.y + node.height - 8); // 노드 바로 아래에서
    expect(b.y).toBeLessThanOrEqual(node.y + node.height + 2);
    expect(b.y + b.height).toBeGreaterThanOrEqual(col.y + 4); // 열 머리 띠 테두리까지
    expect(b.y + b.height).toBeLessThanOrEqual(col.y + 16);
    expect(b.x).toBeGreaterThanOrEqual(Math.min(node.x, col.x) - 8);
    expect(b.x + b.width).toBeLessThanOrEqual(Math.max(node.x + node.width, col.x + col.width) + 8);
  }
  await emit(page, "sessions", { "/p/alpha-plan": { state: "working", sessionId: null, alive: true } });
  await expect(link(page, "p-in")).toHaveAttribute("data-flow", "active");
  await expect(link(page, "r-in")).toHaveAttribute("data-flow", "idle");
  const loop = (await link(page, "loop").locator(".wall").boundingBox())!;
  expect(loop.y).toBeLessThan(plan.y - 8); // 노드 줄 위로 넘어가
  expect(loop.y + loop.height).toBeLessThanOrEqual(plan.y + 8); // 계획 세션 윗변으로 들어간다
  // 가로 관도 같은 관 — 백로그→실행 세션, 최근 완료→후속후보
  await expect(page.locator("[data-link]")).toHaveCount(7);
});

/** 가운데 경계를 body 가로 비율 x 지점까지 끈다 */
async function dragSplit(page: Page, x: number) {
  const sep = (await page.locator('[role="separator"][aria-orientation="vertical"]').boundingBox())!;
  const body = (await page.locator(".body").boundingBox())!;
  await page.mouse.move(sep.x + sep.width / 2, sep.y + 200);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width * x, sep.y + 200, { steps: 5 });
  await page.mouse.up();
}

test("경계를 왼쪽 끝으로 → 실행창만, 계획은 레일 · 계획 관은 레일로 · 레일 누르면 복귀", async ({ page }) => {
  await dragSplit(page, 0.03);
  await expect(page.locator(".term-plan")).toBeHidden();
  await expect(page.locator(".term-run")).toBeVisible();
  const rail = page.locator(".foldrail-plan");
  await expect(rail).toBeVisible();
  await expect(rail).toContainText("계획 세션");
  const rb = (await rail.boundingBox())!;
  for (const id of ["p-in", "p-out"]) {
    const b = (await link(page, id).locator(".wall").boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(rb.x - 8); // 관 끝이 레일 안으로
    expect(b.x).toBeLessThanOrEqual(rb.x + rb.width);
  }
  await rail.click();
  await expect(rail).toHaveCount(0);
  await expect(page.locator(".term-plan")).toBeVisible();
  await expect(page.locator(".info-plan .pband")).toBeVisible();
});

test("경계를 오른쪽 끝으로 → 계획창만, 실행은 레일", async ({ page }) => {
  await dragSplit(page, 0.97);
  await expect(page.locator(".term-run")).toBeHidden();
  await expect(page.locator(".term-plan")).toBeVisible();
  await expect(page.locator(".foldrail-run")).toContainText("실행 세션");
  const rb = (await page.locator(".foldrail-run").boundingBox())!;
  const b = (await link(page, "r-out").locator(".wall").boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(rb.x + rb.width + 8);
});

test("머리줄 3단 버튼: 계획 접기 · 가운데 · 실행 접기", async ({ page }) => {
  const seg = (name: string) => page.getByRole("group", { name: "터미널 배치" }).getByRole("button", { name });
  await expect(seg("가운데 · 계획·실행 반반")).toHaveClass(/\bon\b/);

  await seg("계획 접기 · 실행창만").click();
  await expect(page.locator(".foldrail-plan")).toBeVisible();
  await expect(page.locator(".term-plan")).toBeHidden();
  await expect(seg("계획 접기 · 실행창만")).toHaveClass(/\bon\b/);

  await seg("실행 접기 · 계획창만").click();
  await expect(page.locator(".foldrail-run")).toBeVisible();
  await expect(page.locator(".term-run")).toBeHidden();
  await expect(page.locator(".term-plan")).toBeVisible();

  await seg("가운데 · 계획·실행 반반").click();
  await expect(page.locator(".foldrail-plan, .foldrail-run")).toHaveCount(0);
  const [pl, rn] = [(await page.locator(".term-plan").boundingBox())!, (await page.locator(".term-run").boundingBox())!];
  expect(Math.abs(pl.width - rn.width)).toBeLessThanOrEqual(2); // 반반
});

test("가장자리가 아니면 접히지 않는다(20~80%)", async ({ page }) => {
  await dragSplit(page, 0.25);
  await expect(page.locator(".foldrail-plan, .foldrail-run")).toHaveCount(0);
  await expect(page.locator(".term-plan")).toBeVisible();
});

test("단축 버튼: 기본값 · 누르면 그 세션에 채움 · ＋로 추가(이름=명령어) · ×로 삭제 · 다시 열어도 유지", async ({ page }) => {
  const plan = page.getByRole("group", { name: "계획 세션 단축 버튼" });
  const run = page.getByRole("group", { name: "실행 세션 단축 버튼" });
  await expect(run.getByRole("button", { name: "/forge:fg-next", exact: true })).toBeVisible();
  await expect(plan.getByRole("button", { name: "/forge:fg-ask", exact: true })).toBeVisible();
  await expect(page.locator(".head").getByRole("button", { name: /다음 단계/ })).toHaveCount(0); // 머리줄에서 옮김

  await plan.getByRole("button", { name: "단축 버튼 추가" }).click();
  await plan.getByRole("combobox", { name: "추가할 명령어" }).fill("/forge:fg-status");
  await page.keyboard.press("Enter");
  const added = plan.getByRole("button", { name: "/forge:fg-status", exact: true });
  await expect(added).toBeVisible();
  await added.click();
  const fills = await page.evaluate(() => (window as any).__calls.filter((c: any) => c.cmd === "session_fill").map((c: any) => c.args));
  expect(fills.at(-1)).toMatchObject({ role: "plan", text: "/forge:fg-status" });

  await page.reload();
  await expect(plan.getByRole("button", { name: "/forge:fg-status", exact: true })).toBeVisible(); // 저장됨

  await plan.getByRole("button", { name: "/forge:fg-status", exact: true }).hover();
  await plan.getByRole("button", { name: "/forge:fg-status 단축 버튼 삭제" }).click();
  await expect(plan.getByRole("button", { name: "/forge:fg-status", exact: true })).toHaveCount(0);

  await plan.getByRole("button", { name: "단축 버튼 추가" }).click();
  await page.keyboard.press("Escape"); // Esc는 입력만 닫는다
  await expect(plan.getByRole("combobox")).toHaveCount(0);
});

test("세션이 작업 중이면 그 열의 단축 버튼은 꺼진다", async ({ page }) => {
  await emit(page, "sessions", runWorking);
  await expect(page.getByRole("group", { name: "실행 세션 단축 버튼" }).getByRole("button", { name: "/forge:fg-next", exact: true })).toBeDisabled();
  await expect(page.getByRole("group", { name: "계획 세션 단축 버튼" }).getByRole("button", { name: "/forge:fg-ask", exact: true })).toBeEnabled();
});

test("단축 버튼 추가 자동완성: 실제 명령 목록(+내장) · 거르기 · 이미 있는 건 제외 · ↓Enter · Tab 채우고 인자 · 클릭", async ({ page }) => {
  const run = page.getByRole("group", { name: "실행 세션 단축 버튼" });
  const box = run.getByRole("combobox", { name: "추가할 명령어" });
  const opts = run.getByRole("option");

  await run.getByRole("button", { name: "단축 버튼 추가" }).click();
  await expect(opts.first()).toBeVisible(); // "/"만 있어도 후보가 뜬다
  await expect(run.getByRole("option", { name: "/forge:fg-next", exact: true })).toHaveCount(0); // 이미 있음

  await box.fill("eli");
  await expect(opts).toHaveText(["/eli5"]); // 백엔드가 읽어 온 사용자 스킬
  await box.fill("cle");
  await expect(opts).toHaveText(["/clear"]); // 내장 명령
  await box.fill("/lea");
  await expect(opts).toHaveCount(0); // 부분 문자열이 아니면 없음
  await box.fill("learn"); // "lea"는 /clear에도 들어 있다
  await expect(opts).toHaveText(["/forge:fg-learn"]);
  await page.keyboard.press("Enter");
  await expect(run.getByRole("button", { name: "/forge:fg-learn", exact: true })).toBeVisible();

  await run.getByRole("button", { name: "단축 버튼 추가" }).click();
  await box.fill("fg-run");
  await page.keyboard.press("Tab");
  await expect(box).toHaveValue("/forge:fg-run ");
  await box.fill("/forge:fg-run #12");
  await expect(opts).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(run.getByRole("button", { name: "/forge:fg-run #12", exact: true })).toBeVisible();

  await run.getByRole("button", { name: "단축 버튼 추가" }).click();
  await box.fill("doc");
  await run.getByRole("option", { name: "/forge:fg-doctor" }).click();
  await expect(run.getByRole("button", { name: "/forge:fg-doctor", exact: true })).toBeVisible();
});

test("명령 목록은 프로젝트마다 처음 한 번만 읽는다", async ({ page }) => {
  const count = () => page.evaluate(() => (window as any).__calls.filter((c: any) => c.cmd === "slash_commands").length);
  await expect.poll(count).toBe(1);
  await page.getByRole("button", { name: /^empty main/ }).click();
  await expect.poll(count).toBe(2);
  await page.getByRole("button", { name: /^alpha main/ }).click();
  await page.waitForTimeout(200);
  expect(await count()).toBe(2); // 다시 와도 또 읽지 않는다
});
