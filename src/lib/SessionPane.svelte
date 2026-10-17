<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { ask } from "@tauri-apps/plugin-dialog";
  import Terminal from "./Terminal.svelte";
  import { roleLabel, stateLabel, pipClass } from "./sessions";
  import type { Role, SessionState } from "./types";

  let {
    project,
    projectName,
    role,
    name,
    session,
    task,
  }: { project: string; projectName: string; role: Role; name: string; session: SessionState | null; task: string | null } =
    $props();

  let busy = $state(false);
  let error = $state("");
  let alive = $derived(!!session?.alive);

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
    <span>{stateLabel(session)}{task ? ` · ${task}` : ""}</span>
    <span class="sp"></span>
    {#if alive}
      <button class="btn sm" onclick={kill}>세션 종료</button>
    {/if}
  </div>
  {#if alive}
    {#key name}<Terminal {name} />{/key}
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
  .label { color: var(--ink); }
  .sp { flex: 1; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 8px; padding: 16px; color: #e6e5e0; }
  .empty .t3 { color: #898781; }
  .err { color: var(--crit); font-size: 11px; }
</style>
