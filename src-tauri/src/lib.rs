pub mod forge;
pub mod session;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

/// 등록한 프로젝트 목록과 프로젝트마다 하나씩 도는 파일 감시.
#[derive(Default)]
struct AppState {
    projects: Mutex<Vec<PathBuf>>,
    watchers: Mutex<HashMap<PathBuf, Debouncer<notify::RecommendedWatcher>>>,
    session_watcher: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
    terms: session::Terms,
}

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("app data dir")
}

fn files(app: &AppHandle) -> session::Files {
    session::Files { dir: data_dir(app) }
}

fn store_path(app: &AppHandle) -> PathBuf {
    data_dir(app).join("projects.json")
}

/// 스냅샷을 만들 때 훅용 요약(앱이 꺼져 있을 때 알림 문구)도 함께 갱신한다.
fn snapshot_of(app: &AppHandle, project: &Path) -> forge::Snapshot {
    let snap = forge::snapshot(project);
    files(app).write_summary(project, &snap.name, &snap.headline);
    snap
}

fn load_projects(app: &AppHandle) -> Vec<PathBuf> {
    std::fs::read_to_string(store_path(app))
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<PathBuf>>(&t).ok())
        .unwrap_or_default()
}

fn save_projects(app: &AppHandle, projects: &[PathBuf]) -> Result<(), String> {
    let path = store_path(app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// `.forge/` 재귀 감시 + 프로젝트 폴더(.forge 생성) + git 폴더(HEAD) 비재귀 감시.
/// 바뀌면 300ms 디바운스 뒤 그 프로젝트의 새 스냅샷을 `snapshot` 이벤트로 보낸다.
fn watch(app: &AppHandle, project: &Path) {
    let handle = app.clone();
    let p = project.to_path_buf();
    let forge_dir = project.join(".forge");
    let watching_forge = forge_dir.is_dir();
    let debouncer = new_debouncer(Duration::from_millis(300), move |res: notify_debouncer_mini::DebounceEventResult| {
        if res.is_err() {
            return;
        }
        let snap = snapshot_of(&handle, &p);
        if snap.has_forge != watching_forge {
            // .forge가 새로 생기거나 사라졌다 — 감시 대상을 다시 잡는다(자기 콜백 밖에서).
            let (h, p) = (handle.clone(), p.clone());
            std::thread::spawn(move || watch(&h, &p));
        }
        let _ = handle.emit("snapshot", snap);
    });
    let Ok(mut debouncer) = debouncer else { return };
    let w = debouncer.watcher();
    let _ = w.watch(project, RecursiveMode::NonRecursive);
    if watching_forge {
        let _ = w.watch(&forge_dir, RecursiveMode::Recursive);
    }
    if let Some(git) = forge::git_dir(project) {
        let _ = w.watch(&git, RecursiveMode::NonRecursive);
    }
    app.state::<AppState>().watchers.lock().unwrap().insert(project.to_path_buf(), debouncer);
}

fn snapshots(app: &AppHandle, state: &State<AppState>) -> Vec<forge::Snapshot> {
    state.projects.lock().unwrap().iter().map(|p| snapshot_of(app, p)).collect()
}

/// 훅이 상태 파일을, 상태줄 래퍼가 모델·effort 기록을 바꾸면 `sessions`·`models` 이벤트로 보낸다.
fn watch_sessions(app: &AppHandle) {
    let handle = app.clone();
    let debouncer = new_debouncer(Duration::from_millis(150), move |res: notify_debouncer_mini::DebounceEventResult| {
        if res.is_ok() {
            let f = files(&handle);
            let _ = handle.emit("sessions", session::states(&f));
            let _ = handle.emit("models", session::models(&f));
        }
    });
    let Ok(mut debouncer) = debouncer else { return };
    let _ = debouncer.watcher().watch(&files(app).sessions(), RecursiveMode::NonRecursive);
    let _ = debouncer.watcher().watch(&files(app).models(), RecursiveMode::NonRecursive);
    *app.state::<AppState>().session_watcher.lock().unwrap() = Some(debouncer);
}

#[tauri::command]
fn list_projects(app: AppHandle, state: State<AppState>) -> Vec<forge::Snapshot> {
    snapshots(&app, &state)
}

#[tauri::command]
fn add_project(app: AppHandle, state: State<AppState>, path: String) -> Result<Vec<forge::Snapshot>, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err(format!("폴더가 아닙니다: {}", path.display()));
    }
    {
        let mut projects = state.projects.lock().unwrap();
        if !projects.contains(&path) {
            projects.push(path.clone());
            save_projects(&app, &projects)?;
        }
    }
    watch(&app, &path);
    Ok(snapshots(&app, &state))
}

#[tauri::command]
fn remove_project(app: AppHandle, state: State<AppState>, path: String) -> Result<Vec<forge::Snapshot>, String> {
    let path = PathBuf::from(path);
    {
        let mut projects = state.projects.lock().unwrap();
        projects.retain(|p| *p != path);
        save_projects(&app, &projects)?;
    }
    state.watchers.lock().unwrap().remove(&path);
    Ok(snapshots(&app, &state))
}

fn registered(state: &State<AppState>, project: &Path) -> Result<(), String> {
    if state.projects.lock().unwrap().iter().any(|p| p == project) {
        Ok(())
    } else {
        Err("등록하지 않은 프로젝트입니다".into())
    }
}

#[tauri::command]
fn session_states(app: AppHandle) -> HashMap<String, session::SessionState> {
    session::states(&files(&app))
}

/// 계획(plan)·실행(run) 세션 이름. 화면이 세션 상태를 프로젝트에 짝지을 때 쓴다.
#[tauri::command]
fn session_names(project: String) -> [String; 2] {
    let p = Path::new(&project);
    [session::session_name(p, "plan"), session::session_name(p, "run")]
}

/// 계획·실행 세션에 붙이는 claude 이름과 띄울 때 모델(`[이름, 모델]` 두 개). 이름 규칙은 `session::session_title` 한 곳.
#[tauri::command]
fn session_titles(project: String) -> [(String, &'static str); 2] {
    let p = Path::new(&project);
    [session::session_title(p, "plan"), session::session_title(p, "run")]
}

#[tauri::command]
fn session_models(app: AppHandle) -> HashMap<String, session::ModelInfo> {
    session::models(&files(&app))
}

#[tauri::command]
fn session_start(app: AppHandle, state: State<AppState>, project: String, role: String) -> Result<String, String> {
    let project = PathBuf::from(project);
    registered(&state, &project)?;
    if role != "plan" && role != "run" {
        return Err(format!("알 수 없는 역할: {role}"));
    }
    session::start(&files(&app), &project, &role)
}

/// 세션을 끝내는 유일한 길(확인창은 화면이 띄운다). 앱 종료는 세션을 죽이지 않는다.
#[tauri::command]
fn session_kill(app: AppHandle, name: String) -> Result<(), String> {
    if !name.starts_with("anvil-") {
        return Err("Anvil 세션이 아닙니다".into());
    }
    session::kill(&files(&app), &name)
}

#[tauri::command]
fn term_open(app: AppHandle, state: State<AppState>, id: u32, name: String, cols: u16, rows: u16, on_data: Channel<String>) -> Result<(), String> {
    state.terms.open(id, &files(&app), &name, cols, rows, move |s| {
        let _ = on_data.send(s);
    })
}

#[tauri::command]
fn term_write(state: State<AppState>, id: u32, data: String) -> Result<(), String> {
    state.terms.write(id, &data)
}

#[tauri::command]
fn term_resize(state: State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    state.terms.resize(id, cols, rows)
}

#[tauri::command]
fn term_close(state: State<AppState>, id: u32) {
    state.terms.close(id);
}

#[tauri::command]
fn notify(body: String) {
    session::notify(&body);
}

/// 보드 버튼: 역할에 맞는 세션 입력창에 forge 명령을 채운다(Enter 없음). 세션이 없으면 띄우고
/// SessionStart(입력 대기)를 기다린 뒤 채운다. 채운 세션 이름을 돌려준다(화면이 그 칸에 초점을 옮김).
#[tauri::command]
async fn session_fill(app: AppHandle, project: String, role: String, text: String) -> Result<String, String> {
    let project = PathBuf::from(project);
    registered(&app.state::<AppState>(), &project)?;
    if role != "plan" && role != "run" {
        return Err(format!("알 수 없는 역할: {role}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let files = files(&app);
        let name = session::session_name(&project, &role);
        let alive = session::live_sessions(&files).contains(&name);
        if !alive {
            session::start(&files, &project, &role)?;
            if !session::wait_ready(&files, &name, Duration::from_secs(40)) {
                return Err("세션이 입력을 받을 준비가 되지 않았습니다(처음 여는 폴더라면 claude의 폴더 신뢰 확인을 먼저 해 주세요)".into());
            }
        } else if session::states(&files).get(&name).is_some_and(|s| s.state == "working") {
            return Err("세션이 작업 중이라 채우지 않았습니다".into());
        }
        session::fill(&files, &name, &text)?;
        Ok(name)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- 후속후보 숨김(앱 데이터 hidden-followups.json) ----------

#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq)]
struct HiddenFollowup {
    project: String,
    source: String,
    text: String,
}

fn hidden_path(app: &AppHandle) -> PathBuf {
    data_dir(app).join("hidden-followups.json")
}

fn load_hidden(app: &AppHandle) -> Vec<HiddenFollowup> {
    std::fs::read_to_string(hidden_path(app))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn hidden_followups(app: AppHandle) -> Vec<HiddenFollowup> {
    load_hidden(&app)
}

#[tauri::command]
fn set_followup_hidden(app: AppHandle, item: HiddenFollowup, hidden: bool) -> Result<Vec<HiddenFollowup>, String> {
    let mut list = load_hidden(&app);
    list.retain(|h| *h != item);
    if hidden {
        list.push(item);
    }
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    std::fs::write(hidden_path(&app), json).map_err(|e| e.to_string())?;
    Ok(list)
}
/// 보드 카드가 여는 문서. 등록한 프로젝트의 `.forge/` 안 파일만 읽는다.
#[tauri::command]
fn read_doc(state: State<AppState>, project: String, rel: String) -> Result<String, String> {
    let project = PathBuf::from(project);
    if !state.projects.lock().unwrap().contains(&project) {
        return Err("등록하지 않은 프로젝트입니다".into());
    }
    let forge_dir = project.join(".forge").canonicalize().map_err(|e| e.to_string())?;
    let file = project.join(&rel).canonicalize().map_err(|e| e.to_string())?;
    if !file.starts_with(&forge_dir) {
        return Err(".forge/ 밖의 파일은 열지 않습니다".into());
    }
    std::fs::read_to_string(file).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let files = files(&handle);
            files.install()?;
            // 훅은 이 pid가 살아 있으면 알림을 앱에 맡긴다.
            std::fs::write(files.dir.join("app.pid"), std::process::id().to_string())?;
            // 로그인 셸 PATH를 미리 받아 둔다(첫 세션 열기가 느려지지 않게).
            std::thread::spawn(|| {
                session::login_path();
            });
            let projects = load_projects(&handle);
            for p in &projects {
                watch(&handle, p);
            }
            *app.state::<AppState>().projects.lock().unwrap() = projects;
            watch_sessions(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            add_project,
            remove_project,
            read_doc,
            session_states,
            session_names,
            session_titles,
            session_models,
            session_start,
            session_kill,
            term_open,
            term_write,
            term_resize,
            term_close,
            notify,
            session_fill,
            hidden_followups,
            set_followup_hidden
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // 세션(tmux)은 그대로 둔다. pid 파일만 지운다(붙어 있던 tmux 클라이언트는 앱과 함께 끝난다).
                let _ = std::fs::remove_file(files(app).dir.join("app.pid"));
            }
        });
}
