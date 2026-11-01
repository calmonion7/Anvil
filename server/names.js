// 세션 이름 — 서버(session.js)와 데스크톱 앱 주 프로세스(입력 대기 알림, electron/notify.js)가 함께 쓴다.
// node-pty를 부르지 않도록 session.js에서 떼어 냈다.
import { basename } from 'node:path';

/** `anvil-<프로젝트키>-<plan|run>`. 키는 폴더 이름 + 경로 해시 6자리(같은 이름 폴더 구분). */
export function sessionName(project, role) {
  const base = [...basename(project).toLowerCase()].map((ch) => (/^[a-z0-9]$/.test(ch) ? ch : '-')).join('');
  // FNV-1a — 실행마다 같은 값이어야 한다.
  let h = 0x811c9dc5;
  for (const b of Buffer.from(project)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `anvil-${base}-${(h & 0xffffff).toString(16).padStart(6, '0')}-${role}`;
}
