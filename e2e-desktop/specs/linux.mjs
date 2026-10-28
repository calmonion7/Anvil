// 깨끗한 Ubuntu 22.04(node·tmux·jq·claude·curl·git 없음) — 준비물 띠 → git은 사용자가 직접 → [설치] → 세션 열기 → 내장 jq로 상태줄
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
  step("⑥ 시스템 jq 없이도 내장 jq로 상태줄 래퍼가 모델을 기록하고 원래 상태줄을 그대로 보인다", () => {
    const sys = "/usr/local/bin:/usr/bin:/bin";
    // dash의 command -v는 못 찾으면 127(CI 실측)이라 0이 아닌지만 본다
    assert.notEqual(spawnSync("sh", ["-c", "command -v jq"], { env: { PATH: sys } }).status, 0, "시스템에 jq가 없어야 한다");
    const env = { ...process.env, PATH: `${join(dirname(process.env.ANVIL_BIN), "bin")}:${sys}`, ANVIL_SESSION: "e2e-sl" };
    assert.equal(execSync("jq --version", { env }).toString().trim(), "jq-1.8.1");

    const data = join(homedir(), ".local/share/com.taebro.anvil");
    const proj = join(homedir(), "sl-proj");
    mkdirSync(join(proj, ".claude"), { recursive: true });
    writeFileSync(join(proj, ".claude/settings.local.json"), '{"statusLine":{"command":"cat"}}');
    const input = JSON.stringify({ model: { display_name: "Opus 5.5" }, effort: { level: "high" }, workspace: { project_dir: proj } });
    const out = execSync(`bash '${join(data, "anvil-statusline.sh")}'`, { env, input }).toString();
    assert.equal(out, input, "원래 상태줄(cat) 출력이 그대로 나와야 한다");
    assert.equal(readFileSync(join(data, "models/e2e-sl.json"), "utf8").trim(), '{"model":"Opus 5.5","effort":"high"}');
  });
});
