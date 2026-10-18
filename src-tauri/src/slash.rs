//! 단축 버튼 자동완성용 슬래시 명령 목록 — 설치된 플러그인·사용자·프로젝트의 스킬과 명령 파일을 읽는다.
//! Claude 내장 명령(/clear 등)은 파일이 없어 여기서 못 읽는다(프런트가 덧붙인다).

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// `<dir>/skills/<스킬>/SKILL.md`와 `<dir>/commands/<명령>.md`를 `/{prefix}이름`으로 모은다.
/// 스킬 이름은 SKILL.md 앞머리 `name:`이 있으면 그것, 없으면 폴더 이름.
fn scan(dir: &Path, prefix: &str, out: &mut BTreeSet<String>) {
    if let Ok(rd) = fs::read_dir(dir.join("skills")) {
        for e in rd.flatten() {
            let md = e.path().join("SKILL.md");
            let Ok(text) = fs::read_to_string(&md) else { continue };
            let name = front_name(&text).unwrap_or_else(|| e.file_name().to_string_lossy().into_owned());
            out.insert(format!("/{prefix}{name}"));
        }
    }
    if let Ok(rd) = fs::read_dir(dir.join("commands")) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().is_some_and(|x| x == "md") {
                if let Some(stem) = p.file_stem() {
                    out.insert(format!("/{prefix}{}", stem.to_string_lossy()));
                }
            }
        }
    }
}

/// 앞머리(--- … ---) 안의 `name:` 값
fn front_name(text: &str) -> Option<String> {
    let body = text.strip_prefix("---")?;
    let end = body.find("\n---")?;
    body[..end].lines().find_map(|l| {
        let v = l.strip_prefix("name:")?.trim().trim_matches(['"', '\'']);
        (!v.is_empty()).then(|| v.to_string())
    })
}

/// 설치된 플러그인(`plugins/installed_plugins.json`) · 사용자(`~/.claude`) · 프로젝트(`<project>/.claude`)의 명령
pub fn collect(claude_home: &Path, project: Option<&Path>) -> Vec<String> {
    let mut out = BTreeSet::new();
    let installed = fs::read_to_string(claude_home.join("plugins/installed_plugins.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
    if let Some(plugins) = installed.as_ref().and_then(|v| v.get("plugins")).and_then(|p| p.as_object()) {
        for (key, entries) in plugins {
            let plugin = key.split('@').next().unwrap_or(key);
            let path = entries.as_array().and_then(|a| a.first()).and_then(|e| e.get("installPath")).and_then(|p| p.as_str());
            if let Some(path) = path {
                scan(Path::new(path), &format!("{plugin}:"), &mut out);
            }
        }
    }
    scan(claude_home, "", &mut out);
    if let Some(p) = project {
        scan(&p.join(".claude"), "", &mut out);
    }
    out.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(p: &Path, text: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn collects_plugin_user_and_project_commands() {
        let root = std::env::temp_dir().join(format!("anvil-slash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let home = root.join("home/.claude");
        let plug = root.join("cache/forge/0.9.5");
        write(&plug.join("skills/fg-ask/SKILL.md"), "---\nname: fg-ask\ndescription: x\n---\n");
        write(&plug.join("skills/dir-only/SKILL.md"), "no front matter");
        write(&plug.join("commands/fg-legacy.md"), "x");
        write(&plug.join("skills/no-skill-md/README.md"), "x"); // SKILL.md 없으면 스킬 아님
        write(
            &home.join("plugins/installed_plugins.json"),
            &format!(r#"{{"version":2,"plugins":{{"forge@forge":[{{"installPath":"{}"}}]}}}}"#, plug.display()),
        );
        write(&home.join("skills/eli5/SKILL.md"), "---\nname: \"eli5\"\n---\n");
        write(&home.join("commands/deploy.md"), "x");
        let proj = root.join("proj");
        write(&proj.join(".claude/commands/ship.md"), "x");

        let got = collect(&home, Some(&proj));
        assert_eq!(
            got,
            ["/deploy", "/eli5", "/forge:dir-only", "/forge:fg-ask", "/forge:fg-legacy", "/ship"]
        );
        // 플러그인 목록 파일이 없어도 사용자 명령은 나온다
        fs::remove_file(home.join("plugins/installed_plugins.json")).unwrap();
        assert_eq!(collect(&home, None), ["/deploy", "/eli5"]);
        let _ = fs::remove_dir_all(&root);
    }
}
