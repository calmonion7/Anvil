import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// Anvil 자체 업데이트 띠(데스크톱 앱 5/6) — 새 버전이 있으면 [업데이트], 진행은 서버 `updater` 이벤트로 바뀐다.

const base = { current: "0.1.8", available: { version: "0.2.0" }, progress: null, error: null, installable: true };

test("새 버전이 있으면 띠에 [업데이트]가 보이고, 누르면 설치를 시작한다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.updater = base;
  await page.goto("/");
  await expect(page.getByText("Anvil 0.2.0 사용 가능")).toBeVisible();
  await page.getByRole("button", { name: "업데이트", exact: true }).click();
  await expect.poll(() => ipc.calls.some((c) => c.cmd === "updater_install")).toBe(true);
});

test("진행: 내려받는 중 → 세션이 끝나면 업데이트 → 실패하면 오류와 [다시 시도]", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.updater = base;
  await page.goto("/");
  await expect(page.getByText("Anvil 0.2.0 사용 가능")).toBeVisible();
  await ipc.emit("updater", { ...base, progress: { state: "downloading", version: "0.2.0", error: null } });
  await expect(page.getByRole("button", { name: "내려받는 중…" })).toBeDisabled();
  await ipc.emit("updater", { ...base, progress: { state: "deferred", version: "0.2.0", error: null } });
  await expect(page.getByText("세션이 끝나면 업데이트")).toBeVisible();
  await ipc.emit("updater", { ...base, progress: { state: "failed", version: "0.2.0", error: "체크섬이 맞지 않아 업데이트 파일을 버렸습니다" } });
  await expect(page.getByText("체크섬이 맞지 않아 업데이트 파일을 버렸습니다")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => ipc.calls.filter((c) => c.cmd === "updater_install").length).toBe(1);
});

test("설치본이 아니거나 새 버전이 없으면 띠가 없다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.updater = { ...base, installable: false };
  await page.goto("/");
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
  await expect(page.getByText("사용 가능")).toHaveCount(0);
});
