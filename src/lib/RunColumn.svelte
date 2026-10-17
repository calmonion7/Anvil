<script lang="ts">
  import type { Snapshot, Stage, CheckResult, BoardActions } from "./types";
  import { splitTitle, priorityLabel } from "./format";

  /** 실행 열 위쪽 — 진행 영역(「지금」 띠 · 루프 줄 · 백로그). '실행'은 실행 세션에 채운다. */
  let {
    snap,
    onOpen,
    actions,
    runBlocked = null,
  }: {
    snap: Snapshot;
    onOpen: (rel: string, label: string) => void;
    actions: BoardActions;
    /** 실행 세션이 작업 중이면 그 이유(`#N 실행 중`) — '실행'을 끈다 */
    runBlocked?: string | null;
  } = $props();

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

  function stepClass(stage: string): string {
    if (!active) return "";
    const now = order.indexOf(active.stage);
    const i = order.indexOf(stage);
    return i < now ? "done" : i === now ? "now" : "";
  }

  const num = (t: number | null) => (t === null ? "#—" : `#${t}`);
</script>

<section class="col">
  <div class="band">
    <span class="t3 b kicker">지금</span>
    {#if !snap.hasForge}
      <span class="ink2 tt">forge 없음 — 이 프로젝트에는 아직 .forge/ 가 없습니다. 첫 계획을 만들면 채워집니다.</span>
    {:else if active}
      <span class="tt" title={active.title}><span class="num">{num(active.task)}</span>{splitTitle(active.title)[0]}</span>
      {#if active.inLoop || active.running}
        <span class="t3">{[active.inLoop && "루프 소속", active.running && "실행 중"].filter(Boolean).join(" · ")}</span>
      {/if}
      <span class="steps">
        {#each steps as s, i (s.stage)}
          {#if i > 0}<span class="bar"></span>{/if}
          <span class="step {stepClass(s.stage)}" title={s.label}>
            <span class="n">{stepClass(s.stage) === "done" ? "✓" : i + 1}</span>{s.label}
          </span>
        {/each}
      </span>
      {#each active.docs as d (d.path)}
        <button class="btn sm" onclick={() => onOpen(d.path, `${d.label} · ${num(active.task)}`)}>{d.label}</button>
      {/each}
    {:else}
      <span class="ink2">진행 중인 작업 없음</span>
      <span class="awaiting">
        {#each snap.executed as e (e.path)}
          <button class="link" onclick={() => onOpen(e.path, `plan · ${num(e.task)}`)} title={e.title}>
            <span class="num">{num(e.task)}</span>{splitTitle(e.title)[0]} <span class="t3">· 회고 대기</span>
          </button>
        {/each}
      </span>
    {/if}
  </div>

  {#if loop}
    <div class="wall" class:stopped={!!loop.wall}>
      <span class="tt" title={loop.wall ?? loop.goal}>
        {#if loop.wall}<span class="b">⏸ 루프 정지</span> — {loop.wall}{:else}<span class="b">↻ 루프 진행</span>{/if}
      </span>
      {#if loop.replanCap !== null}<span class="t3">재계획 {loop.replanRound ?? 0}/{loop.replanCap}</span>{/if}
      <span class="cks">
        {#each loop.checks as c (c.id)}
          <span class="ck {c.result}" title={c.text}><span class="i">{checkIcon[c.result]}</span>{c.id}</span>
        {/each}
      </span>
      <button class="btn sm" onclick={() => onOpen(loop.path, "loop")}>loop</button>
    </div>
  {/if}

  <div class="ch"><span class="b">백로그</span><span class="ct">{snap.backlog.length} · fg-run 순서</span></div>
  <div class="list">
    {#each snap.backlog as p (p.path)}
      <div class="item">
        <button class="open" onclick={() => onOpen(p.path, `plan · ${num(p.task)}`)} title={p.title}>
          <span class="tt"><span class="num">{num(p.task)}</span>{p.title}</span>
          <span class="mt">
            <span class:pri-h={p.priority === "high"}>{priorityLabel[p.priority]}</span>{p.part ? ` · part ${p.part}` : ""}{p.fromLoop ? " · 루프 생성" : ""}
          </span>
        </button>
        <button class="btn sm" disabled={!!runBlocked} title={runBlocked ?? "실행 세션 입력창에 /forge:fg-run을 채웁니다"} onclick={() => actions.run(p)}>실행</button>
      </div>
    {:else}
      <div class="emptycell">
        <span class="t3">비어 있음</span>
        <span class="ink2">대기 중인 계획이 없습니다.</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .col { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .ink2 { color: var(--ink2); }
  .kicker { letter-spacing: .04em; flex: none; }
  .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 「지금」 띠 — 번호·제목, 단계, 문서 버튼을 한 줄에. 현재 단계 클래스 `now`와 겹치지 않게 `band` */
  .band { flex: none; display: flex; align-items: center; gap: 8px; min-height: 40px; margin: 8px 16px 0; padding: 4px 8px 4px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
  .steps { flex: none; display: flex; align-items: center; gap: 4px; }
  .step { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .step .n { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 10px; }
  .step.done { color: var(--ink2); }
  .step.done .n { background: var(--ink2); border-color: var(--ink2); color: var(--surface); }
  .step.now { color: var(--ink); font-weight: 600; }
  .step.now .n { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }
  .bar { flex: 0 0 12px; height: 1.5px; background: var(--line); }
  .awaiting { flex: 1; min-width: 0; display: flex; gap: 12px; overflow: hidden; }
  .link { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .link:hover { text-decoration: underline; }

  .wall { flex: none; display: flex; align-items: center; gap: 12px; margin: 4px 16px 0; padding: 4px 8px 4px 12px; min-height: 32px; border-radius: 6px; background: var(--line2); border-left: 3px solid var(--line); }
  .wall.stopped { background: var(--warn-wash); border-left-color: var(--warn); }
  .cks { flex: none; display: flex; gap: 4px; }
  .ck { display: inline-flex; align-items: center; gap: 2px; height: 20px; padding: 0 6px; border-radius: 4px; font-size: 11px; background: var(--line2); color: var(--ink2); }
  .ck .i { font-weight: 700; }
  .ck.pass .i { color: var(--good); }
  .ck.fail .i { color: var(--crit); }
  .ck.waiting .i { color: var(--warn); }

  .ch { flex: none; display: flex; align-items: baseline; gap: 8px; padding: 12px 20px 4px; }
  .ct { font-size: 11px; color: var(--muted); }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
  .list > * { flex: none; }
  .item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 8px 4px 12px; background: var(--surface); border: 1px solid var(--line2); border-radius: 6px; }
  .item:hover { border-color: var(--line); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; }
  .mt { flex: none; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .pri-h { color: var(--ink); font-weight: 600; }
  .emptycell { padding: 12px; display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--line); border-radius: 6px; }
</style>
