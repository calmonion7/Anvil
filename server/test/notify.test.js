// 입력 대기 알림의 판정과 문구(electron/notify.js) — 주 프로세스가 띄우는 OS 알림 자체는 사람이 UAT로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSession, message, readStates, toNotify } from '../../electron/notify.js';
import { sessionName } from '../names.js';

test('입력 대기로 바뀌는 순간에만 알린다', () => {
  assert.deepEqual(toNotify({ a: 'working' }, { a: 'waiting' }, false), ['a']);
  assert.deepEqual(toNotify({ a: 'waiting' }, { a: 'waiting' }, false), [], '이미 대기 중에 또 온 Notification 훅');
  assert.deepEqual(toNotify({}, { a: 'waiting' }, false), ['a'], '처음 본 세션');
  assert.deepEqual(toNotify({ a: 'waiting' }, { a: 'working' }, false), []);
  assert.deepEqual(toNotify({ a: 'working' }, { a: 'ended' }, false), []);
});

test('포커스된 Anvil 창이 있으면 알리지 않는다', () => {
  assert.deepEqual(toNotify({ a: 'working' }, { a: 'waiting' }, true), []);
});

test('세션 이름으로 등록된 프로젝트와 역할을 찾는다', () => {
  const projects = ['/Users/x/Project/BibleMap', '/Users/y/BibleMap'];
  assert.deepEqual(findSession(sessionName('/Users/y/BibleMap', 'run'), projects), { project: '/Users/y/BibleMap', role: 'run' });
  assert.deepEqual(findSession(sessionName('/Users/x/Project/BibleMap', 'plan'), projects), { project: '/Users/x/Project/BibleMap', role: 'plan' });
  assert.equal(findSession('anvil-other-000000-plan', projects), null);
});

test('문구는 폴더 이름과 역할', () => {
  assert.deepEqual(message({ project: '/a/Anvil', role: 'plan' }, false), { title: 'Anvil', body: 'Anvil · 계획 세션 — 입력을 기다립니다' });
  assert.equal(message({ project: '/a/Anvil', role: 'run' }, false).body, 'Anvil · 실행 세션 — 입력을 기다립니다');
  assert.equal(message({ project: '/a/Anvil', role: 'run' }, true).body, 'Anvil · run session — waiting for input');
});

test('상태 파일을 읽는다(깨진 파일·폴더 없음은 건너뛴다)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anvil-notify-'));
  try {
    assert.deepEqual(readStates(dir), {});
    mkdirSync(join(dir, 'sessions'));
    writeFileSync(join(dir, 'sessions', 'a.json'), '{"state":"waiting","session_id":"x","ts":1}\n');
    writeFileSync(join(dir, 'sessions', 'b.json'), '{깨짐');
    writeFileSync(join(dir, 'sessions', 'a.json.tmp'), '{"state":"working"}');
    assert.deepEqual(readStates(dir), { a: 'waiting' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
