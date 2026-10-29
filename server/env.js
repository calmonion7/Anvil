// claude·node를 찾는 PATH와 `.claude`가 있는 홈 — 준비물 확인(deps.js)과 세션(session.js)이 같이 쓴다.
// src-tauri/src/session.rs의 login_path · run_path · claude_home 이식(내장 tmux·jq 폴더와 WSL은 없다).
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter } from 'node:path';

let login;

/** 로그인 셸의 PATH(한 번 받아 둔다). 서버가 launchd 등 최소 환경에서 떠도 사용자가 깐 claude·node를 찾게 한다. */
export function loginPath() {
  if (login !== undefined) return login;
  const env = process.env.PATH ?? '';
  if (process.platform === 'win32') return (login = env);
  let fromShell;
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', "printf '__ANVIL_PATH__%s__END__' \"$PATH\""], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    });
    fromShell = out.match(/__ANVIL_PATH__(.*)__END__/s)?.[1];
  } catch {}
  // 셸 설정이 깨져 있어도 claude는 찾게 한다.
  return (login = `${fromShell ?? env}:/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin`);
}

/** claude·준비물 확인·세션에 넘기는 PATH: (예전 [설치]가 깐) Anvil 전용 node → ~/.local/bin(claude) → 로그인 PATH. */
export function runPath() {
  const home = homedir();
  return [`${home}/.local/share/anvil/node/bin`, `${home}/.local/bin`, loginPath()].join(delimiter);
}

/** `.claude`(플러그인 · 슬래시 명령)가 있는 홈. */
export const claudeHome = () => homedir();
