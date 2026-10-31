// claude가 부르는 Node 스크립트(server/hooks/) — 세션 상태 훅과 상태줄 모델 기록 래퍼.
// session.rs의 sh·jq판(HOOK_SCRIPT · STATUSLINE_SCRIPT)과 같은 동작인지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOKS = join(import.meta.dirname, '../hooks');

function run(script, args, input, env) {
  const r = spawnSync(process.execPath, [join(HOOKS, script), ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ANVIL_SESSION: '', ...env },
  });
  return { ok: r.status === 0, out: r.stdout };
}

test('상태 훅: 세션 파일에 상태·session_id·시각을 남기고, 입력에 id가 없으면 전 값을 지킨다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anvil-hook-'));
  const rec = () => JSON.parse(readFileSync(join(dir, 'sessions/s.json'), 'utf8'));
  try {
    assert.ok(run('anvil-hook.js', [dir, 'waiting'], '{"session_id":"abc","hook_event_name":"SessionStart"}', { ANVIL_SESSION: 's' }).ok);
    const first = rec();
    assert.equal(first.state, 'waiting');
    assert.equal(first.session_id, 'abc');
    assert.ok(Math.abs(first.ts - Date.now() / 1000) < 60);

    assert.ok(run('anvil-hook.js', [dir, 'working'], '{}', { ANVIL_SESSION: 's' }).ok);
    assert.deepEqual([rec().state, rec().session_id], ['working', 'abc']);
    assert.ok(run('anvil-hook.js', [dir, 'ended'], '깨진 입력', { ANVIL_SESSION: 's' }).ok, '어떤 경우에도 claude를 막지 않는다');
    assert.deepEqual([rec().state, rec().session_id], ['ended', 'abc']);

    // Anvil 세션이 아니면(ANVIL_SESSION 없음) 아무것도 남기지 않는다
    assert.ok(run('anvil-hook.js', [dir, 'waiting'], '{}', {}).ok);
    assert.deepEqual(readFileSync(join(dir, 'sessions/s.json'), 'utf8').length > 0, true);
    assert.ok(!existsSync(join(dir, 'sessions/.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// session::tests::statusline_wrapper_records_model_and_passes_through 이식
test('상태줄 래퍼: 모델·effort(객체/옛 문자열)를 기록하고, 원래 상태줄 명령에 같은 입력을 넘겨 출력을 그대로 낸다', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'anvil-sl-'));
  const proj = join(dir, 'proj');
  mkdirSync(join(proj, '.claude'), { recursive: true });
  writeFileSync(join(proj, '.claude/settings.local.json'), '{"statusLine":{"command":"cat"}}');
  const sl = (name, input) => run('anvil-statusline.js', [dir], input, { ANVIL_SESSION: name, HOME: join(dir, 'nohome') });
  const rec = (name) => readFileSync(join(dir, `models/${name}.json`), 'utf8').trim();
  try {
    const input = JSON.stringify({ model: { display_name: 'Opus 5.5' }, effort: { level: 'high' }, workspace: { project_dir: proj } });
    assert.deepEqual(sl('s-plan', input), { ok: true, out: input });
    assert.equal(rec('s-plan'), '{"model":"Opus 5.5","effort":"high"}');

    // 옛 형식 문자열 effort, 원래 상태줄 없음 → 출력 없이 기록만
    const old = '{"model":{"display_name":"Sonnet 5.5"},"effort":"low","cwd":"/nonexistent"}';
    assert.deepEqual(sl('s-run', old), { ok: true, out: '' });
    assert.equal(rec('s-run'), '{"model":"Sonnet 5.5","effort":"low"}');

    // 원래 상태줄이 이 래퍼 자신이면 다시 부르지 않는다(무한 재귀 방지)
    writeFileSync(join(proj, '.claude/settings.local.json'), '{"statusLine":{"command":"node /x/anvil-statusline.js /d"}}');
    assert.deepEqual(sl('s-plan', input), { ok: true, out: '' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
