// OS별 교체 단계(데스크톱 앱 5/6) — 서버가 내려간 뒤 앱을 끄고, 새 버전으로 바꾸고, 다시 연다. 앱·서버가 쓰던 파일을 바꿔야 하므로
// 서버가 띄운 작은 스크립트가 서버 밖에서 맡는다. mac: `.zip`을 풀어 `.app`을 통째로 바꾼다. Windows: 설치 프로그램을 조용히(/S) 다시
// 돌린다(사용자 범위 설치라 관리자 권한이 없어도 된다). Linux: `$APPIMAGE` 파일을 바꾼다. 앱이 직접 내려받은 파일이라 mac 격리 표시가 붙지 않는다.
// `ANVIL_NO_RELAUNCH`가 있으면 바꾸기만 하고 다시 열지 않는다(CI 교체 확인용).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 지금 도는 설치본 → { platform, target, running } | null(개발 실행·브라우저 서버). target: mac `.app`, Windows 설치 폴더, Linux AppImage 파일.
 *  running: 남은 앱 프로세스를 찾을 실행 파일 경로의 앞부분 */
export function installed({ platform = process.platform, execPath = process.execPath, env = process.env, packaged = import.meta.dirname.includes('app.asar') } = {}) {
  if (!packaged) return null;
  if (platform === 'darwin') {
    const app = execPath.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/)?.[1];
    return app ? { platform, target: app, running: `${app}/Contents/` } : null;
  }
  if (platform === 'win32') return { platform, target: dirname(execPath), running: execPath };
  if (platform === 'linux') return env.APPIMAGE ? { platform, target: env.APPIMAGE, running: `${dirname(execPath)}/` } : null;
  return null;
}

export const installable = () => installed() !== null;

/** 남은 앱 프로세스(실행 파일 경로가 $3으로 시작)가 끝나길 30초 기다리고, 남으면 강제로 끝낸다 */
const STOP_SH = `i=0
while pgrep -f "$3" >/dev/null 2>&1 && [ $i -lt 60 ]; do sleep 0.5; i=$((i+1)); done
pkill -9 -f "$3" 2>/dev/null || true`;

/** OS별 교체 스크립트. 인자: $1 업데이트 파일, $2 target, $3 running(mac·Linux) */
export const SCRIPTS = {
  darwin: {
    name: 'replace.sh',
    text: `#!/bin/sh
# Anvil 업데이트(mac): $1 .zip → $2 .app 교체 후 다시 연다
set -e
NEW="$(mktemp -d)"
ditto -x -k "$1" "$NEW"
# 번들 ID가 아니라 바꿀 그 .app에만, 실제로 돌 때만 종료를 청한다 — 같은 ID의 다른 설치본(옛 Tauri 앱 등)을 끄지 않게
if pgrep -f "$3" >/dev/null 2>&1; then osascript -e "quit app \\"$2\\"" >/dev/null 2>&1 || true; fi
${STOP_SH}
rm -rf "$2"
ditto "$NEW/Anvil.app" "$2"
rm -rf "$NEW" "$1"
[ -n "$ANVIL_NO_RELAUNCH" ] || open "$2"
`,
  },
  linux: {
    name: 'replace.sh',
    text: `#!/bin/sh
# Anvil 업데이트(Linux): $1 새 AppImage → $2 교체 후 다시 연다
set -e
${STOP_SH}
mv -f "$1" "$2"
chmod +x "$2"
[ -n "$ANVIL_NO_RELAUNCH" ] || (nohup "$2" >/dev/null 2>&1 &)
`,
  },
  win32: {
    name: 'replace.cmd',
    text: `@echo off\r
rem Anvil 업데이트(Windows): %1 설치 프로그램을 조용히 돌린다(설치 폴더 %2) — 남은 앱을 끄고, 설치 뒤 다시 연다\r
taskkill /F /IM Anvil.exe >nul 2>&1\r
ping -n 3 127.0.0.1 >nul\r
if defined ANVIL_NO_RELAUNCH ("%~1" /S) else ("%~1" /S --force-run)\r
del "%~1"\r
`,
  },
};

/** 교체 스크립트를 업데이트 파일 옆에 쓰고 서버와 떨어진 프로세스로 띄운다(서버는 곧 내려간다). */
export async function replace(file, inst = installed()) {
  if (!inst) throw new Error('not an installed app');
  const s = SCRIPTS[inst.platform];
  const script = join(dirname(file), s.name);
  writeFileSync(script, s.text, { mode: 0o755 });
  const [cmd, args] = inst.platform === 'win32' ? ['cmd.exe', ['/d', '/c', script, file, inst.target]] : ['/bin/sh', [script, file, inst.target, inst.running]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
