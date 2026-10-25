// setup-wsl로 WSL1 Ubuntu를 넣은 뒤 — [다시 확인] → [설치] → 세션 열기, WSL 안에서 교차 확인
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { bandGone, bandText, installAll, korean, openSession, step, xfail } from "../helpers.mjs";

const wsl = (cmd) => execSync(`wsl -- bash -lc "${cmd}"`, { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: undefined } }).trim();

describe("Windows WSL1 Ubuntu", () => {
  before(korean);

  step("① [다시 확인] 뒤 띠 기록", async () => {
    await $(".band.top").$("button=다시 확인").click();
    await browser.pause(2000);
    await bandText();
  });
  xfail("① 띠에 node · claude · forge 필요 표시", async () => {
    const text = await bandText();
    for (const w of ["node", "claude", "forge"]) assert.ok(text.includes(w), `'${w}' 없음: ${text}`);
  });
  xfail("② [설치] → 모든 항목 설치", installAll);
  xfail("③ 준비물 띠 사라짐", bandGone);
  xfail("④ [세션 열기] → 터미널에 claude 첫 화면", openSession);
  xfail("⑤ WSL 안 교차 확인: node · claude · forge", async () => {
    assert.match(wsl("~/.local/bin/node --version"), /^v22\./);
    assert.ok(wsl("claude --version").length > 0);
    assert.ok(wsl("cat ~/.claude/plugins/installed_plugins.json").includes('"forge@'));
  });
});
