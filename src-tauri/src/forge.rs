//! `.forge/` 읽기 전용 파서. forge 규칙(브랜치 root 해석, STATUS 필드, 단계 판정,
//! 백로그 순서, loop.md, done 겹치기, 후속후보)을 Anvil 안에 다시 구현한다.
//! Anvil은 `.forge/`에 절대 쓰지 않는다(ADR 261017-211602).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

// ---------- git HEAD · forge root ----------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Head {
    Branch(String),
    Detached,
    NotGit,
}

/// 프로젝트의 git 폴더. 워크트리처럼 `.git`이 파일이면 `gitdir:`를 따라간다.
pub fn git_dir(project: &Path) -> Option<PathBuf> {
    let dot = project.join(".git");
    if dot.is_dir() {
        return Some(dot);
    }
    let text = fs::read_to_string(&dot).ok()?;
    let target = text.trim().strip_prefix("gitdir:")?.trim();
    let p = Path::new(target);
    Some(if p.is_absolute() { p.to_path_buf() } else { project.join(p) })
}

pub fn read_head(project: &Path) -> Head {
    let Some(dir) = git_dir(project) else { return Head::NotGit };
    let Ok(text) = fs::read_to_string(dir.join("HEAD")) else { return Head::NotGit };
    match text.trim().strip_prefix("ref: refs/heads/") {
        Some(branch) => Head::Branch(branch.to_string()),
        None => Head::Detached,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub branch: Option<String>,
    /// `.forge` 또는 `.forge/branch/<branch>`
    pub rel: String,
    pub warning: Option<String>,
}

/// `.forge/config.json`의 `defaultBranch`, 없으면 `main`.
pub fn default_branch(project: &Path) -> String {
    fs::read_to_string(project.join(".forge/config.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("defaultBranch")?.as_str().map(String::from))
        .unwrap_or_else(|| "main".into())
}

pub fn resolve_root(project: &Path, head: &Head) -> RootInfo {
    match head {
        Head::Branch(b) if *b == default_branch(project) => RootInfo { branch: Some(b.clone()), rel: ".forge".into(), warning: None },
        Head::Branch(b) => RootInfo { branch: Some(b.clone()), rel: format!(".forge/branch/{b}"), warning: None },
        _ => RootInfo {
            branch: None,
            rel: ".forge".into(),
            warning: Some(crate::i18n::tr("이름 있는 브랜치가 아니라 기본 .forge/ 를 읽습니다", "Not on a named branch; reading the default .forge/").into()),
        },
    }
}

// ---------- 필드 · 마커 ----------

/// `field:`와 `- field:` 모두 받고 첫 낱말만 값으로 읽는다(`verified: yes (…)` → `yes`).
pub fn status_field(text: &str, name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let l = line.trim_start();
        let l = l.strip_prefix('-').map(str::trim_start).unwrap_or(l);
        let rest = l.strip_prefix(name)?.strip_prefix(':')?;
        rest.split_whitespace().next().map(String::from)
    })
}

/// 줄 전체 값(`wall: fork (이유 …)`처럼 첫 낱말만으로는 모자랄 때).
fn field_line(text: &str, name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let l = line.trim_start();
        let l = l.strip_prefix('-').map(str::trim_start).unwrap_or(l);
        let v = l.strip_prefix(name)?.strip_prefix(':')?.trim();
        (!v.is_empty()).then(|| v.to_string())
    })
}

/// `<!-- name: value -->` 마커의 값.
fn marker(text: &str, name: &str) -> Option<String> {
    let open = format!("<!-- {name}:");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find("-->")? + start;
    let v = text[start..end].trim();
    (!v.is_empty()).then(|| v.to_string())
}

fn title_of(text: &str) -> String {
    text.lines()
        .find_map(|l| l.strip_prefix("# "))
        .unwrap_or(crate::i18n::tr("(제목 없음)", "(untitled)"))
        .trim()
        .to_string()
}

fn norm(v: &str) -> String {
    v.to_lowercase().chars().take_while(|c| c.is_ascii_lowercase() || *c == '/').collect()
}

pub fn is_sealable(verified: Option<&str>) -> bool {
    matches!(verified.map(norm).as_deref(), Some("yes" | "skipped" | "n/a"))
}

// ---------- 스냅샷 타입 ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Run,
    Retro,
    Seal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Doc {
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTask {
    pub task: Option<u32>,
    pub slug: String,
    pub title: String,
    pub stage: Stage,
    pub running: bool,
    pub verified: Option<String>,
    pub retro: Option<String>,
    pub in_loop: bool,
    pub docs: Vec<Doc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanCard {
    pub task: Option<u32>,
    pub slug: String,
    pub title: String,
    pub priority: String,
    pub part: Option<String>,
    pub from_loop: bool,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCard {
    pub task: Option<u32>,
    pub slug: String,
    pub title: String,
    pub date: String,
    pub verified: Option<String>,
    pub retro: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckResult {
    Pass,
    Fail,
    Waiting,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub text: String,
    pub result: CheckResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopState {
    pub goal: String,
    pub wall: Option<String>,
    pub replan_round: Option<u32>,
    pub replan_cap: Option<u32>,
    pub checks: Vec<Check>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Followup {
    pub id: String,
    pub source: String,
    pub task: Option<u32>,
    pub date: String,
    /// open | taken | dismissed
    pub status: String,
    pub taken: Option<u32>,
    /// 본문 첫 줄
    pub text: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileError {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    pub path: String,
    pub has_forge: bool,
    pub root: RootInfo,
    /// 사이드바의 가장 중요한 사실 한 줄
    pub headline: String,
    pub active: Option<ActiveTask>,
    pub loop_state: Option<LoopState>,
    pub backlog: Vec<PlanCard>,
    pub executed: Vec<TaskCard>,
    pub done: Vec<TaskCard>,
    pub done_total: usize,
    pub followups: Vec<Followup>,
    pub errors: Vec<FileError>,
    /// `running.md`나 `drive.md`의 `session:` — 이 claude 세션이 지금 활성 작업을 실행 중이다.
    pub driving_session: Option<String>,
}

// ---------- 읽기 도우미 ----------

struct Reader {
    project: PathBuf,
    errors: Vec<FileError>,
}

impl Reader {
    fn rel(&self, p: &Path) -> String {
        p.strip_prefix(&self.project).unwrap_or(p).to_string_lossy().into_owned()
    }

    /// 읽지 못하면 그 파일만 오류로 남기고 None.
    fn read(&mut self, p: &Path) -> Option<String> {
        match fs::read(p) {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(s) => Some(s),
                Err(_) => {
                    self.fail(p, crate::i18n::tr("UTF-8 문서가 아닙니다. 이 파일만 건너뛰었습니다.", "Not a UTF-8 document. Skipped this file only."));
                    None
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => {
                self.fail(p, &format!("{}({e}){}", crate::i18n::tr("읽을 수 없습니다", "Cannot read"), crate::i18n::tr(". 이 파일만 건너뛰었습니다.", ". Skipped this file only.")));
                None
            }
        }
    }

    fn fail(&mut self, p: &Path, message: &str) {
        let path = self.rel(p);
        self.errors.push(FileError { path, message: message.into() });
    }
}

fn sub_dirs(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn md_files(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".md"))
        .collect();
    v.sort();
    v
}

/// `YYMMDD-HHMMSS-slug`(새 형식) / `YYYY-MM-DD-slug`(옛 형식) → (정렬 키, 날짜, slug)
pub fn split_dated(name: &str) -> (String, String, String) {
    let b = name.as_bytes();
    let digits = |r: std::ops::Range<usize>| b.len() >= r.end && b[r].iter().all(u8::is_ascii_digit);
    if digits(0..6) && b.get(6) == Some(&b'-') && digits(7..13) {
        // 같은 초 충돌 접미 글자(`a`) 허용
        let mut end = 13;
        if b.get(13).is_some_and(u8::is_ascii_lowercase) {
            end = 14;
        }
        let date = format!("20{}-{}-{}", &name[0..2], &name[2..4], &name[4..6]);
        let key = format!("{date} {}", &name[7..end]);
        let slug = name.get(end + 1..).unwrap_or("").to_string();
        return (key, date, slug);
    }
    if digits(0..4) && b.get(4) == Some(&b'-') && digits(5..7) && b.get(7) == Some(&b'-') && digits(8..10) {
        let date = name[0..10].to_string();
        let slug = name.get(11..).unwrap_or("").to_string();
        return (format!("{date} 000000"), date, slug);
    }
    (String::new(), String::new(), name.to_string())
}

// ---------- 후속후보 ----------

const FOLLOWUP_MARK: &str = "<!-- followup:";

/// `- 3` / `-` → 양의 정수만 Some, `-`는 None, 그 밖은 Err.
fn task_num(v: &str) -> Result<Option<u32>, ()> {
    if v == "-" {
        return Ok(None);
    }
    match v.parse::<u32>() {
        Ok(n) if n > 0 => Ok(Some(n)),
        _ => Err(()),
    }
}

/// 마커 한 줄 → 본문 없는 Followup. 형식이 어긋나면 None.
fn parse_followup_marker(line: &str) -> Option<Followup> {
    let inner = line.trim().strip_prefix("<!--")?.strip_suffix("-->")?.trim();
    let fields: Vec<&str> = inner.split(" | ").collect();
    let names = ["followup", "source", "task", "date", "status", "taken"];
    if fields.len() != names.len() {
        return None;
    }
    let mut v = Vec::new();
    for (f, n) in fields.iter().zip(names) {
        v.push(f.trim().strip_prefix(n)?.strip_prefix(':')?.trim().to_string());
    }
    let id = &v[0];
    let hex = id.strip_prefix("fu-")?;
    if hex.len() != 12 || !hex.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return None;
    }
    let d = v[3].as_bytes();
    if d.len() != 10 || d[4] != b'-' || d[7] != b'-' || !d.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return None;
    }
    let status = v[4].as_str();
    let taken = task_num(&v[5]).ok()?;
    if !matches!(status, "open" | "taken" | "dismissed") || (status == "taken") != taken.is_some() || v[1].is_empty() {
        return None;
    }
    Some(Followup {
        id: id.clone(),
        source: v[1].clone(),
        task: task_num(&v[2]).ok()?,
        date: v[3].clone(),
        status: status.to_string(),
        taken,
        text: String::new(),
        body: String::new(),
    })
}

/// forge 원장(`followups.md`) — 마커부터 다음 마커나 끝까지가 한 항목. 첫 마커 앞은 무시.
/// 깨진 마커는 그 항목만 건너뛰고 오류 문구로 돌려준다.
pub fn parse_followups(text: &str) -> (Vec<Followup>, Vec<String>) {
    let mut items = Vec::new();
    let mut errors = Vec::new();
    let mut cur: Option<(Option<Followup>, Vec<&str>)> = None;
    let finish = |c: Option<(Option<Followup>, Vec<&str>)>, items: &mut Vec<Followup>| {
        if let Some((Some(mut f), lines)) = c {
            let body: Vec<String> = lines
                .iter()
                .map(|l| l.trim())
                .enumerate()
                .map(|(i, l)| if i == 0 { l.strip_prefix("- ").unwrap_or(l).to_string() } else { l.to_string() })
                .collect();
            let body = body.join("\n").trim().to_string();
            f.text = body.lines().next().unwrap_or("").to_string();
            f.body = body;
            items.push(f);
        }
    };
    for (n, line) in text.lines().enumerate() {
        if line.trim_start().starts_with(FOLLOWUP_MARK) {
            finish(cur.take(), &mut items);
            let f = parse_followup_marker(line);
            if f.is_none() {
                errors.push(format!("{} {}: {}", crate::i18n::tr("후속후보 마커가 깨졌습니다 — 줄", "Broken follow-up marker — line"), n + 1, line.trim()));
            }
            cur = Some((f, vec![]));
        } else if let Some((_, lines)) = cur.as_mut() {
            lines.push(line);
        }
    }
    finish(cur.take(), &mut items);
    (items, errors)
}

// ---------- loop.md ----------

fn parse_loop(text: &str, path: String) -> LoopState {
    let goal = text
        .lines()
        .find_map(|l| l.strip_prefix("# "))
        .map(|t| t.trim_start_matches("LOOP").trim_start_matches(|c: char| c == ' ' || c == '—' || c == '-').trim().to_string())
        .unwrap_or_default();
    let wall = field_line(text, "wall").filter(|w| norm(w) != "none");
    let num = |name| status_field(text, name).and_then(|v| v.parse().ok());

    let mut checks: Vec<Check> = Vec::new();
    for line in text.lines() {
        let l = line.trim_start();
        let (done, rest) = if let Some(r) = l.strip_prefix("- [ ] ") {
            (false, r)
        } else if let Some(r) = l.strip_prefix("- [x] ").or_else(|| l.strip_prefix("- [X] ")) {
            (true, r)
        } else {
            continue;
        };
        let Some((id, body)) = rest.split_once('.') else { continue };
        if !id.starts_with('C') || !id[1..].chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let result = if done { CheckResult::Pass } else { CheckResult::Unknown };
        checks.push(Check { id: id.to_string(), text: body.trim().to_string(), result });
    }
    // `## Check progress`의 `- Cn: pass|fail|waiting …`가 체크박스보다 우선한다.
    for line in text.lines() {
        let Some(rest) = line.trim_start().strip_prefix("- C") else { continue };
        let Some((n, tail)) = rest.split_once(':') else { continue };
        if !n.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let id = format!("C{n}");
        let word = tail.split_whitespace().next().map(norm).unwrap_or_default();
        let result = match word.as_str() {
            "pass" => CheckResult::Pass,
            "fail" => CheckResult::Fail,
            "waiting" => CheckResult::Waiting,
            _ => CheckResult::Unknown,
        };
        if let Some(c) = checks.iter_mut().find(|c| c.id == id) {
            c.result = result;
        }
    }
    LoopState { goal, wall, replan_round: num("replan-round"), replan_cap: num("replan-cap"), checks, path }
}

// ---------- 스냅샷 ----------

pub fn snapshot(project: &Path) -> Snapshot {
    snapshot_with_head(project, &read_head(project))
}

pub fn snapshot_with_head(project: &Path, head: &Head) -> Snapshot {
    let name = project.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let top = project.join(".forge");
    let root_info = resolve_root(project, head);
    let mut s = Snapshot {
        name,
        path: project.to_string_lossy().into_owned(),
        has_forge: top.is_dir(),
        root: root_info.clone(),
        headline: String::new(),
        active: None,
        loop_state: None,
        backlog: vec![],
        executed: vec![],
        done: vec![],
        done_total: 0,
        followups: vec![],
        errors: vec![],
        driving_session: None,
    };
    if !s.has_forge {
        s.headline = crate::i18n::tr("forge 없음", "No forge").into();
        return s;
    }
    let root = project.join(&root_info.rel);
    let mut r = Reader { project: project.to_path_buf(), errors: vec![] };

    // 진행 영역(현재 root만)
    let loop_path = root.join("loop.md");
    let loop_text = r.read(&loop_path);
    if let Some(t) = &loop_text {
        s.loop_state = Some(parse_loop(t, r.rel(&loop_path)));
    }
    s.active = read_active(&mut r, &root, loop_text.as_deref());
    s.backlog = read_backlog(&mut r, &root.join("backlog"));
    s.driving_session = ["running.md", "drive.md"]
        .iter()
        .find_map(|f| r.read(&root.join(f)).and_then(|t| status_field(&t, "session")));
    for d in sub_dirs(&root.join("executed")) {
        let dir = root.join("executed").join(&d);
        if let Some(card) = read_task_dir(&mut r, &dir, &d) {
            s.executed.push(card);
        }
    }

    // 기록 영역(최상위 위에 현재 root를 겹침, 같은 이름은 root 우선)
    let layers: Vec<PathBuf> = if root == top { vec![top.clone()] } else { vec![top.clone(), root.clone()] };
    let mut done: std::collections::BTreeMap<String, PathBuf> = Default::default();
    for layer in &layers {
        for d in sub_dirs(&layer.join("done")) {
            done.insert(d.clone(), layer.join("done").join(d));
        }
    }
    s.done_total = done.len();
    let mut cards: Vec<(String, TaskCard)> = vec![];
    for (name, dir) in &done {
        let key = split_dated(name).0;
        if let Some(card) = read_task_dir(&mut r, dir, name) {
            cards.push((key, card));
        }
    }
    cards.sort_by(|a, b| b.0.cmp(&a.0));
    s.done = cards.into_iter().map(|c| c.1).collect();

    // 후속후보 원장(현재 root만 — 겹쳐 읽지 않음)
    let ledger = root.join("followups.md");
    if let Some(t) = r.read(&ledger) {
        let (items, errs) = parse_followups(&t);
        for e in errs {
            r.fail(&ledger, &e);
        }
        s.followups = items;
    }
    s.followups.sort_by(|a, b| b.date.cmp(&a.date));

    s.errors = r.errors;
    s.headline = headline(&s);
    s
}

fn read_active(r: &mut Reader, root: &Path, loop_text: Option<&str>) -> Option<ActiveTask> {
    let plan_path = root.join("plan.md");
    let plan = r.read(&plan_path)?;
    let status_path = root.join("STATUS.md");
    let status = r.read(&status_path).unwrap_or_default();
    let has_run = root.join("run.md").is_file();
    let running = root.join("running.md").is_file();
    let verified = status_field(&status, "verified");
    let retro = status_field(&status, "retro");
    let stage = if running || !has_run || !is_sealable(verified.as_deref()) {
        Stage::Run
    } else if retro.as_deref().map(norm).as_deref().is_none_or(|v| v == "pending" || v.is_empty()) {
        Stage::Retro
    } else {
        Stage::Seal
    };
    let slug = marker(&plan, "forge-slug").unwrap_or_else(|| "plan".into());
    let in_loop = loop_text.is_some_and(|t| t.lines().any(|l| l.trim() == format!("- {slug}")));
    let mut docs = vec![Doc { label: "plan".into(), path: r.rel(&plan_path) }];
    for (label, f) in [("run", "run.md"), ("STATUS", "STATUS.md"), ("loop", "loop.md")] {
        let p = root.join(f);
        if p.is_file() {
            docs.push(Doc { label: label.into(), path: r.rel(&p) });
        }
    }
    Some(ActiveTask {
        task: marker(&plan, "task").and_then(|v| v.parse().ok()),
        slug,
        title: title_of(&plan),
        stage,
        running,
        verified,
        retro,
        in_loop,
        docs,
    })
}

fn read_backlog(r: &mut Reader, dir: &Path) -> Vec<PlanCard> {
    let mut v: Vec<(String, PlanCard)> = vec![];
    for f in md_files(dir) {
        let p = dir.join(&f);
        let Some(text) = r.read(&p) else { continue };
        let Some(slug) = marker(&text, "forge-slug") else {
            r.fail(&p, crate::i18n::tr("forge-slug 마커가 없습니다. 이 파일만 건너뛰었습니다.", "No forge-slug marker. Skipped this file only."));
            continue;
        };
        let priority = match marker(&text, "priority").as_deref() {
            Some("high") => "high",
            Some("low") => "low",
            _ => "medium",
        };
        let part = marker(&text, "part");
        let rank = match priority { "high" => 0, "low" => 2, _ => 1 };
        let part_n: u32 = part.as_deref().and_then(|p| p.split('/').next()?.parse().ok()).unwrap_or(0);
        let key = format!("{rank}\t{part_n:03}\t{slug}");
        v.push((
            key,
            PlanCard {
                task: marker(&text, "task").and_then(|t| t.parse().ok()),
                title: title_of(&text),
                priority: priority.into(),
                part,
                from_loop: text.contains("generated-by: fg-loop"),
                path: r.rel(&p),
                slug,
            },
        ));
    }
    v.sort_by(|a, b| a.0.cmp(&b.0));
    v.into_iter().map(|e| e.1).collect()
}

fn read_task_dir(r: &mut Reader, dir: &Path, name: &str) -> Option<TaskCard> {
    let plan_path = dir.join("plan.md");
    let plan = r.read(&plan_path).unwrap_or_default();
    let status = r.read(&dir.join("STATUS.md")).unwrap_or_default();
    let (_, prefix_date, name_slug) = split_dated(name);
    let date = status_field(&status, "completed")
        .or_else(|| status_field(&status, "executed"))
        .unwrap_or(prefix_date);
    Some(TaskCard {
        task: marker(&plan, "task").and_then(|t| t.parse().ok()),
        slug: marker(&plan, "forge-slug").or_else(|| status_field(&status, "slug")).unwrap_or(name_slug),
        title: if plan.is_empty() { name.to_string() } else { title_of(&plan) },
        date,
        verified: status_field(&status, "verified"),
        retro: status_field(&status, "retro"),
        path: r.rel(if plan_path.is_file() { &plan_path } else { dir }),
    })
}

/// 루프 정지 > 검증 실패 > 실행 중 #N > 회고 대기 > 백로그 N > forge 없음
fn headline(s: &Snapshot) -> String {
    let num = |t: Option<u32>| t.map(|n| format!(" #{n}")).unwrap_or_default();
    if s.loop_state.as_ref().is_some_and(|l| l.wall.is_some()) {
        return crate::i18n::tr("루프 정지", "Loop halted").into();
    }
    let failed = |v: &Option<String>| v.as_deref().map(norm).as_deref() == Some("failed");
    if let Some(a) = s.active.as_ref().filter(|a| failed(&a.verified)) {
        return format!("{}{}", crate::i18n::tr("검증 실패", "Verification failed"), num(a.task));
    }
    if let Some(e) = s.executed.iter().find(|e| failed(&e.verified)) {
        return format!("{}{}", crate::i18n::tr("검증 실패", "Verification failed"), num(e.task));
    }
    if let Some(a) = &s.active {
        match a.stage {
            Stage::Run => return format!("{}{}", crate::i18n::tr("실행 중", "Running"), num(a.task)),
            Stage::Retro => return crate::i18n::tr("회고 대기", "Awaiting retro").into(),
            Stage::Seal => return format!("{}{}", crate::i18n::tr("봉인 대기", "Awaiting seal"), num(a.task)),
        }
    }
    if !s.executed.is_empty() {
        return crate::i18n::tr("회고 대기", "Awaiting retro").into();
    }
    format!("{} {}", crate::i18n::tr("백로그", "Backlog"), s.backlog.len())
}
