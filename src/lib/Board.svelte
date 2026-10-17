<script lang="ts">
  import type { Snapshot, Stage, CheckResult } from "./types";
  import { dayLabel, splitTitle, priorityLabel, inlineCode, norm } from "./format";

  let { snap, onOpen }: { snap: Snapshot; onOpen: (rel: string, label: string) => void } = $props();

  const DONE_PAGE = 20;
  let showAllDone = $state(false);

  const steps: { stage: Stage | "plan"; label: string }[] = [
    { stage: "plan", label: "계획" },
    { stage: "run", label: "실행·검증" },
    { stage: "retro", label: "회고" },
    { stage: "seal", label: "봉인" },
  ];
  const order = ["plan", "run", "retro", "seal"];
  const checkIcon: Record<CheckResult, string> = { pass: "✓", fail: "✕", waiting: "⏳", unknown: "·" };

  let active = $derived(snap.active);
  let loop = $derived(snap.loopState);
  let activeTitle = $derived(active ? splitTitle(active.title) : ["", ""]);
  let doneShown = $derived(showAllDone ? snap.done : snap.done.slice(0, DONE_PAGE));

  function stepClass(stage: string): string {
    if (!active) return "";
    const now = order.indexOf(active.stage);
    const i = order.indexOf(stage);
    return i < now ? "done" : i === now ? "now" : "";
  }

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

<div class="board">
  <div class="head">
    <span class="t1">{snap.name}</span>
    <span class="chip">⎇ {snap.root.branch ?? "브랜치 없음"} · {snap.root.rel}/</span>
    {#if snap.root.warning}<span class="chip warn">{snap.root.warning}</span>{/if}
    <span class="sp"></span>
  </div>

  {#if !snap.hasForge}
    <div class="hero empty">
      <span class="b">forge 없음</span>
      <div class="ink2">이 프로젝트에는 아직 .forge/ 가 없습니다. 첫 계획을 만들면 보드가 채워집니다.</div>
    </div>
  {:else}
    {#each snap.errors as err (err.path)}
      <div class="error">
        <span class="b"><span class="crit">✕</span> 읽기 실패</span>
        <span class="ink2">{err.path} — {err.message}</span>
        <span class="sp"></span>
        <button class="btn sm" onclick={() => onOpen(err.path, err.path.split("/").pop() ?? err.path)}>파일 열기</button>
      </div>
    {/each}

    <div class="hero">
      {#if active}
        <div class="ttl">
          <div class="t3 b kicker">지금{active.inLoop ? " · 루프 소속" : ""}{active.running ? " · 실행 중" : ""}</div>
          <div class="t1"><span class="num">{num(active.task)}</span>{activeTitle[0]}</div>
          {#if activeTitle[1]}<div class="sub" title={activeTitle[1]}>{activeTitle[1]}</div>{/if}
        </div>
        <div class="docs">
          {#each active.docs as d (d.path)}
            <button class="btn sm" onclick={() => onOpen(d.path, `${d.label} · ${num(active.task)}`)}>{d.label}</button>
          {/each}
        </div>
        <div class="steps">
          {#each steps as s, i (s.stage)}
            {#if i > 0}<span class="bar"></span>{/if}
            <span class="step {stepClass(s.stage)}">
              <span class="n">{stepClass(s.stage) === "done" ? "✓" : i + 1}</span>{s.label}
            </span>
          {/each}
        </div>
      {:else}
        <div class="ttl">
          <div class="t3 b kicker">지금</div>
          <div class="ink2">진행 중인 작업이 없습니다.</div>
          {#if snap.executed.length}
            <div class="awaiting">
              {#each snap.executed as e (e.path)}
                <button class="link" onclick={() => onOpen(e.path, `plan · ${num(e.task)}`)}>
                  <span class="num">{num(e.task)}</span>{splitTitle(e.title)[0]} <span class="t3">· 회고 대기</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div></div>
      {/if}

      {#if loop}
        <div class="wall" class:stopped={!!loop.wall}>
          <span>
            {#if loop.wall}<span class="b">⏸ 루프 정지</span> — {loop.wall}{:else}<span class="b">↻ 루프 진행</span>{/if}
          </span>
          {#if loop.replanCap !== null}<span class="t3">재계획 {loop.replanRound ?? 0}/{loop.replanCap}</span>{/if}
          <span class="cks">
            {#each loop.checks as c (c.id)}
              <span class="ck {c.result}" title={c.text}><span class="i">{checkIcon[c.result]}</span>{c.id}</span>
            {/each}
          </span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => onOpen(loop.path, "loop")}>loop</button>
        </div>
      {/if}
    </div>

    <div class="cols">
      <section class="col">
        <div class="ch"><span class="b">백로그</span><span class="ct">{snap.backlog.length} · fg-run 순서</span></div>
        {#each snap.backlog as p (p.path)}
          <button class="item" onclick={() => onOpen(p.path, `plan · ${num(p.task)}`)}>
            <div class="tt"><span class="num">{num(p.task)}</span>{p.title}</div>
            <div class="mt">
              <span class:pri-h={p.priority === "high"}>{priorityLabel[p.priority]}</span>
              {#if p.part}<span>part {p.part}</span>{/if}
              {#if p.fromLoop}<span>루프 생성</span>{/if}
            </div>
          </button>
        {:else}
          <div class="emptycell">
            <span class="t3">비어 있음</span>
            <div class="ink2">대기 중인 계획이 없습니다.</div>
          </div>
        {/each}
      </section>

      <section class="col">
        <div class="ch"><span class="b">후속후보</span><span class="ct">{snap.followups.length}</span></div>
        {#each snap.followups as f, i (f.sourcePath + i)}
          <button class="item" onclick={() => onOpen(f.sourcePath, f.sourceSlug)}>
            <div class="tt">{@html inlineCode(f.text)}</div>
            <div class="mt"><span>← {f.sourceSlug}</span>{#if f.date}<span>{dayLabel(f.date)}</span>{/if}</div>
          </button>
        {:else}
          <div class="emptycell">
            <span class="t3">비어 있음</span>
            <div class="ink2">회고나 실행 기록에 남은 후속후보가 없습니다.</div>
          </div>
        {/each}
      </section>

      <section class="col">
        <div class="ch"><span class="b">최근 완료</span><span class="ct">{snap.doneTotal}</span></div>
        {#each doneShown as d (d.path)}
          {@const v = verifiedMark(d.verified)}
          <button class="item" onclick={() => onOpen(d.path, `plan · ${num(d.task)}`)}>
            <div class="tt"><span class="num">{num(d.task)}</span>{splitTitle(d.title)[0]}</div>
            <div class="mt">
              <span class={v.cls}>{v.icon}</span><span>{v.label}</span>
              <span>· {retroLabel(d.retro)}</span>
              {#if d.date}<span>· {dayLabel(d.date)}</span>{/if}
            </div>
          </button>
        {:else}
          <div class="emptycell">
            <span class="t3">비어 있음</span>
            <div class="ink2">아직 봉인한 작업이 없습니다.</div>
          </div>
        {/each}
        {#if snap.done.length > DONE_PAGE}
          <button class="more" onclick={() => (showAllDone = !showAllDone)}>
            {showAllDone ? "최근 것만 보기" : `전체 기록 보기 (${snap.done.length}) →`}
          </button>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .board { flex: 1; min-height: 0; padding: 16px 24px; display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 12px; border: 1px solid var(--line); color: var(--ink2); font-size: 11px; white-space: nowrap; }
  .chip.warn { border-color: transparent; background: var(--warn-wash); color: var(--ink); }
  .sp { flex: 1; }
  .ink2 { color: var(--ink2); }
  .crit { color: var(--crit); }
  .good { color: var(--good); }

  .hero { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; }
  .hero.empty { display: flex; flex-direction: column; gap: 8px; }
  .ttl { min-width: 0; }
  .kicker { letter-spacing: .04em; margin-bottom: 4px; }
  .sub { color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72ch; }
  .docs { display: flex; gap: 8px; align-items: flex-start; }
  .steps { grid-column: 1 / -1; display: flex; align-items: center; gap: 4px; }
  .step { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
  .step .n { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 10px; }
  .step.done { color: var(--ink2); }
  .step.done .n { background: var(--ink2); border-color: var(--ink2); color: var(--surface); }
  .step.now { color: var(--ink); font-weight: 600; }
  .step.now .n { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }
  .bar { flex: 0 0 24px; height: 1.5px; background: var(--line); }
  .awaiting { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .link { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
  .link:hover { text-decoration: underline; }

  .wall { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 12px; border-radius: 6px; background: var(--line2); border-left: 3px solid var(--line); }
  .wall.stopped { background: var(--warn-wash); border-left-color: var(--warn); }
  .cks { display: flex; gap: 4px; flex-wrap: wrap; }
  .ck { display: inline-flex; align-items: center; gap: 2px; height: 20px; padding: 0 6px; border-radius: 4px; font-size: 11px; background: var(--line2); color: var(--ink2); }
  .ck .i { font-weight: 700; }
  .ck.pass .i { color: var(--good); }
  .ck.fail .i { color: var(--crit); }
  .ck.waiting .i { color: var(--warn); }

  .error { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line2); border-left: 3px solid var(--crit); }

  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .col { min-height: 0; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-bottom: 24px; }
  /* 열은 스크롤 컨테이너 — 카드가 넘쳐도 줄어들지 않게(min-height가 flex 기본 최소 높이를 덮어써 제목이 잘리던 문제) */
  .col > * { flex: none; }
  .ch { display: flex; align-items: baseline; gap: 8px; padding: 0 4px 4px; position: sticky; top: 0; background: var(--plane); z-index: 1; }
  .ct { font-size: 11px; color: var(--muted); }
  .item { background: var(--surface); border: 1px solid var(--line2); border-radius: 6px; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; text-align: left; cursor: pointer; min-height: 44px; }
  .item:hover { border-color: var(--line); }
  .tt { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .mt { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
  .pri-h { color: var(--ink); font-weight: 600; }
  .more { padding: 4px; font-size: 11px; color: var(--accent); background: none; border: 0; text-align: left; cursor: pointer; }
  .emptycell { padding: 12px; display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--line); border-radius: 6px; }
</style>
