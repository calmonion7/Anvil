// windows 러너, WSL을 깔기 전 — 띠가 WSL을 먼저 안내하고 [설치]는 아직 없다
import assert from "node:assert/strict";
import { bandText, korean, step } from "../helpers.mjs";

describe("Windows WSL 없음", () => {
  before(korean);

  step("⓪ 띠에 WSL 안내, [설치] 없음", async () => {
    assert.ok((await bandText()).includes("WSL"));
    assert.equal(await $(".band.top").$("button=설치").isExisting(), false);
  });
});
