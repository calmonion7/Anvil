// 테스트용 가짜 claude — `--settings`로 받은 훅 설정의 명령을 claude처럼 부르고, 줄 단위 입력에 반응한다.
//   go → UserPromptSubmit(작업 중) · done → Stop(입력 대기) · flood → 300KB 출력 · exit → SessionEnd 뒤 종료 · die143 → 코드 143으로 종료 · 그 밖 → `got:<줄>`
// FAKE_OUT이 있으면 받은 인자·cwd·환경을 그 파일에 남긴다.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const settings = JSON.parse(readFileSync(args[args.indexOf('--settings') + 1], 'utf8'));
const hook = (event) => {
  for (const m of settings.hooks[event] ?? []) {
    for (const h of m.hooks) {
      execSync(h.command, { input: JSON.stringify({ session_id: 'fake-sid' }), stdio: ['pipe', 'ignore', 'inherit'] });
    }
  }
};

if (process.env.FAKE_OUT) {
  writeFileSync(process.env.FAKE_OUT, JSON.stringify({ args, cwd: process.cwd(), env: process.env }));
}
hook('SessionStart');
process.stdout.write('ready>\n');
createInterface({ input: process.stdin }).on('line', (raw) => {
  // ^U(줄 지우기)는 실제 claude가 스스로 처리한다 — POSIX 터미널은 대신 지워 주지만 Windows ConPTY는 그대로 넘긴다
  const line = raw.slice(raw.lastIndexOf('\x15') + 1);
  if (line === 'go') {
    hook('UserPromptSubmit');
    console.log('busy');
  } else if (line === 'done') {
    hook('Stop');
    console.log('idle');
  } else if (line === 'flood') {
    process.stdout.write(`${'x'.repeat(300_000)}END\n`);
  } else if (line === 'exit') {
    hook('SessionEnd');
    process.exit(0);
  } else if (line === 'die143') {
    process.exit(143); // 실제 claude가 SIGTERM을 받고 끝나는 코드(2026-10-31 실측)
  } else {
    console.log(`got:${line}`);
  }
});
