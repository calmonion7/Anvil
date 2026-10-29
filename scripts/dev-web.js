// 개발 실행(`npm run dev:web`): Node 서버(server/main.js)와 vite 개발 화면을 같은 환경(ANVIL_PORT·ANVIL_DATA_DIR)으로 같이 띄운다.
// 화면은 이 스크립트가 찍는 「Anvil 개발:」 주소(vite 주소 + 서버 토큰)로 연다 — 서버 주소처럼 ?token=으로 쿠키를 받고,
// vite 프록시는 그 쿠키를 /api·/ws와 함께 서버로 넘길 뿐 토큰을 붙이지 않는다(Origin·Host 헤더는 위조할 수 있다).
// 뒤에 붙인 인자는 vite에 넘긴다(예: `npm run dev:web -- --port 1430`). 하나가 끝나거나 신호를 받으면 둘 다 내린다.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const root = join(import.meta.dirname, '..');
const stdio = ['inherit', 'pipe', 'inherit'];
const children = [
  spawn(process.execPath, [join(root, 'server/main.js')], { cwd: root, stdio }),
  spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', ...process.argv.slice(2)], { cwd: root, stdio }),
];

// 서버가 찍은 토큰과 vite의 Local 주소가 모이면 개발 화면 주소를 한 번 찍는다(「Anvil:」 주소는 build/ 화면이다).
let token, local;
for (const c of children) {
  c.stdout.on('data', (d) => {
    process.stdout.write(d);
    if (token && local) return;
    const text = stripVTControlCharacters(String(d));
    token ??= text.match(/Anvil: http:\/\/\S+\?token=(\w+)/)?.[1];
    local ??= text.match(/Local:\s+(http:\/\/\S+?)\/?\s/)?.[1];
    if (token && local) console.log(`Anvil 개발: ${local}/?token=${token}`);
  });
}

let code = 0;
let signaled = false; // 사용자가 멈춘 것이면 자식이 신호로 낸 종료 코드(vite는 143)를 실패로 보지 않는다
const stop = () => children.forEach((c) => c.exitCode === null && c.signalCode === null && c.kill('SIGTERM'));
for (const c of children) {
  c.on('exit', (exit) => {
    if (!signaled) code ||= exit ?? 0;
    stop();
    if (children.every((x) => x.exitCode !== null || x.signalCode !== null)) process.exit(code);
  });
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => ((signaled = true), stop()));
