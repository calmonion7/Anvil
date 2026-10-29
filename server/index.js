// `node --test server/`(DoD 1)의 진입점. Node 22+는 디렉터리 인자를 글롭이 아니라 모듈로 실행해
// 이 index.js를 부르므로, 여기서 server/ 아래 *.test.js를 모두 불러온다(서버 실행은 main.js).
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

const tests = readdirSync(import.meta.dirname, { recursive: true }).filter((f) => f.endsWith('.test.js'));
for (const f of tests.sort()) {
  try {
    await import(`./${f}`);
  } catch (e) {
    // 불러오기 실패도 실패 수에 잡히게 한다(그냥 던지면 뒤 파일이 조용히 빠진다).
    test(`load ${f}`, () => {
      throw e;
    });
  }
}
