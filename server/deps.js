// 준비물(node 22 이상 · claude CLI · forge 플러그인) 확인과 forge 플러그인 버전 — src-tauri/src/deps.rs 이식.
// 앱 안 [설치]·로그인 열기는 없앴다(ADR 261029-121641: 설치는 한 줄 설치 스크립트가 맡는다). tmux는 더 이상 준비물이 아니다.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { claudeHome, runPath } from './env.js';
import { tr } from './i18n.js';

const run = promisify(execFile);
const platform = { darwin: 'macos', win32: 'windows' }[process.platform] ?? 'linux';

const FORGE_PLUGIN = 'forge@forge';
/** Anvil 보드가 맞춰 만든 forge 버전(major.minor). 이보다 높으면 `.forge/` 형식이 달라졌을 수 있다. */
const TESTED_FORGE = [0, 9];

const label = (need) =>
  ({
    devtools: tr('개발자 도구(git)', 'Developer tools (git)'),
    git: 'git',
    node: tr('node 22 이상', 'node 22+'),
    claude: 'claude CLI',
    forge: tr('forge 플러그인', 'forge plugin'),
  })[need];

/** claude가 기록하는 설치 목록에 forge 플러그인이 있는가. */
export function forgeInstalled(home) {
  try {
    return readFileSync(join(home, '.claude/plugins/installed_plugins.json'), 'utf8').includes('"forge@');
  } catch {
    return false;
  }
}

const nodeOk = (version) => Number(version.trim().replace(/^v/, '').split('.')[0]) >= 22;

/** 빠진 준비물. `probe(프로그램)`이 `--version`류 실행 성공 여부, `nodeVersion`이 `node --version` 출력.
 *  forge가 빠졌으면 git도 확인한다 — macOS는 `git` 대신 `xcode-select -p`로 물어야 설치 창이 뜨지 않는다. */
export function missing(probe, nodeVersion, forge, os) {
  const v = [];
  if (!forge) {
    if (os === 'macos' ? !probe('xcode-select', ['-p']) : !probe('git', ['--version'])) v.push(os === 'macos' ? 'devtools' : 'git');
  }
  if (!(nodeVersion && nodeOk(nodeVersion))) v.push('node');
  if (!probe('claude', ['--version'])) v.push('claude');
  if (!forge) v.push('forge');
  return v;
}

/** 띠 문구: 빠진 것들 + Linux에서 git이 빠졌으면 직접 설치 안내. */
export function needsMessage(needs, os) {
  let m = tr('필요: ', 'Required: ') + needs.map(label).join(' · ');
  if (needs.includes('git') && os === 'linux') {
    m += ` — ${tr('git은 터미널에서 직접 설치하세요: ', 'Install git yourself in a terminal: ')}\`sudo apt install git\``;
  }
  return m;
}

/** 확인용 실행 — 성공하면 표준 출력, 아니면 null. */
async function probeOut(prog, args) {
  try {
    return (await run(prog, args, { env: { ...process.env, PATH: runPath() }, timeout: 15_000 })).stdout;
  } catch {
    return null;
  }
}

async function status() {
  const progs = [
    ['node', ['--version']],
    ['claude', ['--version']],
    platform === 'macos' ? ['xcode-select', ['-p']] : ['git', ['--version']],
  ];
  const outs = new Map(await Promise.all(progs.map(async ([p, a]) => [p, await probeOut(p, a)])));
  const needs = missing((p) => outs.get(p) != null, outs.get('node'), forgeInstalled(claudeHome()), platform);
  // installable은 [설치]가 없어져 늘 false — 화면이 쓰던 모양은 그대로 둔다.
  return { needs, message: needs.length ? needsMessage(needs, platform) : null, installable: false, platform };
}

// ---------- forge 플러그인 버전 ----------

const ver = (s) => s.split(/[-+]/)[0].split('.').map((p) => Number(p) || 0);

function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** installed_plugins.json에서 user 범위 forge 버전. */
export function forgeInstalledVersion(home) {
  const plugins = readJson(join(home, '.claude/plugins/installed_plugins.json'))?.plugins ?? {};
  for (const [k, entries] of Object.entries(plugins)) {
    if (!k.startsWith('forge@') || !Array.isArray(entries)) continue;
    const v = entries.find((e) => e?.scope === 'user')?.version;
    if (typeof v === 'string') return v;
  }
  return null;
}

/** 마켓플레이스 폴더의 plugin.json 버전. */
export function forgeLatestVersion(home) {
  const v = readJson(join(home, '.claude/plugins/marketplaces/forge/.claude-plugin/plugin.json'))?.version;
  return typeof v === 'string' ? v : null;
}

export function forgePluginFrom(installed, latest) {
  const update_available = installed != null && latest != null && cmp(ver(latest), ver(installed)) > 0;
  const untested = installed != null && cmp(ver(installed).concat(0, 0).slice(0, 2), TESTED_FORGE) > 0;
  return { installed, latest, update_available, untested };
}

export const commands = {
  /** 준비물 확인 — 빠졌으면 띠 문구 */
  deps_status: () => status(),

  /** forge 플러그인 새 버전 · 호환 여부(마켓플레이스를 새로 받는다) */
  forge_plugin_status: async () => {
    await probeOut('claude', ['plugin', 'marketplace', 'update', 'forge']);
    const home = claudeHome();
    return forgePluginFrom(forgeInstalledVersion(home), forgeLatestVersion(home));
  },

  /** 사용자 범위 forge를 최신으로. 열린 claude 세션은 재시작해야 적용된다. */
  forge_plugin_update: async () => {
    try {
      await run('claude', ['plugin', 'update', FORGE_PLUGIN], { env: { ...process.env, PATH: runPath() } });
      return null;
    } catch (e) {
      throw new Error(String(e.stderr ?? '').trim().split('\n').pop() || tr('업데이트 실패', 'Update failed'));
    }
  },
};
