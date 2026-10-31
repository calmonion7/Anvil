// 서버가 Electron 안의 Node(ELECTRON_RUN_AS_NODE)로 돈다 — node-pty 생성, 서버 진입점, 그리고 세션 흐름 전체
// (가짜 claude가 훅을 세션 PATH의 `node` 대체 실행 파일로 부른다)를 Electron 런타임에서 다시 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const electron = createRequire(import.meta.url)('electron'); // node에서 부르면 실행 파일 경로
const asNode = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
const skip = false; // Windows도 돈다(데스크톱 앱 4/6) — 세션 흐름은 node.cmd 대체 실행 파일로 훅을 부른다

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

for (const file of ['pty.test.js', 'session.test.js']) {
  test(`Electron 런타임에서 ${file}가 통과한다`, { skip }, () => {
    const r = spawnSync(electron, ['--test', join(import.meta.dirname, file)], { env: asNode, encoding: 'utf8', timeout: 120_000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
}

test('Electron 런타임으로 server/main.js가 뜬다', { skip }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'anvil-electron-'));
  const port = await freePort();
  const child = spawn(electron, [join(import.meta.dirname, '../main.js')], {
    env: { ...asNode, ANVIL_PORT: String(port), ANVIL_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (d) => {
        out += d;
        const m = out.match(/Anvil: (http:\/\/\S+)/);
        if (m) resolve(m[1]);
      });
      child.on('exit', (code) => reject(new Error(`exit ${code}: ${out}`)));
    });
    assert.match(url, new RegExp(`^http://127\\.0\\.0\\.1:${port}/\\?token=\\w+$`));
  } finally {
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
