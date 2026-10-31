<script lang="ts">
  // 「준비 중」 — 준비물이 빠졌을 때 보드 대신 보이는 화면(데스크톱 앱 3/6). 설치는 버튼 없이 이미 시작됐고(deps_install),
  // 서버가 보내는 `deps_progress`로 항목별 상태를 그린다. 실패하면 원문 오류 일부와 [다시 시도]. 끝나면 부모가 보드로 넘긴다.
  import { t } from "./i18n.svelte";

  export type InstallItem = { need: string; label: string; state: "pending" | "running" | "ok" | "failed" | "skipped"; detail: string | null };
  export type InstallProgress = { running: boolean; items: InstallItem[] };

  let { progress, message, onRetry }: { progress: InstallProgress | null; message: string | null; onRetry: () => void } = $props();

  const STATE = $derived({
    pending: t("대기", "Waiting"),
    running: t("설치 중…", "Installing…"),
    ok: t("완료", "Done"),
    failed: t("실패", "Failed"),
    skipped: t("건너뜀", "Skipped"),
  });
  const items = $derived(progress?.items ?? []);
  const running = $derived(progress?.running ?? true);
  /** 설치가 끝났는데 남은 것 — 실패·건너뜀, 또는 자동으로 설치할 수 없는 준비물(항목 없음) */
  const stuck = $derived(!running && (items.some((i) => i.state === "failed" || i.state === "skipped") || items.length === 0));
</script>

<div class="prepare">
  <div class="box">
    <h1 class="t1">{t("준비 중", "Getting ready")}</h1>
    <p class="ink2">
      {#if stuck}
        {t("설치하지 못한 준비물이 있습니다. 아래 내용을 확인한 뒤 다시 시도하세요.", "Some prerequisites could not be installed. Check below, then try again.")}
      {:else}
        {t("Anvil에 필요한 프로그램을 설치하고 있습니다. 끝나면 보드로 넘어갑니다.", "Installing what Anvil needs. The board opens when this is done.")}
      {/if}
    </p>
    {#if items.length}
      <ul>
        {#each items as item (item.need)}
          <li class={item.state}>
            <span class="row">
              <span class="pip" aria-hidden="true"></span>
              <span class="label">{item.label}</span>
              <span class="state">{STATE[item.state]}</span>
            </span>
            {#if item.detail}<pre class="detail">{item.detail}</pre>{/if}
          </li>
        {/each}
      </ul>
    {:else if stuck && message}
      <pre class="detail">{message}</pre>
    {/if}
    {#if stuck}
      <button class="btn" onclick={onRetry}>{t("다시 시도", "Try again")}</button>
    {/if}
  </div>
</div>

<style>
  .prepare { flex: 1; display: grid; place-items: center; padding: 24px 16px; min-width: 0; }
  .box { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 56ch; min-width: 0; }
  h1, p { margin: 0; }
  .ink2 { color: var(--ink2); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li { padding: 8px 12px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line2); min-width: 0; }
  .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .label { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
  .state { color: var(--ink2); white-space: nowrap; }
  .pip { width: 8px; height: 8px; border-radius: 50%; flex: none; border: 1px solid var(--line2); }
  .running .pip { background: var(--accent); border-color: var(--accent); }
  .ok .pip { background: var(--good); border-color: var(--good); }
  .failed .pip { background: var(--crit); border-color: var(--crit); }
  .failed .state { color: var(--crit); }
  .detail { margin: 8px 0 0; padding: 8px; border-radius: 4px; background: var(--bg, transparent); color: var(--ink2); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 8em; overflow: auto; }
  .btn { align-self: flex-start; min-height: 44px; }
</style>
