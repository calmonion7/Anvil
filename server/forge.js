// `.forge/` 읽기 전용 파서 — src-tauri/src/forge.rs 이식. forge 규칙(브랜치 root 해석, STATUS 필드, 단계 판정,
// 백로그 순서, loop.md, done 겹치기, 후속후보)을 다시 구현한다. 프로젝트 목록·문서 읽기·감시는 lib.rs 몫의 이식.
// Anvil은 `.forge/`에 절대 쓰지 않는다(ADR 261017-211602). 계약은 server/API.md.
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, watch as fsWatch, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tr } from './i18n.js';

// ---------- 문자열 도우미(Rust 의미 그대로) ----------

/** Rust `str::lines`: `\n`으로 나누고 끝의 `\r`을 떼며, 마지막 빈 줄은 없다. */
function lines(text) {
  const v = text.split('\n');
  if (v.at(-1) === '') v.pop();
  return v.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

const words = (s) => s.split(/\s+/).filter(Boolean);
const stripPrefix = (s, p) => (s.startsWith(p) ? s.slice(p.length) : null);
/** Rust `String` 비교(바이트 순). */
const cmpBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
/** Rust `str::parse::<u32>()` — 실패면 null. */
function parseU32(v) {
  if (!/^\+?[0-9]+$/.test(v)) return null;
  const n = Number(v);
  return n <= 0xffffffff ? n : null;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
/** Rust `fs::read_to_string` — 없거나 UTF-8이 아니면 던진다. */
const readText = (p) => utf8.decode(readFileSync(p));

// ---------- git HEAD · forge root ----------

/** 프로젝트의 git 폴더. 워크트리처럼 `.git`이 파일이면 `gitdir:`를 따라간다. */
export function gitDir(project) {
  const dot = join(project, '.git');
  if (isDir(dot)) return dot;
  let text;
  try {
    text = readText(dot);
  } catch {
    return null;
  }
  const target = stripPrefix(text.trim(), 'gitdir:')?.trim();
  if (target == null) return null;
  return isAbsolute(target) ? target : join(project, target);
}

/** → `{type:'branch', branch}` | `{type:'detached'}` | `{type:'notGit'}` */
export function readHead(project) {
  const dir = gitDir(project);
  if (dir === null) return { type: 'notGit' };
  let text;
  try {
    text = readText(join(dir, 'HEAD'));
  } catch {
    return { type: 'notGit' };
  }
  const b = stripPrefix(text.trim(), 'ref: refs/heads/');
  return b === null ? { type: 'detached' } : { type: 'branch', branch: b };
}

/** `.forge/config.json`의 `defaultBranch`, 없으면 `main`. */
export function defaultBranch(project) {
  try {
    const v = JSON.parse(readText(join(project, '.forge/config.json')));
    if (typeof v?.defaultBranch === 'string') return v.defaultBranch;
  } catch {}
  return 'main';
}

/** → `{branch, git, rel(.forge | .forge/branch/<b>), warning}` */
export function resolveRoot(project, head) {
  if (head.type === 'branch') {
    const b = head.branch;
    return { branch: b, git: true, rel: b === defaultBranch(project) ? '.forge' : `.forge/branch/${b}`, warning: null };
  }
  if (head.type === 'notGit') return { branch: null, git: false, rel: '.forge', warning: null };
  return {
    branch: null,
    git: true,
    rel: '.forge',
    warning: tr('이름 있는 브랜치가 아니라 기본 .forge/ 를 읽습니다', 'Not on a named branch; reading the default .forge/'),
  };
}

// ---------- 필드 · 마커 ----------

function fieldValue(line, name) {
  let l = line.trimStart();
  if (l.startsWith('-')) l = l.slice(1).trimStart();
  const rest = stripPrefix(l, name);
  return rest === null ? null : stripPrefix(rest, ':');
}

/** `field:`와 `- field:` 모두 받고 첫 낱말만 값으로 읽는다(`verified: yes (…)` → `yes`). */
export function statusField(text, name) {
  for (const line of lines(text)) {
    const rest = fieldValue(line, name);
    const w = rest === null ? undefined : words(rest)[0];
    if (w !== undefined) return w;
  }
  return null;
}

/** 줄 전체 값(`wall: fork (이유 …)`처럼 첫 낱말만으로는 모자랄 때). */
function fieldLine(text, name) {
  for (const line of lines(text)) {
    const v = fieldValue(line, name)?.trim();
    if (v) return v;
  }
  return null;
}

/** `<!-- name: value -->` 마커의 값. */
function marker(text, name) {
  const open = `<!-- ${name}:`;
  const at = text.indexOf(open);
  if (at < 0) return null;
  const start = at + open.length;
  const end = text.indexOf('-->', start);
  if (end < 0) return null;
  return text.slice(start, end).trim() || null;
}

function titleOf(text) {
  for (const l of lines(text)) {
    if (l.startsWith('# ')) return l.slice(2).trim();
  }
  return tr('(제목 없음)', '(untitled)').trim();
}

function norm(v) {
  let out = '';
  for (const c of v.toLowerCase()) {
    if (!((c >= 'a' && c <= 'z') || c === '/')) break;
    out += c;
  }
  return out;
}

export function isSealable(verified) {
  return verified != null && ['yes', 'skipped', 'n/a'].includes(norm(verified));
}

// ---------- 읽기 도우미 ----------

class Reader {
  constructor(project) {
    this.project = project;
    this.errors = [];
  }

  rel(p) {
    return relative(this.project, p);
  }

  /** 읽지 못하면 그 파일만 오류로 남기고 null(없는 파일은 조용히 null). */
  read(p) {
    let bytes;
    try {
      bytes = readFileSync(p);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        this.fail(p, `${tr('읽을 수 없습니다', 'Cannot read')}(${e.message})${tr('. 이 파일만 건너뛰었습니다.', '. Skipped this file only.')}`);
      }
      return null;
    }
    try {
      return utf8.decode(bytes);
    } catch {
      this.fail(p, tr('UTF-8 문서가 아닙니다. 이 파일만 건너뛰었습니다.', 'Not a UTF-8 document. Skipped this file only.'));
      return null;
    }
  }

  fail(p, message) {
    this.errors.push({ path: this.rel(p), message });
  }
}

function entries(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const subDirs = (dir) => entries(dir).filter((n) => isDir(join(dir, n))).sort(cmpBytes);
const mdFiles = (dir) => entries(dir).filter((n) => n.endsWith('.md')).sort(cmpBytes);

/** `YYMMDD-HHMMSS-slug`(새 형식) / `YYYY-MM-DD-slug`(옛 형식) → [정렬 키, 날짜, slug] */
export function splitDated(name) {
  const b = Buffer.from(name);
  const digits = (from, to) => b.length >= to && b.subarray(from, to).every((c) => c >= 0x30 && c <= 0x39);
  const dash = (i) => b[i] === 0x2d;
  // Rust `name.get(i..)` — 범위 밖이거나 글자 중간이면 빈 문자열
  const tail = (i) => (i > b.length || (b[i] & 0xc0) === 0x80 ? '' : b.subarray(i).toString());
  if (digits(0, 6) && dash(6) && digits(7, 13)) {
    // 같은 초 충돌 접미 글자(`a`) 허용
    const end = b[13] >= 0x61 && b[13] <= 0x7a ? 14 : 13;
    const date = `20${name.slice(0, 2)}-${name.slice(2, 4)}-${name.slice(4, 6)}`;
    return [`${date} ${name.slice(7, end)}`, date, tail(end + 1)];
  }
  if (digits(0, 4) && dash(4) && digits(5, 7) && dash(7) && digits(8, 10)) {
    const date = name.slice(0, 10);
    return [`${date} 000000`, date, tail(11)];
  }
  return ['', '', name];
}

// ---------- 후속후보 ----------

const FOLLOWUP_MARK = '<!-- followup:';

/** `3` / `-` → 양의 정수는 수, `-`는 null, 그 밖은 undefined(형식 오류). */
function taskNum(v) {
  if (v === '-') return null;
  const n = parseU32(v);
  return n > 0 ? n : undefined;
}

/** 마커 한 줄 → 본문 없는 후속후보. 형식이 어긋나면 null. */
function parseFollowupMarker(line) {
  let inner = stripPrefix(line.trim(), '<!--');
  if (inner === null || !inner.endsWith('-->')) return null;
  inner = inner.slice(0, -3).trim();
  const fields = inner.split(' | ');
  const names = ['followup', 'source', 'task', 'date', 'status', 'taken'];
  if (fields.length !== names.length) return null;
  const v = [];
  for (const [i, f] of fields.entries()) {
    const afterName = stripPrefix(f.trim(), names[i]);
    const rest = afterName === null ? null : stripPrefix(afterName, ':');
    if (rest === null) return null;
    v.push(rest.trim());
  }
  const [id, source, task, date, status, takenText] = v;
  if (!/^fu-[0-9a-f]{12}$/.test(id) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return null;
  const taken = taskNum(takenText);
  if (taken === undefined) return null;
  if (!['open', 'taken', 'dismissed'].includes(status) || (status === 'taken') !== (taken !== null) || source === '') return null;
  const t = taskNum(task);
  if (t === undefined) return null;
  return { id, source, task: t, date, status, taken, text: '', body: '' };
}

/** forge 원장(`followups.md`) — 마커부터 다음 마커나 끝까지가 한 항목. 첫 마커 앞은 무시.
 *  깨진 마커는 그 항목만 건너뛰고 오류 문구로 돌려준다. → `{items, errors}` */
export function parseFollowups(text) {
  const items = [];
  const errors = [];
  let cur = null;
  const finish = () => {
    if (!cur?.f) return;
    const body = cur.lines
      .map((l) => l.trim())
      .map((l, i) => (i === 0 ? (stripPrefix(l, '- ') ?? l) : l))
      .join('\n')
      .trim();
    cur.f.text = lines(body)[0] ?? '';
    cur.f.body = body;
    items.push(cur.f);
  };
  for (const [n, line] of lines(text).entries()) {
    if (line.trimStart().startsWith(FOLLOWUP_MARK)) {
      finish();
      const f = parseFollowupMarker(line);
      if (f === null) {
        errors.push(`${tr('후속후보 마커가 깨졌습니다 — 줄', 'Broken follow-up marker — line')} ${n + 1}: ${line.trim()}`);
      }
      cur = { f, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  finish();
  return { items, errors };
}

// ---------- loop.md ----------

function parseLoop(text, path) {
  let goal = '';
  for (const l of lines(text)) {
    if (!l.startsWith('# ')) continue;
    let t = l.slice(2);
    while (t.startsWith('LOOP')) t = t.slice(4);
    goal = t.replace(/^[ —-]+/, '').trim();
    break;
  }
  const w = fieldLine(text, 'wall');
  const wall = w !== null && norm(w) !== 'none' ? w : null;
  const num = (name) => {
    const v = statusField(text, name);
    return v === null ? null : parseU32(v);
  };

  const checks = [];
  for (const line of lines(text)) {
    const l = line.trimStart();
    let done;
    let rest = stripPrefix(l, '- [ ] ');
    if (rest !== null) done = false;
    else {
      rest = stripPrefix(l, '- [x] ') ?? stripPrefix(l, '- [X] ');
      if (rest === null) continue;
      done = true;
    }
    const dot = rest.indexOf('.');
    if (dot < 0) continue;
    const id = rest.slice(0, dot);
    if (!/^C[0-9]*$/.test(id)) continue;
    checks.push({ id, text: rest.slice(dot + 1).trim(), result: done ? 'pass' : 'unknown' });
  }
  // `## Check progress`의 `- Cn: pass|fail|waiting …`가 체크박스보다 우선한다.
  for (const line of lines(text)) {
    const rest = stripPrefix(line.trimStart(), '- C');
    if (rest === null) continue;
    const colon = rest.indexOf(':');
    if (colon < 0) continue;
    const n = rest.slice(0, colon);
    if (!/^[0-9]*$/.test(n)) continue;
    const word = norm(words(rest.slice(colon + 1))[0] ?? '');
    const result = ['pass', 'fail', 'waiting'].includes(word) ? word : 'unknown';
    const c = checks.find((c) => c.id === `C${n}`);
    if (c) c.result = result;
  }
  return { goal, wall, replanRound: num('replan-round'), replanCap: num('replan-cap'), checks, path };
}

// ---------- 스냅샷 ----------

/** 화면에 보내는 프로젝트 스냅샷(Rust `forge::Snapshot`의 JSON과 같은 모양). */
export function snapshot(project) {
  return snapshotWithHead(project, readHead(project));
}

export function snapshotWithHead(project, head) {
  const top = join(project, '.forge');
  const rootInfo = resolveRoot(project, head);
  const s = {
    name: basename(project),
    path: project,
    hasForge: isDir(top),
    root: rootInfo,
    headline: '',
    active: null,
    loopState: null,
    backlog: [],
    executed: [],
    done: [],
    doneTotal: 0,
    followups: [],
    errors: [],
    drivingSession: null,
  };
  if (!s.hasForge) {
    s.headline = tr('forge 없음', 'No forge');
    return s;
  }
  const root = join(project, rootInfo.rel);
  const r = new Reader(project);

  // 진행 영역(현재 root만)
  const loopPath = join(root, 'loop.md');
  const loopText = r.read(loopPath);
  if (loopText !== null) s.loopState = parseLoop(loopText, r.rel(loopPath));
  s.active = readActive(r, root, loopText);
  s.backlog = readBacklog(r, join(root, 'backlog'));
  for (const f of ['running.md', 'drive.md']) {
    const t = r.read(join(root, f));
    const v = t === null ? null : statusField(t, 'session');
    if (v !== null) {
      s.drivingSession = v;
      break;
    }
  }
  for (const d of subDirs(join(root, 'executed'))) {
    s.executed.push(readTaskDir(r, join(root, 'executed', d), d));
  }

  // 기록 영역(최상위 위에 현재 root를 겹침, 같은 이름은 root 우선)
  const layers = root === top ? [top] : [top, root];
  const done = new Map();
  for (const layer of layers) {
    for (const d of subDirs(join(layer, 'done'))) done.set(d, join(layer, 'done', d));
  }
  s.doneTotal = done.size;
  const cards = [...done.keys()]
    .sort(cmpBytes)
    .map((name) => [splitDated(name)[0], readTaskDir(r, done.get(name), name)]);
  cards.sort((a, b) => cmpBytes(b[0], a[0]));
  s.done = cards.map((c) => c[1]);

  // 후속후보 원장(현재 root만 — 겹쳐 읽지 않음)
  const ledger = join(root, 'followups.md');
  const t = r.read(ledger);
  if (t !== null) {
    const { items, errors } = parseFollowups(t);
    for (const e of errors) r.fail(ledger, e);
    s.followups = items;
  }
  s.followups.sort((a, b) => cmpBytes(b.date, a.date));

  s.errors = r.errors;
  s.headline = headline(s);
  return s;
}

function readActive(r, root, loopText) {
  const planPath = join(root, 'plan.md');
  const plan = r.read(planPath);
  if (plan === null) return null;
  const status = r.read(join(root, 'STATUS.md')) ?? '';
  const hasRun = isFile(join(root, 'run.md'));
  const running = isFile(join(root, 'running.md'));
  const verified = statusField(status, 'verified');
  const retro = statusField(status, 'retro');
  let stage;
  if (running || !hasRun || !isSealable(verified)) stage = 'run';
  else if (retro === null || norm(retro) === 'pending' || norm(retro) === '') stage = 'retro';
  else stage = 'seal';
  const slug = marker(plan, 'forge-slug') ?? 'plan';
  const inLoop = loopText !== null && lines(loopText).some((l) => l.trim() === `- ${slug}`);
  const docs = [{ label: 'plan', path: r.rel(planPath) }];
  for (const [label, f] of [
    ['run', 'run.md'],
    ['STATUS', 'STATUS.md'],
    ['loop', 'loop.md'],
  ]) {
    const p = join(root, f);
    if (isFile(p)) docs.push({ label, path: r.rel(p) });
  }
  return {
    task: taskMarker(plan),
    slug,
    title: titleOf(plan),
    stage,
    running,
    verified,
    retro,
    inLoop,
    docs,
  };
}

function taskMarker(text) {
  const v = marker(text, 'task');
  return v === null ? null : parseU32(v);
}

function readBacklog(r, dir) {
  const v = [];
  for (const f of mdFiles(dir)) {
    const p = join(dir, f);
    const text = r.read(p);
    if (text === null) continue;
    const slug = marker(text, 'forge-slug');
    if (slug === null) {
      r.fail(p, tr('forge-slug 마커가 없습니다. 이 파일만 건너뛰었습니다.', 'No forge-slug marker. Skipped this file only.'));
      continue;
    }
    const m = marker(text, 'priority');
    const priority = m === 'high' || m === 'low' ? m : 'medium';
    const part = marker(text, 'part');
    const rank = { high: 0, medium: 1, low: 2 }[priority];
    const partN = (part === null ? null : parseU32(part.split('/')[0])) ?? 0;
    v.push([
      `${rank}\t${String(partN).padStart(3, '0')}\t${slug}`,
      {
        task: taskMarker(text),
        slug,
        title: titleOf(text),
        priority,
        part,
        fromLoop: text.includes('generated-by: fg-loop'),
        path: r.rel(p),
      },
    ]);
  }
  v.sort((a, b) => cmpBytes(a[0], b[0]));
  return v.map((e) => e[1]);
}

function readTaskDir(r, dir, name) {
  const planPath = join(dir, 'plan.md');
  const plan = r.read(planPath) ?? '';
  const status = r.read(join(dir, 'STATUS.md')) ?? '';
  const [, prefixDate, nameSlug] = splitDated(name);
  return {
    task: taskMarker(plan),
    slug: marker(plan, 'forge-slug') ?? statusField(status, 'slug') ?? nameSlug,
    title: plan === '' ? name : titleOf(plan),
    date: statusField(status, 'completed') ?? statusField(status, 'executed') ?? prefixDate,
    verified: statusField(status, 'verified'),
    retro: statusField(status, 'retro'),
    path: r.rel(isFile(planPath) ? planPath : dir),
  };
}

/** 루프 정지 > 검증 실패 > 실행 중 #N > 회고 대기 > 백로그 N > forge 없음 */
function headline(s) {
  const num = (t) => (t === null ? '' : ` #${t}`);
  if (s.loopState?.wall != null) return tr('루프 정지', 'Loop halted');
  const failed = (v) => v != null && norm(v) === 'failed';
  if (s.active && failed(s.active.verified)) return `${tr('검증 실패', 'Verification failed')}${num(s.active.task)}`;
  const e = s.executed.find((e) => failed(e.verified));
  if (e) return `${tr('검증 실패', 'Verification failed')}${num(e.task)}`;
  if (s.active) {
    if (s.active.stage === 'run') return `${tr('실행 중', 'Running')}${num(s.active.task)}`;
    if (s.active.stage === 'retro') return tr('회고 대기', 'Awaiting retro');
    return `${tr('봉인 대기', 'Awaiting seal')}${num(s.active.task)}`;
  }
  if (s.executed.length) return tr('회고 대기', 'Awaiting retro');
  return `${tr('백로그', 'Backlog')} ${s.backlog.length}`;
}

// ---------- 프로젝트 목록 · 감시 (lib.rs) ----------

/** 등록한 프로젝트 경로(`<data>/projects.json`)와 프로젝트마다 하나씩 도는 감시. */
let projects = [];
const watchers = new Map();
const NOT_REGISTERED = () => tr('등록하지 않은 프로젝트입니다', 'This project is not registered');

const storePath = (ctx) => join(ctx.dataDir, 'projects.json');

function saveProjects(ctx) {
  mkdirSync(dirname(storePath(ctx)), { recursive: true });
  writeFileSync(storePath(ctx), JSON.stringify(projects, null, 2));
}

/** `.forge/` 재귀 감시 + 프로젝트 폴더(.forge 생성) + git 폴더(HEAD) 비재귀 감시.
 *  바뀌면 300ms 디바운스 뒤 그 프로젝트의 새 스냅샷을 `snapshot` 이벤트로 보낸다. */
function watch(ctx, project) {
  unwatch(project);
  const forgeDir = join(project, '.forge');
  const watchingForge = isDir(forgeDir);
  let timer;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const snap = snapshot(project);
      // .forge가 새로 생기거나 사라졌다 — 감시 대상을 다시 잡는다.
      if (snap.hasForge !== watchingForge) watch(ctx, project);
      ctx.broadcast('snapshot', snap);
    }, 300);
  };
  const handles = [];
  const add = (p, recursive) => {
    try {
      const w = fsWatch(p, { recursive, persistent: false }, changed);
      w.on('error', () => {}); // 감시하던 폴더가 사라지면 오는 오류 — 프로젝트 폴더 감시가 대신 잡는다
      handles.push(w);
    } catch {}
  };
  add(project, false);
  if (watchingForge) add(forgeDir, true);
  const git = gitDir(project);
  if (git !== null) add(git, false);
  watchers.set(project, () => {
    clearTimeout(timer);
    for (const w of handles) w.close();
  });
}

function unwatch(project) {
  watchers.get(project)?.();
  watchers.delete(project);
}

/** 데이터 폴더의 프로젝트 목록을 읽고 감시를 시작한다(다시 부르면 처음부터). */
export async function init(ctx) {
  for (const p of [...watchers.keys()]) unwatch(p);
  projects = [];
  try {
    const v = JSON.parse(readFileSync(storePath(ctx), 'utf8'));
    if (Array.isArray(v) && v.every((p) => typeof p === 'string')) projects = v;
  } catch {}
  for (const p of projects) watch(ctx, p);
}

/** 등록한 프로젝트인가 — 세션 모듈이 ctx.registered로 쓴다. */
export function registered(project) {
  return projects.includes(project);
}

const snapshots = () => projects.map(snapshot);

export const commands = {
  list_projects: async () => snapshots(),

  add_project: async ({ path }, ctx) => {
    if (!isDir(path)) throw new Error(`${tr('폴더가 아닙니다: ', 'Not a folder: ')}${path}`);
    if (!projects.includes(path)) {
      projects.push(path);
      saveProjects(ctx);
    }
    watch(ctx, path);
    return snapshots();
  },

  remove_project: async ({ path }, ctx) => {
    projects = projects.filter((p) => p !== path);
    saveProjects(ctx);
    unwatch(path);
    return snapshots();
  },

  /** 보드 카드가 여는 문서. 등록한 프로젝트의 `.forge/` 안 파일만 읽는다(심볼릭 링크는 따라간 실제 위치로 판단). */
  read_doc: async ({ project, rel }) => {
    if (!registered(project)) throw new Error(NOT_REGISTERED());
    const forgeDir = realpathSync(join(project, '.forge'));
    const file = realpathSync(resolve(project, rel));
    if (file !== forgeDir && !file.startsWith(forgeDir + sep)) {
      throw new Error(tr('.forge/ 밖의 파일은 열지 않습니다', 'Files outside .forge/ are not opened'));
    }
    return readText(file);
  },
};
