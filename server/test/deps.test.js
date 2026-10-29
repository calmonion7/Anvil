// 준비물 확인·forge 플러그인 버전 — src-tauri/src/deps.rs 단위 테스트 이식([설치]·tmux 몫은 빠졌다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forgeInstalled, forgeInstalledVersion, forgeLatestVersion, forgePluginFrom, missing, needsMessage } from '../deps.js';

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
