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
  }: {
    snap: Snapshot;
    plan: SessionState | null;
    run: SessionState | null;
    onList: (kind: ListKind) => void;
    followupCount: number;
  } = $props();

  type Edge = "e1" | "e2" | "e3" | "e4" | "e5";

  let pulses = $state<Record<Edge, number>>({ e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 });

  const working = (s: SessionState | null) => !!s?.alive && s.state === "working";
  const waiting = (s: SessionState | null) => !!s?.alive && s.state === "waiting";
  let flow = $derived<Record<Edge, boolean>>({ e1: working(plan), e2: working(run), e3: working(run), e4: false, e5: false });

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
    if (cur.backlog > p.backlog) pulse("e1");
    if (cur.active && cur.active !== p.active) pulse("e2");
    else if (cur.backlog < p.backlog) pulse("e2");
    if (cur.done > p.done) pulse("e3");
    if (cur.follow > p.follow) pulse("e4");
    else if (cur.follow < p.follow) pulse("e5");
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
    {@render edge("e1")}
    <button class="node cnt backlog" data-node="backlog" onclick={() => onList("backlog")}>백로그 <span class="ct">{snap.backlog.length}</span></button>
    {@render edge("e2")}
    <div class="node sess run" class:wait={waiting(run)} data-node="run">
      <span class="role">실행 세션</span>
      <span class="st">{stateLabel(run)}</span>
    </div>
    {@render edge("e3")}
    <button class="node cnt done" data-node="done" onclick={() => onList("done")}>최근 완료 <span class="ct">{snap.doneTotal}</span></button>
    {@render edge("e4")}
    <button class="node cnt follow" data-node="followups" onclick={() => onList("followups")}>후속후보 <span class="ct">{followupCount}</span></button>
    <!-- 귀환 루프: 후속후보 → 계획 세션(착수하면 다시 계획으로) -->
    <span class="loopback" data-edge="e5" aria-hidden="true" title="후속후보는 계획 세션에서 착수합니다">
      {#key pulses.e5}{#if pulses.e5}<span class="pulse back"></span>{/if}{/key}
    </span>
  </div>
</section>

<style>
  .flow { flex: none; margin: 4px 16px 8px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .row { position: relative; display: flex; align-items: center; min-width: 0; padding-bottom: 16px; }
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
  /* 행 아래 ㄷ자 선 — 오른쪽(후속후보) 아래에서 왼쪽(계획 세션) 아래로, 끝은 위로 향한 화살촉 */
  .loopback { position: absolute; left: 48px; right: 48px; bottom: 2px; height: 14px; border: 1.5px dashed var(--line); border-top: 0; border-radius: 0 0 6px 6px; }
  .loopback::after { content: ""; position: absolute; left: -5.5px; top: -6px; border: 4px solid transparent; border-bottom: 6px solid var(--muted); border-top: 0; }
  .pulse.back { top: auto; bottom: -5px; left: auto; right: 0; animation: travel-back 1.2s ease-out forwards; }
  @keyframes travel-back { from { right: 0; opacity: 1; } to { right: calc(100% - 8px); opacity: 0; } }

  /* 화살표: 기본은 흐린 선, 흐르는 중이면 점이 오른쪽으로 이동 */
  .edge { position: relative; flex: 1; min-width: 24px; height: 2px; margin: 0 4px; background: var(--line); overflow: visible; }
  .edge::after { content: ""; position: absolute; right: -1px; top: -3px; border: 4px solid transparent; border-left: 6px solid var(--line); border-right: 0; }
  .dots { position: absolute; inset: 0; opacity: 0; background: repeating-linear-gradient(90deg, var(--accent) 0 4px, transparent 4px 12px); background-size: 12px 2px; }
  .edge[data-flow="active"] .dots { opacity: 1; animation: march .6s linear infinite; }
  .edge[data-edge="e1"] .dots { background-image: repeating-linear-gradient(90deg, var(--warn) 0 4px, transparent 4px 12px); }
  .pulse { position: absolute; top: -3px; left: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 8px var(--accent); animation: travel .9s ease-out forwards; }

  @keyframes march { to { background-position: 12px 0; } }
  @keyframes travel { from { left: 0; opacity: 1; } to { left: calc(100% - 8px); opacity: 0; } }
  @keyframes breathe { 50% { box-shadow: 0 0 0 4px var(--warn-wash); } }

  @media (prefers-reduced-motion: reduce) {
    .edge[data-flow="active"] .dots, .node.wait, .pulse { animation: none; }
    .pulse { display: none; }
  }

</style>
