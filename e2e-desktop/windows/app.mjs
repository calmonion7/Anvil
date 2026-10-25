// Windows 시나리오 공통 — 테스트 빌드(tauri.e2e.json)는 웹뷰 디버그 포트 9222를 열고 뜬다.
// msedgedriver가 WebView2에 붙지 못해(#11 run.md) Playwright가 CDP로 직접 붙는다. Linux(helpers.mjs)와 같은 단계 규칙.
import { chromium, test } from "@playwright/test";
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const out = process.env.E2E_OUT || path.resolve("out");
const CDP = "http://127.0.0.1:9222";
// 하네스의 NODE_OPTIONS가 앱 → 앱이 띄우는 명령으로 새지 않게
const cleanEnv = { ...process.env, NODE_OPTIONS: undefined };
let app;
let browser;
let n = 0;
export let page;

/** 앱을 띄우고 CDP로 붙어 화면을 한국어로 고정한다 */
export async function launch() {
  fs.mkdirSync(out, { recursive: true });
  const log = fs.openSync(path.join(out, "app.log"), "a");
  app = spawn(process.env.ANVIL_BIN, [], { env: cleanEnv, stdio: ["ignore", log, log] });
  for (let i = 0; i < 120 && !(await fetch(`${CDP}/json/version`).then((r) => r.ok, () => false)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.connectOverCDP(CDP);
  // 처음 띄울 때는 웹뷰가 잠시 about:blank — 앱 화면(tauri.localhost)이 될 때까지
  for (let i = 0; i < 120 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("tauri"));
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(page, `앱 화면을 못 찾음: ${browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(", ")}`);
  await page.locator(".main").waitFor({ timeout: 60000 });
  await page.evaluate(() => localStorage.setItem("anvil.lang", "ko"));
  await page.reload();
  await page.locator(".main").waitFor({ timeout: 60000 });
}

export async function close() {
  await browser?.close().catch(() => {});
  // 웹뷰 자식 프로세스까지
  if (app?.pid) {
    try {
      execSync(`taskkill /T /F /PID ${app.pid}`, { stdio: "ignore" });
    } catch {}
  }
}

/** 순번을 붙인 스크린샷. 실패해도 시나리오는 계속 */
export async function shot(name) {
  n += 1;
  const file = path.join(out, `${String(n).padStart(2, "0")}-${name.replace(/[^\p{L}\p{N}]+/gu, "-")}.png`);
  await page?.screenshot({ path: file }).catch((e) => console.log(`스크린샷 실패(${name}): ${e.message}`));
}

/** 지금 되어야 하는 단계. 끝나면 스크린샷 */
export function step(title, fn) {
  test(title, async () => {
    try {
      await fn();
    } finally {
      await shot(title);
    }
  });
}

/** 아직 안 되는 단계(실패 예정). 실패하면 통과, 통과해 버리면 빨강 — 기능이 생기면 xfail을 step으로 바꾼다. */
export function xfail(title, fn) {
  test(`[실패 예정] ${title}`, async () => {
    let passed = false;
    try {
      await fn();
      passed = true;
    } catch (e) {
      console.log(`[실패 예정] ${title} — 기대대로 실패: ${String(e?.message ?? e).split("\n")[0]}`);
    } finally {
      await shot(title);
    }
    if (passed) throw new Error(`실패 예정 단계가 통과했다 — '${title}'의 xfail을 step으로 바꿀 것`);
  });
}

/** 띠가 떠 있고 그 문구를 돌려준다(로그에도 남긴다) */
export async function bandText() {
  const b = page.locator(".band.top").first();
  await b.waitFor({ state: "visible", timeout: 60000 });
  const text = await b.innerText();
  console.log(`띠: ${text.replace(/\n/g, " / ")}`);
  return text;
}

/** [설치] → 끝날 때까지 기다려 실패 항목이 없는지 본다 */
export async function installAll() {
  await page.locator(".band.top").getByRole("button", { name: "설치", exact: true }).click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "설치 중…" }).waitFor({ state: "detached", timeout: 12 * 60 * 1000 });
  const steps = page.locator(".band.top ul.steps");
  const lines = (await steps.count()) ? await steps.innerText() : "(결과 목록 없음 — 모두 설치돼 띠가 닫힘)";
  console.log(`설치 결과: ${lines.replace(/\n/g, " / ")}`);
  assert.equal(await page.locator(".band.top ul.steps li .crit").count(), 0, `실패 항목: ${lines}`);
}

/** 준비물 띠(✕)가 사라졌는가 */
export async function bandGone() {
  await page.locator(".band.top .crit").waitFor({ state: "detached", timeout: 30000 });
}

/** 시험 프로젝트에서 [세션 열기] → 앱 안 터미널에 claude 첫 화면 문구 */
export async function openSession() {
  await page.locator(".term-plan").getByRole("button", { name: "세션 열기" }).click({ timeout: 15000 });
  const rows = page.locator(".term-plan .xterm-rows");
  const deadline = Date.now() + 3 * 60 * 1000;
  let text = "";
  while (Date.now() < deadline && !/Claude Code|Welcome|text style|theme/i.test(text)) {
    await page.waitForTimeout(2000);
    text = await rows.innerText().catch(() => "");
  }
  console.log(`터미널: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
  assert.match(text, /Claude Code|Welcome|text style|theme/i, "터미널에 claude 첫 화면 문구가 보이지 않는다");
}

/** WSL 기본 배포판의 로그인 셸에서 명령 */
export const wsl = (cmd) => execSync(`wsl -- bash -lc "${cmd}"`, { encoding: "utf8", env: cleanEnv }).trim();
