// windows 러너, 배포판을 깔기 전 — 띠가 WSL을 먼저 안내하고 [설치]는 아직 없다
import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { bandText, close, launch, page, step } from "./app.mjs";

test.describe.configure({ mode: "serial" });
test.beforeAll(launch);
test.afterAll(close);

step("⓪ 띠에 WSL 안내, [설치] 없음", async () => {
  assert.ok((await bandText()).includes("WSL"));
  assert.equal(await page.locator(".band.top").getByRole("button", { name: "설치", exact: true }).count(), 0);
});
