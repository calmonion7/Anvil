//! 준비물(tmux · claude CLI · forge 플러그인) 확인과 설치. 설치는 사용자가 [설치]를 누를 때만, macOS만.

use crate::session::{backend_missing, login_path};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Need {
    Tmux,
    Claude,
    Forge,
}

impl Need {
    fn label(self) -> &'static str {
        match self {
            Need::Tmux => "tmux",
            Need::Claude => "claude CLI",
            Need::Forge => "forge 플러그인",
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DepsStatus {
    pub needs: Vec<Need>,
    /// 띠에 띄울 문구. 다 있으면 None.
    pub message: Option<String>,
    /// [설치] 버튼을 띄울지(macOS만).
    pub installable: bool,
}

const FORGE_MARKETPLACE: &str = "gyuha/forge";
const FORGE_PLUGIN: &str = "forge@forge";

/// claude가 기록하는 설치 목록에 forge 플러그인이 있는가.
pub fn forge_installed(home: &Path) -> bool {
    std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json"))
        .map(|s| s.contains("\"forge@"))
        .unwrap_or(false)
}

/// macOS에서 빠진 준비물. `probe(프로그램, 인자)`가 실행 성공 여부를 알려준다.
pub fn missing(probe: impl Fn(&str, &[&str]) -> bool, forge: bool) -> Vec<Need> {
    let mut v = Vec::new();
    if !probe("tmux", &["-V"]) {
        v.push(Need::Tmux);
    }
    if !probe("claude", &["--version"]) {
        v.push(Need::Claude);
    }
    if !forge {
        v.push(Need::Forge);
    }
    v
}

/// 빠진 것만 차례로 설치하는 bash 스크립트. tmux는 Homebrew로만 설치한다.
/// jq는 선택(없어도 동작, 모델 표시만 빠짐) — 띠는 띄우지 않고, brew가 있으면 같이 깔되 실패해도 넘어간다.
pub fn install_script(needs: &[Need], has_brew: bool, has_jq: bool) -> Result<String, String> {
    let mut lines = vec!["set -e".to_string()];
    if has_brew && !has_jq {
        lines.push("brew install jq || true".into());
    }
    for n in needs {
        match n {
            Need::Tmux if !has_brew => {
                return Err("tmux 설치에 Homebrew가 필요합니다 — https://brew.sh 에서 설치한 뒤 다시 누르세요".into())
            }
            Need::Tmux => lines.push("brew install tmux".into()),
            Need::Claude => lines.push("curl -fsSL https://claude.ai/install.sh | bash".into()),
            Need::Forge => {
                lines.push(format!("claude plugin marketplace add {FORGE_MARKETPLACE} || true"));
                lines.push(format!("claude plugin install {FORGE_PLUGIN}"));
            }
        }
    }
    Ok(lines.join("\n"))
}

fn probe(prog: &str, args: &[&str]) -> bool {
    Command::new(prog)
        .args(args)
        .env("PATH", login_path())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn home() -> std::path::PathBuf {
    std::env::var("HOME").unwrap_or_default().into()
}

pub fn status() -> DepsStatus {
    if cfg!(windows) {
        let message = backend_missing(true, probe).map(String::from);
        return DepsStatus { needs: vec![], message, installable: false };
    }
    let needs = missing(probe, forge_installed(&home()));
    let message = (!needs.is_empty())
        .then(|| format!("필요: {}", needs.iter().map(|n| n.label()).collect::<Vec<_>>().join(" · ")));
    DepsStatus { installable: cfg!(target_os = "macos") && !needs.is_empty(), needs, message }
}

/// 빠진 것을 설치한다. 실패하면 출력 끝부분을 돌려준다.
pub fn install() -> Result<(), String> {
    let needs = status().needs;
    let script = install_script(&needs, probe("brew", &["--version"]), probe("jq", &["--version"]))?;
    let out = Command::new("/bin/bash")
        .args(["-c", &script])
        .env("PATH", login_path())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let log = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    let tail: Vec<&str> = log.lines().rev().take(3).collect();
    Err(tail.into_iter().rev().collect::<Vec<_>>().join(" / "))
}

/// 터미널 앱에서 claude를 열어 로그인하게 한다.
pub fn open_login() -> Result<(), String> {
    Command::new("osascript")
        .args(["-e", "tell application \"Terminal\" to do script \"claude\"", "-e", "tell application \"Terminal\" to activate"])
        .status()
        .map_err(|e| e.to_string())
        .and_then(|s| if s.success() { Ok(()) } else { Err("터미널을 열지 못했습니다".into()) })
}

// ---------- forge 플러그인 버전 ----------

/// Anvil 보드가 맞춰 만든 forge 버전(major.minor). 이보다 높으면 `.forge/` 형식이 달라졌을 수 있다.
const TESTED_FORGE: (u64, u64) = (0, 9);

#[derive(Serialize, Debug, PartialEq)]
pub struct ForgePlugin {
    /// 사용자 범위(모든 프로젝트 공통)에 설치된 버전
    pub installed: Option<String>,
    /// 마켓플레이스의 최신 버전
    pub latest: Option<String>,
    pub update_available: bool,
    /// Anvil이 확인한 forge보다 새 버전이라 보드가 정확하지 않을 수 있다
    pub untested: bool,
}

fn ver(s: &str) -> Vec<u64> {
    s.split(['-', '+']).next().unwrap_or("").split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

/// installed_plugins.json에서 user 범위 forge 버전.
pub fn forge_installed_version(home: &Path) -> Option<String> {
    let text = std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json["plugins"].as_object()?.iter().filter(|(k, _)| k.starts_with("forge@")).find_map(|(_, entries)| {
        entries.as_array()?.iter().find(|e| e["scope"] == "user")?["version"].as_str().map(String::from)
    })
}

/// 마켓플레이스 폴더의 plugin.json 버전.
pub fn forge_latest_version(home: &Path) -> Option<String> {
    let text = std::fs::read_to_string(home.join(".claude/plugins/marketplaces/forge/.claude-plugin/plugin.json")).ok()?;
    serde_json::from_str::<serde_json::Value>(&text).ok()?["version"].as_str().map(String::from)
}

pub fn forge_plugin_from(installed: Option<String>, latest: Option<String>) -> ForgePlugin {
    let update_available = matches!((&installed, &latest), (Some(i), Some(l)) if ver(l) > ver(i));
    let untested = installed.as_deref().map(ver).is_some_and(|v| {
        (v.first().copied().unwrap_or(0), v.get(1).copied().unwrap_or(0)) > TESTED_FORGE
    });
    ForgePlugin { installed, latest, update_available, untested }
}

/// 마켓플레이스를 새로 받아(네트워크) 설치 버전과 비교한다.
pub fn forge_plugin_status() -> ForgePlugin {
    let _ = Command::new("claude")
        .args(["plugin", "marketplace", "update", "forge"])
        .env("PATH", login_path())
        .output();
    let home = home();
    forge_plugin_from(forge_installed_version(&home), forge_latest_version(&home))
}

/// 사용자 범위 forge를 최신으로. 열린 claude 세션은 재시작해야 적용된다.
pub fn forge_plugin_update() -> Result<(), String> {
    let out = Command::new("claude")
        .args(["plugin", "update", FORGE_PLUGIN])
        .env("PATH", login_path())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("업데이트 실패").to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forge_plugin_update_and_compat() {
        let s = |v: &str| Some(v.to_string());
        let p = forge_plugin_from(s("0.9.5"), s("0.9.10"));
        assert!(p.update_available && !p.untested);
        assert!(!forge_plugin_from(s("0.9.5"), s("0.9.5")).update_available);
        assert!(forge_plugin_from(s("0.10.0"), s("0.10.0")).untested);
        assert!(forge_plugin_from(s("1.0.0"), None).untested);
        assert!(!forge_plugin_from(None, s("0.9.5")).update_available);
    }

    #[test]
    fn forge_plugin_reads_user_scope_and_marketplace() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".claude/plugins/marketplaces/forge/.claude-plugin")).unwrap();
        std::fs::write(
            d.path().join(".claude/plugins/installed_plugins.json"),
            r#"{"plugins":{"forge@forge":[{"scope":"local","version":"0.8.1"},{"scope":"user","version":"0.9.5"}]}}"#,
        )
        .unwrap();
        std::fs::write(d.path().join(".claude/plugins/marketplaces/forge/.claude-plugin/plugin.json"), r#"{"version":"0.9.6"}"#).unwrap();
        assert_eq!(forge_installed_version(d.path()).as_deref(), Some("0.9.5"));
        assert_eq!(forge_latest_version(d.path()).as_deref(), Some("0.9.6"));
    }

    #[test]
    fn deps_missing_lists_only_absent() {
        let all = |_: &str, _: &[&str]| true;
        let no_tmux = |p: &str, _: &[&str]| p != "tmux";
        assert_eq!(missing(all, true), vec![]);
        assert_eq!(missing(no_tmux, false), vec![Need::Tmux, Need::Forge]);
    }

    #[test]
    fn deps_forge_installed_reads_plugin_list() {
        let d = tempfile::tempdir().unwrap();
        assert!(!forge_installed(d.path()));
        std::fs::create_dir_all(d.path().join(".claude/plugins")).unwrap();
        std::fs::write(d.path().join(".claude/plugins/installed_plugins.json"), r#"{"plugins":{"forge@forge":[]}}"#).unwrap();
        assert!(forge_installed(d.path()));
    }

    #[test]
    fn deps_install_script_in_order() {
        let s = install_script(&[Need::Tmux, Need::Claude, Need::Forge], true, true).unwrap();
        let tmux = s.find("brew install tmux").unwrap();
        let claude = s.find("claude.ai/install.sh").unwrap();
        let forge = s.find("plugin install forge@forge").unwrap();
        assert!(s.starts_with("set -e") && tmux < claude && claude < forge);
        assert!(s.contains("marketplace add gyuha/forge"));
    }

    #[test]
    fn deps_install_script_needs_brew_for_tmux() {
        assert!(install_script(&[Need::Tmux], false, false).unwrap_err().contains("brew.sh"));
        assert!(!install_script(&[Need::Claude], false, false).unwrap().contains("brew"));
    }

    #[test]
    fn deps_install_script_adds_optional_jq() {
        assert!(install_script(&[Need::Claude], true, false).unwrap().contains("brew install jq || true"));
        assert!(!install_script(&[Need::Claude], true, true).unwrap().contains("jq"));
        assert!(!install_script(&[Need::Claude], false, false).unwrap().contains("jq"));
    }
}
