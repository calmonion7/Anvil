// Anvil 세션 상태 훅 — claude가 SessionStart·UserPromptSubmit·PostToolUse·Stop·Notification·SessionEnd 때
// `node anvil-hook.js <데이터 폴더> <상태>`로 부른다(설정은 session.js가 쓰는 hooks.json).
// `<데이터 폴더>/sessions/<ANVIL_SESSION>.json`에 {state, session_id, ts}를 남긴다. 어떤 경우에도 claude를 막지 않도록 늘 exit 0.
// 옛 sh판 훅(v0.1.x)의 입력 대기 OS 알림은 별도 작업이라 옮기지 않았다.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, state] = process.argv.slice(2);
const name = process.env.ANVIL_SESSION;
const sessionId = (text) => {
  try {
    const id = JSON.parse(text)?.session_id;
    return typeof id === 'string' && id ? id : undefined;
  } catch {}
};

try {
  if (name && dir && state) {
    let input = '';
    try {
      input = readFileSync(0, 'utf8');
    } catch {}
    const f = join(dir, 'sessions', `${name}.json`);
    let sid = sessionId(input);
    if (!sid) {
      try {
        sid = sessionId(readFileSync(f, 'utf8'));
      } catch {}
    }
    mkdirSync(join(dir, 'sessions'), { recursive: true });
    writeFileSync(`${f}.tmp`, `${JSON.stringify({ state, session_id: sid ?? '', ts: Math.floor(Date.now() / 1000) })}\n`);
    renameSync(`${f}.tmp`, f);
  }
} catch {}
process.exit(0);
