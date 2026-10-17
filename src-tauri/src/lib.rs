pub mod forge;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// 등록한 프로젝트 목록과 프로젝트마다 하나씩 도는 파일 감시.
#[derive(Default)]
struct AppState {
    projects: Mutex<Vec<PathBuf>>,
    watchers: Mutex<HashMap<PathBuf, Debouncer<notify::RecommendedWatcher>>>,
}

fn store_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("app data dir").join("projects.json")
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
        let snap = forge::snapshot(&p);
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

fn snapshots(state: &State<AppState>) -> Vec<forge::Snapshot> {
    state.projects.lock().unwrap().iter().map(|p| forge::snapshot(p)).collect()
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Vec<forge::Snapshot> {
    snapshots(&state)
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
    Ok(snapshots(&state))
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
    Ok(snapshots(&state))
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
            let projects = load_projects(&handle);
            for p in &projects {
                watch(&handle, p);
            }
            *app.state::<AppState>().projects.lock().unwrap() = projects;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_projects, add_project, remove_project, read_doc])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
