import { test, expect, type Page } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 계획 #5 UAT (b)~(e)를 IPC 모킹으로 검사한다. (a) 창 기억은 실제 창이 필요해 사람 판정.

const chip = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^${label} \\d+$`) });
const fills = (page: Page) =>
  page.evaluate(() => (window as any).__calls.filter((c: any) => c.cmd === "session_fill").map((c: any) => c.args));

test.beforeEach(async ({ page }) => {
  await mockIpc(page);
  await page.goto("/");
  await expect(chip(page, "백로그")).toBeVisible();
});

test("(b) 위쪽은 띠·칩 한 덩어리, 그 아래 전부 터미널, 위아래 경계 없음, 칩 숫자 = 목록 수", async ({ page }) => {
  await expect(chip(page, "후속후보")).toHaveText(/후속후보 2$/); // 원장 4건 중 open 2건만
  await expect(chip(page, "최근 완료")).toHaveText(/최근 완료 1$/);
  await expect(chip(page, "백로그")).toHaveText(/백로그 2$/);
  await expect(page.locator('[role="separator"][aria-orientation="horizontal"]')).toHaveCount(0);

  const strip = (await chip(page, "백로그").boundingBox())!;
  const term = (await page.locator(".term-plan").boundingBox())!;
  expect(term.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  expect(term.height).toBeGreaterThan(820 * 0.6);
});

test("(c) 후속후보 팝업: 위는 open(최신순)에 착수·기각, 처리됨은 접혀 있다", async ({ page }) => {
  await chip(page, "후속후보").click();
  const dlg = page.getByRole("dialog", { name: "후속후보" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button", { name: "착수" })).toHaveCount(2);
  await expect(dlg.getByRole("button", { name: "기각" })).toHaveCount(2);
  await expect(dlg.locator(".tt").first()).toHaveText("후속 하나");
  await expect(dlg).not.toContainText("착수한 후속");

  // 여러 줄 본문은 펼쳐 본다
  await dlg.getByRole("button", { name: /후속 하나/ }).click();
  await expect(dlg).toContainText("근거: 펼쳐 보는 줄");

  // 처리됨: taken은 → #N, dismissed는 본문
  await dlg.getByRole("button", { name: "처리됨 2건" }).click();
  await expect(dlg).toContainText("→ #1");
  await dlg.getByRole("button", { name: /기각한 후속/ }).click();
  await expect(dlg).toContainText("사유: 대체됨");
  await dlg.getByRole("button", { name: /착수한 후속/ }).click();
  await expect(page.getByRole("dialog", { name: /plan · #1/ })).toContainText("문서 .forge/done/d1/plan.md");
});

test("(c) 후속후보 착수·기각은 닫고 계획 세션 입력창에 원장 id로 fg-ask", async ({ page }) => {
  await chip(page, "후속후보").click();
  let dlg = page.getByRole("dialog", { name: "후속후보" });
  await dlg.getByRole("button", { name: "착수" }).first().click();
  await expect(dlg).toHaveCount(0);
  expect((await fills(page)).at(-1)).toMatchObject({ role: "plan", text: "/forge:fg-ask 후속후보 fu-000000000001 착수: 후속 하나" });

  await chip(page, "후속후보").click();
  dlg = page.getByRole("dialog", { name: "후속후보" });
  await dlg.getByRole("button", { name: "기각" }).nth(1).click();
  await expect(dlg).toHaveCount(0);
  expect((await fills(page)).at(-1)).toMatchObject({ role: "plan", text: "/forge:fg-ask 후속후보 fu-000000000002 기각 — 사유: " });
});

test("(c) 백로그 팝업: 실행은 닫고 실행 세션에 fg-run", async ({ page }) => {
  await chip(page, "백로그").click();
  const dlg = page.getByRole("dialog", { name: "백로그" });
  await dlg.getByRole("button", { name: "실행" }).first().click();
  await expect(dlg).toHaveCount(0);
  expect((await fills(page)).at(-1)).toMatchObject({ role: "run", text: "/forge:fg-run #10" });
});

test("(c) Esc·바깥 클릭으로 닫힘", async ({ page }) => {
  await chip(page, "최근 완료").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await chip(page, "최근 완료").click();
  await page.locator(".scrim").click({ position: { x: 5, y: 300 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("(d) 0건 칩 → 팝업에 '비어 있음'", async ({ page }) => {
  await page.getByRole("button", { name: /^empty main/ }).click();
  await expect(chip(page, "백로그")).toHaveText(/백로그 0$/);
  for (const label of ["후속후보", "최근 완료", "백로그"]) {
    await chip(page, label).click();
    await expect(page.getByRole("dialog", { name: label })).toContainText("비어 있음");
    await page.keyboard.press("Escape");
  }
});

test("(e) 팝업에서 연 문서는 위에 겹치고 Esc 한 번에 문서만 닫혀 목록으로 복귀", async ({ page }) => {
  await chip(page, "백로그").click();
  const list = page.getByRole("dialog", { name: "백로그" });
  await list.getByRole("button", { name: /^#10백로그 열 / }).click();
  const doc = page.getByRole("dialog", { name: /plan · #10/ });
  await expect(doc).toContainText("문서 .forge/backlog/b10.md");

  await page.keyboard.press("Escape");
  await expect(doc).toHaveCount(0);
  await expect(list).toBeVisible();
});

test("(e) 띠의 plan 버튼으로 연 문서는 닫으면 터미널이 그대로", async ({ page }) => {
  await page.getByRole("button", { name: "plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".term-plan")).toBeVisible();
});
