// 준비물(node 22 이상 · claude CLI · forge 플러그인, Windows는 Git) 확인·첫 실행 자동 설치와 forge 플러그인 버전 — src-tauri/src/deps.rs 이식.
// 설치는 버튼 없이 화면이 부르는 `deps_install`이 사용자 범위로 한다(ADR 261030-005852). 로그인은 첫 세션 안에서 claude가 받는다.
// node는 설치하지 않는다(데스크톱 앱은 Electron 안의 node를 쓴다). tmux는 더 이상 준비물이 아니다.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { claudeHome, runPath, withPath } from './env.js';
import { tr } from './i18n.js';

const run = promisify(execFile);
const platform = { darwin: 'macos', win32: 'windows' }[process.platform] ?? 'linux';

const FORGE_PLUGIN = 'forge@forge';
const FORGE_MARKETPLACE = 'gyuha/forge';
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
 *  forge가 빠졌으면 git도 확인한다 — macOS는 `git` 대신 `xcode-select -p`로 물어야 설치 창이 뜨지 않는다.
 *  Windows는 claude가 Git Bash로 돌므로 forge와 상관없이 Git을 확인한다. */
export function missing(probe, nodeVersion, forge, os) {
  const v = [];
  if (os === 'windows') {
    if (!probe('git', ['--version'])) v.push('git');
  } else if (!forge) {
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
    return (await run(prog, args, { env: withPath(process.env, runPath()), timeout: 15_000, windowsHide: true })).stdout;
  } catch {
    return null;
  }
}

async function status() {
  // 테스트 전용: CI의 앱 스모크는 준비물이 없는 러너에서 돈다 — 「준비 중」이 보드를 가리고 자동 설치가 러너 홈에 실제로 깔지 않게
  if (process.env.ANVIL_SKIP_DEPS) return { needs: [], message: null, installable: false, platform };
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

// ---------- 첫 실행 자동 설치 ----------

const XCODE_INSTALLER = 'Install Command Line Developer Tools';

/** 설치 순서 — Windows Git·mac 개발자 도구(forge를 받는 데 git이 필요) → claude → forge(claude 명령으로 받는다). node는 설치하지 않는다. */
const ORDER = ['git', 'devtools', 'claude', 'forge'];

/** 설치할 항목을 순서대로 → [{ need, label, state: 'pending', detail: null }] */
export function installPlan(needs, os) {
  return ORDER.filter((n) => needs.includes(n) && (n !== 'git' || os !== 'macos')).map((need) => ({ need, label: label(need), state: 'pending', detail: null }));
}

/** 설치 명령의 오류에서 화면에 보일 원문 끝부분 */
const tail = (e) => String(e?.stderr || e?.message || e).trim().split('\n').slice(-3).join('\n').slice(-400);

/** 데스크톱 우분투엔 curl이 없을 수 있어 wget으로도 받는다(claude install.sh도 wget으로 돈다 — deps.rs 실측) */
const CLAUDE_SH = 'set -o pipefail 2>/dev/null; if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh; else wget -q -O - https://claude.ai/install.sh; fi | bash';

/** 항목 하나를 설치하는 일 — `x(prog, args)`는 표준 출력을 돌려주거나 오류를 던진다. `wait()`는 mac 개발자 도구 설치 창이 끝났는지 기다린다. */
const steps = {
  git: async (x, os) => {
    if (os !== 'windows') throw new Error(`${tr('git은 터미널에서 직접 설치하세요: ', 'Install git yourself in a terminal: ')}sudo apt install git`);
    await x('winget', ['install', '--id', 'Git.Git', '-e', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements']);
  },
  devtools: async (x, _os, wait, note) => {
    await x('xcode-select', ['--install']).catch(() => {}); // 이미 설치 창이 떠 있어도 오류로 끝난다
    // 설치 창이 Anvil 창 뒤에 숨지 않게 앞으로 가져온다(VM UAT 2026-10-31 — deps.rs가 하던 일). 못 가져와도 설치는 그대로.
    await x('osascript', ['-e', `tell application "${XCODE_INSTALLER}" to activate`]).catch(() => {});
    note(tr('열린 「개발자 도구」 설치 창에서 [설치]를 눌러 주세요', 'Click [Install] in the developer tools window that opened'));
    if (!(await wait())) throw new Error(tr('개발자 도구 설치 창에서 설치를 마친 뒤 [다시 시도]', 'Finish the developer tools installer, then [Try again]'));
  },
  claude: (x, os) =>
    os === 'windows'
      ? x('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'])
      : x('/bin/bash', ['-c', CLAUDE_SH]),
  forge: async (x) => {
    if (!/\bforge\b/.test(await x('claude', ['plugin', 'marketplace', 'list']))) await x('claude', ['plugin', 'marketplace', 'add', FORGE_MARKETPLACE]);
    await x('claude', ['plugin', 'install', FORGE_PLUGIN]);
  },
};

/** mac 개발자 도구: 설치 창을 띄운 뒤 `xcode-select -p`가 될 때까지(최대 30분) 기다린다. */
const waitDevtools = (x) => async () => {
  const end = Date.now() + 30 * 60_000;
  while (Date.now() < end) {
    if (await x('xcode-select', ['-p']).then(() => true, () => false)) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
};

/**
 * 빠진 준비물을 순서대로 설치한다. 하나가 실패해도 다음 항목을 계속하되, forge는 앞 항목(claude·git·개발자 도구)이 안 되면 건너뛴다.
 * 바뀔 때마다 `onChange(items)`. → items
 */
export async function installWith(needs, os, x, { onChange = () => {}, wait = waitDevtools(x) } = {}) {
  const items = installPlan(needs, os);
  for (const item of items) {
    if (item.need === 'forge') {
      const blocker = items.find((i) => i.need !== 'forge' && i.state !== 'ok');
      if (blocker) {
        item.state = 'skipped';
        item.detail = `${blocker.label}${tr('이(가) 먼저 필요합니다', ' is required first')}`;
        onChange(items);
        continue;
      }
    }
    item.state = 'running';
    onChange(items);
    // 사람이 할 일이 있으면(설치 창) 진행 중인 항목에 안내를 띄운다
    const note = (msg) => {
      item.detail = msg;
      onChange(items);
    };
    try {
      await steps[item.need](x, os, wait, note);
      item.state = 'ok';
      item.detail = null;
    } catch (e) {
      item.state = 'failed';
      item.detail = tail(e);
    }
    onChange(items);
  }
  return items;
}

/** 실제 실행기 — Anvil PATH(설치 직후의 ~/.local/bin claude 포함)로, 설치 하나에 최대 10분 */
const exec = async (prog, args) =>
  (await run(prog, args, { env: withPath(process.env, runPath()), timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })).stdout;

/** 지금 진행(없으면 null): { running, items } — 다시 붙는 화면이 `deps_install`로 받는다 */
let progress = null;
let current = null;

/**
 * 설치를 시작한다(이미 도는 중이면 그 진행을 돌려준다 — 한 번에 하나만). 진행은 `deps_progress` 이벤트로 보낸다.
 * `needs`를 주지 않으면 지금 확인해서 빠진 것만 설치한다(이미 있으면 건너뜀). → 끝난 진행의 Promise
 */
export function startInstall(ctx, { needs, os = platform, x = exec } = {}) {
  if (current) return current;
  progress = { running: true, items: [] };
  current = (async () => {
    const list = needs ?? (await status()).needs;
    const send = (items) => {
      progress = { running: true, items: items.map((i) => ({ ...i })) };
      ctx.broadcast('deps_progress', progress);
    };
    const items = await installWith(list, os, x, { onChange: send });
    progress = { running: false, items };
    ctx.broadcast('deps_progress', progress);
    return progress;
  })().finally(() => (current = null));
  return current;
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

  /** 빠진 준비물 자동 설치를 시작한다(이미 도는 중이면 그대로). 끝까지 기다리지 않고 지금 진행을 돌려준다 — 이후는 `deps_progress` 이벤트. */
  deps_install: (_args, ctx) => {
    startInstall(ctx).catch((e) => console.error(`준비물 설치 실패: ${e?.message ?? e}`));
    return progress;
  },

  /** forge 플러그인 새 버전 · 호환 여부(마켓플레이스를 새로 받는다) */
  forge_plugin_status: async () => {
    await probeOut('claude', ['plugin', 'marketplace', 'update', 'forge']);
    const home = claudeHome();
    return forgePluginFrom(forgeInstalledVersion(home), forgeLatestVersion(home));
  },

  /** 사용자 범위 forge를 최신으로. 열린 claude 세션은 재시작해야 적용된다. */
  forge_plugin_update: async () => {
    try {
      await run('claude', ['plugin', 'update', FORGE_PLUGIN], { env: withPath(process.env, runPath()), windowsHide: true });
      return null;
    } catch (e) {
      throw new Error(String(e.stderr ?? '').trim().split('\n').pop() || tr('업데이트 실패', 'Update failed'));
    }
  },
};
