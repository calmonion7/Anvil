//! 배포판 자동 업데이트(tauri-plugin-updater). 로컬 폴링 설치본(번들에 build-commit)은 main을 따라가므로 끈다.

use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

/// install-app.sh가 남기는 build-commit이 리소스에 있으면 로컬 폴링 설치본이다.
pub fn should_check(resource_dir: &Path) -> bool {
    !resource_dir.join("build-commit").exists()
}

fn enabled(app: &AppHandle) -> bool {
    app.path().resource_dir().map(|d| should_check(&d)).unwrap_or(false)
}

/// 새 버전이 있으면 그 버전 문자열. 확인 대상이 아니거나 없으면 None.
#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<Option<String>, String> {
    if !enabled(&app) {
        return Ok(None);
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| u.version))
}

/// 내려받아 설치하고 재시작한다.
#[tauri::command]
pub async fn updater_install(app: AppHandle) -> Result<(), String> {
    let Some(update) = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updater_skip_when_build_commit_present() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("build-commit"), "abc").unwrap();
        assert!(!should_check(d.path()));
    }

    #[test]
    fn updater_skip_not_when_distributed() {
        let d = tempfile::tempdir().unwrap();
        assert!(should_check(d.path()));
    }
}
