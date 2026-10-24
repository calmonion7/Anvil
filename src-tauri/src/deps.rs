//! 준비물(tmux · claude CLI · forge 플러그인) 확인과 설치. 설치는 사용자가 [설치]를 누를 때만, macOS만.
//! macOS는 tmux·jq가 앱에 내장돼 준비물이 node·claude CLI·forge(+개발자 도구)다.

use crate::session::{backend_missing, bundled_bin, login_path};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Need {
    Tmux,
    /// macOS 명령어 라인 개발자 도구(git) — claude가 forge 마켓플레이스를 git으로 받는다
    DevTools,
    /// forge 훅(SessionStart·Stop 등)이 node로 돈다 — 깨끗한 맥에는 없다
    Node,
    Claude,
    Forge,
}

impl Need {
    fn label(self) -> &'static str {
        match self {
            Need::Tmux => "tmux",
            Need::DevTools => crate::i18n::tr("개발자 도구(git)", "Developer tools (git)"),
            Need::Node => "node",
            Need::Claude => "claude CLI",
            Need::Forge => crate::i18n::tr("forge 플러그인", "forge plugin"),
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
/// macOS [설치]가 받는 node 버전(LTS). 올릴 때는 이 상수만 바꿔 릴리스한다.
const NODE_VERSION: &str = "v22.20.0";

/// claude가 기록하는 설치 목록에 forge 플러그인이 있는가.
pub fn forge_installed(home: &Path) -> bool {
    std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json"))
        .map(|s| s.contains("\"forge@"))
        .unwrap_or(false)
}

/// 빠진 준비물. `probe(프로그램, 인자)`가 실행 성공 여부를 알려준다.
/// `bundled_tmux`: macOS 앱에 tmux가 내장돼 있으면 tmux는 준비물이 아니다(ADR 261024-202909).
/// `mac`: forge가 빠졌으면 개발자 도구(git)도 확인한다 — `git` 대신 `xcode-select -p`로 물어야 설치 창이 뜨지 않는다.
pub fn missing(probe: impl Fn(&str, &[&str]) -> bool, forge: bool, bundled_tmux: bool, mac: bool) -> Vec<Need> {
    let mut v = Vec::new();
    if !bundled_tmux && !probe("tmux", &["-V"]) {
        v.push(Need::Tmux);
    }
    if mac && !forge && !probe("xcode-select", &["-p"]) {
        v.push(Need::DevTools);
    }
    if !probe("node", &["--version"]) {
        v.push(Need::Node);
    }
    if !probe("claude", &["--version"]) {
        v.push(Need::Claude);
    }
    if !forge {
        v.push(Need::Forge);
    }
    v
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Ok,
    Failed,
    Skipped,
    /// macOS 설치 창을 띄웠다 — 사용자가 창에서 끝내야 한다
    Started,
}

/// 설치 결과 한 항목 — 띠에 항목별로 보여 준다.
#[derive(Serialize, Debug)]
pub struct Step {
    pub need: Need,
    pub label: &'static str,
    pub outcome: Outcome,
    /// 실패 · 건너뜀 이유
    pub detail: Option<String>,
}

/// 준비물 하나를 설치하는 bash 명령. tmux는 Homebrew로만 설치한다(macOS는 내장이라 보통 오지 않는다).
pub fn step_cmd(need: Need, has_brew: bool) -> Result<String, String> {
    Ok(match need {
        Need::Tmux if !has_brew => {
            return Err(crate::i18n::tr("tmux 설치에 Homebrew가 필요합니다 — https://brew.sh", "Installing tmux requires Homebrew — https://brew.sh").into())
        }
        Need::Tmux => "brew install tmux".into(),
        // 설치 창이 Anvil 뒤로 숨지 않게, 창이 뜰 때까지 몇 초 재시도하며 앞으로 가져온다(못 가져와도 결과는 그대로).
        Need::DevTools => format!(
            "xcode-select --install || exit $?\nfor i in $(seq 20); do osascript -e 'if application \"{XCODE_INSTALLER}\" is running then tell application \"{XCODE_INSTALLER}\" to activate' -e 'application \"{XCODE_INSTALLER}\" is running' 2>/dev/null | grep -q true && break; sleep 0.25; done\nexit 0"
        ),
        // nodejs.org 공식 압축본을 SHASUMS256으로 검증해 ~/.local/share/anvil/node에 풀고 ~/.local/bin에 심링크(관리자 암호 없음)
        Need::Node => format!(
            "set -e\nV={NODE_VERSION}; A=$(uname -m); [ \"$A\" = x86_64 ] && A=x64\nF=node-$V-darwin-$A.tar.xz; T=$(mktemp -d); cd \"$T\"\ncurl -fsSLO https://nodejs.org/dist/$V/$F\ncurl -fsSL https://nodejs.org/dist/$V/SHASUMS256.txt | grep \" $F$\" | shasum -a 256 -c -\nD=\"$HOME/.local/share/anvil/node\"; rm -rf \"$D\"; mkdir -p \"$D\" \"$HOME/.local/bin\"\ntar -xf \"$F\" -C \"$D\" --strip-components 1\nfor b in node npm npx; do ln -sf \"$D/bin/$b\" \"$HOME/.local/bin/$b\"; done\nrm -rf \"$T\""
        ),
        Need::Claude => "curl -fsSL https://claude.ai/install.sh | bash".into(),
        Need::Forge => format!("set -e\nclaude plugin marketplace list | grep -qw forge || claude plugin marketplace add {FORGE_MARKETPLACE}\nclaude plugin install {FORGE_PLUGIN}"),
    })
}

const XCODE_INSTALLER: &str = "Install Command Line Developer Tools";

/// 항목별로 이어서 설치한다 — 하나가 실패해도 나머지를 계속하고, claude가 실패하면 forge는 건너뛴다.
pub fn install_with(needs: &[Need], has_brew: bool, mut run: impl FnMut(&str) -> Result<(), String>) -> Vec<Step> {
    let mut steps: Vec<Step> = Vec::new();
    for &need in needs {
        let not_ok = |n: Need| steps.iter().any(|s| s.need == n && s.outcome != Outcome::Ok);
        let result = if need == Need::Forge && not_ok(Need::Claude) {
            Err((Outcome::Skipped, crate::i18n::tr("claude CLI가 먼저 필요합니다", "claude CLI is required first").to_string()))
        } else if need == Need::Forge && not_ok(Need::DevTools) {
            Err((Outcome::Skipped, crate::i18n::tr("개발자 도구 설치를 마친 뒤 [다시 확인] → [설치]", "Finish installing the developer tools, then [Check again] → [Install]").to_string()))
        } else {
            step_cmd(need, has_brew).and_then(|c| run(&c)).map_err(|e| (Outcome::Failed, e))
        };
        let (outcome, detail) = match result {
            // 설치 창만 띄우고 바로 돌아온다
            Ok(()) if need == Need::DevTools => (
                Outcome::Started,
                Some(crate::i18n::tr("설치 창이 열렸습니다 — 설치를 마친 뒤 [다시 확인]", "An installer window opened — finish it, then [Check again]").to_string()),
            ),
            Ok(()) => (Outcome::Ok, None),
            Err((o, e)) => (o, Some(e)),
        };
        steps.push(Step { need, label: need.label(), outcome, detail });
    }
    steps
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
    crate::session::claude_home()
}

pub fn status() -> DepsStatus {
    if cfg!(windows) {
        // 윈도우: tmux · claude · node는 WSL 안에서 확인, forge는 WSL 홈의 플러그인 목록으로. node는 표시만 한다.
        let message = backend_missing(true, probe).map(String::from).or_else(|| {
            (!probe("wsl.exe", &["--", "bash", "-lc", "node --version"])).then(|| {
                crate::i18n::tr("WSL에 node 설치 필요(forge 훅이 node로 돈다): https://nodejs.org", "node is required in WSL (forge hooks run on node): https://nodejs.org").to_string()
            })
        }).or_else(|| {
            (!forge_installed(&home())).then(|| {
                crate::i18n::tr(
                    "WSL의 claude에 forge 플러그인 설치 필요: `wsl -- bash -lc \"claude plugin marketplace add gyuha/forge && claude plugin install forge@forge\"`",
                    "Install the forge plugin in WSL's claude: `wsl -- bash -lc \"claude plugin marketplace add gyuha/forge && claude plugin install forge@forge\"`",
                )
                .to_string()
            })
        });
        return DepsStatus { needs: vec![], message, installable: false };
    }
    let needs = missing(probe, forge_installed(&home()), bundled_bin().is_some(), cfg!(target_os = "macos"));
    let message = (!needs.is_empty())
        .then(|| format!("{}{}", crate::i18n::tr("필요: ", "Required: "), needs.iter().map(|n| n.label()).collect::<Vec<_>>().join(" · ")));
    DepsStatus { installable: cfg!(target_os = "macos") && !needs.is_empty(), needs, message }
}

/// 빠진 것을 항목별로 설치하고 결과를 돌려준다. 실패한 항목에는 출력의 마지막 줄을 붙인다.
pub fn install() -> Vec<Step> {
    let needs = status().needs;
    install_with(&needs, probe("brew", &["--version"]), |cmd| {
        let out = Command::new("/bin/bash").args(["-c", cmd]).env("PATH", login_path()).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        let log = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        Err(log.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string())
    })
}

/// 로그인 터미널에서 실행할 명령. 공식 설치본(~/.local/bin)은 새 셸 PATH에 없어 앞에 넣는다(v0.1.2 VM 실측).
const LOGIN_CMD: &str = "export PATH=\\\"$HOME/.local/bin:$PATH\\\"; claude";

/// 터미널 앱에서 claude를 열어 로그인하게 한다.
pub fn open_login() -> Result<(), String> {
    Command::new("osascript")
        .args(["-e", &format!("tell application \"Terminal\" to do script \"{LOGIN_CMD}\""), "-e", "tell application \"Terminal\" to activate"])
        .status()
        .map_err(|e| e.to_string())
        .and_then(|s| if s.success() { Ok(()) } else { Err(crate::i18n::tr("터미널을 열지 못했습니다", "Could not open a terminal").into()) })
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
    let _ = crate::session::claude_command(&["plugin", "marketplace", "update", "forge"]).output();
    let home = home();
    forge_plugin_from(forge_installed_version(&home), forge_latest_version(&home))
}

/// 사용자 범위 forge를 최신으로. 열린 claude 세션은 재시작해야 적용된다.
pub fn forge_plugin_update() -> Result<(), String> {
    let out = crate::session::claude_command(&["plugin", "update", FORGE_PLUGIN])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or(crate::i18n::tr("업데이트 실패", "Update failed")).to_string())
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
        assert_eq!(missing(all, true, false, false), vec![]);
        assert_eq!(missing(no_tmux, false, false, false), vec![Need::Tmux, Need::Forge]);
        // macOS 내장 tmux가 있으면 tmux는 준비물이 아니다
        assert_eq!(missing(no_tmux, false, true, false), vec![Need::Forge]);
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
    fn deps_install_steps_in_order() {
        assert!(step_cmd(Need::Claude, false).unwrap().contains("claude.ai/install.sh"));
        let forge = step_cmd(Need::Forge, false).unwrap();
        assert!(forge.contains("marketplace add gyuha/forge") && forge.contains("plugin install forge@forge"));
        assert_eq!(step_cmd(Need::Tmux, true).unwrap(), "brew install tmux");
        assert!(step_cmd(Need::Tmux, false).unwrap_err().contains("brew.sh"));
    }

    /// 하나가 실패해도 나머지를 이어 가고, claude가 실패하면 forge는 건너뛴다 — 결과는 항목별로
    #[test]
    fn deps_install_continues_and_skips_forge_without_claude() {
        let mut ran = Vec::new();
        let r = install_with(&[Need::Tmux, Need::Claude, Need::Forge], false, |c| {
            ran.push(c.to_string());
            if c.contains("install.sh") { Err("네트워크 오류".into()) } else { Ok(()) }
        });
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::Tmux, Outcome::Failed),
            (Need::Claude, Outcome::Failed),
            (Need::Forge, Outcome::Skipped),
        ]);
        assert!(r[0].detail.as_deref().unwrap().contains("brew.sh"));
        assert_eq!(r[1].detail.as_deref(), Some("네트워크 오류"));
        assert_eq!(ran.len(), 1, "tmux(brew 없음)와 forge(claude 실패)는 실행하지 않는다");

        let ok = install_with(&[Need::Claude, Need::Forge], false, |_| Ok(()));
        assert!(ok.iter().all(|s| s.outcome == Outcome::Ok && s.detail.is_none()));
    }

    /// 깨끗한 맥에는 git이 없어 forge 마켓플레이스를 못 받는다(v0.1.2 VM 실측) — forge가 빠졌을 때만 개발자 도구를 준비물로
    #[test]
    fn deps_devtools_needed_only_for_forge_on_mac() {
        let no_devtools = |p: &str, _: &[&str]| p != "xcode-select";
        assert_eq!(missing(no_devtools, false, true, true), vec![Need::DevTools, Need::Forge]);
        assert_eq!(missing(no_devtools, true, true, true), vec![], "forge가 있으면 git은 필요 없다");
        assert_eq!(missing(no_devtools, false, false, false), vec![Need::Forge], "macOS가 아니면 묻지 않는다");
    }

    /// 개발자 도구는 macOS 설치 창을 띄울 뿐이라 '시작됨', forge는 개발자 도구가 끝나기 전엔 건너뛴다
    #[test]
    fn deps_devtools_starts_installer_and_forge_waits() {
        let dt = step_cmd(Need::DevTools, false).unwrap();
        assert!(dt.starts_with("xcode-select --install || exit $?"), "{dt}");
        assert!(dt.contains("to activate") && dt.contains(XCODE_INSTALLER) && dt.ends_with("exit 0"), "설치 창을 앞으로 가져오되 실패해도 결과는 그대로: {dt}");
        let r = install_with(&[Need::DevTools, Need::Claude, Need::Forge], false, |_| Ok(()));
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::DevTools, Outcome::Started),
            (Need::Claude, Outcome::Ok),
            (Need::Forge, Outcome::Skipped),
        ]);
        assert!(r[0].detail.as_deref().unwrap().contains("다시 확인"));
        assert!(r[2].detail.as_deref().unwrap().contains("개발자 도구"));
    }

    /// 마켓플레이스 등록 실패를 숨기지 않는다(이미 등록돼 있으면 통과)
    #[test]
    fn deps_node_missing_is_listed_regardless_of_forge() {
        let no_node = |p: &str, _: &[&str]| p != "node";
        assert_eq!(missing(no_node, true, true, true), vec![Need::Node], "forge가 있어도 확인한다");
        assert_eq!(missing(no_node, true, true, false), vec![Need::Node], "macOS가 아니어도 띠에 표시한다");
        let none = |_: &str, _: &[&str]| false;
        assert_eq!(missing(none, false, true, true), vec![Need::DevTools, Need::Node, Need::Claude, Need::Forge], "설치 순서: 개발자 도구 → node → claude → forge");
    }

    #[test]
    fn deps_node_installs_pinned_verified_archive_into_local_bin() {
        let c = step_cmd(Need::Node, false).unwrap();
        assert!(c.starts_with("set -e"), "{c}");
        assert!(c.contains(&format!("V={NODE_VERSION}")) && NODE_VERSION.starts_with("v22."), "{c}");
        assert!(c.contains("https://nodejs.org/dist/$V/$F") && c.contains("darwin-$A.tar.xz"), "{c}");
        assert!(c.contains("SHASUMS256.txt") && c.contains("shasum -a 256 -c -"), "{c}");
        assert!(c.contains("$HOME/.local/share/anvil/node"), "{c}");
        assert!(c.contains("for b in node npm npx; do ln -sf \"$D/bin/$b\" \"$HOME/.local/bin/$b\""), "{c}");
        let r = install_with(&[Need::DevTools, Need::Node, Need::Claude, Need::Forge], false, |_| Ok(()));
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::DevTools, Outcome::Started),
            (Need::Node, Outcome::Ok),
            (Need::Claude, Outcome::Ok),
            (Need::Forge, Outcome::Skipped),
        ]);
    }

    #[test]
    fn deps_forge_marketplace_failure_is_not_swallowed() {
        let forge = step_cmd(Need::Forge, false).unwrap();
        assert!(!forge.contains("|| true"), "{forge}");
        assert!(forge.contains("marketplace list"), "{forge}");
    }

    /// 공식 설치본(~/.local/bin)은 새 셸 PATH에 없다 — 로그인 터미널이 그 경로를 넣고 claude를 부른다
    #[test]
    fn deps_login_command_finds_local_bin_claude() {
        assert!(LOGIN_CMD.contains("$HOME/.local/bin") && LOGIN_CMD.ends_with("claude"), "{LOGIN_CMD}");
    }
}
