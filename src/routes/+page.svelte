<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { marked } from "marked";
  import { onMount } from "svelte";
  import Board from "$lib/Board.svelte";
  import type { Snapshot, DocTab } from "$lib/types";

  const SELECTED_KEY = "anvil.selected";

  let projects = $state<Snapshot[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let selected = $state<string | null>(null);
  let tabs = $state<DocTab[]>([]);
  /** null = 보드 탭 */
  let activeTab = $state<number | null>(null);
  let docHtml = $state("");
  let docError = $state("");

  let current = $derived(projects.find((p) => p.path === selected) ?? projects[0] ?? null);
  let currentTab = $derived(activeTab === null ? null : tabs[activeTab] ?? null);

  function remember(path: string | null) {
    try {
      if (path) localStorage.setItem(SELECTED_KEY, path);
    } catch {}
  }

  onMount(() => {
    try {
      selected = localStorage.getItem(SELECTED_KEY);
    } catch {}
    invoke<Snapshot[]>("list_projects")
      .then((list) => (projects = list))
      .catch((e) => (loadError = String(e)))
      .finally(() => (loading = false));
    const unlisten = listen<Snapshot>("snapshot", (e) => {
      const i = projects.findIndex((p) => p.path === e.payload.path);
      if (i >= 0) projects[i] = e.payload;
      if (currentTab?.project === e.payload.path) loadDoc(currentTab);
    });
    return () => {
      unlisten.then((f) => f());
    };
  });

  async function addProject() {
    const dir = await open({ directory: true, multiple: false, title: "프로젝트 폴더 고르기" });
    if (typeof dir !== "string") return;
    try {
      projects = await invoke<Snapshot[]>("add_project", { path: dir });
      selectProject(dir);
    } catch (e) {
      loadError = String(e);
    }
  }

  async function removeProject(path: string) {
    projects = await invoke<Snapshot[]>("remove_project", { path });
    tabs = tabs.filter((t) => t.project !== path);
    activeTab = null;
  }

  function selectProject(path: string) {
    selected = path;
    remember(path);
    activeTab = null;
  }

  async function loadDoc(tab: DocTab) {
    try {
      const text = await invoke<string>("read_doc", { project: tab.project, rel: tab.rel });
      docHtml = await marked.parse(text);
      docError = "";
    } catch (e) {
      docHtml = "";
      docError = String(e);
    }
  }

  function openDoc(rel: string, label: string) {
    if (!current) return;
    let i = tabs.findIndex((t) => t.project === current!.path && t.rel === rel);
    if (i < 0) {
      tabs.push({ project: current.path, rel, label: `${current.name} · ${label}` });
      i = tabs.length - 1;
    }
    showTab(i);
  }

  function showTab(i: number | null) {
    activeTab = i;
    if (i !== null) loadDoc(tabs[i]);
  }

  function closeTab(i: number) {
    tabs.splice(i, 1);
    if (activeTab === null) return;
    if (activeTab === i) showTab(tabs.length ? Math.min(i, tabs.length - 1) : null);
    else if (activeTab > i) activeTab -= 1;
  }
</script>

<div class="app">
  <aside class="side">
    <div class="hd"><span class="t3 b caps">프로젝트</span><span class="t3">{projects.length}</span></div>
    {#if loading}
      <div class="skels"><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div><div class="skel" style="width:70%"></div></div>
    {/if}
    {#each projects as p (p.path)}
      <div class="proj" class:on={current?.path === p.path}>
        <button class="pick" onclick={() => selectProject(p.path)} title={p.path}>
          <div class:b={current?.path === p.path} class="nm">{p.name}</div>
          <div class="t3 nm">{p.root.branch ? `${p.root.branch} · ` : ""}{p.headline}</div>
        </button>
        <button class="x" title="등록 해제(폴더는 그대로)" aria-label="{p.name} 등록 해제" onclick={() => removeProject(p.path)}>×</button>
      </div>
    {/each}
    <button class="add t3" onclick={addProject}>＋ 프로젝트 추가</button>
  </aside>

  <section class="main">
    {#if tabs.length}
      <nav class="tabs">
        <button class="tab" class:on={activeTab === null} onclick={() => showTab(null)}>보드</button>
        {#each tabs as t, i (t.project + t.rel)}
          <span class="tab" class:on={activeTab === i}>
            <button class="tl" onclick={() => showTab(i)} title={t.rel}>{t.label}</button>
            <button class="x" aria-label="탭 닫기" onclick={() => closeTab(i)}>×</button>
          </span>
        {/each}
      </nav>
    {/if}

    {#if currentTab}
      <article class="doc">
        <div class="t3">{currentTab.rel}</div>
        {#if docError}
          <div class="error"><span class="b">✕ 읽기 실패</span> — {docError}</div>
        {:else}
          <div class="md">{@html docHtml}</div>
        {/if}
      </article>
    {:else if loading}
      <div class="center"><div class="skels wide"><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div></div></div>
    {:else if loadError}
      <div class="center"><div class="error"><span class="b">✕ 불러오기 실패</span> — {loadError}</div></div>
    {:else if current}
      {#key current.path}<Board snap={current} onOpen={openDoc} />{/key}
    {:else}
      <div class="center">
        <div class="welcome">
          <span class="t1">등록한 프로젝트가 없습니다</span>
          <div class="ink2">forge를 쓰는 프로젝트 폴더를 추가하면 그 프로젝트의 .forge 상태가 보드로 보입니다.</div>
          <button class="btn" onclick={addProject}>＋ 프로젝트 추가</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .app { display: flex; height: 100vh; min-width: 960px; }
  .side { width: 208px; flex: none; background: var(--surface); border-right: 1px solid var(--line2); padding: 16px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
  .hd { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 8px; }
  .caps { letter-spacing: .04em; }
  .proj { display: flex; align-items: center; border-radius: 6px; }
  .proj.on { background: var(--accent-wash); }
  .pick { flex: 1; min-width: 0; padding: 8px; background: none; border: 0; text-align: left; cursor: pointer; min-height: 44px; }
  .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { width: 24px; height: 24px; border: 0; background: none; color: var(--muted); border-radius: 4px; cursor: pointer; opacity: 0; }
  .proj:hover .x, .proj:focus-within .x, .tab .x { opacity: 1; }
  .x:hover { background: var(--line2); color: var(--ink); }
  .add { margin-top: auto; padding: 8px; background: none; border: 0; text-align: left; cursor: pointer; min-height: 44px; }
  .add:hover { color: var(--ink); }
  .skels { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .skels.wide { width: 360px; }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tabs { display: flex; gap: 4px; padding: 8px 24px 0; border-bottom: 1px solid var(--line2); overflow-x: auto; flex: none; }
  .tab { display: inline-flex; align-items: center; height: 32px; padding: 0 8px; border: 0; border-radius: 6px 6px 0 0; background: none; color: var(--ink2); cursor: pointer; white-space: nowrap; }
  .tab.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent); }
  .tl { background: none; border: 0; padding: 0 4px; cursor: pointer; max-width: 32ch; overflow: hidden; text-overflow: ellipsis; color: inherit; font-weight: inherit; }
  .doc { flex: 1; overflow-y: auto; padding: 16px 24px 48px; }
  .md { max-width: 75ch; }
  .md :global(pre) { background: var(--surface); border: 1px solid var(--line2); border-radius: 6px; padding: 8px 12px; overflow-x: auto; }
  .md :global(table) { border-collapse: collapse; }
  .md :global(th), .md :global(td) { border: 1px solid var(--line); padding: 4px 8px; }
  .md :global(h1) { font-size: 15px; }
  .md :global(h2), .md :global(h3) { font-size: 13px; }
  .md :global(a) { color: var(--accent); }
  .center { flex: 1; display: grid; place-items: center; padding: 24px; }
  .welcome { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: 48ch; }
  .ink2 { color: var(--ink2); }
  .error { padding: 8px 12px; border-radius: 6px; background: var(--surface); border-left: 3px solid var(--crit); }
</style>
