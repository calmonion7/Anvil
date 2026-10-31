// Windows에서 세션·준비물 명령을 띄우는 데 필요한 것(데스크톱 앱 4/6) — 운영체제를 인자로 받아 어느 OS에서든 Windows 분기를 확인한다.
// Windows node-pty는 실행 파일을 서버 자신의 Path에서 이름 그대로만 찾는다(확장자를 붙이지 않는다 — node-pty src/win/path_util.cc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCommand, spawnTarget, withPath } from '../env.js';

test('환경의 PATH는 대소문자가 다른 이름(Path 등)을 지우고 하나만 남긴다', () => {
  const env = withPath({ Path: 'C:\\old', PATH: 'x', path: 'y', HOME: 'h' }, 'C:\\new');
  assert.deepEqual(env, { HOME: 'h', PATH: 'C:\\new' });
});

test('Windows: 실행 파일 이름을 PATH에서 .exe·.cmd·.bat까지 붙여 찾는다', () => {
  const files = new Set(['C:\\u\\.local\\bin\\claude.exe', 'C:\\n\\npx.cmd']);
  const exists = (f) => files.has(f);
  assert.equal(findCommand('claude', 'C:\\x;C:\\u\\.local\\bin', 'win32', exists), 'C:\\u\\.local\\bin\\claude.exe');
  assert.equal(findCommand('npx', 'C:\\n', 'win32', exists), 'C:\\n\\npx.cmd');
  assert.equal(findCommand('nope', 'C:\\n', 'win32', exists), 'nope', '못 찾으면 그대로');
  assert.equal(findCommand('C:\\a\\b.cmd', 'C:\\n', 'win32', exists), 'C:\\a\\b.cmd', '경로를 주면 그대로');
  assert.equal(findCommand('claude', '/usr/bin', 'darwin', () => true), 'claude', 'Windows가 아니면 그대로');
});

test('Windows .cmd·.bat은 cmd.exe로 감싸 명령줄 문자열로 넘기고, .exe는 그대로', () => {
  const [file, args] = spawnTarget('C:\\t\\claude.cmd', ['-n', '[Anvil] [p] PLAN', '--settings', 'C:\\d\\hooks.json'], 'win32');
  assert.equal(file, 'cmd.exe');
  assert.equal(args, '/d /s /c ""C:\\t\\claude.cmd" "-n" "[Anvil] [p] PLAN" "--settings" "C:\\d\\hooks.json""');
  assert.deepEqual(spawnTarget('C:\\t\\claude.exe', ['-n', 'x'], 'win32'), ['C:\\t\\claude.exe', ['-n', 'x']]);
  assert.deepEqual(spawnTarget('/usr/bin/claude.cmd', ['a'], 'darwin'), ['/usr/bin/claude.cmd', ['a']]);
});
