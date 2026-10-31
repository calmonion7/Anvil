// OS별 교체 단계(데스크톱 앱 5/6) — 교체 스크립트를 그 OS에서 실제로 돌려 옛 설치본이 새것으로 바뀌는지 본다(다시 열기는 끈다).
// CI가 세 OS에서 `node --test server/`로 돌린다 — 테스트마다 자기 OS가 아니면 건너뛴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCRIPTS, installed } from '../replace.js';

function tempDir(fn) {
  const d = mkdtempSync(join(tmpdir(), 'anvil-replace-'));
  try {
    return fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

/** 스크립트를 쓰고 기다리며 돌린다(실제 앱은 detached로 띄우고 기다리지 않는다) */
function runScript(platform, dir, args, running = '') {
  const s = SCRIPTS[platform];
  const script = join(dir, s.name);
  writeFileSync(script, s.text, { mode: 0o755 });
  const env = { ...process.env, ANVIL_NO_RELAUNCH: '1', ANVIL_RUNNING: running };
  if (platform === 'win32') execFileSync('cmd.exe', ['/d', '/c', script, ...args], { env, stdio: 'pipe' });
  else execFileSync('/bin/sh', [script, ...args], { env, stdio: 'pipe' });
}

test('설치본만 업데이트한다 — 개발 실행·브라우저 서버는 아니다', () => {
  assert.equal(installed({ packaged: false, platform: 'darwin', execPath: '/Applications/Anvil.app/Contents/MacOS/Anvil' }), null);
  assert.deepEqual(installed({ packaged: true, platform: 'darwin', execPath: '/Applications/Anvil.app/Contents/MacOS/Anvil' }), {
    platform: 'darwin',
    target: '/Applications/Anvil.app',
    running: '/Applications/Anvil.app/Contents/',
  });
  assert.equal(installed({ packaged: true, platform: 'linux', execPath: '/tmp/.mount_x/anvil', env: {} }), null, 'AppImage로 돌지 않으면 바꿀 파일이 없다');
  assert.equal(installed({ packaged: true, platform: 'linux', execPath: '/tmp/.mount_x/anvil', env: { APPIMAGE: '/home/u/Anvil.AppImage' } }).target, '/home/u/Anvil.AppImage');
  assert.equal(installed({ packaged: true, platform: 'win32', execPath: 'C:\\u\\Programs\\Anvil\\Anvil.exe' }).platform, 'win32');
});

test('mac 스크립트는 번들 ID가 아니라 바꿀 .app 경로에만, 돌 때만 종료를 청한다(같은 ID의 다른 설치본을 끄지 않는다)', () => {
  assert.doesNotMatch(SCRIPTS.darwin.text, /app id/);
  assert.match(SCRIPTS.darwin.text, /if pgrep -f "\$ANVIL_RUNNING"[^\n]*quit app \\"\$2\\"/);
});

test('남은 앱을 찾는 패턴은 인자가 아니라 환경변수로 받는다 — 인자면 스크립트 자신이 걸려 스스로를 끝낸다(Linux CI 실측)', () => {
  for (const p of ['darwin', 'linux']) assert.doesNotMatch(SCRIPTS[p].text, /\$3/, p);
});

test('Windows 스크립트는 설치 프로그램을 call로 불러 돌아와서 지운다', () => {
  assert.match(SCRIPTS.win32.text, /call "%~1" \/S/);
});

test('mac: 내려받은 .zip을 풀어 옛 .app을 새 .app으로 통째로 바꾼다', { skip: process.platform !== 'darwin' }, () => {
  tempDir((d) => {
    const mk = (root, v) => {
      mkdirSync(join(root, 'Anvil.app/Contents/MacOS'), { recursive: true });
      writeFileSync(join(root, 'Anvil.app/Contents/version'), v);
    };
    mk(join(d, 'new'), '0.2.0');
    const zip = join(d, 'Anvil-0.2.0-mac-arm64.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', join(d, 'new/Anvil.app'), zip]);
    mk(join(d, 'inst'), '0.1.8');
    writeFileSync(join(d, 'inst/Anvil.app/Contents/old-only'), 'x');
    const app = join(d, 'inst/Anvil.app');
    runScript('darwin', d, [zip, app], `${app}/Contents/`);
    assert.equal(readFileSync(join(app, 'Contents/version'), 'utf8'), '0.2.0');
    assert.throws(() => statSync(join(app, 'Contents/old-only')), '옛 .app에만 있던 파일은 남지 않는다');
    assert.throws(() => statSync(zip), '내려받은 파일은 지운다');
  });
});

test('Linux: 새 AppImage로 옛 파일을 바꾸고 실행 권한을 준다', { skip: process.platform !== 'linux' }, () => {
  tempDir((d) => {
    const next = join(d, 'Anvil-0.2.0-linux-x86_64.AppImage');
    writeFileSync(next, 'new');
    const app = join(d, 'Anvil.AppImage');
    writeFileSync(app, 'old');
    runScript('linux', d, [next, app], join(d, 'no-such-mount/'));
    assert.equal(readFileSync(app, 'utf8'), 'new');
    assert.ok(statSync(app).mode & 0o100, '실행 권한');
  });
});

test('Windows: 설치 프로그램을 조용히(/S) 돌리고 지운다', { skip: process.platform !== 'win32' }, () => {
  tempDir((d) => {
    const mark = join(d, 'ran.txt');
    const installer = join(d, 'Anvil-0.2.0-win-x64.cmd'); // 가짜 설치 프로그램 — 받은 인자를 적는다
    writeFileSync(installer, `@echo off\r\necho %*> "${mark}"\r\n`);
    runScript('win32', d, [installer, d]);
    assert.equal(readFileSync(mark, 'utf8').trim(), '/S');
    assert.throws(() => statSync(installer), '설치 프로그램은 지운다');
  });
});
