// Rust `forge::Snapshot`의 JSON 모양(src-tauri/src/forge.rs).

export type Stage = "run" | "retro" | "seal";
export type CheckResult = "pass" | "fail" | "waiting" | "unknown";

export interface Doc { label: string; path: string }

export interface ActiveTask {
  task: number | null; slug: string; title: string; stage: Stage; running: boolean;
  verified: string | null; retro: string | null; inLoop: boolean; docs: Doc[];
}

export interface PlanCard {
  task: number | null; slug: string; title: string; priority: "high" | "medium" | "low";
  part: string | null; fromLoop: boolean; path: string;
}

export interface TaskCard {
  task: number | null; slug: string; title: string; date: string;
  verified: string | null; retro: string | null; path: string;
}

export interface Check { id: string; text: string; result: CheckResult }

export interface LoopState {
  goal: string; wall: string | null; replanRound: number | null; replanCap: number | null;
  checks: Check[]; path: string;
}

export interface Followup { text: string; sourceSlug: string; sourcePath: string; date: string }

export interface FileError { path: string; message: string }

export interface Snapshot {
  name: string; path: string; hasForge: boolean;
  root: { branch: string | null; rel: string; warning: string | null };
  headline: string;
  active: ActiveTask | null; loopState: LoopState | null;
  backlog: PlanCard[]; executed: TaskCard[]; done: TaskCard[]; doneTotal: number;
  followups: Followup[]; errors: FileError[];
  /** running.md·drive.md의 session: — 이 claude 세션이 활성 작업을 실행 중 */
  drivingSession: string | null;
}

export type SessionStateName = "working" | "waiting" | "ended" | "starting";

/** 훅이 남긴 세션 상태 + tmux 생존 여부(src-tauri/src/session.rs) */
export interface SessionState { state: SessionStateName; sessionId: string | null; alive: boolean }

export type Role = "plan" | "run";

/** 열린 문서 탭 하나 */
export interface DocTab { project: string; rel: string; label: string }
