<script lang="ts" module>
  /** 관별 펄스 횟수 — FlowBoard가 .forge 변화를 감지해 올린다 */
  export type FlowPulses = { pOut: number; rOut: number; loop: number; e2: number; e4: number };
</script>

<script lang="ts">
  import { tick } from "svelte";

  /** 흐름도의 관(파이프) — 노드 줄과 터미널 열 머리를 잇는다.
      계획 세션 ↓ 계획 터미널 ↑ 백로그 → 실행 세션 ↓ 실행 터미널 ↑ 최근 완료 → 후속후보 ⌒ 계획 세션.
      실제 위치를 재서 그리므로 폭 조절을 따라간다. 세션이 작업 중이면 그 관 안에 빛 캡슐이 흐른다. */
  let {
    root,
    planWorking,
    runWorking,
    pulses,
    deps,
  }: {
    /** 노드·열 머리를 찾고 좌표의 기준이 되는 요소 */
    root: HTMLElement | undefined;
    planWorking: boolean;
    runWorking: boolean;
    pulses: FlowPulses;
    /** 바뀌면 다시 잰다(프로젝트 전환 등) */
    deps: unknown;
  } = $props();

  type Id = "p-in" | "p-out" | "e2" | "r-in" | "r-out" | "e4" | "loop";
  type Tone = "plan" | "run" | "done" | "loop";
  type Pt = { x: number; y: number };
  type Pipe = { id: Id; tone: Tone; d: string; a: Pt; b: Pt; deg: number };
  let pipes = $state<Pipe[]>([]);
  let size = $state({ w: 0, h: 0 });

  /** a에서 b로 가는 S자 관. 세로 관은 세로 접선, 가로 관은 가로 접선으로 붙는다. */
  function pipe(id: Id, tone: Tone, a: Pt, b: Pt, vertical: boolean): Pipe {
    let d: string;
    let deg: number;
    if (vertical) {
      const m = (a.y + b.y) / 2;
      d = `M ${a.x} ${a.y} C ${a.x} ${m}, ${b.x} ${m}, ${b.x} ${b.y}`;
      deg = b.y > a.y ? 90 : -90;
    } else {
      d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      deg = 0;
    }
    return { id, tone, d, a, b, deg };
  }

  function measure() {
    if (!root) return;
    const q = (s: string) => root!.querySelector(s)?.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    const [plan, backlog, run, done, follow, ip, ir] = [
      q('[data-node="plan"]'), q('[data-node="backlog"]'), q('[data-node="run"]'),
      q('[data-node="done"]'), q('[data-node="followups"]'), q(".info-plan"), q(".info-run"),
    ];
    size = { w: base.width, h: base.height };
    if (!plan || !backlog || !run || !done || !follow || !ip || !ir) return (pipes = []);
    const cx = (r: DOMRect) => r.left + r.width / 2 - base.left;
    const cy = (r: DOMRect) => r.top + r.height / 2 - base.top;
    const top = (r: DOMRect) => r.top - base.top;
    const bot = (r: DOMRect) => r.bottom - base.top;
    const left = (r: DOMRect) => r.left - base.left;
    const right = (r: DOMRect) => r.right - base.left;
    /** 노드 가운데 x를 열 안으로 당긴 값 — 열 머리 쪽 끝점 */
    const inCol = (x: number, c: DOMRect) => Math.min(Math.max(x, left(c) + 40), right(c) - 40);
    // 열 머리 띠는 .info 안 margin 8px 아래에서 시작한다 — 이음쇠가 띠 테두리에 걸리게
    const colTop = (c: DOMRect) => top(c) + 8;
    const down = (node: DOMRect, col: DOMRect): [Pt, Pt] => [
      { x: cx(node), y: bot(node) },
      { x: inCol(cx(node), col), y: colTop(col) },
    ];
    const [pInA, pInB] = down(plan, ip);
    const [pOutB, pOutA] = down(backlog, ip);
    const [rInA, rInB] = down(run, ir);
    const [rOutB, rOutA] = down(done, ir);
    const lift = Math.min(top(plan), top(follow)) - 22;
    const fa = { x: cx(follow), y: top(follow) };
    const pa = { x: cx(plan), y: top(plan) };
    pipes = [
      pipe("p-in", "plan", pInA, pInB, true),
      pipe("p-out", "plan", pOutA, pOutB, true),
      pipe("e2", "run", { x: right(backlog), y: cy(backlog) }, { x: left(run), y: cy(run) }, false),
      pipe("r-in", "run", rInA, rInB, true),
      pipe("r-out", "run", rOutA, rOutB, true),
      pipe("e4", "done", { x: right(done), y: cy(done) }, { x: left(follow), y: cy(follow) }, false),
      {
        id: "loop", tone: "loop", a: fa, b: pa, deg: 90,
        d: `M ${fa.x} ${fa.y} C ${fa.x} ${lift}, ${pa.x} ${lift}, ${pa.x} ${pa.y}`,
      },
    ];
  }

  $effect(() => {
    void deps;
    if (!root) return;
    tick().then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll(".flow, .info-plan, .info-run").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  });

  /** 관이 흐르는 조건 — 그 관으로 무언가를 내보내는 세션이 작업 중일 때 */
  const active = (p: Pipe) =>
    p.id === "p-in" || p.id === "p-out" ? planWorking : p.id === "e2" || p.id === "r-in" || p.id === "r-out" ? runWorking : false;
  const pulseOf = (p: Pipe) =>
    ({ "p-in": 0, "p-out": pulses.pOut, e2: pulses.e2, "r-in": 0, "r-out": pulses.rOut, e4: pulses.e4, loop: pulses.loop })[p.id];
</script>

<svg class="pipes" width={size.w} height={size.h} aria-hidden="true">
  {#each pipes as p (p.id)}
    <g class="pipe {p.tone}" data-link={p.id} data-flow={active(p) ? "active" : "idle"}>
      <!-- 관: 그림자 외벽 → 내벽 → 액체 채널 → 위쪽 광택 -->
      <path class="casing" d={p.d} />
      <path class="wall" d={p.d} />
      <path class="channel" d={p.d} />
      <path class="sheen" d={p.d} />
      <!-- 흐름: 일정 속도의 빛 캡슐(실제 픽셀 간격) -->
      <path class="dots" d={p.d} />
      {#key pulseOf(p)}{#if pulseOf(p)}<path class="pulse" d={p.d} pathLength="100" />{/if}{/key}
      <!-- 이음쇠: 출발은 둥근 플랜지, 도착은 방향 쉐브론이 든 플랜지 -->
      <circle class="flange" cx={p.a.x} cy={p.a.y} r="5.5" />
      <g transform="translate({p.b.x} {p.b.y}) rotate({p.deg})">
        <circle class="flange" r="6.5" />
        <path class="chev" d="M -2 -3 L 1.6 0 L -2 3" />
      </g>
    </g>
  {/each}
</svg>

<style>
  .pipes { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
  .pipe { --c: #8a8983; }
  .pipe.plan { --c: var(--warn); }
  .pipe.run { --c: var(--accent); }
  .pipe.done { --c: var(--good); }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .casing { stroke: rgba(0, 0, 0, .7); stroke-width: 12; }
  .wall { stroke: #2b2b29; stroke-width: 10; }
  .channel { stroke: var(--c); stroke-width: 5; opacity: .22; transition: opacity .3s; }
  /* 광택: 관 위쪽에 얇은 빛 — 3px 위로 띄워 겹친다 */
  .sheen { stroke: rgba(255, 255, 255, .07); stroke-width: 2; transform: translateY(-3px); }
  .dots { stroke: var(--c); stroke-width: 4; stroke-dasharray: 7 11; opacity: 0; }
  .pipe[data-flow="active"] .channel { opacity: .45; }
  .pipe[data-flow="active"] .dots { opacity: 1; filter: drop-shadow(0 0 3px var(--c)); animation: flow .9s linear infinite; }
  .pulse { stroke: #fff; stroke-width: 5; stroke-dasharray: 3 200; stroke-dashoffset: 3; filter: drop-shadow(0 0 5px var(--c)); animation: travel 1.1s cubic-bezier(.3, 0, .2, 1) forwards; }
  .flange { fill: #1f1f1d; stroke: var(--c); stroke-opacity: .55; stroke-width: 1.5; }
  .chev { stroke: var(--c); stroke-width: 1.6; opacity: .9; }
  .pipe[data-flow="active"] .flange { stroke-opacity: .9; }
  @keyframes flow { to { stroke-dashoffset: -18; } }
  @keyframes travel { to { stroke-dashoffset: -100; opacity: .2; } }
  @media (prefers-reduced-motion: reduce) {
    .pipe[data-flow="active"] .dots, .pulse { animation: none; }
    .pulse { display: none; }
  }
</style>
