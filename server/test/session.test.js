// 세션(S4) — 가짜 claude(fake-claude.js)를 ANVIL_CLAUDE로 claude 자리에 넣어 node-pty로 띄우고,
// 훅 스크립트(hooks/anvil-hook.js)가 남기는 상태 전이와 브라우저 재접속 때의 출력 재생을 확인한다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPath } from '../env.js';
import { commands as c, init, sessionName } from '../session.js';

const skip = false; // Windows는 가짜 claude를 .cmd로 감싼다(데스크톱 앱 4/6)
const root = realpathSync(mkdtempSync(join(tmpdir(), 'anvil-session-')));
const dataDir = join(root, 'data');
const registered = new Set();
const events = [];
const ctx = {
  dataDir,
  port: 0,
  broadcast: (name, payload) => events.push({ name, payload }),
  registered: (p) => registered.has(p),
};

// Electron 런타임에서 돌 때(electron.test.js) process.execPath는 Electron이다 — 세션 환경에는 ELECTRON_RUN_AS_NODE가 없으므로
// 래퍼가 직접 붙이고, 받은 값은 FAKE_RUN_AS_NODE로 남긴다. Windows는 .cmd 래퍼(세션이 cmd.exe로 감싸 띄운다 — env.js spawnTarget).
const fakeJs = join(import.meta.dirname, 'fake-claude.js');
const fake = join(root, process.platform === 'win32' ? 'claude.cmd' : 'claude');
writeFileSync(
  fake,
  process.platform === 'win32'
    ? `@echo off\r\nif defined ELECTRON_RUN_AS_NODE (set "FAKE_RUN_AS_NODE=%ELECTRON_RUN_AS_NODE%") else (set "FAKE_RUN_AS_NODE=unset")\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${fakeJs}" %*\r\n`
    : `#!/bin/sh\nFAKE_RUN_AS_NODE="\${ELECTRON_RUN_AS_NODE-unset}" ELECTRON_RUN_AS_NODE=1 exec '${process.execPath}' '${fakeJs}' "$@"\n`,
);
chmodSync(fake, 0o755);
process.env.ANVIL_CLAUDE = fake;

function project(name) {
  const p = join(root, name);
  mkdirSync(p);
  registered.add(p);
  return p;
}

/** 웹소켓 연결 자리: 받은 메시지를 모으고, close()로 연결 끊김을 흉내 낸다. */
function fakeConn() {
  const out = [];
  const closers = [];
  return {
    send: (msg) => out.push(msg),
    onClose: (fn) => closers.push(fn),
    close: () => closers.forEach((fn) => fn()),
    text: (id) => out.filter((m) => m.type === 'term' && m.id === id).map((m) => m.data).join(''),
  };
}

async function waitFor(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout: ${fn}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const stateOf = async (name) => (await c.session_states({}, ctx))[name];
const sawEvent = (name, state) => events.some((e) => e.name === 'sessions' && e.payload[name]?.state === state);

before(async () => {
  if (!skip) await init(ctx);
});

after(async () => {
  if (!skip) {
    for (const [name, s] of Object.entries(await c.session_states({}, ctx))) {
      if (s.alive) await c.session_kill({ name }, ctx);
    }
  }
  rmSync(root, { recursive: true, force: true });
});

test('훅이 남긴 세션 상태가 입력 대기 → 작업 중 → 입력 대기 → 종료로 바뀌고 sessions 이벤트로 나간다', { skip }, async () => {
  const p = project('states');
  const name = await c.session_start({ project: p, role: 'plan' }, ctx);
  assert.equal(name, sessionName(p, 'plan'));
  assert.equal(await c.session_start({ project: p, role: 'plan' }, ctx), name, '이미 떠 있으면 그 세션을 돌려준다');

  await waitFor(async () => (await stateOf(name))?.state === 'waiting');
  assert.deepEqual(await stateOf(name), { state: 'waiting', sessionId: 'fake-sid', alive: true });

  const conn = fakeConn();
  const tctx = { ...ctx, conn };
  await c.term_open({ id: 1, name, cols: 80, rows: 24 }, tctx);
  await c.term_write({ id: 1, data: 'go\r' }, tctx);
  await waitFor(async () => (await stateOf(name))?.state === 'working');
  await waitFor(() => sawEvent(name, 'working'));

  await c.term_write({ id: 1, data: 'done\r' }, tctx);
  await waitFor(async () => (await stateOf(name))?.state === 'waiting');

  await c.term_write({ id: 1, data: 'exit\r' }, tctx);
  await waitFor(async () => (await stateOf(name))?.alive === false);
  assert.equal((await stateOf(name)).state, 'ended');
  await waitFor(() => sawEvent(name, 'ended'));
});

test('브라우저 연결이 끊겨도 pty는 남고, 다시 붙으면 끊긴 동안의 출력까지 재생한다', { skip }, async () => {
  const p = project('replay');
  const name = await c.session_start({ project: p, role: 'run' }, ctx);
  await waitFor(async () => (await stateOf(name))?.state === 'waiting');
  // 가짜 claude는 SessionStart 훅을 부른 뒤에 `ready>`를 찍는다 — 그 출력이 재생 버퍼에 들 때까지 기다린다(10번 중 4번 경쟁으로 실패했다).
  await waitFor(async () => {
    const t = fakeConn();
    await c.term_open({ id: 9, name, cols: 80, rows: 24 }, { ...ctx, conn: t });
    t.close();
    return t.text(9).includes('ready>');
  });

  const a = fakeConn();
  await c.term_open({ id: 7, name, cols: 80, rows: 24 }, { ...ctx, conn: a });
  assert.match(a.text(7), /ready>/, '붙자마자 지금까지의 출력을 받는다');
  await c.term_write({ id: 7, data: 'first\r' }, { ...ctx, conn: a });
  await waitFor(() => a.text(7).includes('got:first'));

  a.close(); // 브라우저 탭을 닫음
  assert.equal((await stateOf(name)).alive, true, '연결이 끊겨도 세션은 산다');
  await assert.rejects(c.term_write({ id: 7, data: 'x' }, { ...ctx, conn: a }), /터미널이 없습니다/);

  // 아무 화면도 붙어 있지 않을 때 나온 출력
  await c.session_fill({ project: p, role: 'run', text: 'second\r' }, ctx);
  const replay = await waitFor(async () => {
    const b = fakeConn();
    await c.term_open({ id: 1, name, cols: 80, rows: 24 }, { ...ctx, conn: b });
    b.close();
    return b.text(1).includes('got:second') && b.text(1);
  });
  assert.match(replay, /ready>[\s\S]*got:first[\s\S]*got:second/);

  // 여러 화면이 함께 붙을 수 있다
  const x = fakeConn();
  const y = fakeConn();
  await c.term_open({ id: 1, name, cols: 80, rows: 24 }, { ...ctx, conn: x });
  await c.term_open({ id: 1, name, cols: 100, rows: 30 }, { ...ctx, conn: y });
  await c.term_resize({ id: 1, cols: 90, rows: 30 }, { ...ctx, conn: y });
  await c.term_write({ id: 1, data: 'both\r' }, { ...ctx, conn: x });
  await waitFor(() => x.text(1).includes('got:both') && y.text(1).includes('got:both'));
  await c.term_close({ id: 1 }, { ...ctx, conn: x });
  await assert.rejects(c.term_write({ id: 1, data: 'x' }, { ...ctx, conn: x }), /터미널이 없습니다/);
  y.close();
  await assert.rejects(c.term_open({ id: 1, name: 'anvil-none-plan', cols: 80, rows: 24 }, { ...ctx, conn: x }), /세션이 없습니다/);
});

test('재생 버퍼는 최근 256KB까지만 남긴다', { skip }, async () => {
  const p = project('flood');
  const name = await c.session_start({ project: p, role: 'run' }, ctx);
  await waitFor(async () => (await stateOf(name))?.state === 'waiting');
  await c.session_fill({ project: p, role: 'run', text: 'flood\r' }, ctx);
  const replay = await waitFor(async () => {
    const b = fakeConn();
    await c.term_open({ id: 1, name, cols: 80, rows: 24 }, { ...ctx, conn: b });
    b.close();
    return b.text(1).includes('END') && b.text(1);
  });
  assert.ok(replay.length <= 256 * 1024, `${replay.length}`);
  assert.ok(!replay.includes('ready>'), '오래된 출력은 밀려난다');
});

test('입력창 채우기: 세션이 없으면 띄워 입력 대기를 기다린 뒤 Enter 없이 채우고, 작업 중이면 거절한다', { skip }, async () => {
  const p = project('fill');
  await assert.rejects(c.session_fill({ project: join(root, 'nope'), role: 'plan', text: 'x' }, ctx), /등록하지 않은 프로젝트/);
  await assert.rejects(c.session_fill({ project: p, role: 'x', text: 'x' }, ctx), /알 수 없는 역할: x/);
  await assert.rejects(c.session_start({ project: join(root, 'nope'), role: 'plan' }, ctx), /등록하지 않은 프로젝트/);

  const name = await c.session_fill({ project: p, role: 'plan', text: '/forge:fg-run' }, ctx);
  assert.equal(name, sessionName(p, 'plan'));
  const conn = fakeConn();
  await c.term_open({ id: 1, name, cols: 80, rows: 24 }, { ...ctx, conn });
  await waitFor(() => conn.text(1).includes('/forge:fg-run'));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!conn.text(1).includes('got:/forge:fg-run'), 'Enter는 보내지 않는다');

  await c.term_write({ id: 1, data: '\x15go\r' }, { ...ctx, conn }); // ^U로 채운 글자를 지우고 작업 시작
  await waitFor(async () => (await stateOf(name))?.state === 'working');
  await assert.rejects(c.session_fill({ project: p, role: 'plan', text: 'x' }, ctx), /작업 중이라 채우지 않았습니다/);
  conn.close();
});

test('세션 종료: anvil- 세션만, 끝내면 바로 종료 상태', { skip }, async () => {
  await assert.rejects(c.session_kill({ name: 'other' }, ctx), /Anvil 세션이 아닙니다/);
  await assert.rejects(c.session_kill({ name: 'anvil-none-plan' }, ctx), /세션이 없습니다/);
  const p = project('kill');
  const name = await c.session_start({ project: p, role: 'plan' }, ctx);
  await waitFor(async () => (await stateOf(name))?.state === 'waiting');
  await c.session_kill({ name }, ctx);
  assert.deepEqual(await stateOf(name), { state: 'ended', sessionId: 'fake-sid', alive: false });
});

test('claude는 로그인 PATH·UTF-8 LANG·세션 이름 환경으로, 부모 claude 변수 없이, 역할 모델·훅 설정을 실어 뜬다', { skip }, async () => {
  const out = join(root, 'fake-out.json');
  const saved = { ...process.env };
  Object.assign(process.env, { FAKE_OUT: out, CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'parent', CLAUDE_EFFORT: 'low', CLAUDE_PID: '1', CLAUDE_CONFIG_DIR: '/keep', LANG: 'C', ELECTRON_RUN_AS_NODE: '1' });
  const p = project('env');
  let name;
  try {
    await c.set_model_setting({ role: 'run', model: 'haiku' }, ctx);
    name = await c.session_start({ project: p, role: 'run' }, ctx);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  const got = await waitFor(() => {
    try {
      return JSON.parse(readFileSync(out, 'utf8'));
    } catch {}
  });
  assert.deepEqual(got.args, ['-n', '[Anvil] [env] RUN', '--model', 'haiku', '--settings', join(dataDir, 'hooks.json')]);
  assert.equal(got.cwd, p);
  assert.equal(got.env.PATH, runPath());
  assert.equal(got.env.LANG, 'en_US.UTF-8', 'UTF-8이 아닌 LANG은 UTF-8 로캘로');
  assert.equal(got.env.ANVIL_SESSION, name);
  assert.equal(got.env.CC_SESSION_NAME, '[Anvil] [env] RUN');
  assert.equal(got.env.CLAUDE_CONFIG_DIR, '/keep', '사용자 설정은 남긴다');
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_EFFORT', 'CLAUDE_PID']) assert.ok(!(k in got.env), `${k} 남음`);
  assert.equal(got.env.FAKE_RUN_AS_NODE, 'unset', '세션 안에서 여는 다른 Electron 앱이 node로 뜨지 않게 ELECTRON_RUN_AS_NODE는 넘기지 않는다');
  await c.set_model_setting({ role: 'run', model: 'sonnet' }, ctx);
});

test('세션 이름은 실행마다 같고 프로젝트 경로로 구분된다', async () => {
  const a = sessionName('/Users/x/Project/BibleMap', 'plan');
  assert.equal(a, sessionName('/Users/x/Project/BibleMap', 'plan'));
  assert.match(a, /^anvil-biblemap-[0-9a-f]{6}-plan$/);
  assert.notEqual(a, sessionName('/Users/y/BibleMap', 'plan'));
  assert.match(sessionName('/a/한글 폴더', 'run'), /^anvil-[a-z0-9-]+-[0-9a-f]{6}-run$/);
  assert.deepEqual(await c.session_names({ project: '/Users/x/Project/BibleMap' }, ctx), [a, sessionName('/Users/x/Project/BibleMap', 'run')]);
});

test('역할별 모델 설정: 기본 계획 opus · 실행 sonnet, 고른 값이 이기고 깨진 설정은 기본값', async () => {
  const c2 = { ...ctx, dataDir: join(root, 'data2') };
  const p = '/Users/x/Project/BibleMap';
  assert.deepEqual(await c.model_settings({}, c2), { plan: 'opus', run: 'sonnet' });
  assert.deepEqual(await c.session_titles({ project: p }, c2), [
    ['[Anvil] [BibleMap] PLAN', 'opus'],
    ['[Anvil] [BibleMap] RUN', 'sonnet'],
  ]);
  await c.set_model_setting({ role: 'plan', model: 'default' }, c2);
  await c.set_model_setting({ role: 'run', model: 'haiku' }, c2);
  assert.deepEqual(await c.model_settings({}, c2), { plan: 'default', run: 'haiku' });
  assert.deepEqual((await c.session_titles({ project: p }, c2)).map((t) => t[1]), ['default', 'haiku']);
  await assert.rejects(c.set_model_setting({ role: 'run', model: 'gpt' }, c2), /알 수 없는 모델: gpt/);
  await assert.rejects(c.set_model_setting({ role: 'x', model: 'opus' }, c2), /알 수 없는 역할: x/);
  writeFileSync(join(c2.dataDir, 'settings.json'), '깨진 json');
  assert.equal((await c.model_settings({}, c2)).plan, 'opus');
  await c.set_model_setting({ role: 'plan', model: 'sonnet' }, c2);
  assert.equal((await c.model_settings({}, c2)).plan, 'sonnet');
});

test('서버에 없는 세션의 상태 파일은 종료로, 모델 기록은 그대로 읽는다', async () => {
  const c3 = { ...ctx, dataDir: join(root, 'data3') };
  mkdirSync(join(c3.dataDir, 'sessions'), { recursive: true });
  mkdirSync(join(c3.dataDir, 'models'), { recursive: true });
  writeFileSync(join(c3.dataDir, 'sessions/anvil-old-plan.json'), '{"state":"waiting","session_id":"s1","ts":1}\n');
  writeFileSync(join(c3.dataDir, 'sessions/anvil-old-run.json'), '깨짐');
  writeFileSync(join(c3.dataDir, 'models/anvil-old-plan.json'), '{"model":"Opus 5.5","effort":"high"}\n');
  const all = await c.session_states({}, c3); // 앞 테스트에서 살아 있는 세션도 함께 나온다
  const old = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('anvil-old-')));
  assert.deepEqual(old, {
    'anvil-old-plan': { state: 'ended', sessionId: 's1', alive: false },
    'anvil-old-run': { state: 'ended', sessionId: null, alive: false },
  });
  assert.deepEqual(await c.session_models({}, c3), { 'anvil-old-plan': { model: 'Opus 5.5', effort: 'high' } });
});
