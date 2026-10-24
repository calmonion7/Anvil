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
