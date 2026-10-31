// 세 OS 공통 자체 업데이터(데스크톱 앱 5/6, ADR 261030-005852). GitHub 최신 릴리스 확인 → 이 OS 파일 내려받기 → 체크섬 목록(SHA256SUMS.txt)
// 검증 → 작업 중인 세션이 없을 때 OS별 교체 단계(replace.js)를 부르고 서버를 내린다. 다시 뜬 앱의 서버가 세션을 복구한다(session.js ready).
// 서명이 없어 electron-updater는 쓰지 않는다(서명 없는 mac에서 동작하지 않는다).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tr } from './i18n.js';
import { removeInfo } from './instance.js';
import * as replacer from './replace.js';
import { states } from './session.js';

const API = 'https://api.github.com/repos/calmonion7/Anvil/releases/latest';
const SUMS = 'SHA256SUMS.txt';
/** 주기 확인 간격 */
const EVERY = 6 * 60 * 60_000;

/** `a`가 `b`보다 높은 버전인가(점으로 나눈 숫자 단위) */
export function newer(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** 이 OS의 업데이트 파일 이름(electron-builder.yml artifactName). Windows는 x64판 하나다(ARM은 에뮬레이션). */
const PATTERN = {
  darwin: (arch) => new RegExp(`^Anvil-[\\d.]+-mac-${arch === 'arm64' ? 'arm64' : 'x64'}\\.zip$`),
  win32: () => /^Anvil-[\d.]+-win-x64\.exe$/,
  linux: () => /^Anvil-[\d.]+-linux-x86_64\.AppImage$/,
};

/** 릴리스 첨부 이름들 중 이 OS·아키텍처의 업데이트 파일, 없으면 null */
export function pickAsset(names, platform, arch) {
  const re = PATTERN[platform]?.(arch);
  return (re && names.find((n) => re.test(n))) ?? null;
}

/** 최신 릴리스가 `current`보다 새 버전이고 이 OS 파일과 체크섬 목록이 있으면 → { version, name, url, sumsUrl }, 아니면 null */
export async function check({ current, api = API, platform = process.platform, arch = process.arch }) {
  const res = await fetch(api, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`${tr('릴리스를 확인하지 못했습니다', 'Could not check releases')}: HTTP ${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  if (!/^\d+(\.\d+)*$/.test(version) || !newer(version, current)) return null;
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const url = (n) => assets.find((a) => a.name === n)?.browser_download_url;
  const name = pickAsset(assets.map((a) => a.name), platform, arch);
  if (!name || !url(SUMS)) return null;
  return { version, name, url: url(name), sumsUrl: url(SUMS) };
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${tr('내려받지 못했습니다', 'Download failed')}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 업데이트 파일을 받아 체크섬 목록과 맞춰 본 뒤에만 `dir`에 쓴다(틀리면 쓰지 않고 거부). → 파일 경로 */
export async function download(info, dir) {
  const want = String(await get(info.sumsUrl))
    .split('\n')
    .map((l) => l.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i))
    .find((m) => m?.[2] === info.name)?.[1]
    ?.toLowerCase();
  const buf = await get(info.url);
  if (!want || createHash('sha256').update(buf).digest('hex') !== want) {
    throw new Error(`${tr('체크섬이 맞지 않아 업데이트 파일을 버렸습니다', 'Checksum mismatch — the update file was discarded')} (${info.name})`);
  }
  mkdirSync(dir, { recursive: true });
  const file = join(dir, info.name);
  writeFileSync(file, buf, { mode: 0o755 }); // AppImage는 실행 권한이 있어야 한다
  return file;
}

/** 작업 중(working)인 세션이 있는가 — 입력 대기는 아니다(다시 떠도 대화째 복구된다) */
export const busy = (st) => Object.values(st).some((s) => s?.alive && s.state === 'working');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 내려받기·검증 → 작업 중인 세션이 끝날 때까지 기다림 → 교체 단계 → 서버 종료. 진행은 `onChange({state, version, error})`:
 * `downloading` → (`deferred`) → `installing`, 실패하면 `failed`(서버는 그대로). → 'installing' | 'failed'
 */
export async function update(info, { dir, states: st, replace, exit, sleep = wait, onChange = () => {} }) {
  const tell = (state, error = null) => onChange({ state, version: info.version, error });
  try {
    tell('downloading');
    const file = await download(info, dir);
    while (busy(st())) {
      tell('deferred');
      await sleep(5000);
    }
    tell('installing');
    await replace(file);
  } catch (e) {
    tell('failed', String(e?.message ?? e));
    return 'failed';
  }
  exit();
  return 'installing';
}

// ---------- 서버에 붙는 부분 ----------

const current = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')).version;
/** 화면 띠가 그리는 상태: available(새 버전 또는 null) · progress(진행 또는 null) · error(확인 실패) */
let status = { current, available: null, progress: null, error: null };
let running = null;

function set(ctx, patch) {
  status = { ...status, ...patch };
  ctx.broadcast('updater', status);
}

async function recheck(ctx) {
  try {
    const info = await check({ current, api: process.env.ANVIL_UPDATE_API || API });
    set(ctx, { available: info, error: null });
  } catch (e) {
    set(ctx, { error: String(e?.message ?? e) });
  }
  return status;
}

/** 설치된 앱(교체할 곳을 아는 경우)에서만 확인한다 — 개발 실행·브라우저로 띄운 서버는 업데이트하지 않는다. */
export async function init(ctx) {
  if (!replacer.installable()) return;
  recheck(ctx);
  setInterval(() => recheck(ctx), EVERY).unref();
}

export const commands = {
  /** 지금 상태 { current, available, progress, error, installable } */
  updater_status: async () => ({ ...status, installable: replacer.installable() }),
  /** [다시 확인] */
  updater_check: async (_args, ctx) => ({ ...(replacer.installable() ? await recheck(ctx) : status), installable: replacer.installable() }),
  /** [업데이트] — 끝까지 기다리지 않고 시작만 한다. 진행은 `updater` 이벤트. */
  updater_install: async (_args, ctx) => {
    if (!replacer.installable() || !status.available) return status;
    running ??= update(status.available, {
      dir: join(ctx.dataDir, 'updates'),
      states: () => states(ctx.dataDir),
      replace: (file) => replacer.replace(file),
      exit: () => {
        removeInfo(ctx.dataDir);
        process.exit(0);
      },
      onChange: (p) => set(ctx, { progress: p }),
    }).finally(() => (running = null));
    return status;
  },
};
