<script lang="ts">
  import { call, on } from "$lib/api";
  import { marked } from "marked";
  import { onMount } from "svelte";
  import NowStrip from "$lib/NowStrip.svelte";
  import Shortcuts from "$lib/Shortcuts.svelte";
  import FlowBoard from "$lib/FlowBoard.svelte";
  import FlowLinks, { type FlowPulses } from "$lib/FlowLinks.svelte";
  import ListPopup, { type ListKind } from "$lib/ListPopup.svelte";
  import SessionPane from "$lib/SessionPane.svelte";
  import Prepare, { type InstallProgress } from "$lib/Prepare.svelte";
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
  /** 세션 이름 → 상태 */
  let sessions = $state<Record<string, SessionState>>({});
  /** 세션 이름 → 상태줄 래퍼가 남긴 실제 모델·effort */
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
  // 준비물(claude CLI · forge, Windows는 Git) — 빠졌으면 보드 대신 「준비 중」 화면이 뜨고, 버튼 없이 자동 설치를 한 번 시작한다(3/6).
  type DepsStatus = { needs: string[]; message: string | null; installable: boolean; platform?: string };
  let deps = $state<DepsStatus | null>(null);
  /** 자동 설치 진행(서버 `deps_progress`) */
  let install = $state<InstallProgress | null>(null);
  /** 자동 설치는 처음 한 번만 — 그 뒤는 [다시 시도]로(실패한 채 다시 확인할 때마다 또 설치하지 않게) */
  let autoInstalled = false;
  let preparing = $derived(!!deps?.needs?.length);
  const startInstall = () =>
    call<InstallProgress | null>("deps_install")
      .then((p) => {
        if (p?.running) install = p;
      })
      .catch(() => {});
  /** 준비물이 빠진 동안 세션을 여는 버튼은 끈다 */
  let depsBlocked = $derived(deps?.message ? t("먼저 위 띠의 준비물을 갖추세요", "Get the prerequisites in the band above first") : null);
  /** 확인마다 순번을 매겨 가장 최근 확인의 응답만 반영한다 — WSL은 확인 한 번에 수십 초라 늦은 옛 응답이 새 결과를 덮을 수 있다 */
  let depsSeq = 0;
  const checkDeps = () => {
    const seq = ++depsSeq;
    return call<DepsStatus>("deps_status")
      .then((d) => {
        if (seq !== depsSeq) return;
        deps = d;
        if (d?.needs?.length && !autoInstalled) {
          autoInstalled = true;
          startInstall();
        }
      })
      .catch(() => {});
  };
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
      modelSettings = await call("model_settings");
    } catch (e) {
      settingsError = String(e);
    }
  }
  async function saveModel(role: string, model: string) {
    settingsError = "";
    try {
      await call("set_model_setting", { role, model });
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
    call<ForgePlugin | null>("forge_plugin_status")
      .then((f) => (forgePlugin = f))
      .catch(() => {});
  async function updateForgePlugin() {
    forgeUpdating = true;
    try {
      await call("forge_plugin_update");
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

  let current = $derived(projects.find((p) => p.path === selected) ?? projects[0] ?? null);
  /** 프로젝트 경로 → 설치된 슬래시 명령. 프로젝트마다 처음 한 번만 읽는다. */
  let slashCache = $state<Record<string, string[]>>({});
  $effect(() => {
    const p = current?.path;
    if (!p || p in slashCache) return;
    slashCache[p] = [];
    call<string[]>("slash_commands", { project: p })
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
  let followupCount = $derived(current ? current.followups.filter((f) => f.status === "open").length : 0);

  async function fill(role: Role, text: string) {
    if (!current) return;
    fillError = "";
    try {
      const name = await call<string>("session_fill", { project: current.path, role, text });
      sessions = await call<Record<string, SessionState>>("session_states");
      focus = { name, tick: focus.tick + 1 };
      lastFill = { role, text, n: lastFill.n + 1 };
    } catch (e) {
      fillError = String(e);
    }
  }

  const actions: BoardActions = {
    run: (p) => fill("run", p.task == null ? "/forge:fg-run" : `/forge:fg-run #${p.task}`),
    start: (f) => fill("plan", t(`/forge:fg-ask 후속후보 ${f.id} 착수: ${f.text}`, `/forge:fg-ask follow-up ${f.id} take: ${f.text}`)),
    dismiss: (f) => fill("plan", t(`/forge:fg-ask 후속후보 ${f.id} 기각 — 사유: `, `/forge:fg-ask follow-up ${f.id} dismiss — reason: `)),
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
      if (!names[p.path]) names[p.path] = await call<[string, string]>("session_names", { project: p.path });
      if (!titles[p.path]) titles[p.path] = await call<[SessionTitle, SessionTitle]>("session_titles", { project: p.path });
    }
  }

  /** 브라우저 탭 제목 — 입력을 기다리는 세션이 하나라도 있으면 🔔 */
  let anyWaiting = $derived(
    projects.some((p) =>
      ROLES.some((r) => {
        const s = sessionOf(p.path, r);
        return s?.alive && s.state === "waiting";
      }),
    ),
  );
  $effect(() => {
    document.title = anyWaiting ? "🔔 Anvil" : "Anvil";
  });

  onMount(() => {
    try {
      selected = localStorage.getItem(SELECTED_KEY);
    } catch {}
    loadLayout();
    // 백엔드 문구(요약 · 경고)가 화면 언어로 나오도록 언어를 먼저 알린 뒤 불러온다
    initLang()
      .then(() => call<Snapshot[]>("list_projects"))
      .then(async (list) => {
        projects = list;
        await loadNames(list);
        sessions = await call<Record<string, SessionState>>("session_states");
        models = await call<Record<string, ModelInfo>>("session_models");
      })
      .catch((e) => (loadError = String(e)))
      .finally(() => (loading = false));
    const unSnap = on<Snapshot>("snapshot", (snap) => {
      const i = projects.findIndex((p) => p.path === snap.path);
      if (i >= 0) projects[i] = snap;
      if (currentTab?.project === snap.path) loadDoc(currentTab);
    });
    const unSess = on<Record<string, SessionState>>("sessions", (s) => (sessions = s));
    const unModels = on<Record<string, ModelInfo>>("models", (m) => (models = m));
    // 설치가 끝나면 다시 확인한 뒤에 끝난 진행을 반영한다 — 다 갖췄으면 보드로, 남았으면 실패와 [다시 시도]가 함께 보인다
    const unInstall = on<InstallProgress>("deps_progress", (p) => {
      if (p.running) install = p;
      else checkDeps().then(() => (install = p));
    });
    // 이벤트를 놓쳐도(웹소켓이 다시 붙는 사이 등) 따라가도록 가끔 다시 읽는다. 서버가 잠깐 없는 것은 넘기고, 401은 아래 unauthorized로 올라온다.
    const poll = setInterval(async () => {
      try {
        sessions = await call("session_states");
        models = await call("session_models");
      } catch {}
    }, 5000);
    // 서버가 새 토큰으로 다시 떴다 — 보드(죽은 세션이 살아 보인다) 대신 다시 열 주소를 알린다
    const unAuth = on("unauthorized", () => {
      clearInterval(poll);
      loadError = t(
        "서버가 다시 시작되었습니다 — 서버가 찍은 Anvil 주소(…/?token=)를 다시 여세요",
        "The server restarted — reopen the Anvil address it printed (…/?token=)",
      );
    });
    checkDeps();
    checkForgePlugin();
    return () => {
      unSnap();
      unSess();
      unModels();
      unInstall();
      unAuth();
      clearInterval(poll);
    };
  });

  /** 브라우저에서 폴더 창이 없는 OS(macOS 아님)의 경로 입력칸 — prompt()는 Electron에 없어 화면 안에 띄운다 */
  let pathAsk = $state<{ value: string; error: string; busy: boolean } | null>(null);
  /** 데스크톱 앱의 preload(electron/preload.cjs) — 있으면 OS 기본 폴더 창을 Anvil 창에 붙여 연다(세 OS 모두) */
  const desktop = (globalThis as { anvilDesktop?: { pickFolder(): Promise<string | null> } }).anvilDesktop;

  async function addProject() {
    let dir: unknown;
    try {
      dir = desktop ? await desktop.pickFolder() : await call<string | null | { unsupported: true }>("pick_folder");
    } catch (e) {
      loadError = String(e);
      return;
    }
    if (dir && typeof dir === "object") {
      pathAsk = { value: "", error: "", busy: false };
      return;
    }
    if (typeof dir !== "string") return;
    try {
      await register(dir);
    } catch (e) {
      loadError = String(e);
    }
  }

  async function register(dir: string) {
    projects = await call<Snapshot[]>("add_project", { path: dir });
    await loadNames(projects);
    selectProject(dir);
  }

  /** 입력칸의 [추가] — 실패하면 입력을 남긴 채 오류를 보여 고쳐서 다시 누르게 한다 */
  async function submitPath() {
    const ask = pathAsk;
    const dir = ask?.value.trim();
    if (!ask || !dir) return;
    ask.busy = true;
    ask.error = "";
    try {
      await register(dir);
      pathAsk = null;
    } catch (e) {
      ask.error = String(e);
      ask.busy = false;
    }
  }

  async function removeProject(path: string) {
    projects = await call<Snapshot[]>("remove_project", { path });
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
      const text = await call<string>("read_doc", { project: tab.project, rel: tab.rel });
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
    if (pathAsk) pathAsk = null;
    else if (activeTab !== null) showTab(null);
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
                  .then(() => call<Snapshot[]>("list_projects"))
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
    <!-- 준비물이 빠졌으면 보드 대신 「준비 중」(프로젝트가 없어도 — 첫 실행) -->
    {#if preparing}
      <Prepare progress={install} message={deps?.message ?? null} onRetry={startInstall} />
    {:else if loading}
      <div class="center"><div class="skels wide"><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div></div></div>
    {:else if loadError}
      <div class="center"><div class="error"><span class="b">✕ {t("불러오기 실패", "Failed to load")}</span> — {loadError}</div></div>
    {:else if current}
      <header class="head">
        <span class="t1">{current.name}</span>
        {#if current.root.git}<span class="chip">⎇ {current.root.branch ?? t("브랜치 없음", "No branch")} · {current.root.rel}/</span>{/if}
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
                    <NowStrip snap={current} onOpen={openDoc} onStart={() => fill("plan", "/forge:fg-ask ")} blocked={depsBlocked}>
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
                blocked={depsBlocked}
                onstarted={() => (focus = { name: n, tick: focus.tick + 1 })}
              />
            </div>
          {/each}
        {/if}
        {#if listOpen}
          <ListPopup kind={listOpen} snap={current} onOpen={openDoc} onClose={() => (listOpen = null)} {actions} {planBlocked} {runBlocked} />
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
        <span>{t("백로그", "Backlog")} {current.backlog.length} · {t("후속후보", "Follow-ups")} {followupCount}</span>
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
  {#if pathAsk}
    <!-- 바깥(어두운 바탕) 클릭이나 Esc로 닫힌다 -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="scrim" onclick={(e) => e.target === e.currentTarget && (pathAsk = null)}>
      <div role="dialog" aria-modal="true" aria-label={t("프로젝트 추가", "Add project")}><form class="ask" onsubmit={(e) => { e.preventDefault(); submitPath(); }}>
        <label class="b" for="ask-path">{t("프로젝트 폴더의 절대 경로", "Absolute path of the project folder")}</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="ask-path" bind:value={pathAsk.value} autofocus spellcheck="false" autocomplete="off" placeholder={deps?.platform === "windows" ? "C:\\Users\\me\\project" : "/home/me/project"} />
        {#if pathAsk.error}<div class="err">{pathAsk.error}</div>{/if}
        <div class="row">
          <button type="button" class="btn" onclick={() => (pathAsk = null)}>{t("취소", "Cancel")}</button>
          <button type="submit" class="btn" disabled={!pathAsk.value.trim() || pathAsk.busy}>{t("추가", "Add")}</button>
        </div>
      </form></div>
    </div>
  {/if}
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
  .scrim { position: fixed; inset: 0; z-index: 3; background: rgba(0, 0, 0, .35); display: flex; justify-content: center; align-items: flex-start; padding: 96px 16px 16px; }
  .scrim > div { width: min(560px, 100%); }
  .ask { display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--plane); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
  .ask input { height: 32px; font: 12px "SF Mono", ui-monospace, Menlo, monospace; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: 4px; padding: 0 8px; }
  .ask input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .ask .err { color: var(--crit); white-space: pre-wrap; overflow-wrap: anywhere; }
  .ask .row { display: flex; justify-content: flex-end; gap: 8px; }
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
