// 서버 단일 실행 · 서버 정보 파일 · 유휴 종료 — 앱은 꺼져도 서버가 따로 살고, 다시 열린 앱은 같은 서버에 붙는다.
// 실제 진입점(`node server/main.js`)을 빈 포트·임시 데이터 폴더로 띄워 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { running } from '../instance.js';

const main = join(import.meta.dirname, '../main.js');

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** main.js를 띄워 첫 줄(「Anvil:」)이 찍히거나 끝날 때까지 기다린다 → { child, line, exit(끝났으면 코드) } */
function boot(env) {
  const child = spawn(process.execPath, [main], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      if (/Anvil: .*\n/.test(out)) resolve({ child, line: out });
    });
    child.on('exit', (code) => resolve({ child, line: out, exit: code }));
  });
}

const exited = (child, ms) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const t = setTimeout(() => resolve(null), ms);
    child.on('exit', (code) => (clearTimeout(t), resolve(code)));
  });

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'anvil-instance-'));
  const env = { ANVIL_PORT: String(await freePort()), ANVIL_DATA_DIR: dataDir };
  return { dataDir, env, info: join(dataDir, 'server.json') };
}

test('서버 정보 파일에 포트·pid를 남기고(600) running()이 그 서버를 찾는다', async () => {
  const { dataDir, env, info } = await setup();
  const { child } = await boot(env);
  try {
    const v = JSON.parse(readFileSync(info, 'utf8'));
    assert.deepEqual(v, { port: Number(env.ANVIL_PORT), pid: child.pid });
    if (process.platform !== 'win32') assert.equal(statSync(info).mode & 0o777, 0o600);
    const r = await running(dataDir);
    assert.equal(r.pid, child.pid);
    assert.equal(r.token, readFileSync(join(dataDir, 'token'), 'utf8').trim());
    assert.equal(r.url, `http://127.0.0.1:${env.ANVIL_PORT}/?token=${r.token}`);
  } finally {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('이미 살아 있는 서버가 있으면 두 번째 서버는 뜨지 않고 토큰도 바꾸지 않는다', async () => {
  const { dataDir, env } = await setup();
  const first = await boot(env);
  try {
    const token = readFileSync(join(dataDir, 'token'), 'utf8');
    const second = await boot(env);
    assert.equal(await exited(second.child, 10_000), 0, second.line);
    assert.match(second.line, /이미 실행 중/);
    assert.equal(readFileSync(join(dataDir, 'token'), 'utf8'), token, '첫 서버의 토큰이 그대로여야 앱이 붙는다');
    assert.equal((await running(dataDir)).pid, first.child.pid);
  } finally {
    first.child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('서버 정보 파일이 남아 있어도 그 서버가 죽었으면 새로 뜬다', async () => {
  const { dataDir, env, info } = await setup();
  writeFileSync(info, JSON.stringify({ port: Number(env.ANVIL_PORT), pid: 999_999 }));
  assert.equal(await running(dataDir), null);
  const { child, exit } = await boot(env);
  try {
    assert.equal(exit, undefined, '새 서버가 떠야 한다');
    assert.equal(JSON.parse(readFileSync(info, 'utf8')).pid, child.pid);
  } finally {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('그 포트에 다른 프로세스(가짜 서버)가 있으면 붙지 않고, 토큰도 보내지 않는다', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'anvil-instance-'));
  const port = await freePort();
  const token = 'a'.repeat(64);
  const seen = [];
  // 무엇을 물어도 200을 돌려주는 가짜(다른 사용자가 먼저 잡은 포트) — 받은 요청은 기록한다
  const fake = http.createServer((req, res) => {
    seen.push(`${req.url} ${req.headers.authorization ?? ''} ${req.headers.cookie ?? ''}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ proof: 'x'.repeat(64) }));
  });
  await new Promise((ok) => fake.listen(port, '127.0.0.1', ok));
  try {
    writeFileSync(join(dataDir, 'server.json'), JSON.stringify({ port, pid: process.pid }));
    writeFileSync(join(dataDir, 'token'), `${token}\n`);
    assert.equal(await running(dataDir), null);
    assert.ok(seen.length > 0, '확인 요청은 갔어야 한다');
    assert.ok(seen.every((s) => !s.includes(token)), seen.join('\n'));
  } finally {
    fake.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('세션도 붙은 창도 없이 유휴 시간이 지나면 정상 종료하고 서버 정보 파일을 지운다', async () => {
  const { dataDir, env, info } = await setup();
  const { child } = await boot({ ...env, ANVIL_IDLE_MS: '400' });
  try {
    assert.equal(await exited(child, 10_000), 0);
    assert.equal(existsSync(info), false);
  } finally {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('웹소켓이 붙어 있는 동안은 유휴 종료하지 않고, 떨어지면 종료한다', async () => {
  const { dataDir, env } = await setup();
  const { child } = await boot({ ...env, ANVIL_IDLE_MS: '400' });
  try {
    const { token } = await running(dataDir);
    const ws = new WebSocket(`ws://127.0.0.1:${env.ANVIL_PORT}/ws`, { headers: { authorization: `Bearer ${token}` } });
    await new Promise((ok, fail) => (ws.once('open', ok), ws.once('error', fail)));
    assert.equal(await exited(child, 1500), null, '창이 붙어 있으면 살아 있어야 한다');
    ws.close();
    assert.equal(await exited(child, 10_000), 0);
  } finally {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
