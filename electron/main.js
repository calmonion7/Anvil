// Anvil 데스크톱 앱 주 프로세스 — 창만 맡는다(ADR 261030-005852). 서버(server/main.js)는 앱과 떨어진 프로세스다:
// 열릴 때 데이터 폴더의 서버 정보(server.json·token)로 살아 있는 서버에 붙고, 없으면 이 Electron을 node로(ELECTRON_RUN_AS_NODE)
// detached로 띄운다. 앱을 꺼도(Cmd+Q) 서버에는 아무 신호도 보내지 않아 세션이 산다 — 서버는 세션도 창도 없이 5분 지나면 스스로 내려간다.
// 창은 서버 화면만 연다(contextIsolation · nodeIntegration 없음 · preload 없음). 서버 주소 밖으로는 이동하지 않고, 바깥 링크는 브라우저로 연다.
import { BrowserWindow, app, dialog, session, shell } from 'electron';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { running } from '../server/instance.js';

const dataDir = process.env.ANVIL_DATA_DIR || join(homedir(), '.anvil');
const serverMain = join(import.meta.dirname, '../server/main.js');
/** `npm run dev:app`: 서버 대신 vite 개발 화면을 연다(vite가 /api·/ws·/?token=을 서버로 넘긴다). 설치된 앱에서는 읽지 않는다. */
const devUrl = app.isPackaged ? undefined : process.env.ANVIL_DEV_URL;
/** 서버가 준비될 때까지 기다리는 시간 */
const BOOT_TIMEOUT = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 살아 있는 서버 → { port, token, … }. 없으면 띄우고 토큰을 받아 줄 때까지 기다린다. */
async function ensureServer() {
  const now = await running(dataDir);
  if (now) return now;
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const logFile = join(dataDir, 'server.log');
  const log = openSync(logFile, 'a', 0o600); // 첫 줄에 토큰 붙은 주소가 찍힌다
  spawn(process.execPath, [serverMain], {
    detached: true,
    stdio: ['ignore', log, log],
    cwd: homedir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }).unref();
  closeSync(log);
  const end = Date.now() + BOOT_TIMEOUT;
  while (Date.now() < end) {
    await sleep(200);
    const s = await running(dataDir);
    if (s) return s;
  }
  throw new Error(`서버가 뜨지 않았습니다 — ${logFile}`);
}

let win = null;
/** 창이 머물 수 있는 출처와 지금 연 서버의 토큰 */
let origin = null;
let token = null;

function openExternal(url) {
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Anvil',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const guard = (e, url) => {
    let to;
    try {
      to = new URL(url).origin;
    } catch {}
    if (to === origin) return;
    e.preventDefault();
    openExternal(url);
  };
  win.webContents.on('will-navigate', guard);
  win.webContents.on('will-redirect', guard);
  win.webContents.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame) guard(e, e.url); // 문서 속 iframe도 서버 출처 밖으로는 못 연다(CSP frame-src와 겹으로)
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => (win = null));
}

/** 서버에 붙어 창을 연다(이미 열려 있으면 새 토큰 주소로 다시 연다). */
async function openOnce() {
  const s = await ensureServer();
  const base = devUrl ?? `http://127.0.0.1:${s.port}`;
  origin = new URL(base).origin;
  token = s.token;
  if (!win) createWindow();
  await win.loadURL(`${base}/?token=${s.token}`);
}

/**
 * 여는 중에 또 불리면(Finder·Dock으로 열 때 macOS가 시작 직후 `activate`를 보낸다) 그 열기를 같이 기다린다 —
 * 두 번 열면 뒤 loadURL이 앞 것을 끊어 ERR_ABORTED로 죽는다(UAT 2026-10-30).
 */
let opening = null;
function open() {
  opening ??= openOnce().finally(() => (opening = null));
  return opening;
}

const fail = (e) => {
  dialog.showErrorBox('Anvil', e?.message ?? String(e));
  app.quit();
};

/** 서버가 다시 떠 토큰이 바뀌면(옛 쿠키는 401) 열린 창을 새 토큰으로 다시 연다. */
function followToken() {
  let timer;
  watch(dataDir, (_ev, file) => {
    if (file !== 'token' || !win) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = await running(dataDir);
      if (s && s.token !== token && win) open().catch(fail);
    }, 300);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return open().catch(fail);
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  // mac 관례: 창을 다 닫아도 앱은 Dock에 남고, Dock을 누르면 다시 연다(그새 서버가 내려갔으면 다시 띄운다).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!win) open().catch(fail);
  });
  app
    .whenReady()
    .then(async () => {
      // 화면은 카메라·마이크·알림·클립보드 읽기 같은 권한을 쓰지 않는다 — 문서 속 내용이 요청해도 묻지 않고 거절한다.
      session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      await open();
      followToken();
    })
    .catch(fail);
}
