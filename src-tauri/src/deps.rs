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

#[cfg(test)]
mod tests {
    use super::*;

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
