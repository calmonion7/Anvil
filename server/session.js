// 세션 — 서버가 node-pty로 쥐는 claude 하나(tmux 없음). src-tauri/src/session.rs · slash.rs · lib.rs 세션 명령 이식. 계약은 server/API.md.
// 세션 상태는 서버가 아니라 claude 훅(hooks/anvil-hook.js)이 데이터 폴더 `sessions/<세션 이름>.json`에 남기고,
// 실제 모델·effort는 상태줄 래퍼(hooks/anvil-statusline.js)가 `models/<세션 이름>.json`에 남긴다.
// 화면 연결이 끊겨도 pty는 남고, 다시 붙는 화면에 최근 출력을 재생한다. node-pty는 `./pty.js`로 불러온다.
import { mkdirSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { claudeHome, runPath } from './env.js';
import { tr } from './i18n.js';
import pty from './pty.js';
import { collect } from './slash.js';

const HOOKS = join(import.meta.dirname, 'hooks');
const ROLES = ['plan', 'run'];
/** 설정에서 고를 수 있는 모델. `default`는 `--model`을 붙이지 않아 claude 기본값을 따른다. */
const MODEL_CHOICES = ['default', 'opus', 'sonnet', 'haiku'];
/** 다시 붙는 화면에 재생할 세션별 최근 출력(글자 수) */
const REPLAY_MAX = 256 * 1024;
/** 새로 띄운 세션이 입력 대기를 알릴 때까지 기다리는 시간 */
const READY_TIMEOUT = 40_000;
/**
 * 부모 claude가 자식 프로세스에 심는 변수. Anvil을 다른 claude 세션 안에서 띄우면 새 claude가 자기를 부모의 자식
 * 세션으로 보고 이름(-n)을 부모 세션 이름으로 덮거나 effort를 따라간다(2026-10-18 실측). CLAUDE_CONFIG_DIR 등 사용자 설정은 남긴다.
 */
const PARENT_CLAUDE = /^(CLAUDECODE|CLAUDE_CODE_[A-Z0-9_]+|CLAUDE_PID|CLAUDE_JOB_DIR|CLAUDE_EFFORT)$/;

/** 살아 있는 세션: 이름 → { name, pty, chunks(최근 출력), size, views: Set<{conn, id}> } */
const live = new Map();
/** 연결마다 붙은 터미널: conn → Map(터미널 id → view) */
const views = new WeakMap();

// ---------- 이름 · 모델 설정 ----------

/** `anvil-<프로젝트키>-<plan|run>`. 키는 폴더 이름 + 경로 해시 6자리(같은 이름 폴더 구분). */
export function sessionName(project, role) {
  const base = [...basename(project).toLowerCase()].map((ch) => (/^[a-z0-9]$/.test(ch) ? ch : '-')).join('');
  // FNV-1a — 실행마다 같은 값이어야 한다.
  let h = 0x811c9dc5;
  for (const b of Buffer.from(project)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `anvil-${base}-${(h & 0xffffff).toString(16).padStart(6, '0')}-${role}`;
}

/** claude 세션에 붙이는 이름과 기본 모델 — cxa(`~/cc.sh`) 규칙에 `[Anvil]` 접두어. 계획 = opus, 실행 = sonnet. */
function sessionTitle(project, role) {
  const [mode, model] = role === 'plan' ? ['PLAN', 'opus'] : ['RUN', 'sonnet'];
  return [`[Anvil] [${basename(project)}] ${mode}`, model];
}

function readSettings(dir) {
  try {
    const v = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** 역할별 모델(설정 > 기본값) */
function roleModel(dir, role) {
  const m = readSettings(dir).models?.[role];
  return MODEL_CHOICES.includes(m) ? m : sessionTitle('', role)[1];
}

const checkRole = (role) => {
  if (!ROLES.includes(role)) throw new Error(`${tr('알 수 없는 역할: ', 'Unknown role: ')}${role}`);
};

// ---------- 데이터 폴더(훅 설정) ----------

const quote = (s) => (process.platform === 'win32' ? `"${s}"` : `'${s.replaceAll("'", "'\\''")}'`);
/** claude 훅·상태줄에 등록하는 명령: 이 서버의 node로 hooks/의 스크립트를, 데이터 폴더를 인자로. */
const scriptCmd = (file, dir) => [process.execPath, join(HOOKS, file), dir].map(quote).join(' ');

/** 서버가 시작할 때마다 훅 설정을 다시 쓴다(서버 위치·업데이트 반영). */
function install(dir) {
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'models'), { recursive: true });
  const hook = scriptCmd('anvil-hook.js', dir);
  const cmd = (state) => [{ hooks: [{ type: 'command', command: `${hook} ${state}` }] }];
  const settings = {
    hooks: {
      SessionStart: cmd('waiting'),
      UserPromptSubmit: cmd('working'),
      PostToolUse: cmd('working'),
      Stop: cmd('waiting'),
      Notification: cmd('waiting'),
      SessionEnd: cmd('ended'),
    },
    statusLine: { type: 'command', command: scriptCmd('anvil-statusline.js', dir) },
  };
  writeFileSync(join(dir, 'hooks.json'), JSON.stringify(settings, null, 2));
}

/** `<dir>/*.json`을 이름 → 내용(깨졌으면 null)으로 */
function readRecords(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((f) => {
    try {
      return [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8'))];
    } catch {
      return [f.slice(0, -5), null];
    }
  });
}

/** 훅이 남긴 상태 파일 + 서버의 pty 생존 여부. pty가 없으면 파일과 상관없이 종료다. */
function states(dir) {
  const map = {};
  for (const [name, v] of readRecords(join(dir, 'sessions'))) {
    const alive = live.has(name);
    const sid = v?.session_id;
    map[name] = {
      state: alive ? (typeof v?.state === 'string' ? v.state : 'starting') : 'ended',
      sessionId: typeof sid === 'string' && sid ? sid : null,
      alive,
    };
  }
  for (const name of live.keys()) map[name] ??= { state: 'starting', sessionId: null, alive: true };
  return map;
}

/** 상태줄 래퍼가 남긴 세션별 실제 모델·effort */
function models(dir) {
  const map = {};
  for (const [name, v] of readRecords(join(dir, 'models'))) {
    if (v) map[name] = { model: v.model ?? null, effort: v.effort ?? null };
  }
  return map;
}

function changed(ctx) {
  ctx.broadcast('sessions', states(ctx.dataDir));
  ctx.broadcast('models', models(ctx.dataDir));
}

/** 훅 설정을 쓰고, 훅이 상태 파일을·상태줄 래퍼가 모델 기록을 바꾸면 `sessions`·`models` 이벤트로 보낸다. */
export async function init(ctx) {
  install(ctx.dataDir);
  let timer;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => changed(ctx), 150);
    timer.unref();
  };
  for (const d of ['sessions', 'models']) watch(join(ctx.dataDir, d), onChange).unref();
}

// ---------- 세션(pty) ----------

/** GUI·launchd에서 뜬 서버에는 LANG이 없을 수 있어 한글이 깨진다. UTF-8이 아니면 UTF-8 로캘을 준다. */
const lang = () => (process.env.LANG?.includes('UTF-8') ? process.env.LANG : 'en_US.UTF-8');

function sessionEnv(name, title) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !PARENT_CLAUDE.test(k)));
  // 전역 훅 cc-session-name.sh(SessionStart clear)가 /clear 뒤에 CC_SESSION_NAME을 다시 붙인다.
  return { ...env, ANVIL_SESSION: name, PATH: runPath(), LANG: lang(), TERM: 'xterm-256color', CC_SESSION_NAME: title };
}

function claudeArgs(title, model, hooks) {
  return ['-n', title, ...(model === 'default' ? [] : ['--model', model]), '--settings', hooks];
}

/** 최근 출력을 REPLAY_MAX 글자까지만 남긴다. */
function record(s, data) {
  s.chunks.push(data);
  s.size += data.length;
  while (s.size > REPLAY_MAX) {
    const over = s.size - REPLAY_MAX;
    if (s.chunks[0].length <= over) {
      s.size -= s.chunks.shift().length;
    } else {
      s.chunks[0] = s.chunks[0].slice(over);
      s.size -= over;
    }
  }
}

function check(ctx, project, role) {
  if (!ctx.registered(project)) throw new Error(tr('등록하지 않은 프로젝트입니다', 'This project is not registered'));
  checkRole(role);
}

function start(ctx, project, role) {
  const dir = ctx.dataDir;
  const name = sessionName(project, role);
  if (live.has(name)) return name;
  rmSync(join(dir, 'sessions', `${name}.json`), { force: true });
  rmSync(join(dir, 'models', `${name}.json`), { force: true });
  const [title] = sessionTitle(project, role);
  // ANVIL_CLAUDE: claude 자리에 다른 실행 파일(테스트의 가짜 claude)
  let p;
  try {
    p = pty.spawn(process.env.ANVIL_CLAUDE || 'claude', claudeArgs(title, roleModel(dir, role), join(dir, 'hooks.json')), {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      cwd: project,
      env: sessionEnv(name, title),
    });
  } catch (e) {
    throw new Error(`${tr('claude를 실행할 수 없습니다: ', 'Cannot run claude: ')}${e.message}`);
  }
  const s = { name, pty: p, chunks: [], size: 0, views: new Set() };
  live.set(name, s);
  p.onData((data) => {
    record(s, data);
    for (const v of s.views) v.conn.send({ type: 'term', id: v.id, data });
  });
  p.onExit(() => {
    if (live.get(name) === s) live.delete(name);
    changed(ctx);
  });
  changed(ctx);
  return name;
}

const alive = (s) => live.get(s.name) === s;

/** 새로 띄운 세션이 SessionStart 훅으로 입력 대기를 알릴 때까지 기다린다. */
async function waitReady(dir, name) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const end = Date.now() + READY_TIMEOUT;
  while (Date.now() < end) {
    const s = states(dir)[name];
    if (s?.alive && s.state === 'waiting') {
      await sleep(800); // 훅이 claude 화면이 입력을 받을 준비를 마치기 조금 전에 불릴 수 있다.
      return true;
    }
    await sleep(300);
  }
  return false;
}

// ---------- 터미널(화면 하나 = 웹소켓 연결 + 터미널 id) ----------

function detach(conn, id) {
  const mine = views.get(conn);
  const v = mine?.get(id);
  if (!v) return;
  v.s.views.delete(v);
  mine.delete(id);
}

function viewOf(conn, id) {
  const v = views.get(conn)?.get(id);
  if (!v || !alive(v.s)) throw new Error(tr('터미널이 없습니다', 'No such terminal'));
  return v;
}

export const commands = {
  session_states: async (_args, ctx) => states(ctx.dataDir),
  /** 계획·실행 세션 이름. 화면이 세션 상태를 프로젝트에 짝지을 때 쓴다. */
  session_names: async ({ project }) => ROLES.map((r) => sessionName(project, r)),
  /** 계획·실행 세션의 claude 이름과 띄울 때 모델(설정값, `default`면 claude 기본값) */
  session_titles: async ({ project }, ctx) => ROLES.map((r) => [sessionTitle(project, r)[0], roleModel(ctx.dataDir, r)]),
  model_settings: async (_args, ctx) => Object.fromEntries(ROLES.map((r) => [r, roleModel(ctx.dataDir, r)])),
  /** 역할별 모델 저장 — 새로 여는 세션부터 적용 */
  set_model_setting: async ({ role, model }, ctx) => {
    checkRole(role);
    if (!MODEL_CHOICES.includes(model)) throw new Error(`${tr('알 수 없는 모델: ', 'Unknown model: ')}${model}`);
    const v = readSettings(ctx.dataDir);
    if (!v.models || typeof v.models !== 'object' || Array.isArray(v.models)) v.models = {};
    v.models[role] = model;
    mkdirSync(ctx.dataDir, { recursive: true });
    writeFileSync(join(ctx.dataDir, 'settings.json'), JSON.stringify(v, null, 2));
    return null;
  },
  session_models: async (_args, ctx) => models(ctx.dataDir),
  session_start: async ({ project, role }, ctx) => {
    check(ctx, project, role);
    return start(ctx, project, role);
  },
  /** 세션을 끝내는 유일한 길(확인창은 화면이 띄운다). 서버가 꺼지면 세션도 끝난다. */
  session_kill: async ({ name }, ctx) => {
    if (typeof name !== 'string' || !name.startsWith('anvil-')) throw new Error(tr('Anvil 세션이 아닙니다', 'Not an Anvil session'));
    const s = live.get(name);
    if (!s) throw new Error(tr('세션이 없습니다', 'No such session'));
    live.delete(name);
    s.pty.kill();
    changed(ctx);
    return null;
  },
  /**
   * 보드 버튼: 역할에 맞는 세션 입력창에 글자만 채운다(Enter 없음 — 실행은 사람이 누른다). 세션이 없으면 띄우고
   * 입력 대기를 기다린 뒤 채운다. 채운 세션 이름을 돌려준다(화면이 그 칸에 초점을 옮김).
   */
  session_fill: async ({ project, role, text }, ctx) => {
    check(ctx, project, role);
    const name = sessionName(project, role);
    if (!live.has(name)) {
      start(ctx, project, role);
      if (!(await waitReady(ctx.dataDir, name))) {
        throw new Error(
          tr(
            '세션이 입력을 받을 준비가 되지 않았습니다(처음 여는 폴더라면 claude의 폴더 신뢰 확인을 먼저 해 주세요)',
            "The session is not ready for input (if this folder is new, confirm claude's folder-trust prompt first)",
          ),
        );
      }
    } else if (states(ctx.dataDir)[name]?.state === 'working') {
      throw new Error(tr('세션이 작업 중이라 채우지 않았습니다', 'The session is busy, so nothing was filled in'));
    }
    const s = live.get(name);
    if (!s) throw new Error(tr('세션이 없습니다', 'No such session'));
    s.pty.write(text);
    return name;
  },
  /** 단축 버튼 자동완성 — 설치된 플러그인·사용자·이 프로젝트의 슬래시 명령 */
  slash_commands: async ({ project }) => collect(join(claudeHome(), '.claude'), project),

  // 웹소켓으로만 온다(ctx.conn이 있다). 같은 세션에 여러 화면이 붙을 수 있다.
  /** 세션에 터미널을 붙이고 지금까지의 최근 출력을 재생한다. */
  term_open: async ({ id, name, cols, rows }, ctx) => {
    const s = live.get(name);
    if (!s) throw new Error(tr('세션이 없습니다', 'No such session'));
    const { conn } = ctx;
    let mine = views.get(conn);
    if (!mine) {
      mine = new Map();
      views.set(conn, mine);
      // 연결이 끊기면 그 연결의 터미널만 뗀다(pty는 남는다).
      conn.onClose(() => [...mine.keys()].forEach((tid) => detach(conn, tid)));
    }
    detach(conn, id);
    if (s.size) conn.send({ type: 'term', id, data: s.chunks.join('') });
    const v = { conn, id, s };
    mine.set(id, v);
    s.views.add(v);
    s.pty.resize(cols, rows);
    return null;
  },
  term_write: async ({ id, data }, ctx) => {
    viewOf(ctx.conn, id).s.pty.write(data);
    return null;
  },
  term_resize: async ({ id, cols, rows }, ctx) => {
    viewOf(ctx.conn, id).s.pty.resize(cols, rows);
    return null;
  },
  /** 터미널만 뗀다(세션은 살아 있다). */
  term_close: async ({ id }, ctx) => {
    detach(ctx.conn, id);
    return null;
  },
};
