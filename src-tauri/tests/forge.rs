//! DoD 1 — forge root 해석과 `.forge` 파서의 고정 사실.
//! 픽스처는 실제 프로젝트 `.forge`에서 떠 온 사본이다(tests/fixtures/README.md).

use anvil_lib::forge::{self, CheckResult, Head, Stage};
use std::fs;
use std::path::{Path, PathBuf};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// 픽스처의 config.json만 가진 임시 프로젝트에 `.git/HEAD`를 써서 만든다.
fn temp_project(config_from: Option<&str>, head: Option<&str>) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(".forge")).unwrap();
    if let Some(name) = config_from {
        fs::copy(
            fixture(name).join(".forge/config.json"),
            dir.path().join(".forge/config.json"),
        )
        .unwrap();
    }
    if let Some(head) = head {
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git/HEAD"), head).unwrap();
    }
    dir
}

fn root_of(dir: &Path) -> String {
    let head = forge::read_head(dir);
    forge::resolve_root(dir, &head).rel
}

// ---------- root ----------

#[test]
fn root_biblemap_main_is_dot_forge() {
    let p = temp_project(Some("biblemap"), Some("ref: refs/heads/main\n"));
    assert_eq!(root_of(p.path()), ".forge");
}

#[test]
fn root_portfolion_dev_without_default_branch_is_branch_root() {
    let p = temp_project(Some("portfolion"), Some("ref: refs/heads/dev\n"));
    assert_eq!(root_of(p.path()), ".forge/branch/dev");
}

#[test]
fn root_fitcheck_dev_with_default_branch_dev_is_dot_forge() {
    let p = temp_project(Some("fitcheck"), Some("ref: refs/heads/dev\n"));
    assert_eq!(root_of(p.path()), ".forge");
}

#[test]
fn root_slash_branch_nests() {
    let p = temp_project(None, Some("ref: refs/heads/feature/x\n"));
    assert_eq!(root_of(p.path()), ".forge/branch/feature/x");
}

#[test]
fn root_detached_falls_back_with_warning() {
    let p = temp_project(None, Some("3f2a9c0d1e2b3a4f5c6d7e8f9a0b1c2d3e4f5a6b\n"));
    let head = forge::read_head(p.path());
    assert_eq!(head, Head::Detached);
    let root = forge::resolve_root(p.path(), &head);
    assert_eq!(root.rel, ".forge");
    assert!(root.warning.is_some());
}

#[test]
fn root_not_git_falls_back() {
    let p = temp_project(None, None);
    assert_eq!(forge::read_head(p.path()), Head::NotGit);
    assert_eq!(root_of(p.path()), ".forge");
}

/// git이 아닌 폴더: 브랜치 칩·"기본 .forge/" 배지를 띄울 이유가 없다(첫 설치 문제 2)
#[test]
fn root_not_git_has_no_branch_badge() {
    let p = temp_project(None, None);
    let root = forge::resolve_root(p.path(), &Head::NotGit);
    assert!(!root.git && root.warning.is_none() && root.branch.is_none());
    assert!(forge::resolve_root(p.path(), &Head::Detached).git);
    assert!(forge::resolve_root(p.path(), &Head::Branch("main".into())).git);
}

#[test]
fn root_worktree_git_file_is_followed() {
    let p = temp_project(None, None);
    let gitdir = p.path().join("real-gitdir");
    fs::create_dir_all(&gitdir).unwrap();
    fs::write(gitdir.join("HEAD"), "ref: refs/heads/anvil-monitor\n").unwrap();
    fs::write(p.path().join(".git"), format!("gitdir: {}\n", gitdir.display())).unwrap();
    assert_eq!(root_of(p.path()), ".forge/branch/anvil-monitor");
}

// ---------- BibleMap 픽스처 ----------

fn biblemap() -> forge::Snapshot {
    forge::snapshot_with_head(&fixture("biblemap"), &Head::Branch("main".into()))
}

#[test]
fn biblemap_active_is_362_in_run_stage() {
    let s = biblemap();
    let a = s.active.expect("active task");
    assert_eq!(a.task, Some(362));
    assert_eq!(a.slug, "scene-engedi-text-dark-light");
    assert_eq!(a.stage, Stage::Run);
    assert!(a.title.starts_with("엔게디 장면 문구 수리"));
}

#[test]
fn biblemap_loop_wall_and_checks() {
    let l = biblemap().loop_state.expect("loop.md");
    assert!(l.wall.as_deref().unwrap().contains("unverifiable-uat"));
    assert_eq!((l.replan_round, l.replan_cap), (Some(0), Some(3)));
    let r: Vec<(String, CheckResult)> = l.checks.iter().map(|c| (c.id.clone(), c.result)).collect();
    use CheckResult::*;
    assert_eq!(
        r,
        vec![
            ("C1".into(), Unknown),
            ("C2".into(), Pass),
            ("C3".into(), Pass),
            ("C4".into(), Fail),
            ("C5".into(), Fail),
            ("C6".into(), Unknown),
        ]
    );
}

#[test]
fn biblemap_backlog_in_fg_run_order() {
    let tasks: Vec<Option<u32>> = biblemap().backlog.iter().map(|p| p.task).collect();
    assert_eq!(tasks, vec![Some(363), Some(354), Some(355), Some(350)]);
}

#[test]
fn biblemap_headline_is_loop_wall() {
    assert_eq!(biblemap().headline, "루프 정지");
}

// ---------- PortfoliOn 픽스처 ----------

fn portfolion() -> forge::Snapshot {
    forge::snapshot_with_head(&fixture("portfolion"), &Head::Branch("dev".into()))
}

#[test]
fn portfolion_done_overlays_top_level_and_branch_root() {
    let s = portfolion();
    assert_eq!(s.root.rel, ".forge/branch/dev");
    // 최상위 3 + branch/dev 2
    assert_eq!(s.done_total, 5);
    // 최신이 먼저: branch/dev의 261017-…가 맨 앞
    assert_eq!(s.done[0].slug, "listener-resume-and-enrich-run-check");
}

#[test]
fn portfolion_progress_reads_branch_root_only() {
    let s = portfolion();
    assert!(s.active.is_none());
    assert!(s.backlog.is_empty(), "최상위 backlog 미끼가 섞이면 안 된다");
}

#[test]
fn done_dates_parse_both_folder_formats() {
    let s = portfolion();
    let by_slug = |slug: &str| s.done.iter().find(|d| d.slug == slug).unwrap().date.clone();
    assert_eq!(by_slug("fomc-coverage-guard"), "2026-07-04");
    assert_eq!(by_slug("tech-report-outline-mobile-table"), "2026-08-12");
}

// ---------- STATUS ----------

#[test]
fn status_field_reads_first_word_in_both_forms() {
    let a = "# STATUS\n- verified: yes (npm test → 42 passing)\n";
    let b = "# STATUS\nverified: skipped (사용자 선택)\n";
    assert_eq!(forge::status_field(a, "verified").as_deref(), Some("yes"));
    assert_eq!(forge::status_field(b, "verified").as_deref(), Some("skipped"));
    assert_eq!(forge::status_field(b, "retro"), None);
}

// ---------- 후속후보 ----------

const LEDGER: &str = "# 후속후보\n\n이 제목 줄은 무시된다\n\n<!-- followup: fu-aaaaaaaaaaaa | source: old-task | task: 3 | date: 2026-10-01 | status: open | taken: - -->\n- 재시도 경우 검사 추가\n  근거: 시간 초과 분기 미검증\n<!-- followup: fu-bbbbbbbbbbbb | source: old-task | task: - | date: 2026-10-05 | status: taken | taken: 9 -->\n- 로그 정리\n<!-- followup: fu-cccccccccccc | source: other | task: 4 | date: 2026-10-03 | status: dismissed | taken: - -->\n- 필요 없음\n  사유: 대체됨\n";

#[test]
fn ledger_open_entry_parses() {
    let (items, errors) = forge::parse_followups(LEDGER);
    assert!(errors.is_empty(), "{errors:?}");
    let f = &items[0];
    assert_eq!(f.id, "fu-aaaaaaaaaaaa");
    assert_eq!(f.source, "old-task");
    assert_eq!(f.task, Some(3));
    assert_eq!(f.date, "2026-10-01");
    assert_eq!(f.status, "open");
    assert_eq!(f.taken, None);
    assert_eq!(f.text, "재시도 경우 검사 추가");
}

#[test]
fn ledger_taken_and_dismissed() {
    let (items, _) = forge::parse_followups(LEDGER);
    assert_eq!(items.len(), 3);
    assert_eq!(items[1].status, "taken");
    assert_eq!(items[1].taken, Some(9));
    assert_eq!(items[1].task, None, "task: - 는 번호 없음");
    assert_eq!(items[2].status, "dismissed");
}

#[test]
fn ledger_multiline_body() {
    let (items, _) = forge::parse_followups(LEDGER);
    assert_eq!(items[0].body, "재시도 경우 검사 추가\n근거: 시간 초과 분기 미검증");
    assert_eq!(items[2].body, "필요 없음\n사유: 대체됨");
    assert_eq!(items[1].body, "로그 정리");
}

#[test]
fn ledger_ignores_heading_before_first_marker() {
    let (items, errors) = forge::parse_followups("# 후속후보\n## 후속 후보\n- 제목 아래 항목\n");
    assert!(items.is_empty());
    assert!(errors.is_empty());
}

#[test]
fn ledger_broken_marker_goes_to_errors() {
    let md = "<!-- followup: fu-XYZ | source: a | task: 1 | date: 2026-10-01 | status: open | taken: - -->\n- 깨짐\n<!-- followup: fu-dddddddddddd | source: a | task: 1 | date: 2026-10-01 | status: wip | taken: - -->\n- 상태 틀림\n<!-- followup: fu-eeeeeeeeeeee | source: a | task: 1 | date: 2026-10-02 | status: open | taken: - -->\n- 정상\n";
    let (items, errors) = forge::parse_followups(md);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].id, "fu-eeeeeeeeeeee");
    assert_eq!(errors.len(), 2);
}

#[test]
fn ledger_missing_file_is_zero() {
    let p = temp_project(None, Some("ref: refs/heads/main\n"));
    let s = forge::snapshot(p.path());
    assert!(s.followups.is_empty());
    assert!(s.errors.is_empty());
}

#[test]
fn ledger_snapshot_sorts_open_newest_first_and_reports_errors() {
    let p = temp_project(None, Some("ref: refs/heads/main\n"));
    fs::write(p.path().join(".forge/followups.md"), format!("{LEDGER}<!-- followup: bad -->\n- x\n")).unwrap();
    let s = forge::snapshot(p.path());
    let ids: Vec<&str> = s.followups.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, vec!["fu-bbbbbbbbbbbb", "fu-cccccccccccc", "fu-aaaaaaaaaaaa"], "날짜 최신순");
    assert_eq!(s.errors.len(), 1);
    assert!(s.errors[0].path.ends_with("followups.md"));
}

#[test]
fn ledger_branch_root_reads_only_branch_ledger() {
    let p = temp_project(None, Some("ref: refs/heads/feat\n"));
    fs::write(p.path().join(".forge/followups.md"), LEDGER).unwrap();
    let s = forge::snapshot(p.path());
    assert!(s.followups.is_empty(), "기본 원장을 겹쳐 읽지 않는다");
    let br = p.path().join(".forge/branch/feat");
    fs::create_dir_all(&br).unwrap();
    fs::write(br.join("followups.md"), "<!-- followup: fu-ffffffffffff | source: b | task: 1 | date: 2026-10-09 | status: open | taken: - -->\n- 브랜치 것\n").unwrap();
    let s = forge::snapshot(p.path());
    assert_eq!(s.followups.len(), 1);
    assert_eq!(s.followups[0].id, "fu-ffffffffffff");
}

// ---------- 오류 격리 ----------

#[test]
fn broken_backlog_file_is_isolated() {
    let s = forge::snapshot_with_head(&fixture("broken"), &Head::NotGit);
    let slugs: Vec<&str> = s.backlog.iter().map(|p| p.slug.as_str()).collect();
    assert_eq!(slugs, vec!["a-good-plan", "old-plan"]);
    assert_eq!(s.backlog[1].task, None, "번호 없는 옛 계획은 —로 보인다");
    assert_eq!(s.errors.len(), 1);
    assert!(s.errors[0].path.ends_with("backlog/x.md"));
}

// ---------- 세션과 작업 연결 ----------

#[test]
fn driving_session_comes_from_running_or_drive_marker() {
    let p = temp_project(None, Some("ref: refs/heads/main\n"));
    assert_eq!(forge::snapshot(p.path()).driving_session, None, "표지가 없으면 짐작으로 짝짓지 않는다");
    fs::write(p.path().join(".forge/drive.md"), "# DRIVE\nstarted: 1\nblocked: 0\nsession: abc-123\n").unwrap();
    assert_eq!(forge::snapshot(p.path()).driving_session.as_deref(), Some("abc-123"));
    fs::write(p.path().join(".forge/running.md"), "<!-- forge-running: x -->\nworkflow: pending\nsession: run-9\n").unwrap();
    assert_eq!(forge::snapshot(p.path()).driving_session.as_deref(), Some("run-9"));
}

#[test]
fn no_forge_dir_is_reported() {
    let dir = tempfile::tempdir().unwrap();
    let s = forge::snapshot_with_head(dir.path(), &Head::NotGit);
    assert!(!s.has_forge);
    assert_eq!(s.headline, "forge 없음");
}
