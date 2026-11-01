// 입력 대기 알림 — 주 프로세스(main.js)가 `<데이터 폴더>/sessions/`를 지켜보다 부른다. 여기는 판정과 문구만 맡는다(알림 띄우기는 main.js).
// 상태 파일은 claude 훅(server/hooks/anvil-hook.js)이 `{state, session_id, ts}`로 쓴다.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { sessionName } from '../server/names.js';

/** `<데이터 폴더>/sessions/*.json` → 세션 이름 → 상태 문자열(깨졌거나 없으면 빠진다) */
export function readStates(dataDir) {
  const dir = join(dataDir, 'sessions');
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return {};
  }
  const map = {};
  for (const f of files) {
    try {
      const state = JSON.parse(readFileSync(join(dir, f), 'utf8'))?.state;
      if (typeof state === 'string') map[f.slice(0, -5)] = state;
    } catch {}
  }
  return map;
}

/** 이전 → 지금 상태에서 알릴 세션: 다른 값(처음 본 것 포함)에서 `waiting`으로 바뀐 것만. 포커스된 Anvil 창이 있으면 알리지 않는다. */
export function toNotify(prev, next, focused) {
  if (focused) return [];
  return Object.keys(next).filter((name) => next[name] === 'waiting' && prev[name] !== 'waiting');
}

/** 세션 이름 → 등록된 프로젝트 중 그 이름을 갖는 { project, role }. 모르는 이름이면 null. */
export function findSession(name, projects) {
  for (const project of projects) {
    for (const role of ['plan', 'run']) if (sessionName(project, role) === name) return { project, role };
  }
  return null;
}

/** 알림 제목·본문 */
export function message({ project, role }, en) {
  const label = role === 'plan' ? (en ? 'plan session' : '계획 세션') : en ? 'run session' : '실행 세션';
  return { title: 'Anvil', body: `${basename(project)} · ${label} — ${en ? 'waiting for input' : '입력을 기다립니다'}` };
}
