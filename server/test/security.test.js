// DoD 6: 토큰 없는 요청 · 다른 Origin · localhost가 아닌 Host는 API와 웹소켓 모두에서 거절된다.
// 실제 진입점(`node server/main.js`)을 빈 포트·임시 데이터 폴더로 띄워 확인한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const main = join(import.meta.dirname, '../main.js');
let port, dataDir, child, token, bootUrl;

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** Host 헤더까지 직접 정해 보내는 요청 → { status, headers, body } */
function send(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = '';
      res.on('data', (d) => (text += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

const api = (cmd, args, headers = {}) =>
  send(`/api/${cmd}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(args ?? {}) });
const bearer = (t = token) => ({ authorization: `Bearer ${t}` });

/** 웹소켓 업그레이드 시도 → 받은 HTTP 상태(업그레이드되면 101) */
function upgrade(headers) {
  return new Promise((resolve, reject) => {
    const r = request({
      host: '127.0.0.1',
      port,
      path: '/ws',
      headers: {
        host: `127.0.0.1:${port}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        ...headers,
      },
    });
    r.on('response', (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    r.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    r.on('error', reject);
    r.end();
  });
}

before(async () => {
  port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'anvil-sec-'));
  child = spawn(process.execPath, [main], { env: { ...process.env, ANVIL_PORT: String(port), ANVIL_DATA_DIR: dataDir } });
  bootUrl = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/);
      if (m) resolve(m[0]);
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
  });
  token = new URL(bootUrl).searchParams.get('token');
});

after(() => {
  child?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

test('시작하면 토큰을 데이터 폴더에 600으로 쓰고 같은 토큰의 주소를 알린다', () => {
  assert.equal(new URL(bootUrl).port, String(port));
  assert.ok(token.length >= 32);
  assert.equal(readFileSync(join(dataDir, 'token'), 'utf8').trim(), token);
  if (process.platform !== 'win32') assert.equal(statSync(join(dataDir, 'token')).mode & 0o777, 0o600); // Windows에는 POSIX 권한이 없다
});

test('API: 토큰이 없거나 틀리면 401', async () => {
  assert.equal((await api('set_lang', { en: false })).status, 401);
  assert.equal((await api('set_lang', { en: false }, bearer('wrong'))).status, 401);
  assert.equal((await api('set_lang', { en: false }, { cookie: `anvil_${port}=wrong` })).status, 401);
});

test('API: 맞는 토큰이면 결과를 JSON으로 돌려준다', async () => {
  const r = await api('set_lang', { en: false }, bearer());
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body), null);
});

test('API: 다른 Origin이면 토큰이 맞아도 403, 같은 출처의 Origin은 통과', async () => {
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), origin: 'http://evil.example' })).status, 403);
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), origin: `http://127.0.0.1:${port + 1}` })).status, 403);
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), origin: `http://localhost:${port}` })).status, 200);
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), origin: `http://127.0.0.1:${port}` })).status, 200);
});

test('Host가 이 서버의 localhost 주소가 아니면 403(DNS 리바인딩)', async () => {
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), host: `evil.example:${port}` })).status, 403);
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), host: `127.0.0.1:${port + 1}` })).status, 403);
  assert.equal((await api('set_lang', { en: false }, { ...bearer(), host: `localhost:${port}` })).status, 200);
  assert.equal((await send('/', { headers: { host: `evil.example:${port}` } })).status, 403);
});

test('부트스트랩: /?token= 이 맞으면 HttpOnly·SameSite=Strict 쿠키를 주고 /로 보낸다', async () => {
  const bad = await send('/?token=wrong');
  assert.equal(bad.status, 401);
  assert.equal(bad.headers['set-cookie'], undefined);

  const r = await send(`/?token=${token}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/');
  const cookie = r.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const pair = cookie.split(';')[0];
  assert.equal((await api('set_lang', { en: false }, { cookie: pair })).status, 200);
});

test('정적 파일은 토큰 없이도 401이 아니다', async () => {
  const r = await send('/');
  assert.notEqual(r.status, 401);
  assert.notEqual(r.status, 403);
});

test('화면은 다른 사이트의 프레임에 실리지 않고 플러그인·<base>·폼 전송을 막는 CSP를 단다(스크립트는 화면의 meta CSP)', async () => {
  const csp = (await send('/')).headers['content-security-policy'] ?? '';
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"]) assert.match(csp, new RegExp(d), csp);
});

test('없는 명령은 404 {error}', async () => {
  const r = await api('no_such_command', {}, bearer());
  assert.equal(r.status, 404);
  assert.equal(typeof JSON.parse(r.body).error, 'string');
});

test('웹소켓: 토큰 없음 401 · 다른 Origin 403 · 다른 Host 403', async () => {
  assert.equal(await upgrade({}), 401);
  assert.equal(await upgrade(bearer('wrong')), 401);
  assert.equal(await upgrade({ ...bearer(), origin: 'http://evil.example' }), 403);
  assert.equal(await upgrade({ ...bearer(), host: `evil.example:${port}` }), 403);
  assert.equal(await upgrade(bearer()), 101);
});

test('웹소켓: 쿠키로 붙고 터미널 메시지가 세션 모듈로 간다', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: `anvil_${port}=${token}` }, origin: `http://127.0.0.1:${port}` });
  const msg = await new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'term_open', id: 7, name: 'anvil-x', cols: 80, rows: 24 })));
    ws.on('message', (d) => resolve(JSON.parse(d)));
    ws.on('error', reject);
  });
  ws.close();
  // S4 전까지 session.js는 'not implemented' — 오류가 그 터미널 id로 돌아온다.
  assert.equal(msg.type, 'term_error');
  assert.equal(msg.id, 7);
  assert.equal(typeof msg.error, 'string');
});
