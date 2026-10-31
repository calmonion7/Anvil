// node-pty가 이 OS에서 실제로 프로세스를 띄운다(macOS·Linux는 prebuild의 spawn-helper 실행 권한 포함, Windows는 ConPTY).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pty from '../pty.js';

test('node-pty로 echo를 띄워 출력을 받는다', async () => {
  const p = process.platform === 'win32' ? pty.spawn('cmd.exe', ['/c', 'echo pty-ok'], { cols: 80, rows: 24 }) : pty.spawn('/bin/echo', ['pty-ok'], { cols: 80, rows: 24 });
  let out = '';
  p.onData((d) => (out += d));
  const code = await new Promise((resolve) => p.onExit((e) => resolve(e.exitCode)));
  assert.equal(code, 0);
  assert.match(out, /pty-ok/);
});
