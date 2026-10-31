// 세션 복구(데스크톱 앱 2/6) — 서버가 어떻게 내려가든(SIGTERM·SIGKILL) 열려 있던 세션을 다음 서버가 `claude --resume <대화 ID>`로
// 다시 띄운다. 사람이 끝낸 세션([세션 종료]·claude 스스로 종료)과 등록을 해제한 프로젝트의 세션은 돌아오지 않는다.
// 실제 진입점(`node server/main.js`)을 임시 데이터 폴더로 띄우고, claude 자리에 가짜 claude(fake-claude.js)를 넣어 받은 인자로 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const skip = process.platform === 'win32'; // 가짜 claude를 sh로 감싼다(Windows는 4/6)
const main = join(import.meta.dirname, '../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

async function waitFor(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout: ${fn}`);
    await sleep(100);
  }
}

/** 임시 데이터 폴더·프로젝트·포트·가짜 claude — 끝나면 dispose()로 서버를 내리고 지운다. */
async function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'anvil-restore-')));
  const s = { root, data: join(root, 'data'), project: join(root, 'proj'), out: join(root, 'fake-out.json'), servers: [] };
  mkdirSync(s.project);
  const fake = join(root, 'claude');
  writeFileSync(fake, `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dirname, 'fake-claude.js')}' "$@"\n`);
  chmodSync(fake, 0o755);
  s.port = await freePort();
  s.env = { ...process.env, ANVIL_PORT: String(s.port), ANVIL_DATA_DIR: s.data, ANVIL_CLAUDE: fake, ANVIL_IDLE_MS: '0', FAKE_OUT: s.out };
  delete s.env.ELECTRON_RUN_AS_NODE;
  s.dispose = () => {
    for (const c of s.servers) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  };
  return s;
}

function boot(s) {
  const child = spawn(process.execPath, [main], { env: s.env, stdio: ['ignore', 'pipe', 'inherit'] });
  s.servers.push(child);
  return new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', (d) => {
      text += d;
      if (/Anvil: http/.test(text)) resolve(child);
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${text}`)));
  });
}

async function api(s, cmd, args = {}) {
  const token = readFileSync(join(s.data, 'token'), 'utf8').trim();
  const res = await fetch(`http://127.0.0.1:${s.port}/api/${cmd}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${cmd}: ${JSON.stringify(body)}`);
  return body;
}

async function stop(child, sig) {
  child.kill(sig);
  if (child.exitCode === null && child.signalCode === null) await new Promise((r) => child.once('exit', r));
  await sleep(500); // pty 자식(가짜 claude)이 끝날 시간
}

const list = (s) => {
  try {
    return JSON.parse(readFileSync(join(s.data, 'restore.json'), 'utf8'));
  } catch {
    return [];
  }
};
const args = (s) => JSON.parse(readFileSync(s.out, 'utf8')).args;

/** 프로젝트를 등록하고 계획 세션을 띄워 대화 ID까지 기다린다 → { name, sid } */
async function open(s) {
  await api(s, 'add_project', { path: s.project });
  const name = await api(s, 'session_start', { project: s.project, role: 'plan' });
  const st = await waitFor(async () => {
    const v = (await api(s, 'session_states'))[name];
    return v?.alive && v.state === 'waiting' && v.sessionId ? v : null;
  });
  return { name, sid: st.sessionId };
}

test('세션을 띄우면 복구 목록에 프로젝트·역할·이름이 남고, 훅이 알린 대화 ID도 들어간다', { skip }, async () => {
  const s = await setup();
  try {
    await boot(s);
    const { name, sid } = await open(s);
    const entry = await waitFor(async () => list(s).find((e) => e.name === name && e.sessionId === sid));
    assert.deepEqual(entry, { name, project: s.project, role: 'plan', sessionId: sid });
    if (process.platform !== 'win32') assert.equal(statSync(join(s.data, 'restore.json')).mode & 0o777, 0o600);
  } finally {
    s.dispose();
  }
});

test('[세션 종료]로 끈 세션과 claude가 스스로 끝난 세션은 복구 목록에서 빠진다', { skip }, async () => {
  const s = await setup();
  try {
    await boot(s);
    const { name } = await open(s);
    await api(s, 'session_kill', { name });
    assert.equal(list(s).length, 0, '[세션 종료]');
    await api(s, 'session_start', { project: s.project, role: 'plan' });
    await waitFor(async () => list(s).length === 1);
    await waitFor(async () => (await api(s, 'session_states'))[name]?.state === 'waiting');
    await api(s, 'session_fill', { project: s.project, role: 'plan', text: 'exit\r' }); // 가짜 claude가 스스로 끝난다(/exit)
    await waitFor(async () => list(s).length === 0);
  } finally {
    s.dispose();
  }
});

// 재부팅 때 macOS는 서버와 claude에 거의 동시에 SIGTERM을 보낸다 — claude가 먼저 끝나도 "스스로 끝남"으로 빼지 않는다.
// 실제 claude는 SIGTERM에 143, SIGHUP에 129, /exit에 0으로 끝난다(2026-10-31 실측).
test('서버가 살아 있는 동안 claude가 신호로 죽거나 128 이상 코드로 끝나면 복구 목록에 남는다', { skip }, async () => {
  const s = await setup();
  try {
    await boot(s);
    const { name } = await open(s);
    const pid = Number(execFileSync('pgrep', ['-f', s.data], { encoding: 'utf8' }).trim().split('\n')[0]);
    process.kill(pid, 'SIGTERM');
    await waitFor(async () => !(await api(s, 'session_states'))[name]?.alive);
    await sleep(300);
    assert.deepEqual(list(s).map((e) => e.name), [name], '신호로 죽음');
    await api(s, 'session_start', { project: s.project, role: 'plan' });
    await waitFor(async () => (await api(s, 'session_states'))[name]?.state === 'waiting');
    await api(s, 'session_fill', { project: s.project, role: 'plan', text: 'die143\r' });
    await waitFor(async () => !(await api(s, 'session_states'))[name]?.alive);
    await sleep(300);
    assert.deepEqual(list(s).map((e) => e.name), [name], '코드 143');
  } finally {
    s.dispose();
  }
});

for (const sig of ['SIGTERM', 'SIGKILL']) {
  test(`서버를 ${sig}로 내려도 목록이 남고, 다시 뜬 서버가 같은 세션을 --resume <대화 ID>로 띄운다`, { skip }, async () => {
    const s = await setup();
    try {
      const first = await boot(s);
      const { name, sid } = await open(s);
      await waitFor(async () => list(s).some((e) => e.sessionId === sid));
      await stop(first, sig);
      assert.deepEqual(list(s).map((e) => [e.name, e.sessionId]), [[name, sid]], '서버가 내려가며 끝난 세션은 목록에 남는다');
      await boot(s);
      await waitFor(async () => (await api(s, 'session_states'))[name]?.alive);
      const got = await waitFor(async () => (args(s).includes('--resume') ? JSON.parse(readFileSync(s.out, 'utf8')) : null));
      assert.equal(got.args[got.args.indexOf('--resume') + 1], sid);
      assert.equal(got.cwd, s.project);
      assert.ok(got.args.includes('[Anvil] [proj] PLAN'), '같은 세션 이름(-n)으로 뜬다');
    } finally {
      s.dispose();
    }
  });
}

test('훅이 대화 ID를 알린 직후 서버가 죽어도(목록에 옮기기 전) 그 ID로 이어 연다', { skip }, async () => {
  const s = await setup();
  try {
    const first = await boot(s);
    const { name, sid } = await open(s);
    await stop(first, 'SIGKILL'); // 목록 반영(파일 감시 지연)을 기다리지 않는다 — restore-probe가 잡은 틈
    await boot(s);
    await waitFor(async () => (await api(s, 'session_states'))[name]?.alive);
    const got = await waitFor(async () => (args(s).includes('--resume') ? args(s) : null), 5000);
    assert.equal(got[got.indexOf('--resume') + 1], sid);
  } finally {
    s.dispose();
  }
});

test('대화 ID가 없는 항목은 --resume 없이 새 claude로, 등록을 해제한 프로젝트의 항목은 띄우지 않고 목록에서 뺀다', { skip }, async () => {
  const s = await setup();
  try {
    const gone = join(s.root, 'gone');
    mkdirSync(gone);
    const first = await boot(s);
    await api(s, 'add_project', { path: s.project });
    await api(s, 'add_project', { path: gone });
    const [plan] = await api(s, 'session_names', { project: s.project });
    const [gonePlan] = await api(s, 'session_names', { project: gone });
    await api(s, 'remove_project', { path: gone });
    await stop(first, 'SIGKILL');
    writeFileSync(
      join(s.data, 'restore.json'),
      JSON.stringify([
        { name: plan, project: s.project, role: 'plan', sessionId: null },
        { name: gonePlan, project: gone, role: 'plan', sessionId: 'old-sid' },
      ]),
    );
    // 옵션처럼 생긴 대화 ID는 claude 인자로 넘기지 않는다(`--resume --dangerously-…`가 되지 않게)
    writeFileSync(join(s.data, 'sessions', `${plan}.json`), JSON.stringify({ state: 'ended', session_id: '--dangerously-skip-permissions' }));
    await boot(s);
    await waitFor(async () => (await api(s, 'session_states'))[plan]?.alive);
    const got = await waitFor(async () => (existsSync(s.out) ? args(s) : null));
    assert.ok(!got.includes('--resume'), got.join(' '));
    assert.equal((await api(s, 'session_states'))[gonePlan]?.alive ?? false, false);
    await waitFor(async () => list(s).every((e) => e.project !== gone));
  } finally {
    s.dispose();
  }
});
