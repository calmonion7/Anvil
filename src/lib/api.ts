// Node 서버(server/)와 이야기하는 한 곳 — 명령은 `POST /api/<명령>`, 이벤트·터미널은 웹소켓 `/ws` 하나(server/API.md).
// 인증은 같은 출처 쿠키라 따로 할 일이 없다. 단 서버는 실행마다 새 토큰을 만들므로, 다시 뜬 서버에는 옛 쿠키가 401이다 —
// 그때는 다시 붙으려 하지 않고 `unauthorized` 이벤트로 화면에 알린다(새 ?token= 주소로 다시 열어야 한다).
let unauthorized = false;

/** 명령을 부른다. 실패하면 서버의 오류 문구(문자열)로 거절한다 — 화면이 `String(e)`로 그대로 보인다. */
export async function call<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${command}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  } catch (e) {
    throw String(e);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401 && !unauthorized) {
    unauthorized = true;
    listeners.get("unauthorized")?.forEach((f) => f(null));
  }
  if (!res.ok) throw body?.error ?? `${res.status} ${res.statusText}`;
  return body as T;
}

type Term = { name: string; cols: number; rows: number; data: (s: string) => void; error: (e: string) => void; reset: () => void };
const listeners = new Map<string, Set<(payload: any) => void>>();
const terms = new Map<number, Term>();
let ws: WebSocket | null = null;
let queue: string[] = [];
let nextTerm = 0;

function send(msg: object) {
  if (unauthorized) return;
  connect();
  const s = JSON.stringify(msg);
  if (ws!.readyState === WebSocket.OPEN) ws!.send(s);
  else queue.push(s);
}

function connect() {
  if (ws) return;
  const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    for (const s of queue) sock.send(s);
    queue = [];
  };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "event") listeners.get(m.name)?.forEach((f) => f(m.payload));
    else if (m.type === "term") terms.get(m.id)?.data(m.data);
    else if (m.type === "term_error") terms.get(m.id)?.error(m.error);
  };
  // 서버가 다시 뜨거나 연결이 끊기면 다시 붙는다. 서버는 끊긴 연결의 터미널을 떼므로 열린 터미널을 다시 붙인다(재생분이 다시 오니 화면은 비운다).
  sock.onclose = () => {
    ws = null;
    queue = [];
    setTimeout(async () => {
      if (!listeners.size && !terms.size) return;
      // 업그레이드가 401로 끊겨도 브라우저엔 상태가 안 보인다 — 명령 하나로 먼저 확인하고, 401이면 멈춘다
      await call("session_states").catch(() => {});
      if (unauthorized) return;
      connect();
      for (const [id, t] of terms) {
        t.reset();
        send({ type: "term_open", id, name: t.name, cols: t.cols, rows: t.rows });
      }
    }, 1000);
  };
}

/** 서버 이벤트(`snapshot` · `sessions` · `models`)와 이 파일의 `unauthorized`(서버 재시작으로 401)를 받는다. 돌려준 함수로 그만 받는다. */
export function on<T>(event: string, cb: (payload: T) => void): () => void {
  connect();
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
  return () => listeners.get(event)?.delete(cb);
}

/** 세션 `name`의 pty에 터미널을 붙인다. 붙자마자 서버가 최근 출력을 재생한다. */
export function openTerm(name: string, cols: number, rows: number, h: Pick<Term, "data" | "error" | "reset">) {
  const id = ++nextTerm;
  const t: Term = { name, cols, rows, ...h };
  terms.set(id, t);
  send({ type: "term_open", id, name, cols, rows });
  return {
    write: (data: string) => send({ type: "term_write", id, data }),
    resize(c: number, r: number) {
      t.cols = c;
      t.rows = r;
      send({ type: "term_resize", id, cols: c, rows: r });
    },
    close() {
      terms.delete(id);
      send({ type: "term_close", id });
    },
  };
}
