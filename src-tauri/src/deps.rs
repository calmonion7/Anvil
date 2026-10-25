//! 준비물(node 22 이상 · claude CLI · forge 플러그인) 확인과 설치. 설치는 사용자가 [설치]를 누를 때만, 세 OS 모두 관리자 권한 없이.
//! tmux는 세 OS 모두 앱에 내장돼 준비물이 아니다(ADR 261024-202909, 261025-163349). Windows는 WSL 안에서 확인·설치하고,
//! WSL과 배포판은 준비물보다 먼저 있어야 하는 바탕이라 안내만 한다.

use crate::session::{bundled_bin, login_path, run_path, ANVIL_PATH_SH, WSL_TMUX};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Need {
    Tmux,
    /// macOS 명령어 라인 개발자 도구(git) — claude가 forge 마켓플레이스를 git으로 받는다
    DevTools,
    /// Linux·WSL의 git — 같은 이유. 관리자 권한이 필요해 안내만 한다
    Git,
    /// forge 훅(SessionStart·Stop 등)이 node로 돈다 — 22 미만은 없는 것으로 친다
    Node,
    Claude,
    Forge,
}

impl Need {
    fn label(self) -> &'static str {
        match self {
            Need::Tmux => "tmux",
            Need::DevTools => crate::i18n::tr("개발자 도구(git)", "Developer tools (git)"),
            Need::Git => "git",
            Need::Node => crate::i18n::tr("node 22 이상", "node 22+"),
            Need::Claude => "claude CLI",
            Need::Forge => crate::i18n::tr("forge 플러그인", "forge plugin"),
        }
    }
}

/// 준비물을 확인·설치하는 곳. Windows는 WSL 안.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Os {
    Mac,
    Linux,
    Wsl,
}

impl Os {
    fn current() -> Os {
        if cfg!(windows) {
            Os::Wsl
        } else if cfg!(target_os = "macos") {
            Os::Mac
        } else {
            Os::Linux
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DepsStatus {
    pub needs: Vec<Need>,
    /// 띠에 띄울 문구. 다 있으면 None.
    pub message: Option<String>,
    /// [설치] 버튼을 띄울지.
    pub installable: bool,
    /// macos · linux · windows — 화면이 로그인 안내를 OS별로 고른다.
    pub platform: &'static str,
}

/// [설치] 한 번에 필요한 것: 어디서, Homebrew가 있는지(tmux), 사용자 PATH에 이미 node가 있는지(있으면 그 node는 건드리지 않는다).
pub struct Plan {
    pub os: Os,
    pub has_brew: bool,
    pub user_node: bool,
}

const FORGE_MARKETPLACE: &str = "gyuha/forge";
const FORGE_PLUGIN: &str = "forge@forge";
/// [설치]가 받는 node 버전(LTS). 올릴 때는 이 상수만 바꿔 릴리스한다.
const NODE_VERSION: &str = "v22.20.0";

/// claude가 기록하는 설치 목록에 forge 플러그인이 있는가.
pub fn forge_installed(home: &Path) -> bool {
    std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json"))
        .map(|s| s.contains("\"forge@"))
        .unwrap_or(false)
}

/// `node --version` 출력이 22 이상인가.
fn node_ok(version: &str) -> bool {
    version.trim().trim_start_matches('v').split('.').next().and_then(|m| m.parse::<u32>().ok()).is_some_and(|m| m >= 22)
}

/// 빠진 준비물. `probe(프로그램, 인자)`가 실행 성공 여부를, `node_version`이 Anvil PATH의 `node --version` 출력을 알려준다.
/// `bundled_tmux`: 앱에 tmux가 내장돼 있으면 tmux는 준비물이 아니다.
/// forge가 빠졌으면 git도 확인한다 — macOS는 `git` 대신 `xcode-select -p`로 물어야 설치 창이 뜨지 않는다.
pub fn missing(probe: impl Fn(&str, &[&str]) -> bool, node_version: Option<&str>, forge: bool, bundled_tmux: bool, os: Os) -> Vec<Need> {
    let mut v = Vec::new();
    if !bundled_tmux && !probe("tmux", &["-V"]) {
        v.push(Need::Tmux);
    }
    if !forge {
        match os {
            Os::Mac if !probe("xcode-select", &["-p"]) => v.push(Need::DevTools),
            Os::Linux | Os::Wsl if !probe("git", &["--version"]) => v.push(Need::Git),
            _ => {}
        }
    }
    if !node_version.is_some_and(node_ok) {
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

/// [설치]로 할 일이 남았는가 — git은 안내만 하고, git 없이는 forge도 못 받는다.
pub fn installable(needs: &[Need]) -> bool {
    needs.iter().any(|&n| n != Need::Git && !(n == Need::Forge && needs.contains(&Need::Git)))
}

/// git은 관리자 권한으로 직접 — 띠와 설치 결과에 같은 안내.
fn git_hint(os: Os) -> String {
    let cmd = if os == Os::Wsl { "wsl -- sudo apt install git" } else { "sudo apt install git" };
    format!("{}`{cmd}`", crate::i18n::tr("git은 터미널에서 직접 설치하세요: ", "Install git yourself in a terminal: "))
}

/// 띠 문구: 빠진 것들 + git이 빠졌으면 직접 설치 안내.
pub fn needs_message(needs: &[Need], os: Os) -> String {
    let mut m = format!("{}{}", crate::i18n::tr("필요: ", "Required: "), needs.iter().map(|n| n.label()).collect::<Vec<_>>().join(" · "));
    if needs.contains(&Need::Git) {
        m = format!("{m} — {}", git_hint(os));
    }
    m
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

/// 받기: 데스크톱 우분투엔 curl이 없어 wget으로도(claude install.sh도 wget으로 돈다 — 실측). `dl URL 파일|-`
const DL: &str = r#"dl() { if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$2" "$1"; else wget -q -O "$2" "$1"; fi; }"#;

/// node 설치: nodejs.org 공식 압축본을 SHASUMS256으로 검증해 ~/.local/share/anvil/node에 푼다(관리자 암호 없음).
/// 사용자 PATH에 node가 없을 때만 ~/.local/bin에 심링크한다 — 있으면 사용자의 node를 바꾸지 않는다(Anvil은 자기 PATH로 v22를 쓴다).
fn node_cmd(p: &Plan) -> String {
    let link = if p.user_node { "" } else { "for b in node npm npx; do ln -sf \"$D/bin/$b\" \"$HOME/.local/bin/$b\"; done\n" };
    let (fetch, file, check, untar) = if p.os == Os::Mac {
        (
            "A=$(uname -m); [ \"$A\" = x86_64 ] && A=x64\nF=node-$V-darwin-$A.tar.xz; T=$(mktemp -d); cd \"$T\"\ncurl -fsSLO https://nodejs.org/dist/$V/$F\n".to_string(),
            "",
            "curl -fsSL https://nodejs.org/dist/$V/SHASUMS256.txt | grep \" $F$\" | shasum -a 256 -c -",
            "tar -xf",
        )
    } else {
        (
            format!("{DL}\nA=$(uname -m); case \"$A\" in x86_64) A=x64;; aarch64) A=arm64;; esac\nF=node-$V-linux-$A.tar.gz; T=$(mktemp -d); cd \"$T\"\ndl https://nodejs.org/dist/$V/$F \"$F\"\n"),
            "dl https://nodejs.org/dist/$V/SHASUMS256.txt SHASUMS256.txt\n",
            "grep \" $F$\" SHASUMS256.txt | sha256sum -c -",
            "tar -xzf",
        )
    };
    format!(
        "set -e\nV={NODE_VERSION}; {fetch}{file}{check}\nD=\"$HOME/.local/share/anvil/node\"; rm -rf \"$D\"; mkdir -p \"$D\" \"$HOME/.local/bin\"\n{untar} \"$F\" -C \"$D\" --strip-components 1\n{link}rm -rf \"$T\""
    )
}

/// 준비물 하나를 설치하는 bash 명령. tmux는 Homebrew로만 설치한다(세 OS 모두 내장이라 보통 오지 않는다).
pub fn step_cmd(need: Need, p: &Plan) -> Result<String, String> {
    Ok(match need {
        Need::Tmux if !p.has_brew => {
            return Err(crate::i18n::tr("tmux 설치에 Homebrew가 필요합니다 — https://brew.sh", "Installing tmux requires Homebrew — https://brew.sh").into())
        }
        Need::Tmux => "brew install tmux".into(),
        // 설치 창이 Anvil 뒤로 숨지 않게, 창이 뜰 때까지 몇 초 재시도하며 앞으로 가져온다(못 가져와도 결과는 그대로).
        Need::DevTools => format!(
            "xcode-select --install || exit $?\nfor i in $(seq 20); do osascript -e 'if application \"{XCODE_INSTALLER}\" is running then tell application \"{XCODE_INSTALLER}\" to activate' -e 'application \"{XCODE_INSTALLER}\" is running' 2>/dev/null | grep -q true && break; sleep 0.25; done\nexit 0"
        ),
        Need::Git => return Err(git_hint(p.os)),
        Need::Node => node_cmd(p),
        Need::Claude if p.os == Os::Mac => "curl -fsSL https://claude.ai/install.sh | bash".into(),
        Need::Claude => format!("set -o pipefail\n{DL}\ndl https://claude.ai/install.sh - | bash"),
        Need::Forge => format!("set -e\nclaude plugin marketplace list | grep -qw forge || claude plugin marketplace add {FORGE_MARKETPLACE}\nclaude plugin install {FORGE_PLUGIN}"),
    })
}

const XCODE_INSTALLER: &str = "Install Command Line Developer Tools";

/// 항목별로 이어서 설치한다 — 하나가 실패해도 나머지를 계속하고, claude·git·개발자 도구가 안 되면 forge는 건너뛴다.
pub fn install_with(needs: &[Need], p: &Plan, mut run: impl FnMut(&str) -> Result<(), String>) -> Vec<Step> {
    let mut steps: Vec<Step> = Vec::new();
    for &need in needs {
        let not_ok = |n: Need| steps.iter().any(|s| s.need == n && s.outcome != Outcome::Ok);
        let result = if need == Need::Forge && not_ok(Need::Claude) {
            Err((Outcome::Skipped, crate::i18n::tr("claude CLI가 먼저 필요합니다", "claude CLI is required first").to_string()))
        } else if need == Need::Forge && not_ok(Need::DevTools) {
            Err((Outcome::Skipped, crate::i18n::tr("개발자 도구 설치를 마친 뒤 [다시 확인] → [설치]", "Finish installing the developer tools, then [Check again] → [Install]").to_string()))
        } else if need == Need::Forge && not_ok(Need::Git) {
            Err((Outcome::Skipped, crate::i18n::tr("git 설치를 마친 뒤 [다시 확인] → [설치]", "Install git, then [Check again] → [Install]").to_string()))
        } else if need == Need::Git {
            Err((Outcome::Skipped, format!("{} → [다시 확인]", git_hint(p.os))))
        } else {
            step_cmd(need, p).and_then(|c| run(&c)).map_err(|e| (Outcome::Failed, e))
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

/// WSL 안 로그인 셸에서 Anvil PATH를 앞에 두고 실행하는 `wsl.exe` 인자. `--`가 아니라 `-e` — `--`는 WSL 기본 셸이 `$`를 먼저 펼친다(e2e 실측).
fn wsl_argv(cmd: &str) -> Vec<String> {
    ["-e", "bash", "-lc"].map(String::from).into_iter().chain([format!("{ANVIL_PATH_SH}{cmd}")]).collect()
}

/// WSL이 없거나 배포판이 없으면 안내 문구 — 준비물보다 먼저 있어야 하는 바탕이라 [설치]하지 않는다.
pub fn wsl_missing(probe: impl Fn(&str, &[&str]) -> bool) -> Option<&'static str> {
    if !probe("wsl.exe", &["--version"]) {
        return Some(crate::i18n::tr(
            "WSL이 필요합니다 — 관리자 PowerShell에서 `wsl --install` 실행 후 다시 시작하세요",
            "WSL is required — run `wsl --install` in an admin PowerShell, then restart",
        ));
    }
    if !probe("wsl.exe", &["-e", "true"]) {
        return Some(crate::i18n::tr(
            "WSL에 리눅스 배포판이 필요합니다 — `wsl --install -d Ubuntu` 실행 후 사용자 이름을 만드세요",
            "WSL needs a Linux distribution — run `wsl --install -d Ubuntu` and create a user",
        ));
    }
    None
}

/// 배포판의 아키텍처(`uname -m`)에 맞는 내장 tmux를 WSL에 버전 이름으로 한 번 복사한다. `src`는 내장 폴더의 WSL 경로.
fn wsl_tmux_copy_cmd(src: &str) -> String {
    let src = format!("'{}'", src.replace('\'', r"'\''"));
    format!(
        "[ -x \"{WSL_TMUX}\" ] || {{ mkdir -p \"$(dirname \"{WSL_TMUX}\")\" && cp {src}/tmux-$(uname -m) \"{WSL_TMUX}.tmp\" && chmod 755 \"{WSL_TMUX}.tmp\" && mv \"{WSL_TMUX}.tmp\" \"{WSL_TMUX}\"; }}"
    )
}

/// 준비물 확인용 실행 — 성공하면 표준 출력. Windows는 WSL 로그인 셸 안에서 Anvil PATH로.
fn probe_out(os: Os, prog: &str, args: &[&str]) -> Option<String> {
    let out = if os == Os::Wsl {
        let line = std::iter::once(prog).chain(args.iter().copied()).map(|a| format!("'{}'", a.replace('\'', r"'\''"))).collect::<Vec<_>>().join(" ");
        Command::new("wsl.exe").args(wsl_argv(&line)).output()
    } else {
        Command::new(prog).args(args).env("PATH", run_path()).output()
    };
    out.ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}

/// 사용자 PATH(Anvil PATH 없이)에 node가 있는가 — 있으면 [설치]가 그 node를 가리지 않는다.
fn user_node(os: Os) -> bool {
    let out = if os == Os::Wsl {
        Command::new("wsl.exe").args(["-e", "bash", "-lc", "command -v node"]).output()
    } else {
        Command::new("node").arg("--version").env("PATH", login_path()).output()
    };
    out.is_ok_and(|o| o.status.success())
}

/// 호스트에서 바로 실행(윈도우의 wsl.exe 확인용).
fn probe_host(prog: &str, args: &[&str]) -> bool {
    Command::new(prog).args(args).output().is_ok_and(|o| o.status.success())
}

fn home() -> std::path::PathBuf {
    crate::session::claude_home()
}

pub fn status() -> DepsStatus {
    let os = Os::current();
    let platform = match os {
        Os::Mac => "macos",
        Os::Linux => "linux",
        Os::Wsl => "windows",
    };
    if os == Os::Wsl {
        if let Some(m) = wsl_missing(probe_host) {
            return DepsStatus { needs: vec![], message: Some(m.to_string()), installable: false, platform };
        }
        // 세션이 쓸 tmux를 먼저 놓아 둔다(ADR 261025-163349)
        if let Some(dir) = bundled_bin() {
            let _ = Command::new("wsl.exe").args(wsl_argv(&wsl_tmux_copy_cmd(&crate::wsl::to_wsl(&dir.to_string_lossy())))).output();
        }
    }
    let node = probe_out(os, "node", &["--version"]);
    let needs = missing(|p, a| probe_out(os, p, a).is_some(), node.as_deref(), forge_installed(&home()), bundled_bin().is_some(), os);
    let message = (!needs.is_empty()).then(|| needs_message(&needs, os));
    DepsStatus { installable: installable(&needs), needs, message, platform }
}

/// 빠진 것을 항목별로 설치하고 결과를 돌려준다. 실패한 항목에는 출력의 마지막 줄을 붙인다.
pub fn install() -> Vec<Step> {
    let os = Os::current();
    let needs = status().needs;
    let plan = Plan { os, has_brew: os == Os::Mac && probe_out(os, "brew", &["--version"]).is_some(), user_node: user_node(os) };
    install_with(&needs, &plan, |cmd| {
        let out = if os == Os::Wsl {
            Command::new("wsl.exe").args(wsl_argv(cmd)).output()
        } else {
            Command::new("/bin/bash").args(["-c", cmd]).env("PATH", run_path()).output()
        }
        .map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        let log = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        Err(log.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string())
    })
}

/// 로그인 터미널에서 실행할 명령. 공식 설치본(~/.local/bin)은 새 셸 PATH에 없어 앞에 넣는다(v0.1.2 VM 실측).
const LOGIN_CMD: &str = "export PATH=\\\"$HOME/.local/bin:$PATH\\\"; claude";

/// 터미널 앱에서 claude를 열어 로그인하게 한다(macOS — Linux·WSL은 세션을 열면 claude가 로그인을 안내한다).
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

    const MAC: Plan = Plan { os: Os::Mac, has_brew: false, user_node: false };
    const LINUX: Plan = Plan { os: Os::Linux, has_brew: false, user_node: false };
    const V22: Option<&str> = Some("v22.20.0");

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
        assert_eq!(missing(all, V22, true, false, Os::Linux), vec![]);
        assert_eq!(missing(no_tmux, V22, false, false, Os::Linux), vec![Need::Tmux, Need::Forge]);
        // 앱에 tmux가 내장돼 있으면 tmux는 준비물이 아니다
        assert_eq!(missing(no_tmux, V22, false, true, Os::Linux), vec![Need::Forge]);
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
        assert!(step_cmd(Need::Claude, &MAC).unwrap().contains("claude.ai/install.sh"));
        let forge = step_cmd(Need::Forge, &MAC).unwrap();
        assert!(forge.contains("marketplace add gyuha/forge") && forge.contains("plugin install forge@forge"));
        assert_eq!(step_cmd(Need::Tmux, &Plan { has_brew: true, ..MAC }).unwrap(), "brew install tmux");
        assert!(step_cmd(Need::Tmux, &MAC).unwrap_err().contains("brew.sh"));
    }

    /// 하나가 실패해도 나머지를 이어 가고, claude가 실패하면 forge는 건너뛴다 — 결과는 항목별로
    #[test]
    fn deps_install_continues_and_skips_forge_without_claude() {
        let mut ran = Vec::new();
        let r = install_with(&[Need::Tmux, Need::Claude, Need::Forge], &MAC, |c| {
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

        let ok = install_with(&[Need::Claude, Need::Forge], &MAC, |_| Ok(()));
        assert!(ok.iter().all(|s| s.outcome == Outcome::Ok && s.detail.is_none()));
    }

    /// 깨끗한 맥에는 git이 없어 forge 마켓플레이스를 못 받는다(v0.1.2 VM 실측) — forge가 빠졌을 때만 개발자 도구를 준비물로
    #[test]
    fn deps_devtools_needed_only_for_forge_on_mac() {
        let no_devtools = |p: &str, _: &[&str]| p != "xcode-select";
        assert_eq!(missing(no_devtools, V22, false, true, Os::Mac), vec![Need::DevTools, Need::Forge]);
        assert_eq!(missing(no_devtools, V22, true, true, Os::Mac), vec![], "forge가 있으면 git은 필요 없다");
        assert_eq!(missing(no_devtools, V22, false, false, Os::Linux), vec![Need::Forge], "macOS가 아니면 묻지 않는다");
    }

    /// 개발자 도구는 macOS 설치 창을 띄울 뿐이라 '시작됨', forge는 개발자 도구가 끝나기 전엔 건너뛴다
    #[test]
    fn deps_devtools_starts_installer_and_forge_waits() {
        let dt = step_cmd(Need::DevTools, &MAC).unwrap();
        assert!(dt.starts_with("xcode-select --install || exit $?"), "{dt}");
        assert!(dt.contains("to activate") && dt.contains(XCODE_INSTALLER) && dt.ends_with("exit 0"), "설치 창을 앞으로 가져오되 실패해도 결과는 그대로: {dt}");
        let r = install_with(&[Need::DevTools, Need::Claude, Need::Forge], &MAC, |_| Ok(()));
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::DevTools, Outcome::Started),
            (Need::Claude, Outcome::Ok),
            (Need::Forge, Outcome::Skipped),
        ]);
        assert!(r[0].detail.as_deref().unwrap().contains("다시 확인"));
        assert!(r[2].detail.as_deref().unwrap().contains("개발자 도구"));
    }

    #[test]
    fn deps_node_missing_is_listed_regardless_of_forge() {
        let all = |_: &str, _: &[&str]| true;
        assert_eq!(missing(all, None, true, true, Os::Mac), vec![Need::Node], "forge가 있어도 확인한다");
        assert_eq!(missing(all, None, true, true, Os::Linux), vec![Need::Node], "macOS가 아니어도 띠에 표시한다");
        let none = |_: &str, _: &[&str]| false;
        assert_eq!(missing(none, None, false, true, Os::Mac), vec![Need::DevTools, Need::Node, Need::Claude, Need::Forge], "설치 순서: 개발자 도구 → node → claude → forge");
    }

    /// 22 미만의 node는 없는 것으로 친다(준비물 정의) — 띠 문구도 'node 22 이상'
    #[test]
    fn deps_node_below_22_counts_as_missing() {
        let all = |_: &str, _: &[&str]| true;
        for old in ["v21.7.3", "v12.22.9", "garbage"] {
            assert_eq!(missing(all, Some(old), true, true, Os::Linux), vec![Need::Node], "{old}");
        }
        for ok in ["v22.0.0", "v22.20.0", "v24.1.0"] {
            assert_eq!(missing(all, Some(ok), true, true, Os::Linux), vec![], "{ok}");
        }
        assert!(Need::Node.label().contains("22"), "{}", Need::Node.label());
    }

    #[test]
    fn deps_node_installs_pinned_verified_archive_into_local_bin() {
        let c = step_cmd(Need::Node, &MAC).unwrap();
        assert!(c.starts_with("set -e"), "{c}");
        assert!(c.contains(&format!("V={NODE_VERSION}")) && NODE_VERSION.starts_with("v22."), "{c}");
        assert!(c.contains("https://nodejs.org/dist/$V/$F") && c.contains("darwin-$A.tar.xz"), "{c}");
        assert!(c.contains("SHASUMS256.txt") && c.contains("shasum -a 256 -c -"), "{c}");
        assert!(c.contains("$HOME/.local/share/anvil/node"), "{c}");
        assert!(c.contains("for b in node npm npx; do ln -sf \"$D/bin/$b\" \"$HOME/.local/bin/$b\""), "{c}");
        let r = install_with(&[Need::DevTools, Need::Node, Need::Claude, Need::Forge], &MAC, |_| Ok(()));
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::DevTools, Outcome::Started),
            (Need::Node, Outcome::Ok),
            (Need::Claude, Outcome::Ok),
            (Need::Forge, Outcome::Skipped),
        ]);
    }

    /// Linux·WSL: nodejs.org linux 압축본 + sha256sum. 사용자의 옛 node는 바꾸지 않는다 — 있으면 심링크하지 않는다(결정 5).
    /// 데스크톱 우분투엔 curl이 없어 wget으로도 받는다(fu-fe950c698c91).
    #[test]
    fn deps_linux_node_uses_linux_archive_and_keeps_user_node() {
        let c = step_cmd(Need::Node, &LINUX).unwrap();
        assert!(c.starts_with("set -e"), "{c}");
        assert!(c.contains("linux-$A.tar.gz") && c.contains("sha256sum -c -"), "{c}");
        assert!(c.contains("x86_64) A=x64") && c.contains("aarch64) A=arm64"), "{c}");
        assert!(c.contains("$HOME/.local/share/anvil/node") && c.contains("ln -sf"), "사용자 PATH에 node가 없으면 채운다: {c}");
        assert!(c.contains("wget"), "{c}");
        let keep = step_cmd(Need::Node, &Plan { user_node: true, ..LINUX }).unwrap();
        assert!(!keep.contains("ln -sf"), "옛 node가 있으면 심링크하지 않는다: {keep}");
        let claude = step_cmd(Need::Claude, &LINUX).unwrap();
        assert!(claude.contains("claude.ai/install.sh") && claude.contains("wget"), "{claude}");
    }

    /// Linux·WSL: forge는 git이 있어야 받는다(마켓플레이스 = git clone, 실측). git은 관리자 권한이 필요해 안내만 한다.
    #[test]
    fn deps_linux_needs_git_for_forge_and_is_installable() {
        let no_git = |p: &str, _: &[&str]| p != "git";
        assert_eq!(missing(no_git, V22, false, true, Os::Linux), vec![Need::Git, Need::Forge]);
        assert_eq!(missing(no_git, V22, true, true, Os::Linux), vec![], "forge가 있으면 git은 필요 없다");
        assert_eq!(missing(no_git, V22, false, true, Os::Wsl), vec![Need::Git, Need::Forge]);
        assert!(installable(&[Need::Node, Need::Claude, Need::Forge]));
        assert!(installable(&[Need::Git, Need::Node, Need::Forge]));
        assert!(!installable(&[Need::Git, Need::Forge]), "git만 남으면 [설치]로 할 일이 없다");
        assert!(!installable(&[]));
        let r = install_with(&[Need::Git, Need::Node, Need::Claude, Need::Forge], &LINUX, |_| Ok(()));
        assert_eq!(r.iter().map(|s| (s.need, s.outcome)).collect::<Vec<_>>(), vec![
            (Need::Git, Outcome::Skipped),
            (Need::Node, Outcome::Ok),
            (Need::Claude, Outcome::Ok),
            (Need::Forge, Outcome::Skipped),
        ]);
        assert!(r[0].detail.as_deref().unwrap().contains("sudo apt install git"));
        assert!(needs_message(&[Need::Git, Need::Node], Os::Linux).contains("`sudo apt install git`"));
        assert!(needs_message(&[Need::Git], Os::Wsl).contains("`wsl -- sudo apt install git`"));
        assert!(!needs_message(&[Need::Node], Os::Linux).contains("apt"));
    }

    /// Windows: WSL 자체가 없는 것과 배포판이 없는 것을 따로 안내한다 — 둘 다 해결돼야 [설치]가 보인다
    #[test]
    fn deps_wsl_missing_vs_no_distro() {
        let none = |_: &str, _: &[&str]| false;
        let no_distro = |_: &str, a: &[&str]| a != ["-e", "true"];
        let all = |_: &str, _: &[&str]| true;
        let a = wsl_missing(none).unwrap();
        let b = wsl_missing(no_distro).unwrap();
        assert!(a.contains("wsl --install") && !a.contains("-d Ubuntu"), "{a}");
        assert!(b.contains("wsl --install -d Ubuntu"), "{b}");
        assert_eq!(wsl_missing(all), None);
    }

    /// Windows도 macOS·Linux처럼 항목 목록으로 — 설치는 WSL 로그인 셸 안에서, Anvil PATH를 앞에 두고
    #[test]
    fn deps_windows_lists_needs_and_installs_inside_wsl() {
        let none = |_: &str, _: &[&str]| false;
        assert_eq!(missing(none, None, false, true, Os::Wsl), vec![Need::Git, Need::Node, Need::Claude, Need::Forge]);
        let argv = wsl_argv("echo hi");
        assert_eq!(argv[..3], ["-e", "bash", "-lc"]);
        assert_eq!(argv[3], format!("{}echo hi", crate::session::ANVIL_PATH_SH));
        assert!(step_cmd(Need::Node, &Plan { os: Os::Wsl, ..LINUX }).unwrap().contains("linux-$A.tar.gz"));
    }

    /// WSL에는 배포판의 아키텍처에 맞는 내장 tmux를 버전 이름으로 한 번 복사한다(ADR 261025-163349)
    #[test]
    fn deps_wsl_copies_bundled_tmux_by_arch() {
        let c = wsl_tmux_copy_cmd("/mnt/c/Program Files/Anvil/bin");
        assert!(c.contains("uname -m"), "{c}");
        assert!(c.contains("'/mnt/c/Program Files/Anvil/bin'/tmux-$(uname -m)") || c.contains("'/mnt/c/Program Files/Anvil/bin/tmux-'\"$(uname -m)\""), "{c}");
        assert!(c.contains(crate::session::WSL_TMUX) && crate::session::WSL_TMUX.ends_with("tmux-3.6a"), "{c}");
        assert!(c.starts_with(&format!("[ -x \"{}\" ] ||", crate::session::WSL_TMUX)), "이미 있으면 건드리지 않는다: {c}");
    }

    #[test]
    fn deps_forge_marketplace_failure_is_not_swallowed() {
        let forge = step_cmd(Need::Forge, &MAC).unwrap();
        assert!(!forge.contains("|| true"), "{forge}");
        assert!(forge.contains("marketplace list"), "{forge}");
    }

    /// 공식 설치본(~/.local/bin)은 새 셸 PATH에 없다 — 로그인 터미널이 그 경로를 넣고 claude를 부른다
    #[test]
    fn deps_login_command_finds_local_bin_claude() {
        assert!(LOGIN_CMD.contains("$HOME/.local/bin") && LOGIN_CMD.ends_with("claude"), "{LOGIN_CMD}");
    }
}
