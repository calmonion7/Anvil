// 시나리오 공통 — 단계마다 스크린샷, 화면 언어 고정.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const out = process.env.E2E_OUT || path.resolve("out");
let n = 0;

/** 순번을 붙인 스크린샷. 실패해도 시나리오는 계속 */
export async function shot(name) {
  fs.mkdirSync(out, { recursive: true });
  n += 1;
  const file = path.join(out, `${String(n).padStart(2, "0")}-${name.replace(/[^\p{L}\p{N}]+/gu, "-")}.png`);
  await browser.saveScreenshot(file).catch((e) => console.log(`스크린샷 실패(${name}): ${e.message}`));
}

/** 러너의 기본 언어는 영어 — 화면을 한국어로 고정하고 다시 띄운다 */
export async function korean() {
  await $(".main").waitForExist({ timeout: 60000 });
  await browser.execute(() => localStorage.setItem("anvil.lang", "ko"));
  await browser.refresh();
  await $(".main").waitForExist({ timeout: 60000 });
}

/** 지금 되어야 하는 단계. 끝나면 스크린샷 */
export function step(title, fn) {
  it(title, async function () {
    try {
      await fn.call(this);
    } finally {
      await shot(title);
    }
  });
}

/** 띠가 떠 있고 그 문구를 돌려준다(로그에도 남긴다) */
export async function bandText() {
  const b = $(".band.top");
  await b.waitForDisplayed({ timeout: 60000 });
  const text = await b.getText();
  console.log(`띠: ${text.replace(/\n/g, " / ")}`);
  return text;
}

/** [설치] → 끝날 때까지 기다려 실패 항목이 없는지 본다 */
export async function installAll() {
  const btn = $(".band.top").$("button=설치");
  await btn.waitForClickable({ timeout: 10000 });
  await btn.click();
  await browser.pause(1000);
  await browser.waitUntil(async () => !(await $("button=설치 중…").isExisting()), { timeout: 12 * 60 * 1000, interval: 2000 });
  const failed = await $$(".band.top ul.steps li .crit");
  const lines = await $(".band.top ul.steps").isExisting() ? await $(".band.top ul.steps").getText() : "(결과 목록 없음 — 모두 설치돼 띠가 닫힘)";
  console.log(`설치 결과: ${lines.replace(/\n/g, " / ")}`);
  assert.equal(failed.length, 0, `실패 항목: ${lines}`);
}

/** 준비물 띠(✕)가 사라졌는가 */
export async function bandGone() {
  await browser.waitUntil(async () => !(await $(".band.top .crit").isExisting()), { timeout: 30000 });
}

/** 시험 프로젝트에서 [세션 열기] → 앱 안 터미널에 claude 첫 화면 문구 */
export async function openSession() {
  const btn = $(".term-plan").$("button=세션 열기");
  await btn.waitForClickable({ timeout: 15000 });
  await btn.click();
  const rows = $(".term-plan .xterm-rows");
  await browser.waitUntil(async () => /Claude Code|Welcome|text style|theme/i.test(await rows.getText().catch(() => "")), {
    timeout: 3 * 60 * 1000,
    interval: 2000,
    timeoutMsg: "터미널에 claude 첫 화면 문구가 보이지 않는다",
  });
  console.log(`터미널: ${(await rows.getText()).replace(/\s+/g, " ").slice(0, 300)}`);
}
