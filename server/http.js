// 서버 코어: 127.0.0.1에만 열고, 토큰·Origin·Host를 검사한 뒤 API(POST /api/<명령>)·웹소켓(/ws)·정적 화면(build/)을 낸다.
// 명령은 각 모듈의 `commands`를 그대로 모아 등록한다. 계약은 server/API.md.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { STATUS_CODES, createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import * as deps from './deps.js';
import * as forge from './forge.js';
import * as i18n from './i18n.js';
import { writeInfo } from './instance.js';
import * as pick from './pick.js';
import * as session from './session.js';
import * as updater from './updater.js';

const MODULES = [forge, session, deps, i18n, pick, updater];
/** 터미널은 그 웹소켓 연결에 묶이므로 웹소켓 메시지로만 받는다. */
const TERM = new Set(['term_open', 'term_write', 'term_resize', 'term_close']);
const STATIC = resolve(import.meta.dirname, '../build');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (d) => (text += d));
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });
}

/** 화면의 meta CSP(svelte.config.js — 스크립트)가 못 다는 것: 다른 사이트의 프레임에 실리지 않게(클릭재킹), 문서 HTML이 플러그인·<base>·폼 전송·프레임을 못 쓰게 */
const CSP = "frame-ancestors 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
  res.setHeader('content-security-policy', CSP);
  let file;
  try {
    file = resolve(STATIC, `.${decodeURIComponent(pathname)}`);
  } catch {
    return json(res, 400, { error: 'bad path' });
  }
  if (!file.startsWith(STATIC + sep) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(STATIC, 'index.html'); // SPA: 없는 경로는 화면이 라우팅한다
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('build/ 가 없습니다 — 먼저 `npm run build`\n');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}

/**
 * 서버를 띄운다. 포트를 잡은 뒤에 실행마다 새 토큰을 `<dataDir>/token`(600)에, 포트·pid를 `server.json`에 쓴다
 * (포트를 못 잡은 두 번째 서버가 살아 있는 서버의 토큰을 덮지 않게). `idleMs`가 0보다 크면 살아 있는 세션도 붙은 웹소켓도
 * 없는 상태가 그만큼 이어질 때 `onIdle`을 한 번 부른다. → { url(토큰 붙은 첫 주소), token, server }
 */
export async function start({ port, dataDir, idleMs = 0, onIdle }) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('hex');

  // 같은 호스트의 다른 포트(다른 Anvil)와 쿠키가 섞이지 않게 이름에 포트를 넣는다.
  const cookieName = `anvil_${port}`;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  const tokenBuf = Buffer.from(token);
  const same = (t) => {
    const b = Buffer.from(t ?? '');
    return b.length === tokenBuf.length && timingSafeEqual(b, tokenBuf);
  };
  const authorized = (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ') && same(auth.slice(7))) return true;
    const cookies = (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('='));
    return cookies.some(([k, v]) => k === cookieName && same(v));
  };
  /** 거절할 상태 코드, 통과면 0. Host(DNS 리바인딩) → Origin(다른 웹페이지) → 토큰 순. */
  const reject = (req, needToken) => {
    if (!hosts.has(req.headers.host)) return 403;
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) return 403;
    if (needToken && !authorized(req)) return 401;
    return 0;
  };

  const clients = new Set();
  const send = (ws, msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const ctx = {
    dataDir,
    port,
    /** 열린 모든 화면에 이벤트 `{type:'event', name, payload}`를 보낸다. */
    broadcast: (name, payload) => clients.forEach((ws) => send(ws, { type: 'event', name, payload })),
    registered: (project) => forge.registered(project),
  };

  const commands = {};
  for (const m of MODULES) {
    for (const [name, fn] of Object.entries(m.commands)) {
      if (Object.hasOwn(commands, name)) throw new Error(`duplicate command: ${name}`);
      commands[name] = fn;
    }
  }
  for (const m of MODULES) await m.init?.(ctx);

  async function api(req, res, name) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (TERM.has(name)) return json(res, 400, { error: `${name}: websocket only` });
    if (!Object.hasOwn(commands, name)) return json(res, 404, { error: `unknown command: ${name}` });
    let args;
    try {
      const text = await readBody(req);
      args = text ? JSON.parse(text) : {};
    } catch {
      return json(res, 400, { error: 'invalid JSON body' });
    }
    try {
      json(res, 200, (await commands[name](args, ctx)) ?? null);
    } catch (e) {
      json(res, 500, { error: e?.message ?? String(e) });
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');
    const code = reject(req, isApi);
    if (code) return json(res, code, { error: STATUS_CODES[code] });
    if (isApi) return api(req, res, url.pathname.slice('/api/'.length));
    // 이 서버가 그 토큰의 주인인지 — 앱이 토큰을 보내기 전에 묻는다(instance.js running). 토큰 없이 HMAC만 돌려준다.
    if (url.pathname === '/instance') {
      const nonce = url.searchParams.get('nonce') ?? '';
      if (!/^[0-9a-f]{32}$/.test(nonce)) return json(res, 400, { error: 'bad nonce' });
      return json(res, 200, { proof: createHmac('sha256', token).update(nonce).digest('hex') });
    }
    if (url.pathname === '/' && url.searchParams.has('token')) {
      if (!same(url.searchParams.get('token'))) return json(res, 401, { error: STATUS_CODES[401] });
      res.writeHead(302, { location: '/', 'set-cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/` });
      return res.end();
    }
    serveStatic(req, res, url.pathname);
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const code = new URL(req.url, 'http://localhost').pathname === '/ws' ? reject(req, true) : 404;
    if (code) {
      socket.end(`HTTP/1.1 ${code} ${STATUS_CODES[code]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      const conn = { send: (msg) => send(ws, msg), onClose: (fn) => ws.on('close', fn) };
      ws.on('close', () => clients.delete(ws));
      ws.on('message', async (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        if (!TERM.has(msg?.type)) return;
        const { type, ...args } = msg;
        try {
          await commands[type](args, { ...ctx, conn });
        } catch (e) {
          conn.send({ type: 'term_error', id: msg.id, error: e?.message ?? String(e) });
        }
      });
    });
  });

  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  const tokenFile = join(dataDir, 'token');
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  chmodSync(tokenFile, 0o600); // 이미 있던 파일은 mode 옵션이 먹지 않는다
  writeInfo(dataDir, port);
  // 포트를 잡은 뒤에만(두 번째 서버가 세션을 띄우지 않게): 세션 복구 등
  for (const m of MODULES) await m.ready?.(ctx);

  if (idleMs > 0) {
    let since = Date.now();
    const timer = setInterval(() => {
      if (clients.size || session.liveCount()) since = Date.now();
      else if (Date.now() - since >= idleMs) {
        clearInterval(timer);
        onIdle?.();
      }
    }, Math.min(idleMs, 5000));
  }
  return { url: `http://127.0.0.1:${port}/?token=${token}`, token, server };
}
