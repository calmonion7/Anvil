<script lang="ts">
  import type { Snapshot, SessionState } from "./types";
  import type { ListKind } from "./ListPopup.svelte";
  import { stateLabel } from "./sessions";
  import type { FlowPulses } from "./FlowLinks.svelte";

  /** 정보 흐름도의 노드 줄 — 계획 세션 → 백로그 → 실행 세션 → 완료 → 후속후보 ↺ 계획.
      노드 사이 관(파이프)은 FlowLinks가 그리고, 여기서는 .forge 변화를 감지해 펄스 횟수만 올린다. */
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
    /** 관별 펄스 횟수 — FlowLinks가 그린다 */
    out: FlowPulses;
  } = $props();



  const waiting = (s: SessionState | null) => !!s?.alive && s.state === "waiting";

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
    if (cur.active && cur.active !== p.active) out.e2 += 1;
    else if (cur.backlog < p.backlog) out.e2 += 1;
    if (cur.done > p.done) out.rOut += 1;
    if (cur.follow > p.follow) out.e4 += 1;
    else if (cur.follow < p.follow) out.loop += 1;
  });

</script>


<section class="flow" aria-label="정보 흐름">
  <div class="row">
    <div class="node sess plan" class:wait={waiting(plan)} data-node="plan">
      <span class="role">계획 세션</span><span class="st">{stateLabel(plan)}</span>
    </div>
    <!-- 노드 사이 빈칸 = 관이 지나가는 자리. 계획 세션 → 백로그는 계획 터미널을 거친다 -->
    <span class="via" aria-hidden="true"></span>
    <button class="node cnt backlog" data-node="backlog" onclick={() => onList("backlog")}>백로그 <span class="ct">{snap.backlog.length}</span></button>
    <span class="via" aria-hidden="true"></span>
    <div class="node sess run" class:wait={waiting(run)} data-node="run">
      <span class="role">실행 세션</span>
      <span class="st">{stateLabel(run)}</span>
    </div>
    <!-- 실행 세션 → 최근 완료는 실행 터미널을 거친다 -->
    <span class="via" aria-hidden="true"></span>
    <button class="node cnt done" data-node="done" onclick={() => onList("done")}>최근 완료 <span class="ct">{snap.doneTotal}</span></button>
    <span class="via" aria-hidden="true"></span>
    <button class="node cnt follow" data-node="followups" onclick={() => onList("followups")}>후속후보 <span class="ct">{followupCount}</span></button>
  </div>
</section>

<style>
  .flow { flex: none; margin: 4px 16px 20px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  /* 위 여백은 후속후보 → 계획 세션 귀환 관(FlowLinks)이 넘어가는 자리 */
  .row { position: relative; display: flex; align-items: center; min-width: 0; padding-top: 30px; }
  .via { flex: 1; min-width: 40px; }
  /* 관(FlowLinks)은 노드 테두리에서 시작하고 이음쇠는 테두리 바로 바깥 — 노드가 이음쇠를 가리지 않는다 */
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

  @keyframes breathe { 50% { box-shadow: 0 0 0 4px var(--warn-wash); } }

  @media (prefers-reduced-motion: reduce) {
    .node.wait { animation: none; }
  }
</style>
