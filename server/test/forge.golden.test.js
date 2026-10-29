// 동작 고정(pin): Rust가 화면에 보내던 Snapshot JSON(server/test/golden/, src-tauri/tests/golden.rs가 만듦)과
// Node 파서의 출력이 같아야 한다. 정규화: 임시 프로젝트의 절대 경로 → `<ROOT>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshot } from '../forge.js';

const here = import.meta.dirname;
const fixtures = join(here, '../../src-tauri/tests/fixtures');

// (골든 이름, 픽스처 폴더, `.git/HEAD` 내용 — null이면 git 아님) — golden.rs의 CASES와 같다.
const cases = [
  ['biblemap', 'biblemap', 'ref: refs/heads/main\n'],
  ['broken', 'broken', null],
  ['fitcheck', 'fitcheck', 'ref: refs/heads/dev\n'],
  ['portfolion-dev', 'portfolion', 'ref: refs/heads/dev\n'],
  ['portfolion-main', 'portfolion', 'ref: refs/heads/main\n'],
];

for (const [name, fixture, head] of cases) {
  test(`golden: ${name}`, () => {
    const tmp = mkdtempSync(join(tmpdir(), 'anvil-golden-'));
    try {
      const project = join(tmp, fixture);
      cpSync(join(fixtures, fixture), project, { recursive: true });
      if (head !== null) {
        mkdirSync(join(project, '.git'));
        writeFileSync(join(project, '.git/HEAD'), head);
      }
      const actual = JSON.parse(JSON.stringify(snapshot(project)).replaceAll(project, '<ROOT>'));
      const golden = JSON.parse(readFileSync(join(here, 'golden', `${name}.json`), 'utf8'));
      assert.deepStrictEqual(actual, golden);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}
