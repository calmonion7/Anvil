// 세 OS 공통 자체 업데이터(데스크톱 앱 5/6) — 가짜 릴리스 서버로 확인 · 내려받기와 체크섬 · 세션 가드 · 교체 단계 호출을 본다.
// 교체 단계(OS별)와 서버 종료는 가짜로 바꿔 끼운다. 재시작 뒤 세션 복구는 서버가 뜰 때의 ready()가 맡는다(restore.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { busy, check, download, newer, pickAsset, update } from '../updater.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** 가짜 GitHub 릴리스 API·내려받기 서버. files: 이름 → 내용, sums: 체크섬 목록에 적을 이름 → 해시 */
async function fakeReleases({ tag = 'v0.2.0', files = {}, sums } = {}) {
  sums ??= Object.fromEntries(Object.entries(files).map(([n, c]) => [n, sha(c)]));
  const all = { ...files, 'SHA256SUMS.txt': Object.entries(sums).map(([n, h]) => `${h}  ${n}\n`).join('') };
  const server = createServer((req, res) => {
    if (req.url === '/latest') {
      const base = `http://127.0.0.1:${server.address().port}/files/`;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ tag_name: tag, assets: Object.keys(all).map((name) => ({ name, browser_download_url: base + name })) }));
    }
    const name = decodeURIComponent(req.url.replace('/files/', ''));
    if (!Object.hasOwn(all, name)) return res.writeHead(404).end();
    res.end(all[name]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { api: `http://127.0.0.1:${server.address().port}/latest`, close: () => server.close() };
}

function tempDir(fn) {
  const d = mkdtempSync(join(tmpdir(), 'anvil-upd-'));
  return Promise.resolve(fn(d)).finally(() => rmSync(d, { recursive: true, force: true }));
}

const MAC = 'Anvil-0.2.0-mac-arm64.zip';

test('버전 비교: 숫자 단위로 더 높아야 새 버전이다', () => {
  assert.equal(newer('0.2.0', '0.1.8'), true);
  assert.equal(newer('0.1.10', '0.1.9'), true);
  assert.equal(newer('0.1.8', '0.1.8'), false);
  assert.equal(newer('0.1.7', '0.1.8'), false);
});

test('이 OS·아키텍처의 업데이트 파일을 고른다(mac은 zip, Windows는 x64 설치 프로그램, Linux는 AppImage)', () => {
  const names = ['Anvil-0.2.0-mac-arm64.dmg', MAC, 'Anvil-0.2.0-mac-x64.zip', 'Anvil-0.2.0-win-x64.exe', 'Anvil-0.2.0-linux-x86_64.AppImage', 'SHA256SUMS.txt'];
  assert.equal(pickAsset(names, 'darwin', 'arm64'), MAC);
  assert.equal(pickAsset(names, 'darwin', 'x64'), 'Anvil-0.2.0-mac-x64.zip');
  assert.equal(pickAsset(names, 'win32', 'x64'), 'Anvil-0.2.0-win-x64.exe');
  assert.equal(pickAsset(names, 'win32', 'arm64'), 'Anvil-0.2.0-win-x64.exe', 'ARM Windows는 x64판을 에뮬레이션으로 쓴다');
  assert.equal(pickAsset(names, 'linux', 'x64'), 'Anvil-0.2.0-linux-x86_64.AppImage');
  assert.equal(pickAsset(['SHA256SUMS.txt'], 'darwin', 'arm64'), null);
});

test('새 버전을 감지하고, 같거나 옛 버전·이 OS 파일이 없는 릴리스는 넘긴다', async () => {
  const rel = await fakeReleases({ files: { [MAC]: 'zip' } });
  try {
    const found = await check({ current: '0.1.8', api: rel.api, platform: 'darwin', arch: 'arm64' });
    assert.equal(found.version, '0.2.0');
    assert.equal(found.name, MAC);
    assert.equal(await check({ current: '0.2.0', api: rel.api, platform: 'darwin', arch: 'arm64' }), null);
    assert.equal(await check({ current: '0.3.0', api: rel.api, platform: 'darwin', arch: 'arm64' }), null);
    assert.equal(await check({ current: '0.1.8', api: rel.api, platform: 'linux', arch: 'x64' }), null);
  } finally {
    rel.close();
  }
});

test('내려받은 파일은 체크섬 목록과 맞아야 하고, 틀리거나 목록에 없으면 지우고 거부한다', async () => {
  await tempDir(async (dir) => {
    const ok = await fakeReleases({ files: { [MAC]: 'good zip' } });
    try {
      const file = await download(await check({ current: '0.1.8', api: ok.api, platform: 'darwin', arch: 'arm64' }), dir);
      assert.equal(readFileSync(file, 'utf8'), 'good zip');
    } finally {
      ok.close();
    }
    const bad = await fakeReleases({ files: { [MAC]: 'tampered' }, sums: { [MAC]: sha('good zip') } });
    try {
      const info = await check({ current: '0.1.8', api: bad.api, platform: 'darwin', arch: 'arm64' });
      await assert.rejects(download(info, join(dir, 'b')), /체크섬|checksum/);
      assert.equal(existsSync(join(dir, 'b', MAC)), false, '틀린 파일은 남기지 않는다');
    } finally {
      bad.close();
    }
    const unlisted = await fakeReleases({ files: { [MAC]: 'zip' }, sums: {} });
    try {
      const info = await check({ current: '0.1.8', api: unlisted.api, platform: 'darwin', arch: 'arm64' });
      await assert.rejects(download(info, join(dir, 'c')), /체크섬|checksum/);
    } finally {
      unlisted.close();
    }
  });
});

test('작업 중(working)인 세션이 있으면 바쁘다 — 입력 대기·끝난 세션은 아니다', () => {
  assert.equal(busy({ a: { state: 'working', alive: true } }), true);
  assert.equal(busy({ a: { state: 'waiting', alive: true }, b: { state: 'ended', alive: false } }), false);
  assert.equal(busy({}), false);
});

test('작업 중인 세션이 있으면 「세션이 끝나면 업데이트」로 미루고, 끝나면 교체 단계를 부른 뒤 서버를 내린다', async () => {
  await tempDir(async (dir) => {
    const rel = await fakeReleases({ files: { [MAC]: 'zip' } });
    try {
      const info = await check({ current: '0.1.8', api: rel.api, platform: 'darwin', arch: 'arm64' });
      const seen = [];
      const calls = [];
      let working = 2; // 두 번 확인하는 동안 작업 중
      const result = await update(info, {
        dir,
        states: () => (working-- > 0 ? { s: { state: 'working', alive: true } } : {}),
        sleep: async () => {},
        replace: async (file) => calls.push(['replace', readFileSync(file, 'utf8')]),
        exit: () => calls.push(['exit']),
        onChange: (p) => seen.push(p.state),
      });
      assert.equal(result, 'installing');
      assert.deepEqual(calls, [['replace', 'zip'], ['exit']], '검증한 파일로 교체 단계를 부른 뒤 서버를 내린다');
      assert.deepEqual([...new Set(seen)], ['downloading', 'deferred', 'installing']);
    } finally {
      rel.close();
    }
  });
});

test('내려받기나 교체가 실패하면 failed로 알리고 서버는 내리지 않는다', async () => {
  await tempDir(async (dir) => {
    const rel = await fakeReleases({ files: { [MAC]: 'zip' } });
    try {
      const info = await check({ current: '0.1.8', api: rel.api, platform: 'darwin', arch: 'arm64' });
      const seen = [];
      let exited = false;
      const result = await update(info, {
        dir,
        states: () => ({}),
        sleep: async () => {},
        replace: async () => {
          throw new Error('교체 실패');
        },
        exit: () => (exited = true),
        onChange: (p) => seen.push(p),
      });
      assert.equal(result, 'failed');
      assert.equal(exited, false);
      assert.match(seen.at(-1).error, /교체 실패/);
    } finally {
      rel.close();
    }
  });
});
