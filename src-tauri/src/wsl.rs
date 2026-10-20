//! 윈도우 경로 ↔ WSL 경로. 윈도우에서 tmux는 WSL 안에서 돌므로 경로를 넘길 때 바꾼다.

/// `C:\x\y` → `/mnt/c/x/y`, `\\wsl$\Distro\home\a` → `/home/a`. 이미 유닉스 경로면 그대로.
pub fn to_wsl(win: &str) -> String {
    for prefix in [r"\\wsl$\", r"\\wsl.localhost\"] {
        if let Some(rest) = win.strip_prefix(prefix) {
            let after = rest.split_once('\\').map(|(_, p)| p).unwrap_or("");
            return format!("/{}", after.replace('\\', "/"));
        }
    }
    let b = win.as_bytes();
    if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        let rest = win[2..].replace('\\', "/");
        let rest = rest.trim_start_matches('/');
        let drive = (b[0] as char).to_ascii_lowercase();
        return if rest.is_empty() { format!("/mnt/{drive}") } else { format!("/mnt/{drive}/{rest}") };
    }
    win.replace('\\', "/")
}

/// `/mnt/c/x/y` → `C:\x\y`. 드라이브 마운트 밖 경로는 `\\wsl$\<distro>\…`.
pub fn from_wsl(path: &str, distro: &str) -> String {
    if let Some(rest) = path.strip_prefix("/mnt/") {
        let (d, tail) = rest.split_once('/').unwrap_or((rest, ""));
        if d.len() == 1 && d.as_bytes()[0].is_ascii_alphabetic() {
            return format!("{}:\\{}", d.to_ascii_uppercase(), tail.replace('/', "\\"));
        }
    }
    format!(r"\\wsl$\{distro}{}", path.replace('/', "\\"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wsl_path_drive_letter() {
        assert_eq!(to_wsl(r"C:\Users\me\proj"), "/mnt/c/Users/me/proj");
        assert_eq!(to_wsl(r"d:\"), "/mnt/d");
    }

    #[test]
    fn wsl_path_spaces() {
        assert_eq!(to_wsl(r"C:\My Projects\a b"), "/mnt/c/My Projects/a b");
    }

    #[test]
    fn wsl_path_unc() {
        assert_eq!(to_wsl(r"\\wsl$\Ubuntu\home\me\proj"), "/home/me/proj");
        assert_eq!(to_wsl(r"\\wsl.localhost\Ubuntu\home\me"), "/home/me");
    }

    #[test]
    fn wsl_path_round_trip() {
        assert_eq!(from_wsl("/mnt/c/My Projects/a", "Ubuntu"), r"C:\My Projects\a");
        assert_eq!(from_wsl("/home/me", "Ubuntu"), r"\\wsl$\Ubuntu\home\me");
        for p in [r"C:\x\y z", r"E:\deep\er\path"] {
            assert_eq!(from_wsl(&to_wsl(p), "Ubuntu"), p);
        }
    }

    #[test]
    fn wsl_path_unix_passthrough() {
        assert_eq!(to_wsl("/Users/me/proj"), "/Users/me/proj");
    }
}
