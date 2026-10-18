<script lang="ts">
  import type { Snapshot, SessionState } from "./types";
  import type { ListKind } from "./ListPopup.svelte";
  import { stateLabel } from "./sessions";

  /** 정보 흐름도 — 계획 세션 → 백로그 → 실행 세션 → 완료 → 후속후보 ↺ 계획.
      세션이 작업 중이면 나가는 화살표에 점이 흐르고, .forge 변화는 해당 화살표에 펄스 한 번 + 로그 한 줄. */
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

  type Edge = "e1" | "e2" | "e3" | "e4";
  const LOG_MAX = 50;

  let pulses = $state<Record<Edge, number>>({ e1: 0, e2: 0, e3: 0, e4: 0 });
  let log = $state<{ id: number; t: string; who: string; text: string }[]>([]);
  let seq = 0;

  const working = (s: SessionState | null) => !!s?.alive && s.state === "working";
  const waiting = (s: SessionState | null) => !!s?.alive && s.state === "waiting";
  let flow = $derived<Record<Edge, boolean>>({ e1: working(plan), e2: working(run), e3: working(run), e4: false });

  function push(who: string, text: string, edge?: Edge) {
    const t = new Date().toTimeString().slice(0, 8);
    log = [...log, { id: ++seq, t, who, text }].slice(-LOG_MAX);
    if (edge) pulses[edge] += 1;
  }

  // 직전 값과 비교해 변화만 남긴다. 첫 값은 기준선이라 기록하지 않는다.
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
    if (cur.backlog > p.backlog) push("계획", `백로그 +${cur.backlog - p.backlog}`, "e1");
    if (cur.active && cur.active !== p.active) push("실행", `#${cur.active} 활성 작업으로`, "e2");
    else if (cur.backlog < p.backlog) push("실행", `백로그에서 ${p.backlog - cur.backlog}건 꺼냄`, "e2");
    if (cur.done > p.done) push("완료", `봉인 +${cur.done - p.done}`, "e3");
    if (cur.follow > p.follow) push("회고", `후속후보 +${cur.follow - p.follow}`, "e4");
  });

  let prevPlan: string | undefined;
  let prevRun: string | undefined;
  $effect(() => {
    const v = stateLabel(plan);
    if (prevPlan !== undefined && v !== prevPlan) push("계획 세션", v);
    prevPlan = v;
  });
  $effect(() => {
    const v = stateLabel(run);
    if (prevRun !== undefined && v !== prevRun) push("실행 세션", v);
    prevRun = v;
  });

  let shown = $derived(log.slice(-3).reverse());
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
      <span class="st">{snap.active ? `#${snap.active.task ?? "—"} · ` : ""}{stateLabel(run)}</span>
    </div>
    {@render edge("e3")}
    <button class="node cnt done" data-node="done" onclick={() => onList("done")}>최근 완료 <span class="ct">{snap.doneTotal}</span></button>
    {@render edge("e4")}
    <button class="node cnt follow" data-node="followups" onclick={() => onList("followups")}>후속후보 <span class="ct">{followupCount}</span></button>
    <span class="back t3" title="후속후보는 계획 세션에서 착수합니다">↺ 계획</span>
  </div>
  <ol class="log" aria-label="세션 로그">
    {#each shown as l (l.id)}
      <li><span class="tm">{l.t}</span><span class="who">{l.who}</span><span class="tx">{l.text}</span></li>
    {:else}
      <li class="empty">아직 변화 없음 — 세션이나 .forge가 바뀌면 여기 한 줄씩 쌓입니다</li>
    {/each}
  </ol>
</section>

<style>
  .flow { flex: none; margin: 4px 16px 8px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-family: "SF Mono", Menlo, "Apple SD Gothic Neo", monospace; }
  .row { display: flex; align-items: center; min-width: 0; }
  .node { flex: none; display: flex; flex-direction: column; justify-content: center; min-height: 44px; padding: 0 12px; border-radius: 6px; border: 1.5px solid var(--line); background: var(--raised); color: var(--ink2); font: inherit; font-size: 11px; white-space: nowrap; }
  .sess .role { color: var(--ink); font-weight: 600; }
  .sess .st { color: var(--muted); }
  .plan { border-color: var(--warn); }
  .run { border-color: var(--accent); }
  .cnt { flex-direction: row; align-items: center; gap: 6px; cursor: pointer; }
  .cnt:hover { color: var(--ink); }
  .cnt:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .done { border-color: var(--good); }
  .ct { color: var(--ink); font-weight: 600; }
  .node.wait { animation: breathe 1.6s ease-in-out infinite; }
  .back { flex: none; margin-left: 8px; }

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

  .log { list-style: none; margin: 8px 0 0; padding: 0; font-size: 11px; color: var(--ink2); }
  .log li { display: flex; gap: 12px; white-space: nowrap; overflow: hidden; }
  .tm { color: var(--muted); font-variant-numeric: tabular-nums; }
  .who { color: var(--accent); min-width: 8ch; }
  .tx { overflow: hidden; text-overflow: ellipsis; }
  .empty { color: var(--muted); }
</style>
