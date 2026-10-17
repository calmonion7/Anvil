<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { ask } from "@tauri-apps/plugin-dialog";
  import Terminal from "./Terminal.svelte";
  import { roleLabel, stateLabel, pipClass } from "./sessions";
  import type { Role, SessionState, SessionTitle, ModelInfo } from "./types";

  let {
    project,
    projectName,
    role,
    name,
    session,
    task,
    title,
    live = null,
    focusTick = 0,
  }: {
    project: string;
    projectName: string;
    role: Role;
    name: string;
    session: SessionState | null;
    task: string | null;
    /** claude 세션 이름과 띄울 때 모델(백엔드 `session_title`) */
    title: SessionTitle | null;
    /** 상태줄 래퍼가 남긴 실제 모델·effort — 상태줄이 처음 그려지기 전에는 없다 */
    live?: ModelInfo | null;
    focusTick?: number;
  } = $props();

  let busy = $state(false);
  let error = $state("");
  let alive = $derived(!!session?.alive);
  /** 머리줄 `[Anvil] [BibleMap] PLAN · Opus 5.5 · high` — 기록 전에는 띄울 때 모델만, effort는 숨긴다 */
  let heading = $derived(
    title ? [title[0], (alive && live?.model) || title[1], alive ? live?.effort : null].filter(Boolean).join(" · ") : "",
  );

  async function start() {
    busy = true;
    error = "";
    try {
      await invoke("session_start", { project, role });
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  async function kill() {
    const ok = await ask(`${projectName} ${roleLabel[role]} 세션을 끝낼까요? 진행 중인 claude 대화가 종료됩니다.`, {
      title: "세션 종료",
      kind: "warning",
      okLabel: "세션 종료",
      cancelLabel: "취소",
    });
    if (!ok) return;
    try {
      await invoke("session_kill", { name });
    } catch (e) {
      error = String(e);
    }
  }
</script>

<div class="pane">
  <div class="th">
    <span class="pip {pipClass(session)}"></span>
    <span class="b label">{roleLabel[role]} 세션</span>
    <span class="st">{stateLabel(session)}{task ? ` · ${task}` : ""}</span>
    {#if heading}<span class="nm" title={heading}>{heading}</span>{/if}
    <span class="sp"></span>
    {#if alive}
      <button class="btn sm" onclick={kill}>세션 종료</button>
    {/if}
  </div>
  {#if alive}
    {#key name}<Terminal {name} {focusTick} />{/key}
  {:else}
    <div class="empty">
      <div>{roleLabel[role]} 세션이 없습니다.</div>
      <div class="t3">{role === "plan" ? "계획을 쌓는(fg-ask) 자리입니다." : "계획을 실행하는(fg-run·fg-next) 자리입니다."}</div>
      <button class="btn sm" disabled={busy} onclick={start}>{busy ? "여는 중…" : "세션 열기"}</button>
      {#if error}<div class="err">{error}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #111110; }
  .th { height: 32px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--surface); border-bottom: 1px solid var(--line2); font-size: 11px; color: var(--ink2); }
  .label { color: var(--ink); flex: none; }
  .st { flex: none; }
  .nm { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--muted); }
  .sp { flex: 1; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 8px; padding: 16px; color: #e6e5e0; }
  .empty .t3 { color: #898781; }
  .err { color: var(--crit); font-size: 11px; }
</style>
