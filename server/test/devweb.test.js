// 개발 실행(`npm run dev:web` = scripts/dev-web.js): 서버와 vite 개발 화면을 같이 띄운다.
// 개발 화면 주소(vite)도 서버처럼 ?token= 주소로 쿠키를 받아야 API·웹소켓이 된다 — 프록시는 헤더만 보고 토큰을 붙이지 않는다
// (Origin·Host는 위조할 수 있다). 다른 Origin·Origin 없음은 여전히 거절되며, 스크립트를 멈추면 두 프로세스가 다 내려간다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, '../../scripts/dev-web.js');
let port, vitePort, dataDir, child, devUrl, out = '';

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function send(at, path, method, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: at, path, method, headers: { host: `127.0.0.1:${at}`, ...headers } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.end(method === 'POST' ? '{}' : undefined);
  });
}
const api = (at, cmd, headers = {}) => send(at, `/api/${cmd}`, 'POST', { 'content-type': 'application/json', ...headers });

/** vite를 거친 웹소켓 업그레이드 시도 → 받은 HTTP 상태(업그레이드되면 101) */
function upgrade(headers) {
  return new Promise((resolve, reject) => {
    const r = request({
      host: '127.0.0.1',
      port: vitePort,
      path: '/ws',
      headers: {
        host: `127.0.0.1:${vitePort}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        ...headers,
      },
    });
    r.on('response', (res) => (res.resume(), resolve(res.statusCode)));
    r.on('upgrade', (res, socket) => (socket.destroy(), resolve(res.statusCode)));
    r.on('error', reject);
    r.end();
  });
}

/** 개발 주소(?token=)로 들어가 받은 쿠키 한 쌍 `anvil_<port>=…` */
async function bootCookie() {
  const r = await send(vitePort, new URL(devUrl).pathname + new URL(devUrl).search, 'GET');
  assert.equal(r.status, 302, r.body);
  assert.equal(r.headers.location, '/');
  return r.headers['set-cookie'][0].split(';')[0];
}

const listening = (p) =>
  new Promise((resolve) => {
    const s = connect(p, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

before(async () => {
  [port, vitePort] = [await freePort(), await freePort()];
  dataDir = mkdtempSync(join(tmpdir(), 'anvil-devweb-'));
  child = spawn(process.execPath, [script, '--port', String(vitePort)], {
    env: { ...process.env, ANVIL_PORT: String(port), ANVIL_DATA_DIR: dataDir },
  });
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  // 개발 화면 주소(vite 주소 + 서버 토큰)가 찍히면 준비된 것
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`dev-web이 뜨지 않음:\n${out}`)), 30_000);
    const check = () => {
      const m = out.match(new RegExp(`Anvil 개발: (http://127\\.0\\.0\\.1:${vitePort}/\\?token=\\w+)`));
      if (m) clearTimeout(t), (devUrl = m[1]), resolve();
    };
    child.stdout.on('data', check);
    child.once('exit', (c) => reject(new Error(`dev-web이 종료됨(${c}):\n${out}`)));
  });
});

after(() => {
  if (child.exitCode === null) child.kill('SIGTERM'); // dev-web이 서버·vite까지 내린다(SIGKILL이면 둘이 남는다)
  rmSync(dataDir, { recursive: true, force: true });
});

test('개발 화면 주소(?token=)로 받은 쿠키를 지닌 API 요청은 통과한다', async () => {
  const cookie = await bootCookie();
  const r = await api(vitePort, 'list_projects', { origin: `http://127.0.0.1:${vitePort}`, cookie });
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(JSON.parse(r.body), []);
});

test('개발 화면 Origin·Host를 흉내만 낸 요청(쿠키 없음)은 401 — 프록시가 토큰을 대신 붙이지 않는다', async () => {
  assert.equal((await api(vitePort, 'list_projects', { origin: `http://127.0.0.1:${vitePort}` })).status, 401);
  assert.equal((await api(vitePort, 'list_projects', { origin: `http://127.0.0.1:${vitePort}`, cookie: `anvil_${port}=wrong` })).status, 401);
});

test('개발 화면 웹소켓: 흉내만 낸 Origin은 401, 쿠키가 있으면 붙는다', async () => {
  const origin = `http://127.0.0.1:${vitePort}`;
  assert.equal(await upgrade({ origin }), 401);
  assert.equal(await upgrade({ origin, cookie: await bootCookie() }), 101);
});

test('개발 화면 프록시를 거쳐도 다른 Origin은 403, Origin 없음은 401', async () => {
  assert.equal((await api(vitePort, 'list_projects', { origin: 'http://evil.example' })).status, 403);
  assert.equal((await api(vitePort, 'list_projects')).status, 401);
});

test('서버 포트로 직접 온 토큰 없는 요청은 그대로 401', async () => {
  assert.equal((await api(port, 'list_projects', { origin: `http://127.0.0.1:${port}` })).status, 401);
});

test('스크립트를 멈추면 서버와 vite가 둘 다 내려가고 0으로 끝난다', async () => {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  assert.equal(await exited, 0, '사용자가 멈춘 것은 실패가 아니다');
  // 자식이 정리될 시간을 조금 준다
  for (let i = 0; i < 50 && ((await listening(port)) || (await listening(vitePort))); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(await listening(port), false, '서버 포트가 아직 열려 있음');
  assert.equal(await listening(vitePort), false, 'vite 포트가 아직 열려 있음');
});
