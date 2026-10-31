// 자체 업데이터의 OS별 교체 단계를 진짜 설치 파일로 확인한다(데스크톱 앱 5/6 DoD 2) — CI가 같은 앱을 두 버전으로 만들어 넘긴다.
// 옛 버전을 설치 → server/replace.js의 교체 스크립트로 새 버전으로 교체(다시 열기는 끈다) → 설치본이 새 버전인지 본다.
// 사용: node scripts/check-replace.mjs <옛 dist> <새 dist> <새 버전>
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCRIPTS } from '../server/replace.js';

const [oldDir, newDir, newVersion] = process.argv.slice(2);
if (!newVersion) {
  console.error('사용: node scripts/check-replace.mjs <옛 dist> <새 dist> <새 버전>');
  process.exit(2);
}
const tmp = mkdtempSync(join(tmpdir(), 'anvil-check-replace-'));
const find = (dir, re) => {
  const f = readdirSync(dir).find((n) => re.test(n));
  if (!f) throw new Error(`${dir}에 ${re} 파일이 없다`);
  return join(dir, f);
};
/** 교체 스크립트를 업데이터와 같은 인자로 돌린다(업데이트 파일은 스크립트가 지우므로 복사본을 넘긴다) */
function replace(platform, update, target, running) {
  const copy = join(tmp, update.split(/[\\/]/).pop());
  copyFileSync(update, copy);
  const s = SCRIPTS[platform];
  const script = join(tmp, s.name);
  writeFileSync(script, s.text, { mode: 0o755 });
  const env = { ...process.env, ANVIL_NO_RELAUNCH: '1' };
  if (platform === 'win32') execFileSync('cmd.exe', ['/d', '/c', script, copy, target], { env, stdio: 'inherit' });
  else execFileSync('/bin/sh', [script, copy, target, running], { env, stdio: 'inherit' });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let before;
let after;

if (process.platform === 'darwin') {
  const re = new RegExp(`-mac-${process.arch}\\.zip$`);
  execFileSync('ditto', ['-x', '-k', find(oldDir, re), join(tmp, 'inst')]);
  const app = join(tmp, 'inst/Anvil.app');
  const version = () => execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  before = version();
  replace('darwin', find(newDir, re), app, `${app}/Contents/`);
  after = version();
} else if (process.platform === 'linux') {
  const re = /-linux-x86_64\.AppImage$/;
  const app = join(tmp, 'Anvil.AppImage');
  copyFileSync(find(oldDir, re), app);
  const sum = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
  const next = find(newDir, re);
  before = sum(app) === sum(next) ? newVersion : 'old';
  replace('linux', next, app, join(tmp, 'no-such-mount/'));
  after = sum(app) === sum(next) ? newVersion : 'old';
} else if (process.platform === 'win32') {
  const re = /-win-x64\.exe$/;
  const exe = join(process.env.LOCALAPPDATA, 'Programs/Anvil/Anvil.exe');
  const version = () => {
    try {
      return execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${exe}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  execFileSync(find(oldDir, re), ['/S'], { stdio: 'inherit' });
  for (let i = 0; i < 60 && !version(); i++) await sleep(1000);
  before = version();
  replace('win32', find(newDir, re), join(process.env.LOCALAPPDATA, 'Programs/Anvil'));
  for (let i = 0; i < 60 && version() === before; i++) await sleep(1000); // 설치 프로그램이 뒤에서 마저 끝날 수 있다
  after = version();
} else {
  throw new Error(`지원하지 않는 OS: ${process.platform}`);
}

console.log(`교체 전 ${before} → 교체 뒤 ${after}`);
if (before === newVersion || !after.startsWith(newVersion)) {
  console.error(`실패: 옛 버전이 ${newVersion}으로 바뀌지 않았다`);
  process.exit(1);
}
console.log('통과: 옛 설치본이 새 버전으로 바뀌었다');
