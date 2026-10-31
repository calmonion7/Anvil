// forge 훅용 `node` 대체 실행 파일 — 서버가 Electron 아래서 돌면 세션 PATH의 `node`가 Electron을 node로 부른다
// (사용자 컴퓨터에 node가 없어도 훅·상태줄이 돈다). 일반 node로 돌 때는 아무것도 만들지 않는다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPath, setupNode } from '../env.js';

const electron = createRequire(import.meta.url)('electron');
const dir = mkdtempSync(join(tmpdir(), 'anvil-shim-'));
const skip = process.platform === 'win32'; // Windows `.cmd`는 4/6

after(() => {
  setupNode(dir, process.execPath, false); // 다른 테스트 파일의 runPath()에 남지 않게 되돌린다
  rmSync(dir, { recursive: true, force: true });
});

const { ELECTRON_RUN_AS_NODE: _drop, ...plainEnv } = process.env; // 세션 환경에는 이 변수가 없다

test('Electron 아래서는 세션 PATH의 node가 Electron 안의 node 버전을 찍는다', { skip }, () => {
  const node = setupNode(dir, electron, true);
  assert.equal(node, join(dir, 'bin', 'node'));
  assert.ok(runPath().startsWith(join(dir, 'bin')), runPath());
  const want = spawnSync(electron, ['-p', 'process.versions.node'], { env: { ...plainEnv, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  const got = spawnSync('node', ['-e', 'console.log(process.versions.node, typeof process.versions.electron)'], {
    env: { ...plainEnv, PATH: runPath() },
    encoding: 'utf8',
  });
  assert.equal(got.status, 0, got.stderr);
  assert.equal(got.stdout.trim(), `${want.stdout.trim()} string`);
});

test('일반 node로 돌 때는 대체 실행 파일을 만들지 않고 이 node를 쓴다', () => {
  const other = mkdtempSync(join(tmpdir(), 'anvil-shim-plain-'));
  try {
    assert.equal(setupNode(other, process.execPath, false), process.execPath);
    assert.equal(existsSync(join(other, 'bin')), false);
    assert.ok(!runPath().includes(other));
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});
