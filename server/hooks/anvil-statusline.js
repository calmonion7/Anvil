// 상태줄 래퍼 — claude가 상태줄을 그릴 때 `node anvil-statusline.js <데이터 폴더>`로 부른다(훅 입력에는 모델이 없다).
// 넘어온 JSON의 모델·effort를 `<데이터 폴더>/models/<ANVIL_SESSION>.json`에 남긴 뒤, 같은 입력으로 사용자의 원래
// 상태줄 명령을 실행해 출력을 그대로 내보낸다. sh·jq판(src-tauri session.rs STATUSLINE_SCRIPT) 이식.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [dir] = process.argv.slice(2);
const name = process.env.ANVIL_SESSION;
let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {}
let v = {};
try {
  v = JSON.parse(input) ?? {};
} catch {}

if (name && dir) {
  try {
    // effort는 { level } 객체 또는 옛 형식인 문자열(claude-hud src/effort.ts와 같은 해석)
    const e = v.effort;
    const effort = e && typeof e === 'object' && !Array.isArray(e) ? (e.level ?? null) : typeof e === 'string' ? e : null;
    const f = join(dir, 'models', `${name}.json`);
    mkdirSync(join(dir, 'models'), { recursive: true });
    writeFileSync(`${f}.tmp`, `${JSON.stringify({ model: v.model?.display_name ?? null, effort })}\n`);
    renameSync(`${f}.tmp`, f);
  } catch {}
}

// 원래 상태줄 명령 — claude와 같은 우선순위(프로젝트 local → 프로젝트 → 사용자)
const proj = v.workspace?.project_dir || v.cwd || process.cwd();
let orig = '';
for (const s of [join(proj, '.claude/settings.local.json'), join(proj, '.claude/settings.json'), join(homedir(), '.claude/settings.json')]) {
  try {
    orig = JSON.parse(readFileSync(s, 'utf8')).statusLine?.command || '';
  } catch {
    orig = '';
  }
  if (orig) break;
}
// 이 래퍼 자신(옛 anvil-statusline.sh 포함)이면 다시 부르지 않는다.
if (typeof orig !== 'string' || !orig || orig.includes('anvil-statusline')) process.exit(0);
const win = process.platform === 'win32';
const r = spawnSync(win ? orig : 'bash', win ? [] : ['-c', orig], { input, shell: win, stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(r.status ?? 0);
