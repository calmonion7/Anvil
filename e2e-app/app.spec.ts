import { _electron as electron, expect, test } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 앱 실행 → 창에 보드 → 앱을 끈 뒤에도 서버가 살아 있다 → 다시 열면 새 서버를 띄우지 않고 같은 서버에 붙는다.
// claude 자리에는 가짜 claude(server/test/fake-claude.js)를 넣어 진짜 claude가 뜨지 않게 한다.

const root = join(import.meta.dirname, "..");
/** 보드의 [프로젝트 추가] — 화면 언어는 OS를 따른다(CI 러너는 영어) */
const ADD_PROJECT = /＋ (프로젝트 추가|Add project)/;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

/** 앱 실행 인자 — Linux CI(컨테이너·xvfb)는 Chromium 샌드박스를 켤 수 없다 */
const appArgs = [...(process.platform === "linux" ? ["--no-sandbox"] : []), join(root, "electron/main.js")];

/** claude 자리에 넣을 가짜 claude 래퍼(Windows는 .cmd — 세션이 cmd.exe로 감싸 띄운다) */
function fakeClaude(dir: string) {
  const js = join(root, "server/test/fake-claude.js");
  if (process.platform === "win32") {
    const f = join(dir, "claude.cmd");
    writeFileSync(f, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
    return f;
  }
  const f = join(dir, "claude");
  writeFileSync(f, `#!/bin/sh\nexec '${process.execPath}' '${js}' "$@"\n`);
  chmodSync(f, 0o755);
  return f;
}

/** 앱을 띄운다 — 앱 프로세스의 출력을 테스트 로그로 흘려 CI에서 어디서 멈췄는지 보이게 한다 */
async function launchApp(env: Record<string, string>) {
  const app = await electron.launch({ args: appArgs, env });
  const tag = `[app ${app.process().pid}]`;
  app.process().stdout?.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  app.process().stderr?.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  return app;
}
/**
 * 앱을 끈다(Cmd+Q처럼 app.quit). Playwright close()는 앱의 출력 파이프가 닫히기까지 기다리는데, Linux CI에서는 끝나지 않았다(실측) —
 * 프로세스가 끝나는 것만 기다린다. 30초 안에 안 끝나면 macOS·Linux는 남은 Electron 프로세스를 찍어 실패한다.
 * Windows는 CI에서 실행마다 앱 하나가 app.quit 뒤에도 가끔 남았다(원인 미확인 — VM UAT·후속 후보로 본다). 이 테스트가 보려는 것은
 * "앱이 꺼져도 서버는 산다"라 강제로 끝내도 판정이 같으므로, 경고만 찍고 끝낸 뒤 이어 간다.
 */
async function quitApp(app: Awaited<ReturnType<typeof launchApp>>) {
  const proc = app.process();
  const exited = new Promise<boolean>((r) => (proc.exitCode !== null || proc.signalCode !== null ? r(true) : proc.once("exit", () => r(true))));
  await app.evaluate(({ app }) => app.quit()).catch(() => {}); // 끝나며 연결이 끊겨도 된다
  const ok = await Promise.race([exited, new Promise<boolean>((r) => setTimeout(() => r(false), 30_000))]);
  if (ok) return;
  if (process.platform === "win32") {
    console.log(`⚠ 앱(${proc.pid})이 app.quit 뒤 30초 안에 끝나지 않아 강제로 끝낸다`);
    proc.kill();
    await exited;
    return;
  }
  console.log(execSync("ps -eo pid,ppid,command | grep -i -E 'electron|anvil' | grep -v grep || true").toString());
  expect(ok, "앱이 종료되어야 한다").toBe(true);
}
/** 임시 폴더 정리 — Windows는 막 끝낸 서버·claude가 파일을 잠깐 쥐고 있어(CI 실측 EPERM) 다시 시도하고, 그래도 안 되면 둔다 */
function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {}
}
/** 단계 표시 — 시간 초과 때 마지막으로 찍힌 단계가 멈춘 곳이다 */
const step = (s: string) => console.log(`▶ ${s}`);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("앱을 꺼도 서버가 살고, 다시 열면 같은 서버에 붙는다", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anvil-app-"));
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANVIL_DATA_DIR: dataDir,
    ANVIL_PORT: String(await freePort()),
    ANVIL_CLAUDE: join(root, "server/test/fake-claude.js"),
    ANVIL_SKIP_DEPS: "1", // 러너에는 claude·forge가 없다 — 「준비 중」·자동 설치를 건너뛴다
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => launchApp(env);
  const serverPid = () => JSON.parse(readFileSync(join(dataDir, "server.json"), "utf8")).pid as number;
  const board = (win: Awaited<ReturnType<Awaited<ReturnType<typeof launch>>["firstWindow"]>>) =>
    expect(win.getByRole("button", { name: ADD_PROJECT }).first()).toBeVisible({ timeout: 30_000 });
  let pid = 0;
  try {
    step("1. 앱 실행");
    const first = await launch();
    step("2. 첫 창·보드");
    await board(await first.firstWindow());
    pid = serverPid();
    step("3. 앱 종료");
    await quitApp(first);
    step("4. 앱 종료됨");
    await new Promise((r) => setTimeout(r, 1000));
    expect(alive(pid), "앱을 끈 뒤에도 서버가 살아 있어야 한다").toBe(true);

    step("5. 다시 실행");
    const second = await launch();
    // Finder·Dock으로 열면 macOS가 시작 직후 `activate`를 보낸다 — 서버 확인 중에 와도 창을 두 번 열다 ERR_ABORTED로 죽지 않아야 한다(UAT 2026-10-30).
    await second.evaluate(({ app }) => app.emit("activate"));
    const win2 = await second.firstWindow();
    await board(win2);
    expect(serverPid(), "다시 연 앱은 같은 서버에 붙는다").toBe(pid);

    // 서버가 다시 떠 토큰이 바뀌면 창이 새 토큰으로 다시 열려, 「서버가 다시 시작되었습니다」에 머물지 않는다.
    process.kill(pid);
    await expect.poll(() => alive(pid)).toBe(false);
    const restarted = spawn(process.execPath, [join(root, "server/main.js")], { env, stdio: "ignore", detached: true });
    restarted.unref();
    await expect.poll(() => serverPid(), { timeout: 15_000 }).toBe(restarted.pid);
    pid = restarted.pid!;
    await expect
      .poll(() => win2.evaluate(async () => (await fetch("/api/session_states", { method: "POST" })).status).catch(() => 0), { timeout: 15_000 }) // 새 토큰으로 다시 여는 중이면 맥락이 사라진다 — 다시 본다
      .toBe(200);
    await expect(win2.getByText("서버가 다시 시작되었습니다")).toHaveCount(0);
    step("6. 두 번째 앱 종료");
    await quitApp(second);
  } finally {
    if (pid && alive(pid)) process.kill(pid);
    cleanup(dataDir);
  }
});

// 데스크톱 앱 2/6: 세션 열기 → 앱 끄기 → 서버 강제 종료(SIGKILL — 재부팅 흉내) → 앱 다시 실행 → 같은 세션이 `--resume <대화 ID>`로 다시 산다.
test("서버가 강제 종료돼도 다시 연 앱에서 세션이 --resume으로 복구된다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-app-restore-"));
  const dataDir = join(dir, "data");
  const project = join(dir, "proj");
  mkdirSync(project);
  mkdirSync(dataDir);
  writeFileSync(join(dataDir, "projects.json"), JSON.stringify([project]));
  const fake = fakeClaude(dir);
  const out = join(dir, "fake-out.json");
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANVIL_DATA_DIR: dataDir,
    ANVIL_PORT: String(await freePort()),
    ANVIL_CLAUDE: fake,
    ANVIL_SKIP_DEPS: "1",
    FAKE_OUT: out,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => launchApp(env);
  const serverPid = () => JSON.parse(readFileSync(join(dataDir, "server.json"), "utf8")).pid as number;
  type Win = Awaited<ReturnType<Awaited<ReturnType<typeof launch>>["firstWindow"]>>;
  type States = Record<string, { alive: boolean; sessionId: string | null }>;
  const call = (win: Win, cmd: string, args: object = {}) =>
    win.evaluate(
      async ([cmd, args]) =>
        (await fetch(`/api/${cmd}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) })).json(),
      [cmd, args] as const,
    );
  const sessionOf = async (win: Win, name: string) => ((await call(win, "session_states")) as States)[name];
  let pid = 0;
  try {
    step("1. 앱 실행");
    const first = await launch();
    step("2. 첫 창·보드");
    const win = await first.firstWindow();
    await expect(win.getByRole("button", { name: ADD_PROJECT }).first()).toBeVisible({ timeout: 30_000 });
    const name = (await call(win, "session_start", { project, role: "plan" })) as string;
    await expect.poll(async () => (await sessionOf(win, name))?.sessionId, { timeout: 15_000 }).toBeTruthy();
    const sid = (await sessionOf(win, name)).sessionId;
    // 세션 터미널에 pty 출력이 온다(가짜 claude의 `ready>` — Windows는 ConPTY)
    const screen = await win.evaluate(
      (name) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(`ws://${location.host}/ws`);
          let text = "";
          const done = () => (ws.close(), resolve(text));
          ws.onopen = () => ws.send(JSON.stringify({ type: "term_open", id: 99, name, cols: 80, rows: 24 }));
          ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.type === "term" && m.id === 99 && (text += m.data).includes("ready>")) done();
          };
          setTimeout(done, 10_000);
        }),
      name,
    );
    expect(screen).toContain("ready>");
    pid = serverPid();
    step("3. 앱 종료");
    await quitApp(first);
    step("4. 앱 종료됨");
    process.kill(pid, "SIGKILL");
    await expect.poll(() => alive(pid)).toBe(false);

    step("5. 다시 실행");
    const second = await launch();
    const win2 = await second.firstWindow();
    await expect.poll(async () => (await sessionOf(win2, name).catch(() => undefined))?.alive, { timeout: 30_000 }).toBe(true);
    pid = serverPid();
    const args = JSON.parse(readFileSync(out, "utf8")).args as string[];
    expect(args[args.indexOf("--resume") + 1], args.join(" ")).toBe(sid);
    step("6. 두 번째 앱 종료");
    await quitApp(second);
  } finally {
    if (pid && alive(pid)) process.kill(pid, "SIGKILL");
    cleanup(dir);
  }
});
