import type { Page, WebSocketRoute } from "@playwright/test";

/** 보드 검사용 프로젝트 둘 — 목록이 찬 것(alpha)과 빈 것(empty) */
const alpha = {
  name: "alpha", path: "/p/alpha", hasForge: true,
  root: { branch: "main", rel: ".forge", warning: null },
  headline: "#9 진행 중",
  active: {
    task: 9, slug: "act", title: "활성 작업", stage: "run", running: false,
    verified: null, retro: null, inLoop: false, docs: [{ label: "plan", path: ".forge/plan.md" }],
  },
  loopState: null,
  backlog: [
    { task: 10, slug: "b10", title: "백로그 열", priority: "high", part: null, fromLoop: false, path: ".forge/backlog/b10.md" },
    { task: 11, slug: "b11", title: "백로그 열하나", priority: "medium", part: null, fromLoop: false, path: ".forge/backlog/b11.md" },
  ],
  executed: [],
  done: [{ task: 1, slug: "d1", title: "끝난 일", date: "2026-10-17", verified: "yes", retro: "skipped", path: ".forge/done/d1/plan.md" }],
  doneTotal: 1,
  followups: [
    { id: "fu-000000000001", source: "d1", task: 1, date: "2026-10-18", status: "open", taken: null, text: "후속 하나", body: "후속 하나\n근거: 펼쳐 보는 줄" },
    { id: "fu-000000000002", source: "d1", task: 1, date: "2026-10-17", status: "open", taken: null, text: "후속 둘", body: "후속 둘" },
    { id: "fu-000000000003", source: "d1", task: 1, date: "2026-10-16", status: "taken", taken: 1, text: "착수한 후속", body: "착수한 후속" },
    { id: "fu-000000000004", source: "d1", task: 1, date: "2026-10-15", status: "dismissed", taken: null, text: "기각한 후속", body: "기각한 후속\n사유: 대체됨" },
  ],
  errors: [], drivingSession: null,
};
const empty = {
  ...alpha, name: "empty", path: "/p/empty", headline: "", active: null,
  backlog: [], done: [], doneTotal: 0, followups: [],
};

export { alpha };

export type Ipc = {
  /** 화면이 부른 명령 기록 */
  calls: { cmd: string; args: any }[];
  /** 화면이 웹소켓으로 보낸 메시지(term_* 등) */
  sent: any[];
  /** 준비물 확인 응답 — 기본 null(띠 없음) */
  deps: unknown;
  /** deps_install 응답(지금 진행) — 기본 `{running:true, items:[]}` */
  install: unknown;
  /** pick_folder 응답 — 기본 null(취소) */
  pick: unknown;
  /** updater_status 응답 — 기본 null(띠 없음) */
  updater: unknown;
  /** 서버 이벤트를 화면에 보낸다 */
  emit(event: string, payload: unknown): Promise<void>;
  /** 서버→화면 웹소켓 메시지 하나(웹소켓이 붙을 때까지 기다린다) */
  send(msg: unknown): Promise<void>;
  /** 이후 준비물 확인 응답을 붙잡아 둔다 — `pending[i](값)`으로 i번째 확인을 푼다 */
  hold(): void;
  pending: ((v: unknown) => void)[];
  /** read_doc 응답 — 기본 null(`# 문서 <rel>`) */
  doc: string | null;
  /** 웹소켓이 붙은 횟수 */
  connects: number;
  /** 서버가 새 토큰으로 다시 뜬 것처럼: 이후 모든 /api는 401, 지금 웹소켓은 끊는다 */
  restart(): Promise<void>;
};

/** Node 서버 대신 `/api/*`(page.route)와 `/ws`(page.routeWebSocket)를 가짜로 받는다. 화면 코드에는 검사용 고리가 없다. */
export async function mockIpc(page: Page): Promise<Ipc> {
  let sessions: unknown = {};
  let held = false;
  let ws: WebSocketRoute | null = null;
  let unauthorized = false;
  const ipc: Ipc = {
    calls: [],
    sent: [],
    deps: null,
    install: null,
    pick: null,
    updater: null,
    pending: [],
    doc: null,
    connects: 0,
    hold: () => (held = true),
    async restart() {
      unauthorized = true;
      await ws?.close();
    },
    emit(event, payload) {
      if (event === "sessions") sessions = payload; // 5초 폴링도 같은 값을 보게
      return ipc.send({ type: "event", name: event, payload });
    },
    async send(msg) {
      for (let i = 0; !ws && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
      ws!.send(JSON.stringify(msg));
    },
  };
  const projects = [alpha, empty];

  async function answer(cmd: string, args: any): Promise<unknown> {
    switch (cmd) {
      case "list_projects": return projects;
      case "add_project": return projects;
      case "session_names": return [`${args.project}-plan`, `${args.project}-run`];
      case "session_titles": return [["plan", "opus"], ["run", "opus"]];
      case "session_states": return sessions;
      case "session_models": return {};
      case "model_settings": return {};
      case "session_fill": return `${args.project}-${args.role}`;
      case "read_doc": return ipc.doc ?? `# 문서 ${args.rel}`;
      case "pick_folder": return ipc.pick;
      case "updater_status": return ipc.updater;
      case "deps_status":
        if (held) return new Promise((r) => ipc.pending.push(r));
        return ipc.deps;
      case "deps_install": return ipc.install ?? { running: true, items: [] };
      case "slash_commands":
        return ["/eli5", "/forge:fg-ask", "/forge:fg-doctor", "/forge:fg-learn", "/forge:fg-next", "/forge:fg-run", "/forge:fg-status"];
      default: return null;
    }
  }

  await page.addInitScript(() => localStorage.setItem("anvil.selected", "/p/alpha"));
  await page.route("**/api/*", async (route) => {
    const cmd = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = route.request().postDataJSON() ?? {};
    ipc.calls.push({ cmd, args });
    if (unauthorized) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(await answer(cmd, args)) });
  });
  await page.routeWebSocket(/\/ws$/, (route) => {
    ipc.connects++;
    // 옛 쿠키로는 업그레이드가 401 — 브라우저에는 곧바로 끊긴 연결로만 보인다
    if (unauthorized) return route.close();
    ws = route;
    route.onMessage((m) => ipc.sent.push(JSON.parse(String(m))));
  });
  return ipc;
}
