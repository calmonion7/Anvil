<script lang="ts">
  import { tick } from "svelte";

  /** 열 머리판의 단축 버튼 — 누르면 그 세션 입력창에 명령을 채운다(Enter는 사람이). 버튼 이름 = 명령어 그대로.
      ＋로 추가, 버튼에 올리면 나오는 ×로 삭제. */
  let {
    role,
    items,
    blocked,
    onFill,
    onChange,
  }: {
    role: "plan" | "run";
    items: string[];
    /** 세션이 작업 중이라 채울 수 없으면 그 이유 */
    blocked: string | null;
    onFill: (text: string) => void;
    onChange: (items: string[]) => void;
  } = $props();

  let adding = $state(false);
  let draft = $state("");
  let input = $state<HTMLInputElement>();

  async function open() {
    adding = true;
    draft = "/";
    await tick();
    input?.focus();
  }
  function add() {
    const t = draft.trim();
    if (t && t !== "/" && !items.includes(t)) onChange([...items, t]);
    adding = false;
  }
  function key(e: KeyboardEvent) {
    // Esc는 이 입력만 닫는다 — 문서·목록 겹침을 닫는 전역 Esc로 번지지 않게
    if (e.key === "Escape") {
      e.stopPropagation();
      adding = false;
    } else if (e.key === "Enter") add();
  }
</script>

<div class="sc {role}" role="group" aria-label="{role === 'plan' ? '계획' : '실행'} 세션 단축 버튼">
  {#each items as t (t)}
    <span class="chip">
      <button class="go" disabled={!!blocked} title={blocked ?? `${role === "plan" ? "계획" : "실행"} 세션 입력창에 ${t}를 채웁니다(Enter는 직접)`} onclick={() => onFill(t)}>{t}</button>
      <button class="del" aria-label="{t} 단축 버튼 삭제" title="삭제" onclick={() => onChange(items.filter((x) => x !== t))}>×</button>
    </span>
  {/each}
  {#if adding}
    <input
      bind:this={input}
      bind:value={draft}
      class="add-in"
      aria-label="추가할 명령어"
      placeholder="/forge:fg-…"
      onkeydown={key}
      onblur={() => (adding = false)}
    />
  {:else}
    <button class="plus" aria-label="단축 버튼 추가" title="단축 버튼 추가" onclick={open}>＋</button>
  {/if}
</div>

<style>
  .sc { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .sc.plan { --c: var(--warn); }
  .sc.run { --c: var(--accent); }
  .chip { position: relative; display: inline-flex; }
  .go { height: 24px; padding: 0 10px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--ink); font: 11px "SF Mono", ui-monospace, Menlo, monospace; cursor: pointer; white-space: nowrap; }
  .go:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 22%, transparent); }
  .go:disabled { opacity: .45; cursor: default; }
  .go:focus-visible, .del:focus-visible, .plus:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  /* 삭제 ×: 버튼에 올리거나 포커스할 때만 */
  .del { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid var(--line); background: var(--raised); color: var(--muted); font-size: 11px; line-height: 1; cursor: pointer; opacity: 0; }
  .chip:hover .del, .chip:focus-within .del { opacity: 1; }
  .del:hover { color: var(--crit); }
  .plus { width: 24px; height: 24px; padding: 0; border-radius: 12px; border: 1px dashed var(--line); background: none; color: var(--muted); cursor: pointer; }
  .plus:hover { color: var(--ink); border-color: var(--ink2); }
  .add-in { height: 24px; width: 16ch; padding: 0 8px; border-radius: 12px; border: 1px solid var(--c); background: var(--plane); color: var(--ink); font: 11px "SF Mono", ui-monospace, Menlo, monospace; outline: none; }
</style>
