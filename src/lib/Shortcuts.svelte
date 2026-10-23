<script lang="ts">
  import { tick } from "svelte";
  import { t as tx } from "./i18n.svelte";

  /** 열 머리판의 단축 버튼 — 누르면 그 세션 입력창에 명령을 채운다(Enter는 사람이). 버튼 이름 = 명령어 그대로.
      ＋로 추가, 버튼에 올리면 나오는 ×로 삭제. */
  let {
    role,
    items,
    blocked,
    onFill,
    onChange,
    commands,
  }: {
    role: "plan" | "run";
    items: string[];
    /** 세션이 작업 중이라 채울 수 없으면 그 이유 */
    blocked: string | null;
    onFill: (text: string) => void;
    onChange: (items: string[]) => void;
    /** 자동완성 후보 — 실제 설치된 슬래시 명령(+ 내장 명령) */
    commands: string[];
  } = $props();

  const MAX = 8;

  let adding = $state(false);
  let draft = $state("");
  let input = $state<HTMLInputElement>();
  /** 강조된 후보 위치 — Enter는 이 후보를 추가한다 */
  let hi = $state(0);
  /** LIKE 검색 — 맨 앞 "/"는 무시. 점수: 0 이름 첫머리(/·:·- 뒤) · 1 중간 포함 · 2 글자 순서만 맞음 · null 불일치 */
  function score(cmd: string, q: string): number | null {
    const c = cmd.toLowerCase();
    if (!q) return 1;
    const i = c.indexOf(q);
    if (i >= 0) return i === 0 || "/:-".includes(c[i - 1]) ? 0 : 1;
    let k = 0;
    for (const ch of c) if (ch === q[k]) k++;
    return k === q.length ? 2 : null;
  }
  let hints = $derived.by(() => {
    const q = draft.trim().toLowerCase().replace(/^\//, "");
    return commands
      .filter((c) => !items.includes(c))
      .map((c) => [c, score(c, q)] as const)
      .filter((x): x is readonly [string, number] => x[1] !== null)
      .sort((a, b) => a[1] - b[1])
      .slice(0, MAX)
      .map(([c]) => c);
  });
  let listId = $derived(`sc-${role}-list`);

  async function open() {
    adding = true;
    draft = "/";
    hi = 0;
    await tick();
    input?.focus();
  }
  function add(t = draft.trim()) {
    if (t && t !== "/" && !items.includes(t)) onChange([...items, t]);
    adding = false;
  }
  function key(e: KeyboardEvent) {
    const h = hints[hi];
    // Esc는 이 입력만 닫는다 — 문서·목록 겹침을 닫는 전역 Esc로 번지지 않게
    if (e.key === "Escape") {
      e.stopPropagation();
      adding = false;
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (hints.length) hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + hints.length) % hints.length;
    } else if (e.key === "Tab" && h) {
      // Tab = 후보를 입력칸에만 채움(뒤에 인자를 붙일 때)
      e.preventDefault();
      draft = h + " ";
    } else if (e.key === "Enter") add(h ?? draft.trim());
  }
</script>

<div class="sc {role}" role="group" aria-label={role === "plan" ? tx("계획 세션 단축 버튼", "Plan session shortcuts") : tx("실행 세션 단축 버튼", "Run session shortcuts")}>
  {#each items as t (t)}
    <span class="chip">
      <button class="go" disabled={!!blocked} title={blocked ?? tx(`${role === "plan" ? "계획" : "실행"} 세션 입력창에 ${t}를 채웁니다(Enter는 직접)`, `Fills ${t} into the ${role === "plan" ? "plan" : "run"} session input (press Enter yourself)`)} onclick={() => onFill(t)}>{t}</button>
      <button class="del" aria-label={tx(`${t} 단축 버튼 삭제`, `Delete shortcut ${t}`)} title={tx("삭제", "Delete")} onclick={() => onChange(items.filter((x) => x !== t))}>×</button>
    </span>
  {/each}
  {#if adding}
    <span class="addwrap">
      <input
        bind:this={input}
        bind:value={draft}
        class="add-in"
        role="combobox"
        aria-label={tx("추가할 명령어", "Command to add")}
        aria-expanded={hints.length > 0}
        aria-controls={listId}
        aria-activedescendant={hints[hi] ? `${listId}-${hi}` : undefined}
        autocomplete="off"
        spellcheck="false"
        placeholder="/forge:fg-…"
        onkeydown={key}
        oninput={() => (hi = 0)}
        onblur={() => (adding = false)}
      />
      {#if hints.length}
        <ul class="hints" role="listbox" id={listId} aria-label={tx("명령어 후보", "Command suggestions")}>
          {#each hints as h, i (h)}
            <!-- mousedown에서 막아야 입력칸 blur(닫힘)보다 먼저 고를 수 있다 -->
            <li
              id="{listId}-{i}"
              role="option"
              aria-selected={i === hi}
              class:on={i === hi}
              onmousedown={(e) => { e.preventDefault(); add(h); }}
              onmouseenter={() => (hi = i)}
            >{h}</li>
          {/each}
        </ul>
      {/if}
    </span>
  {:else}
    <button class="plus" aria-label={tx("단축 버튼 추가", "Add shortcut")} title={tx("단축 버튼 추가", "Add shortcut")} onclick={open}>＋</button>
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
  .addwrap { position: relative; }
  .hints { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; min-width: 24ch; max-height: 240px; overflow-y: auto; margin: 0; padding: 4px; list-style: none;
    background: var(--raised); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .5); }
  .hints li { padding: 4px 8px; border-radius: 4px; font: 11px "SF Mono", ui-monospace, Menlo, monospace; color: var(--ink2); cursor: pointer; white-space: nowrap; }
  .hints li.on { background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--ink); }
  .add-in { height: 24px; width: 16ch; padding: 0 8px; border-radius: 12px; border: 1px solid var(--c); background: var(--plane); color: var(--ink); font: 11px "SF Mono", ui-monospace, Menlo, monospace; outline: none; }
</style>
