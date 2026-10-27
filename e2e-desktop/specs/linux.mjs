// 깨끗한 Ubuntu 22.04(node·tmux·claude·curl·git 없음) — 준비물 띠 → git은 사용자가 직접 → [설치] → 세션 열기
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { bandGone, bandText, installAll, korean, openSession, step } from "../helpers.mjs";

describe("Linux 깨끗한 PC", () => {
  before(korean);

  step("① 띠에 git · node 22 이상 · claude · forge 필요, git은 직접 설치 안내", async () => {
    const text = await bandText();
    for (const w of ["git", "node 22", "claude", "forge", "sudo apt install git"]) assert.ok(text.includes(w), `'${w}' 없음: ${text}`);
    assert.ok(!text.includes("tmux"), `tmux는 내장이라 준비물이 아니다: ${text}`);
  });
  step("② 안내대로 git 설치(사용자 흉내) → [다시 확인]하면 git이 빠진다", async () => {
    execSync("sudo apt-get install -y -qq git", { stdio: "ignore" });
    await $(".band.top").$("button=다시 확인").click();
    await browser.waitUntil(async () => !(await bandText()).includes("git"), { timeout: 30000 });
  });
  step("③ [설치] → 모든 항목 설치", installAll);
  step("④ 준비물 띠 사라짐", bandGone);
  step("⑤ [세션 열기] → 터미널에 claude 첫 화면", openSession);
});
