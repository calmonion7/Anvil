//! 세션 — Anvil 전용 tmux 소켓(`tmux -L anvil`) 위의 claude 하나(ADR 261017-211601).
//! 세션 상태는 앱이 아니라 claude 훅이 앱 데이터 `sessions/<세션 이름>.json`에 남긴다.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

pub const SOCKET: &str = "anvil";

// ---------- 환경 ----------

/// Finder에서 띄운 GUI 앱은 PATH가 최소라 `claude`(~/.local/bin)·`tmux`(/opt/homebrew/bin)를 못 찾는다.
/// 로그인 셸에서 PATH를 한 번 받아 tmux 서버·claude에 넘긴다.
pub fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(&shell)
            .args(["-ilc", "printf '__ANVIL_PATH__%s__END__' \"$PATH\""])
            .output();
        let from_shell = out.ok().and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).into_owned();
            let start = s.find("__ANVIL_PATH__")? + "__ANVIL_PATH__".len();
            let end = s[start..].find("__END__")? + start;
            Some(s[start..end].to_string())
        });
        let base = from_shell.unwrap_or_else(|| std::env::var("PATH").unwrap_or_default());
        // 셸 설정이 깨져 있어도 tmux·claude는 찾게 한다.
        let home = std::env::var("HOME").unwrap_or_default();
        format!("{base}:/opt/homebrew/bin:/usr/local/bin:{home}/.local/bin:/usr/bin:/bin")
    })
}

/// GUI 앱에는 LANG이 없어 tmux가 한글을 `_`로 바꾼다. 없으면 UTF-8 로캘을 준다.
fn lang() -> String {
    std::env::var("LANG").ok().filter(|l| l.contains("UTF-8")).unwrap_or_else(|| "en_US.UTF-8".into())
}

/// tmux에 넘기는 경로. 윈도우에선 tmux가 WSL 안에 있으므로 WSL 경로로 바꾼다.
pub fn tmux_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    if cfg!(windows) { crate::wsl::to_wsl(&s) } else { s.into_owned() }
}

/// tmux를 부르는 유일한 경로: (프로그램, 공통 인자). 윈도우에선 `wsl.exe -- tmux …`.
fn tmux_argv(conf: &Path) -> (&'static str, Vec<String>) {
    #[cfg(windows)]
    let (prog, mut args) = ("wsl.exe", vec!["--".to_string(), "tmux".to_string()]);
    #[cfg(not(windows))]
    let (prog, mut args) = ("tmux", Vec::<String>::new());
    args.extend(["-u", "-L", SOCKET, "-f"].map(String::from));
    args.push(tmux_path(conf));
    (prog, args)
}

fn tmux(conf: &Path) -> Command {
    let (prog, args) = tmux_argv(conf);
    let mut c = Command::new(prog);
    c.args(args).env("PATH", login_path()).env("LANG", lang());
    c
}

/// WSL·tmux가 없으면 안내 문구. `probe(프로그램, 인자)`가 실행 성공 여부를 알려준다.
pub fn backend_missing(windows: bool, probe: impl Fn(&str, &[&str]) -> bool) -> Option<&'static str> {
    if windows {
        if !probe("wsl.exe", &["--", "true"]) || !probe("wsl.exe", &["--", "tmux", "-V"]) {
            return Some("WSL에 tmux 설치 필요: `wsl -- sudo apt install tmux`");
        }
    } else if !probe("tmux", &["-V"]) {
        return Some("tmux 설치 필요: `brew install tmux`");
    }
    None
}

/// 실제 환경으로 backend_missing을 잰다.
pub fn backend_status() -> Option<&'static str> {
    backend_missing(cfg!(windows), |prog, args| {
        Command::new(prog)
            .args(args)
            .env("PATH", login_path())
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

// ---------- 앱 데이터 파일(tmux.conf · 훅) ----------

/// 스크립트에 실행 권한을 준다. 윈도우에는 실행 비트가 없어 할 일이 없다.
fn make_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

const TMUX_CONF: &str = "\
set -g status off
set -g mouse on
set -g history-limit 50000
set -g default-terminal \"xterm-256color\"
set -g escape-time 10
";

const HOOK_SCRIPT: &str = r#"#!/bin/bash
# Anvil 세션 상태 훅 — claude가 SessionStart·UserPromptSubmit·PostToolUse·Stop·Notification·SessionEnd 때 부른다.
# 어떤 경우에도 claude를 막지 않도록 항상 exit 0.
state="$1"; dir="$(cd "$(dirname "$0")" && pwd)"; name="${ANVIL_SESSION:-}"
[ -n "$name" ] || exit 0
input="$(cat 2>/dev/null)"
sid="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
mkdir -p "$dir/sessions"
f="$dir/sessions/$name.json"
prev=""
if [ -f "$f" ]; then
  prev="$(sed -n 's/.*"state":"\([^"]*\)".*/\1/p' "$f")"
  [ -n "$sid" ] || sid="$(sed -n 's/.*"session_id":"\([^"]*\)".*/\1/p' "$f")"
fi
printf '{"state":"%s","session_id":"%s","ts":%s}\n' "$state" "$sid" "$(date +%s)" > "$f.tmp" && mv "$f.tmp" "$f"
# 입력 대기로 바뀌었는데 앱이 꺼져 있으면 훅이 직접 알린다(앱이 떠 있으면 앱이 알린다).
if [ "$state" = waiting ] && [ "$prev" != waiting ]; then
  pid="$(cat "$dir/app.pid" 2>/dev/null)"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    msg="$(tr -d '"\\' < "$dir/summary/$name.txt" 2>/dev/null)"
    osascript -e "display notification \"${msg:-입력 대기}\" with title \"Anvil\"" >/dev/null 2>&1 &
  fi
fi
exit 0
"#;

/// 상태줄 래퍼 — claude가 상태줄을 그릴 때 넘기는 JSON에서 모델·effort를 세션별 파일(`models/<세션 이름>.json`)에
/// 남긴 뒤, 같은 입력으로 사용자의 원래 상태줄 명령을 실행해 출력을 그대로 내보낸다(훅 입력에는 이 값이 없다).
const STATUSLINE_SCRIPT: &str = r#"#!/bin/bash
dir="$(cd "$(dirname "$0")" && pwd)"; name="${ANVIL_SESSION:-}"
input="$(cat)"
if [ -n "$name" ] && command -v jq >/dev/null 2>&1; then
  mkdir -p "$dir/models"
  f="$dir/models/$name.json"
  # effort는 { level } 객체 또는 옛 형식인 문자열(claude-hud src/effort.ts와 같은 해석)
  printf '%s' "$input" | jq -c '{model: (.model.display_name // null),
    effort: (if (.effort|type) == "object" then .effort.level elif (.effort|type) == "string" then .effort else null end)}' \
    > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f"
fi
# 원래 상태줄 명령 — claude와 같은 우선순위(프로젝트 local → 프로젝트 → 사용자)
proj="$(printf '%s' "$input" | jq -r '.workspace.project_dir // .cwd // empty' 2>/dev/null)"
[ -n "$proj" ] || proj="$PWD"
orig=""
for s in "$proj/.claude/settings.local.json" "$proj/.claude/settings.json" "$HOME/.claude/settings.json"; do
  [ -f "$s" ] || continue
  orig="$(jq -r '.statusLine.command // empty' "$s" 2>/dev/null)"
  [ -n "$orig" ] && break
done
case "$orig" in ""|*anvil-statusline.sh*) exit 0 ;; esac
printf '%s' "$input" | bash -c "$orig"
"#;

pub struct Files {
    pub dir: PathBuf,
}

impl Files {
    pub fn conf(&self) -> PathBuf {
        self.dir.join("tmux.conf")
    }
    pub fn hooks(&self) -> PathBuf {
        self.dir.join("hooks.json")
    }
    pub fn sessions(&self) -> PathBuf {
        self.dir.join("sessions")
    }
    /// 상태줄 래퍼가 남기는 세션별 모델·effort. `states()`가 `sessions/*.json`을 모두 세션으로 읽어 폴더를 따로 둔다.
    pub fn models(&self) -> PathBuf {
        self.dir.join("models")
    }

    /// 앱이 시작할 때마다 tmux.conf · 훅 스크립트 · 상태줄 래퍼 · 훅 설정을 다시 쓴다(앱 업데이트 반영).
    pub fn install(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(self.sessions())?;
        std::fs::create_dir_all(self.models())?;
        std::fs::create_dir_all(self.dir.join("summary"))?;
        std::fs::write(self.conf(), TMUX_CONF)?;
        let script = self.dir.join("anvil-hook.sh");
        std::fs::write(&script, HOOK_SCRIPT)?;
        make_executable(&script)?;
        let statusline = self.dir.join("anvil-statusline.sh");
        std::fs::write(&statusline, STATUSLINE_SCRIPT)?;
        make_executable(&statusline)?;
        let cmd = |state: &str| serde_json::json!([{ "hooks": [{ "type": "command", "command": format!("'{}' {state}", script.display()) }] }]);
        let settings = serde_json::json!({ "hooks": {
            "SessionStart": cmd("waiting"),
            "UserPromptSubmit": cmd("working"),
            "PostToolUse": cmd("working"),
            "Stop": cmd("waiting"),
            "Notification": cmd("waiting"),
            "SessionEnd": cmd("ended"),
        }, "statusLine": { "type": "command", "command": format!("'{}'", statusline.display()) } });
        std::fs::write(self.hooks(), serde_json::to_string_pretty(&settings)?)?;
        Ok(())
    }

    /// 훅이 앱이 꺼져 있을 때 알림 문구로 쓰는 프로젝트 요약.
    pub fn write_summary(&self, project: &Path, name: &str, headline: &str) {
        for role in ["plan", "run"] {
            let label = if role == "plan" { "계획" } else { "실행" };
            let _ = std::fs::write(
                self.dir.join("summary").join(format!("{}.txt", session_name(project, role))),
                format!("{name} {label} 세션 · 입력 대기 — {headline}"),
            );
        }
    }
}

/// macOS 알림. tauri 알림 플러그인은 macOS 27에서 무시되는 NSUserNotificationCenter를 써서,
/// 앱이 꺼져 있을 때 훅이 쓰는 것과 같은 `osascript display notification`으로 보낸다.
pub fn notify(body: &str) {
    let body: String = body.chars().filter(|c| *c != '"' && *c != '\\').collect();
    let _ = Command::new("osascript")
        .args(["-e", &format!("display notification \"{body}\" with title \"Anvil\"")])
        .spawn();
}

// ---------- 세션 ----------

/// `anvil-<프로젝트키>-<plan|run>`. 키는 폴더 이름 + 경로 해시 6자리(같은 이름 폴더 구분).
pub fn session_name(project: &Path, role: &str) -> String {
    let base: String = project
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    // FNV-1a — 실행마다 같은 값이어야 해서 std 해시(무작위 시드)를 쓰지 않는다.
    let mut h: u32 = 0x811c9dc5;
    for b in project.to_string_lossy().bytes() {
        h = (h ^ b as u32).wrapping_mul(0x01000193);
    }
    format!("anvil-{base}-{:06x}-{role}", h & 0xffffff)
}

/// claude 세션에 붙이는 이름과 모델 — cxa(`~/cc.sh`) 규칙에 `[Anvil]` 접두어(cxa가 자기 세션으로 보고 건드리지 않게).
/// 폴더 이름은 대소문자를 바꾸지 않는다(cc.sh가 `basename`을 그대로 씀). 계획 = opus, 실행 = sonnet(늘 최신 별칭).
pub fn session_title(project: &Path, role: &str) -> (String, &'static str) {
    let folder = project.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let (mode, model) = if role == "plan" { ("PLAN", "opus") } else { ("RUN", "sonnet") };
    (format!("[Anvil] [{folder}] {mode}"), model)
}

/// 셸 작은따옴표 인용(폴더 이름에 `'`가 있어도 깨지지 않게).
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// 부모 claude가 자식 프로세스에 심는 변수를 지우는 셸 앞머리. Anvil을 다른 claude 세션 안에서 띄우면
/// (예: 허브 세션에서 dev 실행) tmux 서버·세션이 그 값을 물려받아, 새 claude가 자기를 부모의 자식 세션으로 보고
/// 이름(-n)을 부모 세션 이름으로 덮거나 effort를 따라간다(2026-10-18 실측: `[Anvil] PLAN`, `CLAUDE_EFFORT=low`).
/// 사용자 설정인 CLAUDE_CONFIG_DIR 등은 건드리지 않는다.
const UNSET_PARENT_CLAUDE: &str = r#"for v in $(env | sed -nE 's/^(CLAUDECODE|CLAUDE_CODE_[A-Z0-9_]+|CLAUDE_PID|CLAUDE_JOB_DIR|CLAUDE_EFFORT)=.*/\1/p'); do unset "$v"; done; "#;

pub fn live_sessions(files: &Files) -> Vec<String> {
    tmux(&files.conf())
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(String::from).collect())
        .unwrap_or_default()
}

pub fn start(files: &Files, project: &Path, role: &str) -> Result<String, String> {
    let name = session_name(project, role);
    if live_sessions(files).contains(&name) {
        return Ok(name);
    }
    let _ = std::fs::remove_file(files.sessions().join(format!("{name}.json")));
    let _ = std::fs::remove_file(files.models().join(format!("{name}.json")));
    let (title, model) = session_title(project, role);
    let cmd = format!(
        "{UNSET_PARENT_CLAUDE}exec claude -n {} --model {model} --settings {}",
        sh_quote(&title),
        sh_quote(&files.hooks().to_string_lossy())
    );
    let out = tmux(&files.conf())
        .args(["new-session", "-d", "-s", &name, "-x", "200", "-y", "50", "-c"])
        .arg(tmux_path(project))
        .args(["-e", &format!("ANVIL_SESSION={name}"), "-e", &format!("PATH={}", login_path()), "-e", &format!("LANG={}", lang())])
        // 전역 훅 cc-session-name.sh(SessionStart clear)가 /clear 뒤에 이 이름을 다시 붙인다.
        .args(["-e", &format!("CC_SESSION_NAME={title}")])
        .arg(cmd)
        .output()
        .map_err(|e| format!("tmux를 실행할 수 없습니다: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(name)
}

/// 세션 입력창에 글자만 채운다. Enter는 보내지 않는다 — 실행은 사람이 누른다.
pub fn fill(files: &Files, name: &str, text: &str) -> Result<(), String> {
    let out = tmux(&files.conf()).args(["send-keys", "-t", name, "-l", text]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// 새로 띄운 세션이 SessionStart 훅으로 입력 대기를 알릴 때까지 기다린다.
pub fn wait_ready(files: &Files, name: &str, timeout: std::time::Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if states(files).get(name).is_some_and(|s| s.alive && s.state == "waiting") {
            // 훅이 claude 화면이 입력을 받을 준비를 마치기 조금 전에 불릴 수 있다.
            std::thread::sleep(std::time::Duration::from_millis(800));
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    false
}

pub fn kill(files: &Files, name: &str) -> Result<(), String> {
    let out = tmux(&files.conf()).args(["kill-session", "-t", name]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    /// working · waiting · ended · starting
    pub state: String,
    pub session_id: Option<String>,
    pub alive: bool,
}

/// 훅이 남긴 상태 파일 + tmux 생존 여부. tmux 세션이 없으면 파일과 상관없이 종료다.
pub fn states(files: &Files) -> HashMap<String, SessionState> {
    let live = live_sessions(files);
    let mut map = HashMap::new();
    for e in std::fs::read_dir(files.sessions()).into_iter().flatten().flatten() {
        let name = e.file_name().to_string_lossy().trim_end_matches(".json").to_string();
        if !e.file_name().to_string_lossy().ends_with(".json") {
            continue;
        }
        let v: serde_json::Value = std::fs::read_to_string(e.path()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        let alive = live.contains(&name);
        let state = if alive { v["state"].as_str().unwrap_or("starting").to_string() } else { "ended".into() };
        let session_id = v["session_id"].as_str().filter(|s| !s.is_empty()).map(String::from);
        map.insert(name, SessionState { state, session_id, alive });
    }
    for name in live {
        map.entry(name).or_insert(SessionState { state: "starting".into(), session_id: None, alive: true });
    }
    map
}

#[derive(Debug, Clone, Serialize, serde::Deserialize, Default)]
pub struct ModelInfo {
    pub model: Option<String>,
    pub effort: Option<String>,
}

/// 상태줄 래퍼가 남긴 세션별 실제 모델·effort(tmux 세션 이름 → 값).
pub fn models(files: &Files) -> HashMap<String, ModelInfo> {
    let mut map = HashMap::new();
    for e in std::fs::read_dir(files.models()).into_iter().flatten().flatten() {
        let file = e.file_name().to_string_lossy().into_owned();
        let Some(name) = file.strip_suffix(".json") else { continue };
        if let Some(m) = std::fs::read_to_string(e.path()).ok().and_then(|t| serde_json::from_str(&t).ok()) {
            map.insert(name.to_string(), m);
        }
    }
    map
}

// ---------- 터미널(pty 안에서 `tmux attach`) ----------

struct Term {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terms(Mutex<HashMap<u32, Term>>);

/// 쪼개져 도착한 UTF-8 바이트를 온전한 글자까지만 넘기고 나머지는 다음 조각에 붙인다.
fn take_utf8(pending: &mut Vec<u8>) -> String {
    match std::str::from_utf8(pending) {
        Ok(s) => {
            let s = s.to_string();
            pending.clear();
            s
        }
        Err(e) if e.error_len().is_none() => {
            let ok = e.valid_up_to();
            let s = String::from_utf8_lossy(&pending[..ok]).into_owned();
            pending.drain(..ok);
            s
        }
        Err(_) => {
            let s = String::from_utf8_lossy(pending).into_owned();
            pending.clear();
            s
        }
    }
}

impl Terms {
    pub fn open(
        &self,
        id: u32,
        files: &Files,
        name: &str,
        cols: u16,
        rows: u16,
        on_data: impl Fn(String) + Send + 'static,
    ) -> Result<(), String> {
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
        let (prog, args) = tmux_argv(&files.conf());
        let mut cmd = CommandBuilder::new(prog);
        cmd.args(args);
        cmd.args(["attach-session", "-t", name]);
        cmd.env("PATH", login_path());
        cmd.env("LANG", lang());
        cmd.env("TERM", "xterm-256color");
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending = Vec::new();
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                pending.extend_from_slice(&buf[..n]);
                let s = take_utf8(&mut pending);
                if !s.is_empty() {
                    on_data(s);
                }
            }
        });
        if let Some(mut old) = self.0.lock().unwrap().insert(id, Term { master: pair.master, writer, child }) {
            let _ = old.child.kill();
        }
        Ok(())
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let mut terms = self.0.lock().unwrap();
        let t = terms.get_mut(&id).ok_or("터미널이 없습니다")?;
        t.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let terms = self.0.lock().unwrap();
        let t = terms.get(&id).ok_or("터미널이 없습니다")?;
        t.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())
    }

    /// 붙어 있던 tmux 클라이언트만 끝낸다(세션은 살아 있다).
    pub fn close(&self, id: u32) {
        if let Some(mut t) = self.0.lock().unwrap().remove(&id) {
            let _ = t.child.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_name_is_stable_and_tmux_safe() {
        let a = session_name(Path::new("/Users/x/Project/BibleMap"), "plan");
        assert_eq!(a, session_name(Path::new("/Users/x/Project/BibleMap"), "plan"));
        assert!(a.starts_with("anvil-biblemap-") && a.ends_with("-plan"));
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        assert_ne!(a, session_name(Path::new("/Users/y/BibleMap"), "plan"));
    }

    #[test]
    fn session_title_follows_cxa_rule_with_anvil_prefix() {
        let p = Path::new("/Users/x/Project/BibleMap");
        assert_eq!(session_title(p, "plan"), ("[Anvil] [BibleMap] PLAN".to_string(), "opus"));
        assert_eq!(session_title(p, "run"), ("[Anvil] [BibleMap] RUN".to_string(), "sonnet"));
        assert_eq!(session_title(Path::new("/a/lab-taebro"), "plan").0, "[Anvil] [lab-taebro] PLAN");
        assert_eq!(sh_quote("[Anvil] [it's] PLAN"), r"'[Anvil] [it'\''s] PLAN'");
    }

    /// 다른 claude 세션 안에서 Anvil을 띄워도 새 claude가 부모의 변수를 물려받지 않는다
    #[test]
    fn parent_claude_env_is_dropped() {
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(format!("{UNSET_PARENT_CLAUDE}env"))
            .env("CLAUDECODE", "1")
            .env("CLAUDE_CODE_SESSION_ID", "parent")
            .env("CLAUDE_CODE_PLUGIN_DIRS", "/x/cc-name-restore")
            .env("CLAUDE_EFFORT", "low")
            .env("CLAUDE_PID", "1")
            .env("CLAUDE_CONFIG_DIR", "/keep")
            .env("CC_SESSION_NAME", "[Anvil] [BibleMap] PLAN")
            .output()
            .unwrap();
        let env = String::from_utf8_lossy(&out.stdout);
        for gone in ["CLAUDECODE=", "CLAUDE_CODE_SESSION_ID=", "CLAUDE_CODE_PLUGIN_DIRS=", "CLAUDE_EFFORT=", "CLAUDE_PID="] {
            assert!(!env.lines().any(|l| l.starts_with(gone)), "{gone} 남음");
        }
        assert!(env.contains("CLAUDE_CONFIG_DIR=/keep"));
        assert!(env.contains("CC_SESSION_NAME=[Anvil] [BibleMap] PLAN"));
    }

    /// Finder에서 띄운 앱은 PATH·LANG이 없다 — tmux 명령은 늘 로그인 PATH와 UTF-8 로캘, `-u`를 실어야
    /// claude·tmux를 찾고 한글이 `_`로 바뀌지 않는다(#2 실측).
    #[test]
    fn backend_missing_reports_wsl_tmux_hint() {
        let none = |_: &str, _: &[&str]| false;
        let all = |_: &str, _: &[&str]| true;
        let no_tmux = |_: &str, a: &[&str]| !a.contains(&"tmux");
        assert!(backend_missing(true, none).unwrap().contains("wsl -- sudo apt install tmux"));
        assert!(backend_missing(true, no_tmux).unwrap().contains("WSL에 tmux"));
        assert_eq!(backend_missing(true, all), None);
        assert!(backend_missing(false, none).is_some());
        assert_eq!(backend_missing(false, all), None);
    }

    #[test]
    fn tmux_command_carries_path_lang_and_utf8() {
        let c = tmux(Path::new("/tmp/anvil-tmux.conf"));
        let args: Vec<_> = c.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(&args[..3], ["-u", "-L", SOCKET]);
        let env = |k: &str| c.get_envs().find(|(n, _)| *n == k).and_then(|(_, v)| v).map(|v| v.to_string_lossy().into_owned());
        let path = env("PATH").expect("PATH 없음");
        assert!(path.contains("/opt/homebrew/bin") && path.contains("/.local/bin"), "{path}");
        assert!(env("LANG").expect("LANG 없음").contains("UTF-8"));
    }

    /// 상태줄 래퍼: 모델·effort(객체/옛 문자열)를 기록하고, 원래 상태줄 명령에 같은 입력을 넘겨 출력을 그대로 낸다.
    #[test]
    fn statusline_wrapper_records_model_and_passes_through() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Stdio;
        if Command::new("jq").arg("--version").output().is_err() {
            eprintln!("jq 없음 — 건너뜀");
            return;
        }
        let dir = std::env::temp_dir().join(format!("anvil-sl-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let proj = dir.join("proj");
        std::fs::create_dir_all(proj.join(".claude")).unwrap();
        std::fs::write(proj.join(".claude/settings.local.json"), r#"{"statusLine":{"command":"cat"}}"#).unwrap();
        let script = dir.join("anvil-statusline.sh");
        std::fs::write(&script, STATUSLINE_SCRIPT).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let run = |name: &str, input: &str| {
            let mut child = Command::new(&script)
                .env("ANVIL_SESSION", name)
                .env("HOME", dir.join("nohome"))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .unwrap();
            child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
            let out = child.wait_with_output().unwrap();
            (out.status.success(), String::from_utf8_lossy(&out.stdout).into_owned())
        };
        let rec = |name: &str| std::fs::read_to_string(dir.join(format!("models/{name}.json"))).unwrap();

        let input = format!(
            r#"{{"model":{{"display_name":"Opus 5.5"}},"effort":{{"level":"high"}},"workspace":{{"project_dir":"{}"}}}}"#,
            proj.display()
        );
        assert_eq!(run("s-plan", &input), (true, input.clone()));
        assert_eq!(rec("s-plan").trim(), r#"{"model":"Opus 5.5","effort":"high"}"#);

        // 옛 형식 문자열 effort, 원래 상태줄 없음 → 출력 없이 기록만
        let old = r#"{"model":{"display_name":"Sonnet 5.5"},"effort":"low","cwd":"/nonexistent"}"#;
        assert_eq!(run("s-run", old), (true, String::new()));
        assert_eq!(rec("s-run").trim(), r#"{"model":"Sonnet 5.5","effort":"low"}"#);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn utf8_split_across_reads_is_rejoined() {
        let bytes = "한글".as_bytes();
        let mut pending = bytes[..4].to_vec();
        assert_eq!(take_utf8(&mut pending), "한");
        pending.extend_from_slice(&bytes[4..]);
        assert_eq!(take_utf8(&mut pending), "글");
    }
}
