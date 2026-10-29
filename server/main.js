// Anvil 서버 진입점: `node server/main.js`.
// 포트는 고정(4517)이고 환경변수 ANVIL_PORT로만 바꾼다. 데이터 폴더는 ANVIL_DATA_DIR, 기본 ~/.anvil.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { start } from './http.js';

const port = Number(process.env.ANVIL_PORT || 4517);
const dataDir = process.env.ANVIL_DATA_DIR || join(homedir(), '.anvil');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`ANVIL_PORT가 올바른 포트가 아닙니다: ${process.env.ANVIL_PORT}`);
  process.exit(1);
}

try {
  const { url } = await start({ port, dataDir });
  console.log(`Anvil: ${url}`);
} catch (e) {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port}를 이미 쓰고 있습니다(ANVIL_PORT로 바꿀 수 있습니다)` : e);
  process.exit(1);
}
