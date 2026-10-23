<script lang="ts">
  import type { Snapshot, Followup, BoardActions } from "./types";
  import { dayLabel, splitTitle, inlineCode, norm, priorityLabel } from "./format";
  import { t } from "./i18n.svelte";

  /** 건수 칩이 여는 목록 팝업 — 후속후보 · 최근 완료 · 백로그. 착수·기각·실행은 팝업을 닫고, 펼치기·문서 열기는 유지한다. */
  let {
    kind,
    snap,
    onOpen,
    onClose,
    actions,
    planBlocked = null,
    runBlocked = null,
  }: {
    kind: ListKind;
    snap: Snapshot;
    onOpen: (rel: string, label: string) => void;
    onClose: () => void;
    actions: BoardActions;
    /** 계획 세션이 작업 중이면 그 이유 — '착수'를 끈다 */
    planBlocked?: string | null;
    /** 실행 세션이 작업 중이면 그 이유(`#N 실행 중`) — '실행'을 끈다 */
    runBlocked?: string | null;
  } = $props();

  const DONE_PAGE = 20;
  const titles = (k: ListKind): string =>
    ({ followups: t("후속후보", "Follow-ups"), done: t("최근 완료", "Recently done"), backlog: t("백로그", "Backlog") })[k];
  let showAllDone = $state(false);
  let showClosed = $state(false);
  let expanded = $state<Record<string, boolean>>({});

  // 원장 그대로 — 위는 open(날짜 최신순), 접힌 「처리됨」에 taken · dismissed
  let openItems = $derived(snap.followups.filter((f) => f.status === "open"));
  let closedItems = $derived(snap.followups.filter((f) => f.status !== "open"));
  /** taken이 가리키는 작업의 문서(있을 때만) */
  const docOf = (n: number | null): string | null =>
    n === null ? null : [...snap.backlog, ...snap.executed, ...snap.done].find((c) => c.task === n)?.path ?? null;
  const hasMore = (f: Followup) => f.body.includes("\n");
  let doneShown = $derived(showAllDone ? snap.done : snap.done.slice(0, DONE_PAGE));

  function verifiedMark(v: string | null): { icon: string; label: string; cls: string } {
    switch (norm(v)) {
      case "yes": return { icon: "✓", label: t("검증", "Verified"), cls: "good" };
      case "skipped": return { icon: "~", label: t("검증 건너뜀", "Verification skipped"), cls: "" };
      case "n/a": return { icon: "~", label: t("검증 해당 없음", "Verification N/A"), cls: "" };
      case "failed": return { icon: "✕", label: t("검증 실패", "Verification failed"), cls: "crit" };
      default: return { icon: "·", label: t("검증 전", "Not verified"), cls: "" };
    }
  }
  const retroLabel = (r: string | null) =>
    norm(r) === "skipped" ? t("회고 건너뜀", "Retro skipped") : !r || norm(r) === "pending" ? t("회고 전", "Retro pending") : t("회고 ✓", "Retro ✓");

  const num = (t: number | null) => (t === null ? "#—" : `#${t}`);
</script>

<script lang="ts" module>
  export type ListKind = "followups" | "done" | "backlog";
</script>

<!-- 바깥(어두운 바탕) 클릭으로 닫힌다. Esc는 +page가 맨 위 겹침부터 닫는다. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="pop" role="dialog" aria-modal="true" aria-label={titles(kind)}>
    <div class="ch">
      <span class="b">{titles(kind)}</span>
      <span class="sp"></span>
      <button class="x" aria-label={t("닫기", "Close")} onclick={onClose}>×</button>
    </div>

    <div class="list">
      {#if kind === "followups"}
        {#snippet more(f: Followup)}
          {#if expanded[f.id]}<pre class="body">{f.body}</pre>{/if}
        {/snippet}
        {#each openItems as f (f.id)}
          <div class="fu">
            <div class="item">
              <button class="open" disabled={!hasMore(f)} aria-expanded={hasMore(f) ? !!expanded[f.id] : undefined} onclick={() => (expanded[f.id] = !expanded[f.id])} title={f.body}>
                <span class="tt">{@html inlineCode(f.text)}</span>
                <span class="mt">← {f.source}{f.date ? ` · ${dayLabel(f.date)}` : ""}</span>
              </button>
              <button class="btn sm" disabled={!!planBlocked} title={planBlocked ?? t("계획 세션 입력창에 /forge:fg-ask를 채웁니다", "Fills /forge:fg-ask into the plan session input")} onclick={() => { actions.start(f); onClose(); }}>{t("착수", "Start")}</button>
              <button class="btn sm quiet" disabled={!!planBlocked} title={planBlocked ?? t("계획 세션 입력창에 기각 사유를 묻는 /forge:fg-ask를 채웁니다", "Fills a dismissal /forge:fg-ask into the plan session input")} onclick={() => { actions.dismiss(f); onClose(); }}>{t("기각", "Dismiss")}</button>
            </div>
            {@render more(f)}
          </div>
        {:else}
          <div class="emptycell">
            <span class="t3">{t("비어 있음", "Empty")}</span>
            <span class="ink2">{t("열린 후속후보가 없습니다.", "No open follow-ups.")}</span>
          </div>
        {/each}
        {#if closedItems.length}
          <button class="more" aria-expanded={showClosed} onclick={() => (showClosed = !showClosed)}>
            {showClosed ? t("처리됨 접기", "Collapse handled") : t(`처리됨 ${closedItems.length}건`, `Handled (${closedItems.length})`)}
          </button>
          {#if showClosed}
            {#each closedItems as f (f.id)}
              {@const doc = f.status === "taken" ? docOf(f.taken) : null}
              <div class="fu">
                <div class="item dim">
                  <button class="open" onclick={() => (doc ? onOpen(doc, `plan · #${f.taken}`) : (expanded[f.id] = !expanded[f.id]))} title={f.body}>
                    <span class="tt">{@html inlineCode(f.text)}</span>
                    <span class="mt">{f.status === "taken" ? `→ #${f.taken}` : t("기각", "Dismissed")} · {f.source}{f.date ? ` · ${dayLabel(f.date)}` : ""}</span>
                  </button>
                </div>
                {#if f.status === "dismissed" || !doc}{@render more(f)}{/if}
              </div>
            {/each}
          {/if}
        {/if}
      {:else if kind === "done"}
        {#each doneShown as d (d.path)}
          {@const v = verifiedMark(d.verified)}
          <button class="item open" onclick={() => onOpen(d.path, `plan · ${num(d.task)}`)} title={d.title}>
            <span class="tt"><span class="num">{num(d.task)}</span>{splitTitle(d.title)[0]}</span>
            <span class="mt"><span class={v.cls}>{v.icon}</span> {v.label} · {retroLabel(d.retro)}{d.date ? ` · ${dayLabel(d.date)}` : ""}</span>
          </button>
        {:else}
          <div class="emptycell">
            <span class="t3">{t("비어 있음", "Empty")}</span>
            <span class="ink2">{t("아직 봉인한 작업이 없습니다.", "No sealed tasks yet.")}</span>
          </div>
        {/each}
        {#if snap.done.length > DONE_PAGE}
          <button class="more" onclick={() => (showAllDone = !showAllDone)}>
            {showAllDone ? t("최근 것만 보기", "Show recent only") : t(`전체 기록 보기 (${snap.done.length}) →`, `Show full history (${snap.done.length}) →`)}
          </button>
        {/if}
      {:else}
        {#each snap.backlog as p (p.path)}
          <div class="item">
            <button class="open" onclick={() => onOpen(p.path, `plan · ${num(p.task)}`)} title={p.title}>
              <span class="tt"><span class="num">{num(p.task)}</span>{p.title}</span>
              <span class="mt">
                <span class:pri-h={p.priority === "high"}>{priorityLabel[p.priority]}</span>{p.part ? ` · part ${p.part}` : ""}{p.fromLoop ? t(" · 루프 생성", " · from loop") : ""}
              </span>
            </button>
            <button class="btn sm" disabled={!!runBlocked} title={runBlocked ?? t("실행 세션 입력창에 /forge:fg-run을 채웁니다", "Fills /forge:fg-run into the run session input")} onclick={() => { actions.run(p); onClose(); }}>{t("실행", "Run")}</button>
          </div>
        {:else}
          <div class="emptycell">
            <span class="t3">{t("비어 있음", "Empty")}</span>
            <span class="ink2">{t("대기 중인 계획이 없습니다.", "No plans waiting.")}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  /* 띠 아래 ~ 터미널을 덮는 바탕. 팝업은 위쪽에 붙여 띠의 칩과 이어 보이게 한다. */
  .scrim { position: absolute; inset: 0; z-index: 2; background: rgba(0, 0, 0, .35); display: flex; justify-content: center; align-items: flex-start; padding: 8px 16px 16px; }
  .pop { width: min(720px, 100%); max-height: 100%; display: flex; flex-direction: column; background: var(--plane); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
  .ch { display: flex; align-items: center; gap: 8px; padding: 8px 8px 4px 16px; flex: none; }
  .sp { flex: 1; }
  .x { width: 32px; height: 32px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .x:hover { background: var(--line2); color: var(--ink); }
  .x:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .list { flex: 1; min-height: 72px; overflow-y: auto; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
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
  .pri-h { color: var(--ink); font-weight: 600; }
  .quiet { color: var(--muted); }
  .fu { display: flex; flex-direction: column; gap: 4px; }
  .open:disabled { cursor: default; }
  .body { margin: 0 0 4px 12px; padding: 8px 12px; white-space: pre-wrap; font: inherit; font-size: 12px; color: var(--ink2); background: var(--surface); border-left: 2px solid var(--line); }
  .more { padding: 4px; font-size: 11px; color: var(--accent); background: none; border: 0; text-align: left; cursor: pointer; }
  .emptycell { padding: 12px; display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--line); border-radius: 6px; }
</style>
