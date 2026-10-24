<script lang="ts">
  import type { Snapshot, Stage, CheckResult } from "./types";
  import { splitTitle } from "./format";
  import { t } from "./i18n.svelte";
  import type { Snippet } from "svelte";

  /** 위쪽 고정 띠 — 진행 영역(「지금」 띠 · 루프 줄). 건수 칩은 FlowBoard 노드로 옮겼다. */
  let {
    snap,
    onOpen,
    tools,
    onStart,
    blocked = null,
  }: {
    snap: Snapshot;
    onOpen: (rel: string, label: string) => void;
    /** forge가 없을 때 — 계획 세션에 첫 계획 명령을 채운다 */
    onStart?: () => void;
    /** 준비물이 빠졌으면 이유 — 시작 버튼을 끈다 */
    blocked?: string | null;
    /** 둘째 줄 오른쪽 — 실행 세션 단축 버튼 */
    tools?: Snippet;
  } = $props();

  const steps: { stage: Stage | "plan"; label: string }[] = $derived([
    { stage: "plan", label: t("계획", "Plan") },
    { stage: "run", label: t("실행·검증", "Run · verify") },
    { stage: "retro", label: t("회고", "Retro") },
    { stage: "seal", label: t("봉인", "Seal") },
  ]);
  const order = ["plan", "run", "retro", "seal"];
  const checkIcon: Record<CheckResult, string> = { pass: "✓", fail: "✕", waiting: "⏳", unknown: "·" };

  let active = $derived(snap.active);
  let loop = $derived(snap.loopState);
  /** 실행 중인 작업이 없을 때 다음에 집을 백로그 — fg-run과 같은 순서(우선순위 → task 번호) */
  const rank = { high: 0, medium: 1, low: 2 };
  let next = $derived(
    [...snap.backlog].sort((a, b) => rank[a.priority] - rank[b.priority] || (a.task ?? Infinity) - (b.task ?? Infinity))[0] ?? null,
  );

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
    <span class="b kicker">{!active && next ? t("다음", "Next") : t("지금", "Now")}</span>
    {#if !snap.hasForge}
      <span class="ink2 tt">{t("forge 없음 — 이 프로젝트에는 아직 .forge/ 가 없습니다. 계획 세션에서 ", "No forge — this project has no .forge/ yet. Create a first plan with ")}<code>/forge:fg-ask</code>{t(" 로 첫 계획을 만들면 보드가 채워집니다.", " in the plan session to fill the board.")}</span>
      {#if onStart}<button class="btn sm" disabled={!!blocked} title={blocked ?? undefined} onclick={onStart}>{t("계획 세션에서 시작", "Start in plan session")}</button>{#if blocked}<span class="t3">{blocked}</span>{/if}{/if}
    {:else if active}
      <span class="tt" title={active.title}><span class="num">{num(active.task)}</span>{splitTitle(active.title)[0]}</span>
      {#each active.docs as d (d.path)}
        <button class="btn sm" onclick={() => onOpen(d.path, `${d.label} · ${num(active.task)}`)}>{d.label}</button>
      {/each}
      <!-- 둘째 줄: 단계와 루프 소속·실행 중 -->
      <div class="line2">
        <span class="steps">
          {#each steps as s, i (s.stage)}
            {#if i > 0}<span class="bar"></span>{/if}
            <span class="step {stepClass(s.stage)}" title={s.label}>
              <span class="n">{stepClass(s.stage) === "done" ? "✓" : i + 1}</span>{s.label}
            </span>
          {/each}
        </span>
        {#if active.inLoop || active.running}
          <span class="t3">{[active.inLoop && t("루프 소속", "In loop"), active.running && t("실행 중", "Running")].filter(Boolean).join(" · ")}</span>
        {/if}
        <span class="sp2"></span>
        {@render tools?.()}
      </div>
    {:else}
      {#if next}
        <button class="link tt" onclick={() => onOpen(next.path, `plan · ${num(next.task)}`)} title={next.title}>
          <span class="num">{num(next.task)}</span>{splitTitle(next.title)[0]}
        </button>
        <span class="t3">{t(`실행 대기 · 백로그 ${snap.backlog.length}건`, `Waiting to run · ${snap.backlog.length} in backlog`)}</span>
      {:else}
        <span class="ink2">{t("진행 중인 작업 없음 · 백로그 비어 있음", "No task in progress · backlog empty")}</span>
      {/if}
      <span class="awaiting">
        {#each snap.executed as e (e.path)}
          <button class="link" onclick={() => onOpen(e.path, `plan · ${num(e.task)}`)} title={e.title}>
            <span class="num">{num(e.task)}</span>{splitTitle(e.title)[0]} <span class="t3">{t("· 회고 대기", "· awaiting retro")}</span>
          </button>
        {/each}
      </span>
      <div class="line2"><span class="sp2"></span>{@render tools?.()}</div>
    {/if}
  </div>

  {#if loop}
    <div class="wall" class:stopped={!!loop.wall}>
      <span class="tt" title={loop.wall ?? loop.goal}>
        {#if loop.wall}<span class="b">{t("⏸ 루프 정지", "⏸ Loop halted")}</span> — {loop.wall}{:else}<span class="b">{t("↻ 루프 진행", "↻ Loop running")}</span>{/if}
      </span>
      {#if loop.replanCap !== null}<span class="t3">{t("재계획", "Replan")} {loop.replanRound ?? 0}/{loop.replanCap}</span>{/if}
      <span class="cks">
        {#each loop.checks as c (c.id)}
          <span class="ck {c.result}" title={c.text}><span class="i">{checkIcon[c.result]}</span>{c.id}</span>
        {/each}
      </span>
      <button class="btn sm" onclick={() => onOpen(loop.path, "loop")}>loop</button>
    </div>
  {/if}

</section>

<style>
  .col { min-width: 0; display: flex; flex-direction: column; }
  .ink2 { color: var(--ink2); }
  .kicker { letter-spacing: .04em; flex: none; }
  .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 「지금」 띠 — 첫째 줄 번호·제목·문서 버튼, 둘째 줄 단계(2026-10-18 사람 결정으로 두 줄).
     현재 단계 클래스 `now`와 겹치지 않게 `band` */
  /* 실행 열 머리판 — 터미널에 붙어 한 덩어리, 위쪽 파란 선에 흐름도의 관이 꽂힌다(계획 쪽 .pband와 같은 꼴) */
  .band { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 8px 16px 6px; background: var(--surface); border-top: 2px solid var(--accent); }
  .band .kicker { height: 20px; padding: 0 8px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 11px; color: var(--accent); background: var(--accent-wash); }
  .band > .tt { font-weight: 600; }
  /* 단계 묶음은 폭을 내용에서 잰다 — WebKit이 그 계산에서 flex gap·flex-basis를 빼먹어 뒤 버튼이 '봉인'을 덮었다.
     간격은 margin, 연결선 폭은 width로 준다. */
  .sp2 { flex: 1; }
  .line2 { flex: 0 0 100%; display: flex; align-items: center; gap: 12px; padding-bottom: 2px; }
  .steps { flex: none; display: flex; align-items: center; }
  .steps > * + * { margin-left: 4px; }
  .step { display: flex; align-items: center; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .step .n { flex: none; margin-right: 4px; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 10px; }
  .step.done { color: var(--ink2); }
  .step.done .n { background: var(--ink2); border-color: var(--ink2); color: var(--surface); }
  .step.now { color: var(--ink); font-weight: 600; }
  .step.now .n { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }
  .bar { flex: none; width: 12px; height: 1.5px; background: var(--line); }
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

</style>
