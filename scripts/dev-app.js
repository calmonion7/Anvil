// 데스크톱 앱 개발 실행(`npm run dev:app`): vite 개발 화면을 띄우고, Electron 창이 그 화면(ANVIL_DEV_URL)을 연다.
// 서버는 설치된 앱처럼 Electron 주 프로세스가 따로 띄우거나(이미 살아 있으면) 거기에 붙는다 — vite가 /api·/ws·/?token=을 그 서버로 넘긴다.
// 뒤에 붙인 인자는 vite에 넘긴다. 창(Electron)이 끝나거나 신호를 받으면 vite도 내린다. 서버는 남는다(유휴 5분 뒤 스스로 내려간다).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const root = join(import.meta.dirname, '..');
const electron = createRequire(import.meta.url)('electron');
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'inherit'],
});

let app;
const stop = () => [vite, app].forEach((c) => c && c.exitCode === null && c.signalCode === null && c.kill('SIGTERM'));
vite.stdout.on('data', (d) => {
  process.stdout.write(d);
  if (app) return;
  const local = stripVTControlCharacters(String(d)).match(/Local:\s+(http:\/\/\S+?)\/?\s/)?.[1];
  if (!local) return;
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  app = spawn(electron, [root], { cwd: root, stdio: 'inherit', env: { ...env, ANVIL_DEV_URL: local } });
  app.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
});
vite.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, stop);
