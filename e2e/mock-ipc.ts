import type { Page } from "@playwright/test";

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

/** window.__TAURI_INTERNALS__를 심어 invoke를 가로챈다. 호출 기록은 window.__calls. */
export async function mockIpc(page: Page) {
  await page.addInitScript(
    ({ projects }) => {
      const w = window as any;
      let cb = 0;
      w.__calls = [];
      // 이벤트 주입: listen이 등록한 콜백을 __emit(event, payload)로 부른다.
      const cbs: Record<number, (e: any) => void> = {};
      const listeners: { event: string; handler: number }[] = [];
      w.__sessions = {};
      w.__emit = (event: string, payload: any) => {
        if (event === "sessions") w.__sessions = payload; // 5초 폴링도 같은 값을 보게
        listeners.filter((l) => l.event === event).forEach((l) => cbs[l.handler]?.({ event, id: l.handler, payload }));
      };
      w.localStorage.setItem("anvil.selected", "/p/alpha");
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      w.__TAURI_INTERNALS__ = {
        transformCallback: (fn: (e: any) => void) => {
          cbs[++cb] = fn;
          return cb;
        },
        unregisterCallback() {},
        convertFileSrc: (s: string) => s,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        async invoke(cmd: string, args: any) {
          w.__calls.push({ cmd, args });
          switch (cmd) {
            case "list_projects": return projects;
            case "session_names": return [`${args.project}-plan`, `${args.project}-run`];
            case "session_titles": return [["plan", "opus"], ["run", "opus"]];
            case "session_states": return w.__sessions;
            case "plugin:event|listen":
              listeners.push({ event: args.event, handler: args.handler });
              return args.handler;
            case "session_models": return {};
            case "model_settings": return {};
            case "session_fill": return `${args.project}-${args.role}`;
            case "read_doc": return `# 문서 ${args.rel}`;
            // 준비물 — 기본은 null(띠 없음). 검사가 __deps·__depsInstall·__depsInstallError를 심으면 그 값.
            // __depsHold를 켜면 확인 응답을 붙잡아 두고, 검사가 __depsResolve[i](값)으로 i번째 확인을 푼다.
            case "deps_status":
              if (w.__depsHold) return new Promise((r) => (w.__depsResolve ??= []).push(r));
              return w.__deps ?? null;
            case "deps_install":
              if (w.__depsInstallError) throw w.__depsInstallError;
              return w.__depsInstall ?? [];
            case "slash_commands":
              return ["/eli5", "/forge:fg-ask", "/forge:fg-doctor", "/forge:fg-learn", "/forge:fg-next", "/forge:fg-run", "/forge:fg-status"];
            default: return null;
          }
        },
      };
    },
    { projects: [alpha, empty] },
  );
}
