// Anvil 서버 진입점: `node server/main.js`(앱은 Electron을 ELECTRON_RUN_AS_NODE=1로 이 파일에 부른다).
// 포트는 고정(4517)이고 환경변수 ANVIL_PORT로만 바꾼다. 데이터 폴더는 ANVIL_DATA_DIR, 기본 ~/.anvil.
// 같은 데이터 폴더에 살아 있는 서버가 있으면 그 주소만 찍고 끝난다. 세션도 붙은 창도 없이 ANVIL_IDLE_MS(기본 5분) 지나면 내려간다.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { start } from './http.js';
import { removeInfo, running } from './instance.js';

const port = Number(process.env.ANVIL_PORT || 4517);
const dataDir = process.env.ANVIL_DATA_DIR || join(homedir(), '.anvil');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`ANVIL_PORT가 올바른 포트가 아닙니다: ${process.env.ANVIL_PORT}`);
  process.exit(1);
}

const idleMs = Number(process.env.ANVIL_IDLE_MS ?? 5 * 60_000);
const existing = await running(dataDir);
if (existing) {
  console.log(`Anvil: 이미 실행 중 ${existing.url}`);
  process.exit(0);
}

try {
  const onIdle = () => {
    removeInfo(dataDir);
    process.exit(0);
  };
  const { url } = await start({ port, dataDir, idleMs, onIdle });
  console.log(`Anvil: ${url}`);
} catch (e) {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port}를 이미 쓰고 있습니다(ANVIL_PORT로 바꿀 수 있습니다)` : e);
  process.exit(1);
}
