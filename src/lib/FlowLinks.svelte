<script lang="ts">
  import { tick } from "svelte";

  /** 흐름도 노드 ↔ 터미널 열 머리를 잇는 세로 화살표 — 계획 세션 ↓ 계획 터미널 ↑ 백로그,
      실행 세션 ↓ 실행 터미널 ↑ 최근 완료. 실제 위치를 재서 그리므로 폭 조절을 따라간다. */
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
    /** 계획 터미널→백로그(백로그 증가) · 실행 터미널→최근 완료(봉인 증가) 펄스 횟수 */
    pulses: { pOut: number; rOut: number };
    /** 바뀌면 다시 잰다(프로젝트 전환 등) */
    deps: unknown;
  } = $props();

  type Link = { id: "p-in" | "p-out" | "r-in" | "r-out"; d: string; role: "plan" | "run" };
  let links = $state<Link[]>([]);
  let size = $state({ w: 0, h: 0 });

  /** from 아래 가운데에서 to 위로(또는 반대로) — x가 열 밖이면 열 안으로 당겨 꺾는다 */
  function vpath(top: DOMRect, bottom: DOMRect, x: number, base: DOMRect, up: boolean): string {
    const bx = Math.min(Math.max(x, bottom.left + 24), bottom.right - 24);
    const y1 = top.bottom - base.top;
    const y2 = bottom.top - base.top;
    const mid = (y1 + y2) / 2;
    const tx = x - base.left;
    const bxx = bx - base.left;
    return up
      ? `M ${bxx} ${y2} V ${mid} H ${tx} V ${y1 + 2}`
      : `M ${tx} ${y1} V ${mid} H ${bxx} V ${y2 - 2}`;
  }

  function measure() {
    if (!root) return;
    const q = (s: string) => root!.querySelector(s)?.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    const [plan, backlog, run, done, ip, ir] = [
      q('[data-node="plan"]'), q('[data-node="backlog"]'), q('[data-node="run"]'),
      q('[data-node="done"]'), q(".info-plan"), q(".info-run"),
    ];
    size = { w: base.width, h: base.height };
    if (!plan || !backlog || !run || !done || !ip || !ir) return (links = []);
    const cx = (r: DOMRect) => r.left + r.width / 2;
    links = [
      { id: "p-in", role: "plan", d: vpath(plan, ip, cx(plan), base, false) },
      { id: "p-out", role: "plan", d: vpath(backlog, ip, cx(backlog), base, true) },
      { id: "r-in", role: "run", d: vpath(run, ir, cx(run), base, false) },
      { id: "r-out", role: "run", d: vpath(done, ir, cx(done), base, true) },
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

  const active = (l: Link) => (l.role === "plan" ? planWorking : runWorking);
  const pulseOf = (l: Link) => (l.id === "p-out" ? pulses.pOut : l.id === "r-out" ? pulses.rOut : 0);
</script>

<svg class="links" width={size.w} height={size.h} aria-hidden="true">
  <defs>
    <marker id="fl-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" />
    </marker>
  </defs>
  {#each links as l (l.id)}
    <g class="link {l.role}" data-link={l.id} data-flow={active(l) ? "active" : "idle"}>
      <path class="base" d={l.d} pathLength="100" marker-end="url(#fl-head)" />
      <path class="dots" d={l.d} pathLength="100" />
      {#key pulseOf(l)}{#if pulseOf(l)}<path class="pulse" d={l.d} pathLength="100" />{/if}{/key}
    </g>
  {/each}
</svg>

<style>
  .links { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
  .base { fill: none; stroke: var(--line); stroke-width: 1.5; }
  .dots { fill: none; stroke-width: 2; stroke-dasharray: 3 5; opacity: 0; }
  .plan .dots { stroke: var(--warn); }
  .run .dots { stroke: var(--accent); }
  .link[data-flow="active"] .dots { opacity: 1; animation: march .6s linear infinite; }
  .pulse { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 6 200; stroke-dashoffset: 6; animation: travel .9s ease-out forwards; }
  @keyframes march { to { stroke-dashoffset: -8; } }
  @keyframes travel { to { stroke-dashoffset: -100; opacity: .2; } }
  @media (prefers-reduced-motion: reduce) {
    .link[data-flow="active"] .dots, .pulse { animation: none; }
    .pulse { display: none; }
  }
</style>
