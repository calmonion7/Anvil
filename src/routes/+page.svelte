<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { marked } from "marked";
  import { onMount } from "svelte";
  import NowStrip from "$lib/NowStrip.svelte";
  import Shortcuts from "$lib/Shortcuts.svelte";
  import FlowBoard from "$lib/FlowBoard.svelte";
  import FlowLinks, { type FlowPulses } from "$lib/FlowLinks.svelte";
  import ListPopup, { type ListKind } from "$lib/ListPopup.svelte";
  import SessionPane from "$lib/SessionPane.svelte";
  import { t, i18n, setLang, initLang, type LangChoice } from "$lib/i18n.svelte";
  import { roleLabel, stateLabel, pipClass, linkedTask } from "$lib/sessions";
  import type { Snapshot, DocTab, SessionState, Role, BoardActions, SessionTitle, ModelInfo } from "$lib/types";

  const SELECTED_KEY = "anvil.selected";
  /** 세로 경계 위치와 프로젝트 영역 접힘 — 앱 전체 설정 */
  const LAYOUT_KEY = "anvil.layout";
  /** 열 머리판 단축 버튼(명령어 목록) — 앱 전체 설정 */
  const SHORTCUT_KEY = "anvil.shortcuts";
  const DEFAULT_SHORTCUTS: Record<Role, string[]> = { plan: ["/forge:fg-ask"], run: ["/forge:fg-next"] };
  /** Claude 내장 명령 — 파일이 없어 백엔드가 못 읽으니 자동완성 후보에 덧붙인다 */
  const BUILTIN_COMMANDS = ["/clear", "/compact", "/context", "/model", "/resume"];
  const ROLES: Role[] = ["plan", "run"];

  let projects = $state<Snapshot[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let selected = $state<string | null>(null);
  let tabs = $state<DocTab[]>([]);
  /** null = 문서 오버레이 닫힘 */
  let activeTab = $state<number | null>(null);
  let docHtml = $state("");
  let docError = $state("");
  /** 프로젝트 경로 → [계획 세션 이름, 실행 세션 이름] */
  let names = $state<Record<string, [string, string]>>({});
  /** 프로젝트 경로 → 계획·실행 세션의 [claude 이름, 띄울 때 모델] */
  let titles = $state<Record<string, [SessionTitle, SessionTitle]>>({});
  /** tmux 세션 이름 → 상태 */
  let sessions = $state<Record<string, SessionState>>({});
  /** tmux 세션 이름 → 상태줄 래퍼가 남긴 실제 모델·effort */
  let models = $state<Record<string, ModelInfo>>({});
  /** 계획↔실행(세로 경계) 비율 · 프로젝트 영역을 레일로 접음 */
  let split = $state(0.5);
  /** 접기 전 비율 — 레일을 누르면 여기로 돌아간다 */
  let unfoldTo = $state(0.5);
  let folded = $derived<Role | null>(split === 0 ? "plan" : split === 1 ? "run" : null);
  function unfold() {
    split = unfoldTo;
    saveLayout({ split });
  }
  /** 머리줄 레이아웃 버튼 — 0 = 계획 접기(실행만) · 0.5 = 반반 · 1 = 실행 접기(계획만) */
  function setLayout(v: number) {
    if (split > 0 && split < 1) unfoldTo = split;
    if (v === 0.5) unfoldTo = 0.5;
    split = v;
    saveLayout({ split, unfoldTo });
  }
  const LAYOUTS = $derived([
    { v: 0, label: t("계획 접기 · 실행창만", "Collapse plan · run only") },
    { v: 0.5, label: t("가운데 · 계획·실행 반반", "Center · plan/run split") },
    { v: 1, label: t("실행 접기 · 계획창만", "Collapse run · plan only") },
  ]);
  let rail = $state(false);
  let shortcuts = $state<Record<Role, string[]>>(loadShortcuts());
  function loadShortcuts(): Record<Role, string[]> {
    try {
      const v = JSON.parse(localStorage.getItem(SHORTCUT_KEY) ?? "null");
      if (Array.isArray(v?.plan) && Array.isArray(v?.run)) return v;
    } catch {}
    return structuredClone(DEFAULT_SHORTCUTS);
  }
  function setShortcuts(r: Role, items: string[]) {
    shortcuts[r] = items;
    try {
      localStorage.setItem(SHORTCUT_KEY, JSON.stringify(shortcuts));
    } catch {}
  }
  /** 건수 칩이 연 목록 팝업 */
  let listOpen = $state<ListKind | null>(null);
  /** 보드 버튼이 명령을 채운 세션과 초점 요청 횟수 */
  let focus = $state<{ name: string; tick: number }>({ name: "", tick: 0 });
  let fillError = $state("");
  let newVersion = $state<string | null>(null);
  let updating = $state(false);
  let updateError = $state("");
  // 준비물(tmux · claude CLI · forge) — 빠졌으면 띠, macOS는 [설치]
  type DepsStatus = { needs: string[]; message: string | null; installable: boolean };
  let deps = $state<DepsStatus | null>(null);
  let depsInstalling = $state(false);
  let depsError = $state("");
  let needLogin = $state(false);
  const checkDeps = () =>
    invoke<DepsStatus>("deps_status")
      .then((d) => (deps = d))
      .catch(() => {});
  async function installDeps() {
    depsInstalling = true;
    depsError = "";
    const hadClaude = !deps?.needs.includes("claude");
    try {
      await invoke("deps_install");
      if (!hadClaude) needLogin = true;
    } catch (e) {
      depsError = String(e);
    }
    depsInstalling = false;
    checkDeps();
  }
  // 설정 > 역할별 모델 — 새로 여는 세션부터 적용
  const MODEL_CHOICES = $derived([
    ["default", t("claude 기본값", "claude default")],
    ["opus", "opus"],
    ["sonnet", "sonnet"],
    ["haiku", "haiku"],
  ] as const);
  let settingsOpen = $state(false);
  let settingsError = $state("");
  let modelSettings = $state<Record<string, string>>({});
  async function openSettings() {
    settingsOpen = true;
    settingsError = "";
    try {
      modelSettings = await invoke("model_settings");
    } catch (e) {
      settingsError = String(e);
    }
  }
  async function saveModel(role: string, model: string) {
    settingsError = "";
    try {
      await invoke("set_model_setting", { role, model });
      modelSettings[role] = model;
      const i = role === "plan" ? 0 : 1;
      for (const t of Object.values(titles)) t[i][1] = model;
    } catch (e) {
      settingsError = String(e);
    }
  }
  // forge 플러그인: 새 버전 [업데이트] · Anvil이 확인한 것보다 새 버전이면 경고
  type ForgePlugin = { installed: string | null; latest: string | null; update_available: boolean; untested: boolean };
  let forgePlugin = $state<ForgePlugin | null>(null);
  let forgeUpdating = $state(false);
  let forgeUpdateMsg = $state("");
  const checkForgePlugin = () =>
    invoke<ForgePlugin | null>("forge_plugin_status")
      .then((f) => (forgePlugin = f))
      .catch(() => {});
  async function updateForgePlugin() {
    forgeUpdating = true;
    try {
      await invoke("forge_plugin_update");
      forgeUpdateMsg = t("업데이트됨 — 열린 claude 세션은 다시 시작해야 적용됩니다", "Updated — restart open claude sessions to apply");
    } catch (e) {
      forgeUpdateMsg = String(e);
    }
    forgeUpdating = false;
    checkForgePlugin();
  }
  /** 보드 버튼이 마지막으로 채운 명령 — 흐름도 로그·터미널 유입 띠 펄스용 */
  /** 관별 펄스 횟수 — FlowBoard가 올리고 FlowLinks가 그린다 */
  let outPulses = $state<FlowPulses>({ pOut: 0, rOut: 0, loop: 0, e2: 0, e4: 0 });
  let mainEl = $state<HTMLElement>();
  let lastFill = $state<{ role: Role; text: string; n: number }>({ role: "run", text: "", n: 0 });
  /** 숨긴 후속후보(앱 데이터 hidden-followups.json) */
  let hiddenItems = $state<{ project: string; source: string; text: string }[]>([]);

  let current = $derived(projects.find((p) => p.path === selected) ?? projects[0] ?? null);
  /** 프로젝트 경로 → 설치된 슬래시 명령. 프로젝트마다 처음 한 번만 읽는다. */
  let slashCache = $state<Record<string, string[]>>({});
  $effect(() => {
    const p = current?.path;
    if (!p || p in slashCache) return;
    slashCache[p] = [];
    invoke<string[]>("slash_commands", { project: p })
      .then((list) => (slashCache[p] = list))
      .catch(() => {});
  });
  let commands = $derived([...BUILTIN_COMMANDS, ...(current ? slashCache[current.path] ?? [] : [])]);
  let currentTab = $derived(activeTab === null ? null : tabs[activeTab] ?? null);

  function sessionOf(path: string, role: Role): SessionState | null {
    const n = names[path]?.[role === "plan" ? 0 : 1];
    return n ? sessions[n] ?? null : null;
  }

  /** 대상 세션이 작업 중이면 버튼을 끄고 이유를 보인다. 입력 대기여도 대화 중간일 수 있어 채우기만 한다. */
  let runBlocked = $derived.by(() => {
    if (!current) return null;
    const s = sessionOf(current.path, "run");
    if (!s?.alive || s.state !== "working") return null;
    const task = linkedTask(current, s);
    return task ? t(`${task} 실행 중`, `Running ${task}`) : t("실행 세션 작업 중", "Run session busy");
  });
  let planBlocked = $derived.by(() => {
    if (!current) return null;
    const s = sessionOf(current.path, "plan");
    return s?.alive && s.state === "working" ? t("계획 세션 작업 중", "Plan session busy") : null;
  });
  let hiddenSet = $derived(
    new Set(hiddenItems.filter((h) => h.project === current?.path).map((h) => `${h.source}\n${h.text}`)),
  );
  let followupCount = $derived(
    current ? current.followups.filter((f) => !hiddenSet.has(`${f.sourcePath}\n${f.text}`)).length : 0,
  );

  async function fill(role: Role, text: string) {
    if (!current) return;
    fillError = "";
    try {
      const name = await invoke<string>("session_fill", { project: current.path, role, text });
      sessions = await invoke<Record<string, SessionState>>("session_states");
      focus = { name, tick: focus.tick + 1 };
      lastFill = { role, text, n: lastFill.n + 1 };
    } catch (e) {
      fillError = String(e);
    }
  }

  const actions: BoardActions = {
    run: (p) => fill("run", p.task == null ? "/forge:fg-run" : `/forge:fg-run #${p.task}`),
    start: (f) => fill("plan", t(`/forge:fg-ask ${f.text} (출처: ${f.sourceSlug})`, `/forge:fg-ask ${f.text} (source: ${f.sourceSlug})`)),
    setHidden: async (f, hidden) => {
      if (!current) return;
      hiddenItems = await invoke("set_followup_hidden", {
        item: { project: current.path, source: f.sourcePath, text: f.text },
        hidden,
      });
    },
  };

  /** 다른 프로젝트에서 입력을 기다리는 세션(상태줄 🔔) */
  let waitingElsewhere = $derived(
    projects.flatMap((p) =>
      p.path === current?.path
        ? []
        : ROLES.filter((r) => {
            const s = sessionOf(p.path, r);
            return s?.alive && s.state === "waiting";
          }).map((r) => t(`${p.name} ${roleLabel[r]} 세션`, `${p.name} ${roleLabel[r]} session`)),
    ),
  );

  function remember(path: string | null) {
    try {
      if (path) localStorage.setItem(SELECTED_KEY, path);
    } catch {}
  }

  /** 바꾼 값만 저장한다 — 접기만 해도 경계 위치가 굳으면 기본값이 바뀌어도 따라가지 않는다. */
  function saveLayout(patch: { split?: number; unfoldTo?: number; rail?: boolean }) {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...v, ...patch }));
    } catch {}
  }

  function loadLayout() {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
      if (typeof v.split === "number") split = v.split;
      if (typeof v.unfoldTo === "number") unfoldTo = v.unfoldTo;
      if (typeof v.rail === "boolean") rail = v.rail;
    } catch {}
  }

  async function loadNames(list: Snapshot[]) {
    for (const p of list) {
      if (!names[p.path]) names[p.path] = await invoke<[string, string]>("session_names", { project: p.path });
      if (!titles[p.path]) titles[p.path] = await invoke<[SessionTitle, SessionTitle]>("session_titles", { project: p.path });
    }
  }

  const notify = (body: string) => invoke("notify", { body });

  /** 입력 대기로 바뀐 세션을 알린다. 지금 보고 있는 프로젝트의 세션은 알리지 않는다. */
  function onSessions(next: Record<string, SessionState>) {
    for (const [name, s] of Object.entries(next)) {
      if (!s.alive || s.state !== "waiting" || sessions[name]?.state === "waiting") continue;
      const owner = projects.find((p) => names[p.path]?.includes(name));
      if (!owner) continue;
      if (owner.path === current?.path && document.hasFocus()) continue;
      const role: Role = names[owner.path][0] === name ? "plan" : "run";
      notify(t(`${owner.name} ${roleLabel[role]} 세션 · 입력 대기 — ${owner.headline}`, `${owner.name} ${roleLabel[role]} session · waiting for input — ${owner.headline}`));
    }
    sessions = next;
  }

  onMount(() => {
    try {
      selected = localStorage.getItem(SELECTED_KEY);
    } catch {}
    loadLayout();
    // 백엔드 문구(요약 · 경고)가 화면 언어로 나오도록 언어를 먼저 알린 뒤 불러온다
    initLang()
      .then(() => invoke<Snapshot[]>("list_projects"))
      .then(async (list) => {
        projects = list;
        await loadNames(list);
        sessions = await invoke<Record<string, SessionState>>("session_states");
        models = await invoke<Record<string, ModelInfo>>("session_models");
        hiddenItems = await invoke("hidden_followups");
      })
      .catch((e) => (loadError = String(e)))
      .finally(() => (loading = false));
    const unSnap = listen<Snapshot>("snapshot", (e) => {
      const i = projects.findIndex((p) => p.path === e.payload.path);
      if (i >= 0) projects[i] = e.payload;
      if (currentTab?.project === e.payload.path) loadDoc(currentTab);
    });
    const unSess = listen<Record<string, SessionState>>("sessions", (e) => onSessions(e.payload));
    const unModels = listen<Record<string, ModelInfo>>("models", (e) => (models = e.payload));
    // 훅이 못 남기는 변화(claude가 아닌 이유로 tmux 세션이 사라짐)도 따라가도록 가끔 다시 읽는다.
    const poll = setInterval(async () => {
      onSessions(await invoke("session_states"));
      models = await invoke("session_models");
    }, 5000);
    // 배포판 업데이트: 시작 때와 24시간마다 확인한다(로컬 폴링 설치본은 백엔드가 None을 준다).
    const checkUpdate = () =>
      invoke<string | null>("updater_check")
        .then((v) => (newVersion = v))
        .catch(() => {});
    checkUpdate();
    checkDeps();
    checkForgePlugin();
    const updatePoll = setInterval(checkUpdate, 24 * 60 * 60 * 1000);
    return () => {
      unSnap.then((f) => f());
      unSess.then((f) => f());
      unModels.then((f) => f());
      clearInterval(poll);
      clearInterval(updatePoll);
    };
  });

  async function addProject() {
    const dir = await open({ directory: true, multiple: false, title: t("프로젝트 폴더 고르기", "Choose project folder") });
    if (typeof dir !== "string") return;
    try {
      projects = await invoke<Snapshot[]>("add_project", { path: dir });
      await loadNames(projects);
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
    listOpen = null;
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

  /** 계획↔실행(세로 경계) 끌기 — 본문 격자(.body) 기준 비율 */
  /** 경계를 가장자리 이만큼 안에서 놓으면 그쪽 열을 레일로 접는다(0 = 계획 접힘 → 실행만, 1 = 실행 접힘 → 계획만) */
  const FOLD_SNAP = 0.12;

  function drag(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const body = el.parentElement!;
    if (split > 0 && split < 1) unfoldTo = split;
    const move = (ev: PointerEvent) => {
      const r = body.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      split = x < FOLD_SNAP ? 0 : x > 1 - FOLD_SNAP ? 1 : Math.min(Math.max(x, 0.2), 0.8);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      saveLayout({ split, unfoldTo });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  /** Esc는 맨 위 겹침 하나만 닫는다 — 문서가 목록 팝업 위에 있으면 문서만 닫고 목록으로 돌아간다. */
  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (activeTab !== null) showTab(null);
    else if (listOpen) listOpen = null;
    else return;
    e.preventDefault();
  }

  function toggleRail() {
    rail = !rail;
    saveLayout({ rail });
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <aside class="side" class:rail>
    <div class="hd">
      {#if !rail}<span class="t3 b caps">{t("프로젝트", "Projects")}</span><span class="t3">{projects.length}</span>{/if}
      <button class="fold" onclick={toggleRail} aria-label={rail ? t("프로젝트 목록 펼치기", "Expand project list") : t("프로젝트 목록 접기", "Collapse project list")} title={rail ? t("펼치기", "Expand") : t("접기", "Collapse")}>{rail ? "»" : "«"}</button>
    </div>
    {#if loading}
      <div class="skels"><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div><div class="skel" style="width:70%"></div></div>
    {/if}
    {#each projects as p (p.path)}
      <div class="proj" class:on={current?.path === p.path}>
        <button class="pick" onclick={() => selectProject(p.path)} title={rail ? p.name : p.path} aria-label={rail ? p.name : undefined}>
          {#if rail}
            <span class:b={current?.path === p.path}>{[...p.name].slice(0, 2).join("")}</span>
          {:else}
            <div class:b={current?.path === p.path} class="nm">{p.name}</div>
            <div class="t3 nm">{p.root.branch ? `${p.root.branch} · ` : ""}{p.headline}</div>
          {/if}
        </button>
        <span class="sd">
          {#each ROLES as r (r)}
            {@const s = sessionOf(p.path, r)}
            {#if s?.alive}<span class="pip {pipClass(s)}" title="{roleLabel[r]}: {stateLabel(s)}"></span>{/if}
          {/each}
        </span>
        {#if !rail}
          <button class="x" title={t("등록 해제(폴더는 그대로)", "Unregister (folder is kept)")} aria-label={t(`${p.name} 등록 해제`, `Unregister ${p.name}`)} onclick={() => removeProject(p.path)}>×</button>
        {/if}
      </div>
    {/each}
    {#if rail}
      <button class="add icon t3" onclick={addProject} aria-label={t("프로젝트 추가", "Add project")} title={t("프로젝트 추가", "Add project")}>＋</button>
      <button class="add icon t3 set" onclick={() => { toggleRail(); openSettings(); }} aria-label={t("설정", "Settings")} title={t("설정", "Settings")}>⚙</button>
    {:else}
      <button class="add t3" onclick={addProject}>＋ {t("프로젝트 추가", "Add project")}</button>
      <button class="add t3 set" aria-expanded={settingsOpen} onclick={() => (settingsOpen ? (settingsOpen = false) : openSettings())}>⚙ {t("설정", "Settings")}</button>
      {#if settingsOpen}
        <div class="settings">
          {#each [["plan", t("계획 세션 모델", "Plan session model")], ["run", t("실행 세션 모델", "Run session model")]] as [role, label] (role)}
            <label class="t3">
              {label}
              <select value={modelSettings[role]} onchange={(e) => saveModel(role, e.currentTarget.value)}>
                {#each MODEL_CHOICES as [v, l] (v)}<option value={v}>{l}</option>{/each}
              </select>
            </label>
          {/each}
          <label class="t3">
            {t("언어", "Language")}
            <select value={i18n.choice} onchange={(e) =>
                setLang(e.currentTarget.value as LangChoice)
                  .then(() => invoke<Snapshot[]>("list_projects"))
                  .then((list) => (projects = list))
                  .then(checkDeps)
                  .catch(() => {})}>
              <option value="auto">{t("자동(시스템 언어)", "Auto (system)")}</option>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <span class="t3">{settingsError || t("새로 여는 세션부터 적용됩니다", "Applies to newly opened sessions")}</span>
        </div>
      {/if}
    {/if}
  </aside>

  <section class="main" bind:this={mainEl}>
    {#if loading}
      <div class="center"><div class="skels wide"><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div></div></div>
    {:else if loadError}
      <div class="center"><div class="error"><span class="b">✕ {t("불러오기 실패", "Failed to load")}</span> — {loadError}</div></div>
    {:else if current}
      <header class="head">
        <span class="t1">{current.name}</span>
        <span class="chip">⎇ {current.root.branch ?? t("브랜치 없음", "No branch")} · {current.root.rel}/</span>
        {#if current.root.warning}<span class="chip warn">{current.root.warning}</span>{/if}
        <span class="sp"></span>
        <div class="seg" role="group" aria-label={t("터미널 배치", "Terminal layout")}>
          {#each LAYOUTS as l (l.v)}
            <button
              class="segb"
              class:on={l.v === 0.5 ? folded === null : split === l.v}
              aria-label={l.label}
              title={l.label}
              onclick={() => setLayout(l.v)}
            >
              <!-- 레이아웃 모양 그림: 접힌 쪽은 좁은 막대 -->
              <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
                <rect x=".75" y=".75" width="16.5" height="10.5" rx="2" />
                {#if l.v === 0}<rect class="fill" x="1.5" y="1.5" width="3" height="9" rx="1" /><line x1="5.5" y1="1" x2="5.5" y2="11" />
                {:else if l.v === 1}<rect class="fill" x="13.5" y="1.5" width="3" height="9" rx="1" /><line x1="12.5" y1="1" x2="12.5" y2="11" />
                {:else}<line x1="9" y1="1" x2="9" y2="11" />{/if}
              </svg>
            </button>
          {/each}
        </div>
      </header>
      {#each current.errors as err (err.path)}
        <div class="band">
          <span class="b"><span class="crit">✕</span> {t("읽기 실패", "Read failed")}</span>
          <span class="ink2">{err.path} — {err.message}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => openDoc(err.path, err.path.split("/").pop() ?? err.path)}>{t("파일 열기", "Open file")}</button>
        </div>
      {/each}
      {#if deps?.message}
        <div class="band">
          <span class="b"><span class="crit">✕</span> {t("준비물이 빠졌습니다", "Missing prerequisites")}</span>
          <span class="ink2">{depsError || deps.message}</span>
          <span class="sp"></span>
          {#if deps.installable}
            <button class="btn sm" disabled={depsInstalling} onclick={installDeps}>
              {depsInstalling ? t("설치 중…", "Installing…") : depsError ? t("다시 시도", "Retry") : t("설치", "Install")}
            </button>
          {/if}
        </div>
      {/if}
      {#if forgePlugin?.update_available || forgeUpdateMsg}
        <div class="band">
          <span class="b">forge {forgePlugin?.latest ?? ""} {t("사용 가능", "available")}</span>
          <span class="ink2">{forgeUpdateMsg || t(`설치됨 ${forgePlugin?.installed} · 프로젝트별로 따로 설치한 forge는 그대로입니다`, `Installed ${forgePlugin?.installed} · per-project forge installs are left as is`)}</span>
          <span class="sp"></span>
          {#if forgeUpdateMsg}
            <button class="btn sm" onclick={() => (forgeUpdateMsg = "")}>{t("닫기", "Close")}</button>
          {:else}
            <button class="btn sm" disabled={forgeUpdating} onclick={updateForgePlugin}>{forgeUpdating ? t("업데이트 중…", "Updating…") : t("업데이트", "Update")}</button>
          {/if}
        </div>
      {/if}
      {#if forgePlugin?.untested}
        <div class="band">
          <span class="b">forge {forgePlugin.installed}</span>
          <span class="ink2">{t("Anvil이 확인한 forge(0.9.x)보다 새 버전이라 보드가 정확하지 않을 수 있습니다", "Newer than the forge version Anvil was tested with (0.9.x); the board may be inaccurate")}</span>
        </div>
      {/if}
      {#if needLogin}
        <div class="band">
          <span class="b">{t("claude CLI 설치됨", "claude CLI installed")}</span><span class="ink2">{t("터미널에서 한 번 로그인해야 세션을 쓸 수 있습니다", "Log in once in a terminal to use sessions")}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => invoke("deps_login").then(() => (needLogin = false)).catch((e) => (depsError = String(e)))}>{t("로그인", "Log in")}</button>
        </div>
      {/if}
      {#if newVersion}
        <div class="band">
          {#if updateError}
            <span class="b"><span class="crit">✕</span> {t("업데이트 실패", "Update failed")}</span><span class="ink2">{updateError}</span>
          {:else}
            <span class="b">{t("새 버전 준비됨", "New version ready")}</span><span class="ink2">v{newVersion}</span>
          {/if}
          <span class="sp"></span>
          <button
            class="btn sm"
            disabled={updating}
            onclick={() => {
              updating = true;
              updateError = "";
              invoke("updater_install").catch((e) => {
                updating = false;
                updateError = String(e);
              });
            }}>{updating ? t("업데이트 중…", "Updating…") : updateError ? t("다시 시도", "Retry") : t("업데이트·재시작", "Update & restart")}</button>
        </div>
      {/if}
      {#if fillError}
        <div class="band">
          <span class="b">✕ {t("명령을 채우지 못했습니다", "Could not fill the command")}</span><span class="ink2">{fillError}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => (fillError = "")}>{t("닫기", "Close")}</button>
        </div>
      {/if}
      {#if tabs.length}
        <nav class="tabs">
          <button class="tab" class:on={activeTab === null} onclick={() => showTab(null)}>{t("보드", "Board")}</button>
          {#each tabs as tab, i (tab.project + tab.rel)}
            <span class="tab" class:on={activeTab === i}>
              <button class="tl" onclick={() => showTab(i)} title={tab.rel}>{tab.label}</button>
              <button class="x" aria-label={t("탭 닫기", "Close tab")} onclick={() => closeTab(i)}>×</button>
            </span>
          {/each}
        </nav>
      {/if}

      <!-- 위쪽 고정 띠(내용 높이) 아래 전부 터미널. 목록 팝업·문서는 터미널 영역 위에 겹친다(문서가 맨 위). -->
      {#key current.path}
        <FlowBoard snap={current} plan={sessionOf(current.path, "plan")} run={sessionOf(current.path, "run")} onList={(k) => (listOpen = k)} {followupCount} bind:out={outPulses} />
      {/key}
      <FlowLinks
        root={mainEl}
        planWorking={sessionOf(current.path, "plan")?.state === "working" && !!sessionOf(current.path, "plan")?.alive}
        runWorking={sessionOf(current.path, "run")?.state === "working" && !!sessionOf(current.path, "run")?.alive}
        pulses={outPulses}
        deps={[current.path, split, rail, current.active?.task, listOpen]}
        {folded}
      />
      <div class="body" style="grid-template-columns: {folded === 'plan' ? '36px 6px minmax(0, 1fr)' : folded === 'run' ? 'minmax(0, 1fr) 6px 36px' : `minmax(0, ${split}fr) 6px minmax(0, ${1 - split}fr)`}">
        <div class="vsplit" role="separator" aria-orientation="vertical" aria-label={t("계획·실행 폭 조절", "Resize plan/run")} onpointerdown={drag}></div>
        {#if names[current.path]}
          {#each ROLES as r, i (r)}
            {@const s = sessionOf(current.path, r)}
            {@const n = names[current.path][i]}
            <!-- 열 머리: 계획 = 최근 쌓은 계획, 실행 = 지금 처리 중인 작업 → 계획·실행을 나란히 본다.
                 같은 grid 행이라 높이가 같이 맞춰져 아래 터미널 머리줄이 나란하다. -->
            {#if folded === r}
              <!-- 접힌 열 = 세로 레일. 흐름도의 관은 여기로 꽂히고, 누르면 펼친다(터미널은 숨기기만 해 연결 유지) -->
              <button class="foldrail info-{r} foldrail-{r}" onclick={unfold} aria-label={t(`${roleLabel[r]} 세션 펼치기`, `Expand ${roleLabel[r]} session`)} title={t(`${roleLabel[r]} 세션 펼치기`, `Expand ${roleLabel[r]} session`)}>
                {#if s?.alive}<span class="pip {pipClass(s)}"></span>{/if}
                <span class="vt">{t(`${roleLabel[r]} 세션`, `${roleLabel[r]} session`)} · {stateLabel(s)}</span>
              </button>
            {:else}
            <div class="info info-{r}">
                {#if r === "run"}
                  {#key current.path}
                    <NowStrip snap={current} onOpen={openDoc} onStart={() => fill("plan", "/forge:fg-ask ")}>
                      {#snippet tools()}
                        <Shortcuts role="run" items={shortcuts.run} blocked={runBlocked} onFill={(t) => fill("run", t)} onChange={(v) => setShortcuts("run", v)} {commands} />
                      {/snippet}
                    </NowStrip>
                  {/key}
                {:else}
                  <div class="pband">
                    <span class="kicker">{t("계획", "Plan")}</span>
                    <span class="tt">{t("후속후보에서 착수하거나 새 계획을 시작하세요", "Start from a follow-up or begin a new plan")}</span>
                    <button class="btn sm" onclick={() => (listOpen = "followups")}>{t(`후속후보 ${followupCount}건 보기`, `View ${followupCount} follow-ups`)}</button>
                    <div class="pline2">
                      <span class="t3">{t("후속후보 착수는 목록의 「착수」로", "Start follow-ups via \"Start\" in the list")}</span>
                      <span class="sp"></span>
                      <Shortcuts role="plan" items={shortcuts.plan} blocked={planBlocked} onFill={(t) => fill("plan", t)} onChange={(v) => setShortcuts("plan", v)} {commands} />
                    </div>
                  </div>
                {/if}
            </div>
            {/if}
            <div class="cell term-{r}" class:folded={folded === r}>
              <!-- 유입 띠: 이 터미널은 위 흐름도의 같은 색 노드·보드 버튼에서 입력을 받는다 -->
              <div class="feed {r}" data-flow={s?.alive && s.state === "working" ? "active" : "idle"} title={t("보드 버튼이 이 세션 입력창에 명령을 채웁니다", "Board buttons fill commands into this session's input")}>
                {#key lastFill.n}{#if lastFill.n && lastFill.role === r}<span class="fpulse"></span>{/if}{/key}
              </div>
              <SessionPane
                project={current.path}
                projectName={current.name}
                role={r}
                name={n}
                session={s}
                task={linkedTask(current, s)}
                title={titles[current.path]?.[i] ?? null}
                live={models[n] ?? null}
                focusTick={focus.name === n ? focus.tick : 0}
              />
            </div>
          {/each}
        {/if}
        {#if listOpen}
          <ListPopup kind={listOpen} snap={current} onOpen={openDoc} onClose={() => (listOpen = null)} {actions} {planBlocked} {runBlocked} hidden={hiddenSet} />
        {/if}
        {#if currentTab}
          <div class="doc" role="dialog" aria-label={currentTab.label}>
            <div class="dh">
              <span class="t3">{currentTab.rel}</span>
              <span class="sp"></span>
              <button class="x on" aria-label={t("문서 닫기", "Close document")} onclick={() => showTab(null)}>×</button>
            </div>
            {#if docError}
              <div class="error"><span class="b">✕ {t("읽기 실패", "Read failed")}</span> — {docError}</div>
            {:else}
              <div class="md">{@html docHtml}</div>
            {/if}
          </div>
        {/if}
      </div>
      <footer class="status">
        <span>{current.name}{current.root.branch ? ` · ${current.root.branch}` : ""}</span>
        <span>{t("백로그", "Backlog")} {current.backlog.length} · {t("후속후보", "Follow-ups")} {current.followups.length}</span>
        {#if waitingElsewhere.length}
          <span class="bell">🔔 {t(`${waitingElsewhere[0]}이 입력을 기다립니다${waitingElsewhere.length > 1 ? ` 외 ${waitingElsewhere.length - 1}` : ""}`, `${waitingElsewhere[0]}${waitingElsewhere.length > 1 ? ` and ${waitingElsewhere.length - 1} more` : ""} waiting for input`)}</span>
        {/if}
      </footer>
    {:else}
      <div class="center">
        <div class="welcome">
          <span class="t1">{t("등록한 프로젝트가 없습니다", "No projects registered")}</span>
          <div class="ink2">{t("forge를 쓰는 프로젝트 폴더를 추가하면 그 프로젝트의 .forge 상태가 보드로 보입니다.", "Add a project folder that uses forge to see its .forge state on the board.")}</div>
          <button class="btn" onclick={addProject}>＋ {t("프로젝트 추가", "Add project")}</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .app { display: flex; height: 100vh; min-width: 960px; }
  .side { width: 208px; flex: none; background: var(--surface); border-right: 1px solid var(--line2); padding: 16px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
  .side.rail { width: 48px; padding: 8px 4px; }
  .hd { display: flex; justify-content: space-between; align-items: center; gap: 4px; padding: 0 0 8px 8px; }
  .rail .hd { padding: 0 0 4px; justify-content: center; }
  .caps { letter-spacing: .04em; }
  .fold { width: 32px; height: 32px; margin-left: auto; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; flex: none; }
  .rail .fold { margin: 0; width: 40px; }
  .fold:hover { background: var(--line2); color: var(--ink); }
  .fold:focus-visible, .pick:focus-visible, .add:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .proj { display: flex; align-items: center; border-radius: 6px; }
  .proj.on { background: var(--accent-wash); }
  .pick { flex: 1; min-width: 0; padding: 8px; background: none; border: 0; text-align: left; cursor: pointer; min-height: 44px; }
  /* 좁은 레일: 앞 두 글자 + 상태 점, 높이 44px */
  .rail .proj { flex-direction: column; justify-content: center; gap: 2px; height: 44px; flex: none; }
  .rail .pick { flex: none; width: 100%; min-height: 0; padding: 0; text-align: center; }
  .rail .sd { justify-content: center; min-height: 8px; }
  .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sd { display: flex; gap: 4px; }
  .x { width: 24px; height: 24px; border: 0; background: none; color: var(--muted); border-radius: 4px; cursor: pointer; opacity: 0; flex: none; }
  .proj:hover .x, .proj:focus-within .x, .tab .x { opacity: 1; }
  .x:hover { background: var(--line2); color: var(--ink); }
  .add { margin-top: auto; padding: 8px; background: none; border: 0; text-align: left; cursor: pointer; min-height: 44px; }
  .add.icon { text-align: center; font-size: 15px; }
  .add:hover { color: var(--ink); }
  .add.set { margin-top: 0; }
  .settings { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 8px; }
  .settings label { display: flex; flex-direction: column; gap: 4px; }
  .settings select { min-height: 32px; font: inherit; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
  .skels { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .skels.wide { width: 360px; }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
  .head { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 16px; flex-wrap: wrap; }
  .head .t1 { font-size: 14px; }
  .head .btn { height: 28px; }
  /* 터미널 배치 3단 버튼 */
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .segb { width: 32px; height: 26px; display: grid; place-items: center; border: 0; background: var(--raised); color: var(--muted); cursor: pointer; }
  .segb + .segb { border-left: 1px solid var(--line); }
  .segb:hover { color: var(--ink); }
  .segb.on { background: var(--accent-wash); color: var(--accent); }
  .segb:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .segb svg { fill: none; stroke: currentColor; stroke-width: 1.5; }
  .segb svg .fill { fill: currentColor; stroke: none; opacity: .6; }
  .chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 12px; border: 1px solid var(--line); color: var(--ink2); font-size: 11px; white-space: nowrap; }
  .chip.warn { border-color: transparent; background: var(--warn-wash); color: var(--ink); }
  .sp { flex: 1; }
  .crit { color: var(--crit); }
  .band { flex: none; display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 8px 12px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line2); border-left: 3px solid var(--crit); }
  .tabs { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid var(--line2); overflow-x: auto; flex: none; }
  .tab { display: inline-flex; align-items: center; height: 32px; padding: 0 8px; border: 0; border-radius: 6px 6px 0 0; background: none; color: var(--ink2); cursor: pointer; white-space: nowrap; }
  .tab.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent); }
  .tl { background: none; border: 0; padding: 0 4px; cursor: pointer; max-width: 32ch; overflow: hidden; text-overflow: ellipsis; color: inherit; font-weight: inherit; }

  .body { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); position: relative; }
  /* 칸 내용이 넘쳐도 이웃 칸(경계·터미널 머리줄)을 덮지 않게 자른다 */
  .cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .cell > :global(*) { flex: 1; }
  .term-plan { grid-area: 2 / 1 / 3 / 2; }
  .info { min-width: 0; display: flex; flex-direction: column; }
  .info > :global(*) { flex: 1; }
  .info-plan { grid-area: 1 / 1 / 2 / 2; }
  .cell.folded { display: none; }
  /* 접힌 열 레일 — 두 행(머리판·터미널)을 다 차지, 위쪽 역할 색 선에 관이 꽂힌다 */
  /* contain: size — 세로 글씨 높이가 머리판 행 높이를 늘리지 않게 */
  .foldrail { contain: size; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 0; border: 0; border-top: 2px solid var(--c); background: var(--surface); color: var(--ink2); cursor: pointer; }
  .foldrail:hover { background: var(--raised); color: var(--ink); }
  .foldrail:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .foldrail .vt { writing-mode: vertical-rl; font-size: 11px; font-weight: 600; letter-spacing: .04em; white-space: nowrap; }
  .foldrail-plan { grid-area: 1 / 1 / 3 / 2; --c: var(--warn); }
  .foldrail-run { grid-area: 1 / 3 / 3 / 4; --c: var(--accent); }
  .info-run { grid-area: 1 / 3 / 2 / 4; }
  .info-run :global(.band) { flex: 1; }
  /* 열 머리판 — 터미널에 붙어 한 덩어리. 위쪽 역할 색 선에 흐름도의 관이 꽂힌다. 실행 쪽(NowStrip .band)과 같은 꼴 */
  .pband { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 8px 16px 6px; background: var(--surface); border-top: 2px solid var(--warn); }
  .pband .kicker { flex: none; height: 20px; padding: 0 8px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; letter-spacing: .04em; background: var(--warn-wash); color: var(--warn); }
  .pband .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  .pline2 { flex: 0 0 100%; min-height: 20px; display: flex; align-items: center; gap: 4px; }
  .cell > .feed { flex: none; position: relative; height: 3px; overflow: hidden; background: var(--line); }
  .feed.plan { --c: var(--warn); }
  .feed.run { --c: var(--accent); }
  .feed[data-flow="active"] { background: repeating-linear-gradient(90deg, var(--c) 0 6px, transparent 6px 14px); background-size: 14px 3px; animation: feed-march .8s linear infinite; }
  .feed[data-flow="idle"] { background: color-mix(in srgb, var(--c) 35%, transparent); }
  .fpulse { position: absolute; top: 0; left: 0; width: 48px; height: 3px; background: var(--ink); box-shadow: 0 0 8px var(--c); animation: feed-travel .9s ease-out forwards; }
  @keyframes feed-march { to { background-position: 14px 0; } }
  @keyframes feed-travel { from { left: 0; opacity: 1; } to { left: calc(100% - 48px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .feed[data-flow="active"], .fpulse { animation: none; }
    .fpulse { display: none; }
  }
  .term-run { grid-area: 2 / 3 / 3 / 4; }
  .doc { position: absolute; inset: 0; z-index: 3; overflow-y: auto; padding: 8px 24px 48px; background: var(--plane); border-top: 1px solid var(--line); }
  .dh { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; }
  .x.on { opacity: 1; width: 32px; height: 32px; }
  .md { max-width: 75ch; }
  .md :global(pre) { background: var(--surface); border: 1px solid var(--line2); border-radius: 6px; padding: 8px 12px; overflow-x: auto; }
  .md :global(table) { border-collapse: collapse; }
  .md :global(th), .md :global(td) { border: 1px solid var(--line); padding: 4px 8px; }
  .md :global(h1) { font-size: 15px; }
  .md :global(h2), .md :global(h3) { font-size: 13px; }
  .md :global(a) { color: var(--accent); }
  .vsplit { grid-area: 1 / 2 / 3 / 3; cursor: col-resize; background: #2a2a28; z-index: 1; }
  .vsplit:hover { background: var(--accent); }
  .center { flex: 1; display: grid; place-items: center; padding: 24px; }
  .welcome { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: 48ch; }
  .ink2 { color: var(--ink2); }
  .error { padding: 8px 12px; border-radius: 6px; background: var(--surface); border-left: 3px solid var(--crit); }
  .status { height: 24px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 11px; color: var(--ink2); background: var(--surface); border-top: 1px solid var(--line2); }
  .bell { margin-left: auto; color: var(--ink); }
</style>
