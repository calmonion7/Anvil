// claude·node를 찾는 PATH와 `.claude`가 있는 홈 — 준비물 확인(deps.js)과 세션(session.js)이 같이 쓴다.
// src-tauri/src/session.rs의 login_path · run_path · claude_home 이식(내장 tmux·jq 폴더와 WSL은 없다).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, win32 } from 'node:path';

let login;
/** Electron 아래서 돌 때 `node` 대체 실행 파일이 든 폴더(setupNode) — runPath() 맨 앞에 둔다. */
let nodeBin = '';

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

/**
 * 훅·상태줄·세션이 부를 `node`. 서버가 Electron 안의 Node로 돌면(ELECTRON_RUN_AS_NODE) 그 Electron을 node로 부르는 sh 스크립트를
 * `<dataDir>/bin/node`에 쓰고 runPath() 맨 앞에 그 폴더를 둔다 — 사용자 컴퓨터에 node가 없어도 forge 훅이 돈다.
 * 일반 node면 아무것도 만들지 않고 그 node를 쓴다. Windows는 `node.cmd`(cmd·PATHEXT용)와 확장자 없는 sh(Git Bash용)를 함께 쓴다. → node 명령 경로
 */
export function setupNode(dataDir, exe = process.execPath, electron = Boolean(process.versions.electron)) {
  if (!electron) {
    nodeBin = '';
    return exe;
  }
  const bin = join(dataDir, 'bin');
  mkdirSync(bin, { recursive: true });
  const sh = join(bin, 'node');
  writeFileSync(sh, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec '${exe.replaceAll("'", "'\\''")}' "$@"\n`);
  chmodSync(sh, 0o755);
  nodeBin = bin;
  if (process.platform !== 'win32') return sh;
  const cmd = join(bin, 'node.cmd');
  writeFileSync(cmd, `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" %*\r\n`);
  return cmd;
}

/** claude·준비물 확인·세션에 넘기는 PATH: (Electron이면) node 대체 실행 파일 → (예전 [설치]가 깐) Anvil 전용 node → ~/.local/bin(claude) → 로그인 PATH. */
export function runPath() {
  const home = homedir();
  return [...(nodeBin ? [nodeBin] : []), join(home, '.local', 'share', 'anvil', 'node', 'bin'), join(home, '.local', 'bin'), loginPath()].join(delimiter);
}

/** 환경에 PATH를 하나만 둔다 — Windows는 이름의 대소문자를 가리지 않아 `{...process.env}`에 `Path`가 남은 채 `PATH`를 더하면 둘이 함께 넘어간다. */
export function withPath(env, path) {
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  out.PATH = path;
  return out;
}

/**
 * 실행 파일 이름 → 실제 경로. Windows node-pty는 서버 자신의 Path에서 이름 그대로만 찾으므로(확장자를 붙이지 않는다 —
 * node-pty src/win/path_util.cc) 세션 PATH에서 .exe·.cmd·.bat까지 붙여 찾는다. 경로를 주었거나 Windows가 아니면 그대로.
 */
export function findCommand(prog, path = runPath(), platform = process.platform, exists = existsSync) {
  if (platform !== 'win32' || /[\\/]/.test(prog)) return prog;
  const exts = /\.\w+$/.test(prog) ? [''] : ['.exe', '.cmd', '.bat'];
  for (const dir of path.split(';').filter(Boolean)) {
    for (const ext of exts) {
      const file = win32.join(dir, prog + ext);
      if (exists(file)) return file;
    }
  }
  return prog;
}

/** pty.spawn에 넘길 [파일, 인자]. Windows .cmd·.bat은 cmd.exe로 감싸고, node-pty가 다시 따옴표를 붙이지 않게 명령줄 문자열로 넘긴다. */
export function spawnTarget(file, args, platform = process.platform) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(file)) return [file, args];
  const q = (s) => `"${String(s).replaceAll('"', '""')}"`;
  return ['cmd.exe', `/d /s /c "${[file, ...args].map(q).join(' ')}"`];
}

/** `.claude`(플러그인 · 슬래시 명령)가 있는 홈. */
export const claudeHome = () => homedir();
