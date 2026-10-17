import type { Role, SessionState, Snapshot } from "./types";

export const roleLabel: Record<Role, string> = { plan: "계획", run: "실행" };

export function stateLabel(s: SessionState | null): string {
  if (!s?.alive) return "없음";
  return { working: "작업 중", waiting: "입력 대기", starting: "시작 중", ended: "종료" }[s.state];
}

/** 시안의 상태 점: 작업 중 = 파랑(run), 입력 대기 = 노랑(wait), 그 밖은 빈 테두리 */
export function pipClass(s: SessionState | null): string {
  if (!s?.alive) return "";
  return s.state === "working" ? "run" : s.state === "waiting" ? "wait" : "";
}

/** running.md·drive.md의 session:이 이 세션 ID와 같을 때만 #N을 붙인다(짐작으로 짝짓지 않는다). */
export function linkedTask(snap: Snapshot, s: SessionState | null): string | null {
  if (!s?.alive || !s.sessionId || !snap.drivingSession || s.sessionId !== snap.drivingSession) return null;
  const n = snap.active?.task;
  return n == null ? "#—" : `#${n}`;
}
