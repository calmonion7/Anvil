<script lang="ts">
  import type { Snapshot, Followup, BoardActions } from "./types";
  import { dayLabel, splitTitle, inlineCode, norm } from "./format";

  /** 계획 열 위쪽 — 기록 영역(후속후보 · 최근 완료). 후속후보를 '착수'하면 계획 세션에 채운다. */
  let {
    snap,
    onOpen,
    actions,
    planBlocked = null,
    hidden = new Set<string>(),
  }: {
    snap: Snapshot;
    onOpen: (rel: string, label: string) => void;
    actions: BoardActions;
    /** 계획 세션이 작업 중이면 그 이유 — '착수'를 끈다 */
    planBlocked?: string | null;
    /** 숨긴 후속후보 키(`출처 경로\n문장`) */
    hidden?: Set<string>;
  } = $props();

  const DONE_PAGE = 20;
  let tab = $state<"followups" | "done">("followups");
  let showAllDone = $state(false);
  let showHidden = $state(false);

  const hideKey = (f: Followup) => `${f.sourcePath}\n${f.text}`;
  let hiddenCount = $derived(snap.followups.filter((f) => hidden.has(hideKey(f))).length);
  let followupsShown = $derived(snap.followups.filter((f) => showHidden || !hidden.has(hideKey(f))));
  let doneShown = $derived(showAllDone ? snap.done : snap.done.slice(0, DONE_PAGE));

  function verifiedMark(v: string | null): { icon: string; label: string; cls: string } {
    switch (norm(v)) {
      case "yes": return { icon: "✓", label: "검증", cls: "good" };
      case "skipped": return { icon: "~", label: "검증 건너뜀", cls: "" };
      case "n/a": return { icon: "~", label: "검증 해당 없음", cls: "" };
      case "failed": return { icon: "✕", label: "검증 실패", cls: "crit" };
      default: return { icon: "·", label: "검증 전", cls: "" };
    }
  }
  const retroLabel = (r: string | null) =>
    norm(r) === "skipped" ? "회고 건너뜀" : !r || norm(r) === "pending" ? "회고 전" : "회고 ✓";

  const num = (t: number | null) => (t === null ? "#—" : `#${t}`);
</script>

<section class="col">
  <div class="ch" role="tablist" aria-label="기록 영역">
    <button class="tb" role="tab" aria-selected={tab === "followups"} class:on={tab === "followups"} onclick={() => (tab = "followups")}>
      후속후보 <span class="ct">{snap.followups.length - hiddenCount}</span>
    </button>
    <button class="tb" role="tab" aria-selected={tab === "done"} class:on={tab === "done"} onclick={() => (tab = "done")}>
      최근 완료 <span class="ct">{snap.doneTotal}</span>
    </button>
    <span class="sp"></span>
    {#if tab === "followups" && hiddenCount}
      <button class="more" onclick={() => (showHidden = !showHidden)}>{showHidden ? "숨긴 항목 감추기" : `숨긴 항목 보기 (${hiddenCount})`}</button>
    {/if}
  </div>

  <div class="list">
    {#if tab === "followups"}
      {#each followupsShown as f, i (f.sourcePath + i)}
        {@const isHidden = hidden.has(hideKey(f))}
        <div class="item" class:dim={isHidden}>
          <button class="open" onclick={() => onOpen(f.sourcePath, f.sourceSlug)} title={f.text}>
            <span class="tt">{@html inlineCode(f.text)}</span>
            <span class="mt">← {f.sourceSlug}{f.date ? ` · ${dayLabel(f.date)}` : ""}</span>
          </button>
          {#if !isHidden}
            <button class="btn sm" disabled={!!planBlocked} title={planBlocked ?? "계획 세션 입력창에 /forge:fg-ask를 채웁니다"} onclick={() => actions.start(f)}>착수</button>
          {/if}
          <button class="btn sm quiet" onclick={() => actions.setHidden(f, !isHidden)}>{isHidden ? "되돌리기" : "숨김"}</button>
        </div>
      {:else}
        <div class="emptycell">
          <span class="t3">비어 있음</span>
          <span class="ink2">회고나 실행 기록에 남은 후속후보가 없습니다.</span>
        </div>
      {/each}
    {:else}
      {#each doneShown as d (d.path)}
        {@const v = verifiedMark(d.verified)}
        <button class="item open" onclick={() => onOpen(d.path, `plan · ${num(d.task)}`)} title={d.title}>
          <span class="tt"><span class="num">{num(d.task)}</span>{splitTitle(d.title)[0]}</span>
          <span class="mt"><span class={v.cls}>{v.icon}</span> {v.label} · {retroLabel(d.retro)}{d.date ? ` · ${dayLabel(d.date)}` : ""}</span>
        </button>
      {:else}
        <div class="emptycell">
          <span class="t3">비어 있음</span>
          <span class="ink2">아직 봉인한 작업이 없습니다.</span>
        </div>
      {/each}
      {#if snap.done.length > DONE_PAGE}
        <button class="more" onclick={() => (showAllDone = !showAllDone)}>
          {showAllDone ? "최근 것만 보기" : `전체 기록 보기 (${snap.done.length}) →`}
        </button>
      {/if}
    {/if}
  </div>
</section>

<style>
  .col { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .ch { display: flex; align-items: center; gap: 4px; padding: 8px 16px 4px; flex: none; }
  .tb { height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--ink2); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .tb.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent); }
  .tb:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .ct { font-size: 11px; color: var(--muted); font-weight: 400; }
  .sp { flex: 1; }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
  .list > * { flex: none; }
  .ink2 { color: var(--ink2); }
  .crit { color: var(--crit); }
  .good { color: var(--good); }
  /* 한 줄 카드 — 제목은 말줄임, 출처·날짜와 버튼은 같은 줄 오른쪽 */
  .item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 8px 4px 12px; background: var(--surface); border: 1px solid var(--line2); border-radius: 6px; text-align: left; }
  .item:hover { border-color: var(--line); }
  .item.dim { opacity: .6; }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; }
  button.item.open { padding: 4px 8px 4px 12px; border: 1px solid var(--line2); background: var(--surface); }
  .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mt { flex: none; font-size: 11px; color: var(--muted); white-space: nowrap; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
  .quiet { color: var(--muted); }
  .more { padding: 4px; font-size: 11px; color: var(--accent); background: none; border: 0; text-align: left; cursor: pointer; }
  .emptycell { padding: 12px; display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--line); border-radius: 6px; }
</style>
