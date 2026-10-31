// 준비물 확인·forge 플러그인 버전 — src-tauri/src/deps.rs 단위 테스트 이식([설치]·tmux 몫은 빠졌다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forgeInstalled, forgeInstalledVersion, forgeLatestVersion, forgePluginFrom, installPlan, installWith, missing, needsMessage, startInstall } from '../deps.js';

function tempHome(fn) {
  const d = mkdtempSync(join(tmpdir(), 'anvil-deps-'));
  try {
    fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

test('빠진 준비물만 고른다', () => {
  const all = () => true;
  assert.deepEqual(missing(all, 'v22.20.0', true, 'linux'), []);
  assert.deepEqual(missing(all, 'v20.1.0', true, 'linux'), ['node']);
  assert.deepEqual(missing(all, null, true, 'linux'), ['node']);
  assert.deepEqual(missing((p) => p !== 'claude', 'v22.20.0', false, 'linux'), ['claude', 'forge']);
  // forge가 없을 때만 git을 묻는다 — macOS는 xcode-select로
  assert.deepEqual(missing((p) => p !== 'git', 'v22.20.0', false, 'linux'), ['git', 'forge']);
  assert.deepEqual(missing((p) => p !== 'xcode-select', 'v22.20.0', false, 'macos'), ['devtools', 'forge']);
  assert.deepEqual(missing(() => false, 'v22.20.0', true, 'macos'), ['claude']);
});

test('띠 문구는 빠진 항목을 잇는다', () => {
  assert.equal(needsMessage(['node', 'claude'], 'macos'), '필요: node 22 이상 · claude CLI');
  assert.match(needsMessage(['git', 'forge'], 'linux'), /sudo apt install git/);
});

test('forge 플러그인 새 버전·호환 판정', () => {
  const p = forgePluginFrom('0.9.5', '0.9.10');
  assert.ok(p.update_available && !p.untested);
  assert.ok(!forgePluginFrom('0.9.5', '0.9.5').update_available);
  assert.ok(forgePluginFrom('0.10.0', '0.10.0').untested);
  assert.ok(forgePluginFrom('1.0.0', null).untested);
  assert.ok(!forgePluginFrom(null, '0.9.5').update_available);
  assert.deepEqual(Object.keys(p), ['installed', 'latest', 'update_available', 'untested']);
});

test('설치 목록의 user 범위 버전과 마켓플레이스 버전을 읽는다', () =>
  tempHome((d) => {
    assert.ok(!forgeInstalled(d));
    mkdirSync(join(d, '.claude/plugins/marketplaces/forge/.claude-plugin'), { recursive: true });
    writeFileSync(
      join(d, '.claude/plugins/installed_plugins.json'),
      '{"plugins":{"forge@forge":[{"scope":"local","version":"0.8.1"},{"scope":"user","version":"0.9.5"}]}}',
    );
    writeFileSync(join(d, '.claude/plugins/marketplaces/forge/.claude-plugin/plugin.json'), '{"version":"0.9.6"}');
    assert.ok(forgeInstalled(d));
    assert.equal(forgeInstalledVersion(d), '0.9.5');
    assert.equal(forgeLatestVersion(d), '0.9.6');
  }));

// ---------- 첫 실행 자동 설치(데스크톱 앱 3/6) — 설치 명령은 주입한 가짜 실행기로 돈다 ----------

/** 받은 명령을 기록하고, `fail`에 맞는 명령은 오류로 끝내는 가짜 실행기. `out`은 명령별 표준 출력. */
function fakeExec({ fail = () => null, out = () => '' } = {}) {
  const calls = [];
  const x = async (prog, args) => {
    const cmd = [prog, ...args].join(' ');
    calls.push(cmd);
    const err = fail(cmd);
    if (err) throw new Error(err);
    return out(cmd);
  };
  return { x, calls };
}
const states = (items) => items.map((i) => [i.need, i.state]);

// CI의 앱 스모크(4/6): 러너에는 claude·forge가 없어 「준비 중」이 보드를 가리고, 자동 설치가 러너 홈에 실제로 설치하려 든다.
test('ANVIL_SKIP_DEPS가 있으면 준비물이 다 있는 것으로 답한다(테스트 전용)', async () => {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const home = mkdtempSync(join(tmpdir(), 'anvil-deps-home-')); // forge가 설치되지 않은 홈
  Object.assign(process.env, { HOME: home, USERPROFILE: home });
  try {
    const { commands } = await import('../deps.js');
    assert.ok((await commands.deps_status()).needs.includes('forge'), '대조: 건너뛰지 않으면 forge가 빠진다');
    process.env.ANVIL_SKIP_DEPS = '1';
    assert.deepEqual((await commands.deps_status()).needs, []);
  } finally {
    delete process.env.ANVIL_SKIP_DEPS;
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    rmSync(home, { recursive: true, force: true });
  }
});

test('Windows는 forge가 있어도 Git을 확인한다(claude가 Git Bash로 돈다)', () => {
  assert.deepEqual(missing((p) => p !== 'git', 'v22.20.0', true, 'windows'), ['git']);
  assert.deepEqual(missing((p) => p !== 'git', 'v22.20.0', true, 'linux'), []);
});

test('설치 순서: Windows Git·mac 개발자 도구 → claude → forge, node는 설치하지 않는다', () => {
  assert.deepEqual(installPlan(['forge', 'claude', 'git'], 'windows').map((i) => i.need), ['git', 'claude', 'forge']);
  assert.deepEqual(installPlan(['node', 'forge', 'claude', 'devtools'], 'macos').map((i) => i.need), ['devtools', 'claude', 'forge']);
  assert.ok(installPlan(['claude'], 'macos').every((i) => i.state === 'pending'));
});

test('claude는 공식 설치 스크립트로, forge는 마켓플레이스를 더한 뒤 사용자 범위로 설치한다', async () => {
  const { x, calls } = fakeExec();
  const seen = [];
  const items = await installWith(['claude', 'forge'], 'macos', x, { onChange: (v) => seen.push(states(v)) });
  assert.deepEqual(states(items), [['claude', 'ok'], ['forge', 'ok']]);
  assert.match(calls[0], /claude\.ai\/install\.sh/);
  assert.deepEqual(calls.slice(1), ['claude plugin marketplace list', 'claude plugin marketplace add gyuha/forge', 'claude plugin install forge@forge']);
  assert.ok(seen.some((s) => s[0][1] === 'running'), '진행 상황을 알린다');
});

test('다시 실행해도 안전: 마켓플레이스가 이미 있으면 더하지 않는다', async () => {
  const { x, calls } = fakeExec({ out: (c) => (c.endsWith('marketplace list') ? 'Configured marketplaces:\n  ❯ forge\n' : '') });
  await installWith(['forge'], 'macos', x);
  assert.deepEqual(calls, ['claude plugin marketplace list', 'claude plugin install forge@forge']);
});

test('설치가 실패하면 원문 오류를 남기고, claude가 안 되면 forge는 건너뛴다', async () => {
  const { x, calls } = fakeExec({ fail: (c) => (c.includes('install.sh') ? 'curl: (6) Could not resolve host: claude.ai' : null) });
  const items = await installWith(['claude', 'forge'], 'linux', x);
  assert.deepEqual(states(items), [['claude', 'failed'], ['forge', 'skipped']]);
  assert.match(items[0].detail, /Could not resolve host/);
  assert.equal(calls.length, 1);
});

test('Linux git은 관리자 권한이 필요해 안내만 하고 forge는 건너뛴다', async () => {
  const { x, calls } = fakeExec();
  const items = await installWith(['git', 'forge'], 'linux', x);
  assert.deepEqual(states(items), [['git', 'failed'], ['forge', 'skipped']]);
  assert.match(items[0].detail, /sudo apt install git/);
  assert.deepEqual(calls, []);
});

test('Windows Git은 winget 사용자 범위로, claude는 install.ps1로 설치한다', async () => {
  const { x, calls } = fakeExec();
  await installWith(['git', 'claude'], 'windows', x);
  assert.match(calls[0], /^winget install .*Git\.Git.*--scope user/);
  assert.match(calls[1], /install\.ps1/);
});

test('mac 개발자 도구: 설치 창을 띄우고 끝날 때까지 기다린 뒤 이어서, 끝내 안 되면 실패와 forge 건너뜀', async () => {
  const { x, calls } = fakeExec();
  const ok = await installWith(['devtools', 'forge'], 'macos', x, { wait: async () => true });
  assert.deepEqual(states(ok), [['devtools', 'ok'], ['forge', 'ok']]);
  assert.equal(calls[0], 'xcode-select --install');
  const no = await installWith(['devtools', 'forge'], 'macos', fakeExec().x, { wait: async () => false });
  assert.deepEqual(states(no), [['devtools', 'failed'], ['forge', 'skipped']]);
});

// VM UAT(2026-10-31): 설치 창이 Anvil 창 뒤에 숨고, 「설치 중…」만 보여 사람이 [설치]를 눌러야 하는 줄 몰랐다.
test('mac 개발자 도구: 설치 창을 앞으로 가져오고, 기다리는 동안 [설치]를 누르라는 안내를 보인다', async () => {
  const { x, calls } = fakeExec();
  let hint;
  const items = await installWith(['devtools'], 'macos', x, {
    wait: async () => true,
    onChange: (v) => v[0].state === 'running' && v[0].detail && (hint = v[0].detail),
  });
  assert.ok(calls.some((c) => c.startsWith('osascript') && c.includes('Install Command Line Developer Tools')), calls.join('\n'));
  assert.match(hint ?? '', /설치/);
  assert.equal(items[0].detail, null, '끝나면 안내를 지운다');
});

test('설치는 한 번에 하나만 돈다 — 진행 중에 또 부르면 같은 진행을 돌려준다', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let n = 0;
  const x = async () => {
    n++;
    await gate;
    return '';
  };
  const events = [];
  const ctx = { broadcast: (name, payload) => events.push([name, payload]) };
  const a = startInstall(ctx, { needs: ['claude'], os: 'macos', x });
  const b = startInstall(ctx, { needs: ['claude'], os: 'macos', x });
  assert.equal(a, b);
  release();
  const done = await a;
  assert.equal(n, 1);
  assert.deepEqual(states(done.items), [['claude', 'ok']]);
  assert.equal(done.running, false);
  assert.ok(events.every(([name]) => name === 'deps_progress'));
  assert.equal(events.at(-1)[1].running, false);
});
