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
  await expect(chip(page, "후속후보")).toHaveText(/후속후보 2$/); // 3건 중 숨김 1건 제외
  await expect(chip(page, "최근 완료")).toHaveText(/최근 완료 1$/);
  await expect(chip(page, "백로그")).toHaveText(/백로그 2$/);
  await expect(page.locator('[role="separator"][aria-orientation="horizontal"]')).toHaveCount(0);

  const strip = (await chip(page, "백로그").boundingBox())!;
  const term = (await page.locator(".term-plan").boundingBox())!;
  expect(term.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  expect(term.height).toBeGreaterThan(820 * 0.6);
});

test("(c) 후속후보 팝업: 숨김은 유지·숫자 감소, 착수는 닫고 계획 세션에 fg-ask", async ({ page }) => {
  await chip(page, "후속후보").click();
  const dlg = page.getByRole("dialog", { name: "후속후보" });
  await expect(dlg).toBeVisible();

  await dlg.getByRole("button", { name: "숨김" }).first().click();
  await expect(dlg).toBeVisible();
  await expect(chip(page, "후속후보")).toHaveText(/후속후보 1$/);

  await dlg.getByRole("button", { name: "착수" }).first().click();
  await expect(dlg).toHaveCount(0);
  expect((await fills(page)).at(-1)).toMatchObject({ role: "plan", text: expect.stringMatching(/^\/forge:fg-ask /) });
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
