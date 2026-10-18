<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { marked } from "marked";
  import { onMount } from "svelte";
  import NowStrip from "$lib/NowStrip.svelte";
  import FlowBoard from "$lib/FlowBoard.svelte";
  import FlowLinks from "$lib/FlowLinks.svelte";
  import ListPopup, { type ListKind } from "$lib/ListPopup.svelte";
  import SessionPane from "$lib/SessionPane.svelte";
  import { roleLabel, stateLabel, pipClass, linkedTask } from "$lib/sessions";
  import type { Snapshot, DocTab, SessionState, Role, BoardActions, SessionTitle, ModelInfo } from "$lib/types";

  const SELECTED_KEY = "anvil.selected";
  /** 세로 경계 위치와 프로젝트 영역 접힘 — 앱 전체 설정 */
  const LAYOUT_KEY = "anvil.layout";
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
  let rail = $state(false);
  /** 건수 칩이 연 목록 팝업 */
  let listOpen = $state<ListKind | null>(null);
  /** 보드 버튼이 명령을 채운 세션과 초점 요청 횟수 */
  let focus = $state<{ name: string; tick: number }>({ name: "", tick: 0 });
  let fillError = $state("");
  /** 보드 버튼이 마지막으로 채운 명령 — 흐름도 로그·터미널 유입 띠 펄스용 */
  /** 터미널을 거쳐 나가는 펄스 — FlowBoard가 올리고 FlowLinks가 그린다 */
  let outPulses = $state({ pOut: 0, rOut: 0 });
  let mainEl = $state<HTMLElement>();
  let lastFill = $state<{ role: Role; text: string; n: number }>({ role: "run", text: "", n: 0 });
  /** 숨긴 후속후보(앱 데이터 hidden-followups.json) */
  let hiddenItems = $state<{ project: string; source: string; text: string }[]>([]);

  let current = $derived(projects.find((p) => p.path === selected) ?? projects[0] ?? null);
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
    const t = linkedTask(current, s);
    return t ? `${t} 실행 중` : "실행 세션 작업 중";
  });
  let planBlocked = $derived.by(() => {
    if (!current) return null;
    const s = sessionOf(current.path, "plan");
    return s?.alive && s.state === "working" ? "계획 세션 작업 중" : null;
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
    next: () => fill("run", "/forge:fg-next"),
    run: (p) => fill("run", p.task == null ? "/forge:fg-run" : `/forge:fg-run #${p.task}`),
    start: (f) => fill("plan", `/forge:fg-ask ${f.text} (출처: ${f.sourceSlug})`),
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
          }).map((r) => `${p.name} ${roleLabel[r]} 세션`),
    ),
  );

  function remember(path: string | null) {
    try {
      if (path) localStorage.setItem(SELECTED_KEY, path);
    } catch {}
  }

  /** 바꾼 값만 저장한다 — 접기만 해도 경계 위치가 굳으면 기본값이 바뀌어도 따라가지 않는다. */
  function saveLayout(patch: { split?: number; rail?: boolean }) {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...v, ...patch }));
    } catch {}
  }

  function loadLayout() {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
      if (typeof v.split === "number") split = v.split;
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
      notify(`${owner.name} ${roleLabel[role]} 세션 · 입력 대기 — ${owner.headline}`);
    }
    sessions = next;
  }

  onMount(() => {
    try {
      selected = localStorage.getItem(SELECTED_KEY);
    } catch {}
    loadLayout();
    invoke<Snapshot[]>("list_projects")
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
    return () => {
      unSnap.then((f) => f());
      unSess.then((f) => f());
      unModels.then((f) => f());
      clearInterval(poll);
    };
  });

  async function addProject() {
    const dir = await open({ directory: true, multiple: false, title: "프로젝트 폴더 고르기" });
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
  function drag(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const body = el.parentElement!;
    const move = (ev: PointerEvent) => {
      const r = body.getBoundingClientRect();
      split = Math.min(Math.max((ev.clientX - r.left) / r.width, 0.2), 0.8);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      saveLayout({ split });
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
      {#if !rail}<span class="t3 b caps">프로젝트</span><span class="t3">{projects.length}</span>{/if}
      <button class="fold" onclick={toggleRail} aria-label={rail ? "프로젝트 목록 펼치기" : "프로젝트 목록 접기"} title={rail ? "펼치기" : "접기"}>{rail ? "»" : "«"}</button>
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
          <button class="x" title="등록 해제(폴더는 그대로)" aria-label="{p.name} 등록 해제" onclick={() => removeProject(p.path)}>×</button>
        {/if}
      </div>
    {/each}
    {#if rail}
      <button class="add icon t3" onclick={addProject} aria-label="프로젝트 추가" title="프로젝트 추가">＋</button>
    {:else}
      <button class="add t3" onclick={addProject}>＋ 프로젝트 추가</button>
    {/if}
  </aside>

  <section class="main" bind:this={mainEl}>
    {#if loading}
      <div class="center"><div class="skels wide"><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div></div></div>
    {:else if loadError}
      <div class="center"><div class="error"><span class="b">✕ 불러오기 실패</span> — {loadError}</div></div>
    {:else if current}
      <header class="head">
        <span class="t1">{current.name}</span>
        <span class="chip">⎇ {current.root.branch ?? "브랜치 없음"} · {current.root.rel}/</span>
        {#if current.root.warning}<span class="chip warn">{current.root.warning}</span>{/if}
        <span class="sp"></span>
        {#if current.hasForge}
          {#if runBlocked}<span class="t3">{runBlocked}</span>{/if}
          <button class="btn pri" disabled={!!runBlocked} title="실행 세션 입력창에 /forge:fg-next를 채웁니다(Enter는 직접)" onclick={actions.next}>다음 단계 ▸</button>
        {/if}
      </header>
      {#each current.errors as err (err.path)}
        <div class="band">
          <span class="b"><span class="crit">✕</span> 읽기 실패</span>
          <span class="ink2">{err.path} — {err.message}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => openDoc(err.path, err.path.split("/").pop() ?? err.path)}>파일 열기</button>
        </div>
      {/each}
      {#if fillError}
        <div class="band">
          <span class="b">✕ 명령을 채우지 못했습니다</span><span class="ink2">{fillError}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={() => (fillError = "")}>닫기</button>
        </div>
      {/if}
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
      />
      <div class="body" style="grid-template-columns: minmax(0, {split}fr) 6px minmax(0, {1 - split}fr)">
        <div class="vsplit" role="separator" aria-orientation="vertical" aria-label="계획·실행 폭 조절" onpointerdown={drag}></div>
        {#if names[current.path]}
          {#each ROLES as r, i (r)}
            {@const s = sessionOf(current.path, r)}
            {@const n = names[current.path][i]}
            <!-- 열 머리: 계획 = 최근 쌓은 계획, 실행 = 지금 처리 중인 작업 → 계획·실행을 나란히 본다.
                 같은 grid 행이라 높이가 같이 맞춰져 아래 터미널 머리줄이 나란하다. -->
            <div class="info info-{r}">
                {#if r === "run"}
                  {#key current.path}<NowStrip snap={current} onOpen={openDoc} />{/key}
                {:else}
                  <div class="pband">
                    <span class="t3 b kicker">계획</span>
                    <span class="ink2 tt">후속후보에서 착수하거나 새 계획을 시작하세요</span>
                    <div class="pline2 t3">
                      <button class="plink" onclick={() => (listOpen = "followups")}>후속후보 {followupCount}건 보기</button>
                      <span>· 새 계획은 계획 세션에서 /forge:fg-ask</span>
                    </div>
                  </div>
                {/if}
            </div>
            <div class="cell term-{r}">
              <!-- 유입 띠: 이 터미널은 위 흐름도의 같은 색 노드·보드 버튼에서 입력을 받는다 -->
              <div class="feed {r}" data-flow={s?.alive && s.state === "working" ? "active" : "idle"} title="보드 버튼이 이 세션 입력창에 명령을 채웁니다">
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
              <button class="x on" aria-label="문서 닫기" onclick={() => showTab(null)}>×</button>
            </div>
            {#if docError}
              <div class="error"><span class="b">✕ 읽기 실패</span> — {docError}</div>
            {:else}
              <div class="md">{@html docHtml}</div>
            {/if}
          </div>
        {/if}
      </div>
      <footer class="status">
        <span>{current.name}{current.root.branch ? ` · ${current.root.branch}` : ""}</span>
        <span>백로그 {current.backlog.length} · 후속후보 {current.followups.length}</span>
        {#if waitingElsewhere.length}
          <span class="bell">🔔 {waitingElsewhere[0]}이 입력을 기다립니다{waitingElsewhere.length > 1 ? ` 외 ${waitingElsewhere.length - 1}` : ""}</span>
        {/if}
      </footer>
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
  .skels { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .skels.wide { width: 360px; }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
  .head { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 16px 8px; flex-wrap: wrap; }
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
  .info-run { grid-area: 1 / 3 / 2 / 4; }
  .info-run :global(.band) { flex: 1; }
  .pband { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-height: 40px; margin: 8px 16px 0; padding: 4px 8px 4px 12px; background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--warn); border-radius: 8px; }
  .pline2 { flex: 0 0 100%; min-height: 20px; display: flex; align-items: center; gap: 4px; padding-bottom: 2px; }
  .kicker { letter-spacing: .04em; flex: none; }
  .tt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .plink { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: var(--accent); font: inherit; }
  .plink:hover { text-decoration: underline; }
  .plink:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
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
