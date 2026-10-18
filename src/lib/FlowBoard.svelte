<script lang="ts">
  import type { Snapshot, SessionState } from "./types";
  import type { ListKind } from "./ListPopup.svelte";
  import { stateLabel } from "./sessions";

  /** 정보 흐름도 — 계획 세션 → 백로그 → 실행 세션 → 완료 → 후속후보 ↺ 계획.
      세션이 작업 중이면 나가는 화살표에 점이 흐르고, .forge 변화는 해당 화살표에 펄스 한 번. */
  let {
    snap,
    plan,
    run,
    onList,
    followupCount,
    out = $bindable(),
  }: {
    snap: Snapshot;
    plan: SessionState | null;
    run: SessionState | null;
    onList: (kind: ListKind) => void;
    followupCount: number;
    /** 터미널을 거쳐 나가는 펄스(계획 터미널→백로그 · 실행 터미널→최근 완료 · 후속후보→계획 귀환) — FlowLinks가 그린다 */
    out: { pOut: number; rOut: number; loop: number };
  } = $props();

  type Edge = "e2" | "e4";

  let pulses = $state<Record<Edge, number>>({ e2: 0, e4: 0 });

  const working = (s: SessionState | null) => !!s?.alive && s.state === "working";
  const waiting = (s: SessionState | null) => !!s?.alive && s.state === "waiting";
  let flow = $derived<Record<Edge, boolean>>({ e2: working(run), e4: false });

  const pulse = (e: Edge) => (pulses[e] += 1);

  // 직전 값과 비교해 변화만 펄스로 보인다. 첫 값은 기준선이다.
  let prev: { backlog: number; done: number; follow: number; active: string | null } | null = null;
  $effect(() => {
    const cur = {
      backlog: snap.backlog.length,
      done: snap.doneTotal,
      follow: snap.followups.length,
      active: snap.active ? `${snap.active.task ?? "—"}` : null,
    };
    const p = prev;
    prev = cur;
    if (!p) return;
    if (cur.backlog > p.backlog) out.pOut += 1;
    if (cur.active && cur.active !== p.active) pulse("e2");
    else if (cur.backlog < p.backlog) pulse("e2");
    if (cur.done > p.done) out.rOut += 1;
    if (cur.follow > p.follow) pulse("e4");
    else if (cur.follow < p.follow) out.loop += 1;
  });

</script>

{#snippet edge(e: Edge)}
  <span class="edge" data-edge={e} data-flow={flow[e] ? "active" : "idle"} aria-hidden="true">
    <span class="dots"></span>
    {#key pulses[e]}{#if pulses[e]}<span class="pulse"></span>{/if}{/key}
  </span>
{/snippet}

<section class="flow" aria-label="정보 흐름">
  <div class="row">
    <div class="node sess plan" class:wait={waiting(plan)} data-node="plan">
      <span class="role">계획 세션</span><span class="st">{stateLabel(plan)}</span>
    </div>
    <!-- 계획 세션 → 백로그는 계획 터미널을 거친다(FlowLinks 세로 화살표) -->
    <span class="via" aria-hidden="true"></span>
    <button class="node cnt backlog" data-node="backlog" onclick={() => onList("backlog")}>백로그 <span class="ct">{snap.backlog.length}</span></button>
    {@render edge("e2")}
    <div class="node sess run" class:wait={waiting(run)} data-node="run">
      <span class="role">실행 세션</span>
      <span class="st">{stateLabel(run)}</span>
    </div>
    <!-- 실행 세션 → 최근 완료는 실행 터미널을 거친다 -->
    <span class="via" aria-hidden="true"></span>
    <button class="node cnt done" data-node="done" onclick={() => onList("done")}>최근 완료 <span class="ct">{snap.doneTotal}</span></button>
    {@render edge("e4")}
    <button class="node cnt follow" data-node="followups" onclick={() => onList("followups")}>후속후보 <span class="ct">{followupCount}</span></button>
  </div>
</section>

<style>
  .flow { flex: none; margin: 4px 16px 20px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  /* 위 여백은 후속후보 → 계획 세션 귀환 곡선(FlowLinks)이 지나가는 자리 */
  .row { position: relative; display: flex; align-items: center; min-width: 0; padding-top: 20px; }
  .via { flex: 1; min-width: 24px; }
  .node { flex: none; display: flex; flex-direction: column; justify-content: center; min-height: 44px; padding: 0 12px; border-radius: 6px; border: 1.5px solid var(--line); background: var(--raised); color: var(--ink2); font: inherit; font-size: 11px; white-space: nowrap; }
  .sess .role { color: var(--ink); font-weight: 600; }
  .sess .st { color: var(--muted); }
  .plan { border-color: var(--warn); }
  .run { border-color: var(--accent); }
  .cnt { flex-direction: row; align-items: center; gap: 6px; cursor: pointer; }
  .cnt:hover { color: var(--ink); }
  .cnt:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .done { border-color: var(--good); }
  .ct { color: var(--ink); font-weight: 600; font-family: "SF Mono", ui-monospace, Menlo, monospace; }
  .node.wait { animation: breathe 1.6s ease-in-out infinite; }
 
  /* 화살표: 기본은 흐린 선, 흐르는 중이면 점이 오른쪽으로 이동 */
  .edge { position: relative; flex: 1; min-width: 24px; height: 1px; margin: 0 10px 0 6px; overflow: visible;
    background: linear-gradient(90deg, transparent, var(--line) 16%, var(--line) 84%, rgba(255,255,255,.22)); }
  /* 쉐브론 화살촉 */
  .edge::after { content: ""; position: absolute; right: 0; top: -3px; width: 6px; height: 6px; border-top: 1.25px solid rgba(255,255,255,.28); border-right: 1.25px solid rgba(255,255,255,.28); transform: rotate(45deg); }
  /* 흐르는 구슬 */
  .dots { position: absolute; left: 0; right: 8px; top: -1.5px; height: 4px; opacity: 0; background: radial-gradient(circle, var(--accent) 1.4px, transparent 1.9px) 0 50% / 10px 4px repeat-x; }
  .edge[data-flow="active"] .dots { opacity: 1; animation: march .6s linear infinite; }
  .pulse { position: absolute; top: -2.5px; left: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 6px 1px var(--accent); animation: travel .9s ease-out forwards; }

  @keyframes march { to { background-position: 10px 50%; } }
  @keyframes travel { from { left: 0; opacity: 1; } to { left: calc(100% - 8px); opacity: 0; } }
  @keyframes breathe { 50% { box-shadow: 0 0 0 4px var(--warn-wash); } }

  @media (prefers-reduced-motion: reduce) {
    .edge[data-flow="active"] .dots, .node.wait, .pulse { animation: none; }
    .pulse { display: none; }
  }

</style>
