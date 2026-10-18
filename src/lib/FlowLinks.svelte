<script lang="ts">
  import { tick } from "svelte";

  /** 흐름도 노드 ↔ 터미널 열 머리를 잇는 곡선 — 계획 세션 ↓ 계획 터미널 ↑ 백로그,
      실행 세션 ↓ 실행 터미널 ↑ 최근 완료, 그리고 노드 줄 위로 넘어가는 후속후보 → 계획 세션 귀환.
      실제 위치를 재서 그리므로 폭 조절을 따라간다. */
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
    /** 계획 터미널→백로그(백로그 증가) · 실행 터미널→최근 완료(봉인 증가) · 귀환(후속후보 감소) 펄스 횟수 */
    pulses: { pOut: number; rOut: number; loop: number };
    /** 바뀌면 다시 잰다(프로젝트 전환 등) */
    deps: unknown;
  } = $props();

  type Id = "p-in" | "p-out" | "r-in" | "r-out" | "loop";
  type Link = { id: Id; d: string; role: "plan" | "run" | "loop" };
  let links = $state<Link[]>([]);
  let size = $state({ w: 0, h: 0 });

  /** 위 점(x1,y1)에서 아래 점(x2,y2)까지 S자 곡선. up이면 아래에서 위로 그린다(화살촉이 위). */
  function curve(x1: number, y1: number, x2: number, y2: number, up: boolean): string {
    const m = (y1 + y2) / 2;
    return up
      ? `M ${x2} ${y2} C ${x2} ${m}, ${x1} ${m}, ${x1} ${y1}`
      : `M ${x1} ${y1} C ${x1} ${m}, ${x2} ${m}, ${x2} ${y2}`;
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
    if (!plan || !backlog || !run || !done || !follow || !ip || !ir) return (links = []);
    const X = (r: DOMRect) => r.left + r.width / 2 - base.left;
    const top = (r: DOMRect) => r.top - base.top;
    const bot = (r: DOMRect) => r.bottom - base.top;
    /** 노드 가운데 x를 열 안으로 당긴 값 — 열 머리 쪽 끝점 */
    const inCol = (x: number, c: DOMRect) => Math.min(Math.max(x, c.left - base.left + 32), c.right - base.left - 32);
    // 열 머리 띠는 margin 8px 아래에서 시작한다 — 화살촉이 띠 테두리에 닿게
    const colTop = (c: DOMRect) => top(c) + 6;
    const lift = Math.min(top(plan), top(follow)) - 14;
    links = [
      { id: "p-in", role: "plan", d: curve(X(plan), bot(plan) + 2, inCol(X(plan), ip), colTop(ip), false) },
      { id: "p-out", role: "plan", d: curve(X(backlog), bot(backlog) + 2, inCol(X(backlog), ip), colTop(ip), true) },
      { id: "r-in", role: "run", d: curve(X(run), bot(run) + 2, inCol(X(run), ir), colTop(ir), false) },
      { id: "r-out", role: "run", d: curve(X(done), bot(done) + 2, inCol(X(done), ir), colTop(ir), true) },
      {
        id: "loop",
        role: "loop",
        d: `M ${X(follow)} ${top(follow) - 2} C ${X(follow)} ${lift}, ${X(plan)} ${lift}, ${X(plan)} ${top(plan) - 2}`,
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

  const active = (l: Link) => (l.role === "plan" ? planWorking : l.role === "run" ? runWorking : false);
  const pulseOf = (l: Link) =>
    l.id === "p-out" ? pulses.pOut : l.id === "r-out" ? pulses.rOut : l.id === "loop" ? pulses.loop : 0;
</script>

<svg class="links" width={size.w} height={size.h} aria-hidden="true">
  <defs>
    {#each ["plan", "run", "loop"] as r (r)}
      <marker id="fl-{r}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
        <path class="chev {r}" d="M2 1.5 L8 5 L2 8.5" />
      </marker>
    {/each}
  </defs>
  {#each links as l (l.id)}
    <g class="link {l.role}" data-link={l.id} data-flow={active(l) ? "active" : "idle"}>
      <!-- 기본선은 실제 픽셀 길이로(점선 간격이 경로 길이에 따라 늘지 않게), 구슬·펄스는 비율로 -->
      <path class="base" d={l.d} marker-end="url(#fl-{l.role})" />
      <path class="dots" d={l.d} pathLength="100" />
      {#key pulseOf(l)}{#if pulseOf(l)}<path class="pulse" d={l.d} pathLength="100" />{/if}{/key}
    </g>
  {/each}
</svg>

<style>
  .links { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
  .link { --c: rgba(255, 255, 255, .28); }
  .link.plan { --c: var(--warn); }
  .link.run { --c: var(--accent); }
  .base { fill: none; stroke: var(--c); stroke-width: 1.25; stroke-linecap: round; opacity: .45; }
  .loop .base { stroke-dasharray: 0 5; stroke-width: 1.6; opacity: .8; }
  .chev { fill: none; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; stroke: rgba(255, 255, 255, .45); }
  .chev.plan { stroke: var(--warn); }
  .chev.run { stroke: var(--accent); }
  /* 흐르는 구슬: 길이 0 대시 + 둥근 끝 = 점 */
  .dots { fill: none; stroke: var(--c); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 0 7; opacity: 0; }
  .link[data-flow="active"] .base { opacity: .7; }
  .link[data-flow="active"] .dots { opacity: 1; animation: march .7s linear infinite; }
  .pulse { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 4 200; stroke-dashoffset: 4; filter: drop-shadow(0 0 3px var(--c)); animation: travel 1s ease-out forwards; }
  @keyframes march { to { stroke-dashoffset: -7; } }
  @keyframes travel { to { stroke-dashoffset: -100; opacity: .1; } }
  @media (prefers-reduced-motion: reduce) {
    .link[data-flow="active"] .dots, .pulse { animation: none; }
    .pulse { display: none; }
  }
</style>
