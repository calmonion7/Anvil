//! Node 전환 동작 고정(pin) — 픽스처마다 화면에 보내는 `forge::Snapshot` JSON을
//! `server/test/golden/<case>.json`과 비교한다. `ANVIL_WRITE_GOLDEN=1`이면 골든을 새로 쓴다.
//! 정규화: 임시 프로젝트의 절대 경로 → `<ROOT>`. Node 쪽(`server/test/forge.golden.test.js`)도 같은 규칙.

use anvil_lib::forge;
use std::fs;
use std::path::{Path, PathBuf};

/// (골든 이름, 픽스처 폴더, `.git/HEAD` 내용 — None이면 git 아님)
const CASES: &[(&str, &str, Option<&str>)] = &[
    ("biblemap", "biblemap", Some("ref: refs/heads/main\n")),
    ("broken", "broken", None),
    ("fitcheck", "fitcheck", Some("ref: refs/heads/dev\n")),
    ("portfolion-dev", "portfolion", Some("ref: refs/heads/dev\n")),
    ("portfolion-main", "portfolion", Some("ref: refs/heads/main\n")),
];

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for e in fs::read_dir(from).unwrap() {
        let e = e.unwrap();
        let dest = to.join(e.file_name());
        if e.file_type().unwrap().is_dir() {
            copy_dir(&e.path(), &dest);
        } else {
            fs::copy(e.path(), dest).unwrap();
        }
    }
}

#[test]
fn snapshot_json_matches_golden() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let golden_dir: PathBuf = manifest.join("../server/test/golden");
    let write = std::env::var("ANVIL_WRITE_GOLDEN").as_deref() == Ok("1");
    let mut mismatched = vec![];
    for (case, fixture, head) in CASES {
        let tmp = tempfile::tempdir().unwrap();
        let project = tmp.path().join(fixture);
        copy_dir(&manifest.join("tests/fixtures").join(fixture), &project);
        if let Some(head) = head {
            fs::create_dir_all(project.join(".git")).unwrap();
            fs::write(project.join(".git/HEAD"), head).unwrap();
        }
        let snap = forge::snapshot(&project);
        let json = serde_json::to_string_pretty(&snap).unwrap().replace(&*project.to_string_lossy(), "<ROOT>") + "\n";
        let file = golden_dir.join(format!("{case}.json"));
        if write {
            fs::create_dir_all(&golden_dir).unwrap();
            fs::write(&file, &json).unwrap();
        } else if fs::read_to_string(&file).ok().as_deref() != Some(json.as_str()) {
            mismatched.push(format!("{case}:\n{json}"));
        }
    }
    assert!(mismatched.is_empty(), "골든과 다름(ANVIL_WRITE_GOLDEN=1로 다시 쓰기):\n{}", mismatched.join("\n"));
}
