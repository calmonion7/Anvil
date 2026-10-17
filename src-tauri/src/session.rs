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

fn tmux(conf: &Path) -> Command {
    let mut c = Command::new("tmux");
    c.args(["-u", "-L", SOCKET, "-f"]).arg(conf).env("PATH", login_path()).env("LANG", lang());
    c
}

// ---------- 앱 데이터 파일(tmux.conf · 훅) ----------

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

    /// 앱이 시작할 때마다 tmux.conf · 훅 스크립트 · 훅 설정을 다시 쓴다(앱 업데이트 반영).
    pub fn install(&self) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        std::fs::create_dir_all(self.sessions())?;
        std::fs::create_dir_all(self.dir.join("summary"))?;
        std::fs::write(self.conf(), TMUX_CONF)?;
        let script = self.dir.join("anvil-hook.sh");
        std::fs::write(&script, HOOK_SCRIPT)?;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))?;
        let cmd = |state: &str| serde_json::json!([{ "hooks": [{ "type": "command", "command": format!("'{}' {state}", script.display()) }] }]);
        let settings = serde_json::json!({ "hooks": {
            "SessionStart": cmd("waiting"),
            "UserPromptSubmit": cmd("working"),
            "PostToolUse": cmd("working"),
            "Stop": cmd("waiting"),
            "Notification": cmd("waiting"),
            "SessionEnd": cmd("ended"),
        }});
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
    let cmd = format!("exec claude --settings '{}'", files.hooks().display());
    let out = tmux(&files.conf())
        .args(["new-session", "-d", "-s", &name, "-x", "200", "-y", "50", "-c"])
        .arg(project)
        .args(["-e", &format!("ANVIL_SESSION={name}"), "-e", &format!("PATH={}", login_path()), "-e", &format!("LANG={}", lang())])
        .arg(cmd)
        .output()
        .map_err(|e| format!("tmux를 실행할 수 없습니다: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(name)
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
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["-u", "-L", SOCKET, "-f"]);
        cmd.arg(files.conf());
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
    fn utf8_split_across_reads_is_rejoined() {
        let bytes = "한글".as_bytes();
        let mut pending = bytes[..4].to_vec();
        assert_eq!(take_utf8(&mut pending), "한");
        pending.extend_from_slice(&bytes[4..]);
        assert_eq!(take_utf8(&mut pending), "글");
    }
}
