// Anvil 데스크톱 앱 주 프로세스 — 창만 맡는다(ADR 261030-005852). 서버(server/main.js)는 앱과 떨어진 프로세스다:
// 열릴 때 데이터 폴더의 서버 정보(server.json·token)로 살아 있는 서버에 붙고, 없으면 이 Electron을 node로(ELECTRON_RUN_AS_NODE)
// detached로 띄운다. 앱을 꺼도(Cmd+Q) 서버에는 아무 신호도 보내지 않아 세션이 산다 — 서버는 세션도 창도 없이 5분 지나면 스스로 내려간다.
// 창은 서버 화면만 연다(contextIsolation · nodeIntegration 없음 · preload는 폴더 고르기와 알림으로 고른 프로젝트 받기만 — preload.cjs).
// 입력 대기 알림은 이 프로세스가 세션 상태 파일을 지켜보다 띄운다(앱이 켜져 있을 때만 — notify.js). Windows·Linux는 창을 닫으면 트레이에 남는다. 서버 주소 밖으로는 이동하지 않고, 바깥 링크는 브라우저로 연다.
import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, session, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { running } from '../server/instance.js';
import { findSession, message, readStates, toNotify } from './notify.js';

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
    windowsHide: true, // Windows에서 서버용 콘솔 창이 뜨지 않게
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(import.meta.dirname, 'preload.cjs') },
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

/** 화면의 [프로젝트 추가] — OS 기본 폴더 창을 Anvil 창에 붙여 연다. 서버 출처의 화면만 부를 수 있다. → 경로 또는 null(취소) */
ipcMain.handle('pick-folder', async (e) => {
  let from;
  try {
    from = new URL(e.senderFrame?.url ?? '').origin;
  } catch {}
  if (!win || from !== origin) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : (r.filePaths[0] ?? null);
});

/** 서버에 붙어 창을 연다(이미 열려 있으면 새 토큰 주소로 다시 연다). */
async function openOnce() {
  await app.whenReady(); // activate가 ready보다 먼저 와도 창은 준비 뒤에 만든다(그 전엔 BrowserWindow를 만들 수 없다 — CI 실측)
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
/** 지금 여는 까닭(start·activate·second-instance·token) — 열기가 실패하면 함께 남긴다 */
let openedFor = null;
function open(reason) {
  if (!opening) {
    openedFor = reason;
    opening = openOnce().finally(() => (opening = null));
  }
  return opening;
}

/** 끄는 중(Cmd+Q·app.quit 뒤)인지 — 그때 난 오류에는 창을 띄우지 않는다 */
let quitting = false;
app.on('before-quit', () => (quitting = true));

/** 오류를 표준 오류와 `<데이터 폴더>/app.log`(600)에 남긴다. 서버 주소의 토큰은 가린다(CI 로그에는 표준 오류가 그대로 찍힌다). */
function logError(e) {
  const where = `[열기: ${openedFor ?? '-'}${quitting ? ' · 끄는 중' : ''}]`;
  const line = `${new Date().toISOString()} ${where} ${String(e?.stack ?? e?.message ?? e).replace(/token=[^\s&'"]+/g, 'token=…')}\n`;
  process.stderr.write(line);
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dataDir, 'app.log'), line, { mode: 0o600 });
  } catch {}
}

/**
 * 오류 창 — 스크립트 없는 HTML 한 장. 닫으면 앱이 끝난다. OS 오류 창(dialog)은 쓰지 않는다: 예전 동기 오류 창은 누를 때까지
 * 주 프로세스를 멈추고, macOS에서 부모 창 없는 showMessageBox도 모달이라 그동안 app.quit이 끝나지 않았다(실측 2026-11-01).
 */
function showError(message) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><meta charset="utf-8"><title>Anvil</title><body style="font:14px system-ui;margin:24px;white-space:pre-wrap">${esc(message)}`;
  const w = new BrowserWindow({ width: 520, height: 220, title: 'Anvil', webPreferences: { sandbox: true, javascript: false } });
  w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  w.on('closed', () => app.quit());
}

/** 창을 열지 못했다 — 남기고, 끄는 중이 아니면 오류 창을 보인다(CI에서 앱이 창도 없이 꺼지지 않던 원인, 작업 #25). */
const fail = (e) => {
  logError(e);
  if (quitting) return;
  app
    .whenReady()
    .then(() => showError(e?.message ?? String(e)))
    .catch(() => app.quit());
};

/** 창을 열거나(없으면) 앞으로 가져온다 */
function showWindow(reason) {
  if (!win) return open(reason).catch(fail);
  if (win.isMinimized()) win.restore();
  win.focus();
}

// ---------- 입력 대기 알림 ----------

const en = () => !app.getLocale().startsWith('ko');

/** 알림을 눌러 고를 프로젝트 — 화면이 `take-project`로 한 번 가져간다(창을 새로 열 때도, 이미 열려 있을 때도 같은 길). */
let pendingProject = null;
ipcMain.handle('take-project', (e) => {
  let from;
  try {
    from = new URL(e.senderFrame?.url ?? '').origin;
  } catch {}
  if (from !== origin) return null;
  const p = pendingProject;
  pendingProject = null;
  return p;
});

function showProject(project) {
  pendingProject = project;
  if (win) win.webContents.send('select-project');
  showWindow('notify');
}

/** 띄운 알림 — Windows는 알림 객체가 GC되면 누르기(click)가 오지 않는다 */
const shown = new Set();
/**
 * OS 알림. 서명 없는 앱은 macOS가 Electron 알림을 권한 창도 없이 거절해(UNErrorDomain 1, 실측 2026-11-01) macOS는 osascript로 띄운다 —
 * 그 알림은 눌러도 Anvil로 오지 않는다.
 */
function notify({ title, body }, project) {
  if (process.platform === 'darwin') {
    execFile('osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, body], () => {});
    return;
  }
  const n = new Notification({ title, body });
  shown.add(n);
  n.on('click', () => project && showProject(project));
  n.on('close', () => shown.delete(n));
  n.show();
}

/** 등록된 프로젝트(`<데이터 폴더>/projects.json`) */
function projects() {
  try {
    const v = JSON.parse(readFileSync(join(dataDir, 'projects.json'), 'utf8'));
    return Array.isArray(v) ? v.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** 훅이 세션 상태 파일을 바꾸면 입력 대기로 바뀐 세션을 알린다. 포커스된 Anvil 창이 있으면 알리지 않는다(보드가 이미 보인다). */
function watchSessions() {
  const dir = join(dataDir, 'sessions');
  mkdirSync(dir, { recursive: true });
  let prev = readStates(dataDir);
  let timer;
  watch(dir, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = readStates(dataDir);
      for (const name of toNotify(prev, next, BrowserWindow.getFocusedWindow() !== null)) {
        const s = findSession(name, projects());
        if (s) notify(message(s, en()), s.project);
      }
      prev = next;
    }, 150);
  });
}

// ---------- 트레이(Windows·Linux) ----------

let tray = null;
/**
 * 창을 다 닫으면 macOS의 Dock처럼 트레이에 남는다 — 그동안에도 입력 대기 알림이 온다. [끝내기]로 앱이 꺼진다(서버·세션은 그대로).
 * 트레이가 보이지 않는 데스크톱(확장 없는 GNOME 등)을 위해 처음 한 번 알린다 — 다시 실행하거나 알림을 누르면 창이 열린다.
 */
function toTray() {
  if (!tray) {
    const icon = nativeImage.createFromPath(join(import.meta.dirname, '../icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
    tray = new Tray(process.platform === 'win32' ? icon : icon.resize({ width: 24, height: 24 }));
    tray.setToolTip('Anvil');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: en() ? 'Open' : '열기', click: () => showWindow('tray') },
        { label: en() ? 'Quit' : '끝내기', click: () => app.quit() },
      ]),
    );
    tray.on('click', () => showWindow('tray'));
  }
  const seen = join(dataDir, 'tray-notice');
  if (!existsSync(seen)) {
    notify({
      title: 'Anvil',
      body: en() ? 'Anvil keeps running in the tray — choose [Quit] from the tray menu to exit.' : 'Anvil은 트레이에서 계속 실행됩니다 — 끝내려면 트레이 메뉴 [끝내기]',
    });
    try {
      writeFileSync(seen, '');
    } catch {}
  }
}

/** 서버가 다시 떠 토큰이 바뀌면(옛 쿠키는 401) 열린 창을 새 토큰으로 다시 연다. */
function followToken() {
  let timer;
  watch(dataDir, (_ev, file) => {
    if (file !== 'token' || !win) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = await running(dataDir);
      if (s && s.token !== token && win) open('token').catch(fail);
    }, 300);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Windows 토스트는 앱 ID가 설치판 바로가기(electron-builder appId)와 같아야 뜬다
  if (process.platform === 'win32') app.setAppUserModelId('com.taebro.anvil');
  app.on('second-instance', () => showWindow('second-instance'));
  // 창을 다 닫아도 앱은 남는다 — mac은 Dock(관례), Windows·Linux는 트레이. 다시 열 때 그새 서버가 내려갔으면 다시 띄운다.
  // app.quit(Cmd+Q·트레이 [끝내기])으로 끌 때는 이 이벤트가 오지 않는다.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') toTray();
  });
  app.on('activate', () => {
    if (!win) open('activate').catch(fail);
  });
  app
    .whenReady()
    .then(async () => {
      // 화면은 카메라·마이크·알림·클립보드 읽기 같은 권한을 쓰지 않는다 — 문서 속 내용이 요청해도 묻지 않고 거절한다.
      session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      await open('start');
      followToken();
      watchSessions();
    })
    .catch(fail);
}
