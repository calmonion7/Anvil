// 실행 중 서버 정보 — 서버는 앱과 떨어진 프로세스라, 앱(electron/main.js)과 두 번째 `node server/main.js`가
// 데이터 폴더의 `server.json`(포트·pid)과 `token`으로 살아 있는 서버를 찾아 붙는다(ADR 261030-005852).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const infoFile = (dataDir) => join(dataDir, 'server.json');

/** 포트를 잡은 뒤 부른다. 600 — 토큰처럼 이 사용자만 읽는다. */
export function writeInfo(dataDir, port) {
  const file = infoFile(dataDir);
  writeFileSync(file, JSON.stringify({ port, pid: process.pid }), { mode: 0o600 });
  chmodSync(file, 0o600); // 이미 있던 파일은 mode 옵션이 먹지 않는다
}

/** 이 프로세스가 쓴 정보 파일만 지운다(그새 다른 서버가 썼으면 둔다). */
export function removeInfo(dataDir) {
  try {
    if (JSON.parse(readFileSync(infoFile(dataDir), 'utf8')).pid === process.pid) rmSync(infoFile(dataDir));
  } catch {}
}

/** 우리 서버는 늘 같은 사용자로 돈다 — 신호를 못 보내는(EPERM) pid는 남의 프로세스다. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * 살아 있는 서버 → { port, pid, token, url }, 없으면 null. pid가 살아 있고, 그 포트의 서버가 토큰을 쥐고 있음을
 * 토큰을 보내지 않고 증명해야 한다(`/instance?nonce=` → HMAC(token, nonce)). 정보 파일이 낡아 그 포트를 다른 사용자의
 * 프로세스가 잡고 있으면 그 가짜 화면에 붙지 않는다.
 */
export async function running(dataDir) {
  let port, pid, token;
  try {
    ({ port, pid } = JSON.parse(readFileSync(infoFile(dataDir), 'utf8')));
    token = readFileSync(join(dataDir, 'token'), 'utf8').trim();
  } catch {
    return null;
  }
  if (!Number.isInteger(port) || !Number.isInteger(pid) || !alive(pid)) return null;
  const nonce = randomBytes(16).toString('hex');
  const want = Buffer.from(createHmac('sha256', token).update(nonce).digest('hex'));
  try {
    const res = await fetch(`http://127.0.0.1:${port}/instance?nonce=${nonce}`, { signal: AbortSignal.timeout(3000) });
    const got = Buffer.from(String((await res.json())?.proof ?? ''));
    if (!res.ok || got.length !== want.length || !timingSafeEqual(got, want)) return null;
  } catch {
    return null;
  }
  return { port, pid, token, url: `http://127.0.0.1:${port}/?token=${token}` };
}
