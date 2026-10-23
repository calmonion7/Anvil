import { t } from "./i18n.svelte";
import type { Role, SessionState, Snapshot } from "./types";

export const roleLabel: Record<Role, string> = {
  get plan() { return t("계획", "Plan"); },
  get run() { return t("실행", "Run"); },
};

export function stateLabel(s: SessionState | null): string {
  if (!s?.alive) return t("없음", "None");
  return {
    working: t("작업 중", "Working"),
    waiting: t("입력 대기", "Waiting for input"),
    starting: t("시작 중", "Starting"),
    ended: t("종료", "Ended"),
  }[s.state];
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
