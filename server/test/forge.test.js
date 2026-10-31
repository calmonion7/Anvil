// forge 읽기 — 옛 Rust판(v0.1.x) tests/forge.rs 27개 사례 이식(골든 밖의 고정 사실) + 프로젝트 목록·문서 읽기·감시(lib.rs 몫).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from '../forge.js';
import { parseFollowups, readHead, resolveRoot, snapshot, snapshotWithHead, statusField } from '../forge.js';

const fixtures = join(import.meta.dirname, 'fixtures');
const fixture = (name) => join(fixtures, name);
const branch = (b) => ({ type: 'branch', branch: b });
const DETACHED = { type: 'detached' };
const NOT_GIT = { type: 'notGit' };

const temps = [];
process.on('exit', () => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), 'anvil-forge-'));
  temps.push(d);
  return d;
}

/** 픽스처의 config.json만 가진 임시 프로젝트에 `.git/HEAD`를 써서 만든다. */
function tempProject(configFrom, head) {
  const dir = tempDir();
  mkdirSync(join(dir, '.forge'));
  if (configFrom) copyFileSync(join(fixture(configFrom), '.forge/config.json'), join(dir, '.forge/config.json'));
  if (head) {
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git/HEAD'), head);
  }
  return dir;
}

const rootOf = (dir) => resolveRoot(dir, readHead(dir)).rel;

// ---------- root ----------

test('root: biblemap main → .forge', () => {
  assert.equal(rootOf(tempProject('biblemap', 'ref: refs/heads/main\n')), '.forge');
});

test('root: portfolion dev(defaultBranch 없음) → 브랜치 root', () => {
  assert.equal(rootOf(tempProject('portfolion', 'ref: refs/heads/dev\n')), '.forge/branch/dev');
});

test('root: fitcheck dev(defaultBranch dev) → .forge', () => {
  assert.equal(rootOf(tempProject('fitcheck', 'ref: refs/heads/dev\n')), '.forge');
});

test('root: 슬래시 브랜치는 중첩된다', () => {
  assert.equal(rootOf(tempProject(null, 'ref: refs/heads/feature/x\n')), '.forge/branch/feature/x');
});

test('root: detached는 경고와 함께 .forge', () => {
  const p = tempProject(null, '3f2a9c0d1e2b3a4f5c6d7e8f9a0b1c2d3e4f5a6b\n');
  const head = readHead(p);
  assert.deepEqual(head, DETACHED);
  const root = resolveRoot(p, head);
  assert.equal(root.rel, '.forge');
  assert.ok(root.warning);
});

test('root: git 아님 → .forge', () => {
  const p = tempProject(null, null);
  assert.deepEqual(readHead(p), NOT_GIT);
  assert.equal(rootOf(p), '.forge');
});

test('root: git 아님은 브랜치 배지가 없다', () => {
  const p = tempProject(null, null);
  const root = resolveRoot(p, NOT_GIT);
  assert.ok(!root.git && root.warning === null && root.branch === null);
  assert.ok(resolveRoot(p, DETACHED).git);
  assert.ok(resolveRoot(p, branch('main')).git);
});

test('root: 워크트리의 .git 파일을 따라간다', () => {
  const p = tempProject(null, null);
  const gitdir = join(p, 'real-gitdir');
  mkdirSync(gitdir);
  writeFileSync(join(gitdir, 'HEAD'), 'ref: refs/heads/anvil-monitor\n');
  writeFileSync(join(p, '.git'), `gitdir: ${gitdir}\n`);
  assert.equal(rootOf(p), '.forge/branch/anvil-monitor');
});

// ---------- BibleMap 픽스처 ----------

const biblemap = () => snapshotWithHead(fixture('biblemap'), branch('main'));

test('biblemap: 활성 #362, run 단계', () => {
  const a = biblemap().active;
  assert.equal(a.task, 362);
  assert.equal(a.slug, 'scene-engedi-text-dark-light');
  assert.equal(a.stage, 'run');
  assert.ok(a.title.startsWith('엔게디 장면 문구 수리'));
});

test('biblemap: loop 정지 사유와 검사', () => {
  const l = biblemap().loopState;
  assert.ok(l.wall.includes('unverifiable-uat'));
  assert.deepEqual([l.replanRound, l.replanCap], [0, 3]);
  assert.deepEqual(
    l.checks.map((c) => [c.id, c.result]),
    [
      ['C1', 'unknown'],
      ['C2', 'pass'],
      ['C3', 'pass'],
      ['C4', 'fail'],
      ['C5', 'fail'],
      ['C6', 'unknown'],
    ],
  );
});

test('biblemap: 백로그는 fg-run 순서', () => {
  assert.deepEqual(
    biblemap().backlog.map((p) => p.task),
    [363, 354, 355, 350],
  );
});

test('biblemap: 한 줄은 루프 정지', () => {
  assert.equal(biblemap().headline, '루프 정지');
});

// ---------- PortfoliOn 픽스처 ----------

const portfolion = () => snapshotWithHead(fixture('portfolion'), branch('dev'));

test('portfolion: done은 최상위 위에 브랜치 root를 겹친다', () => {
  const s = portfolion();
  assert.equal(s.root.rel, '.forge/branch/dev');
  assert.equal(s.doneTotal, 5); // 최상위 3 + branch/dev 2
  assert.equal(s.done[0].slug, 'listener-resume-and-enrich-run-check');
});

test('portfolion: 진행 영역은 브랜치 root만 읽는다', () => {
  const s = portfolion();
  assert.equal(s.active, null);
  assert.deepEqual(s.backlog, [], '최상위 backlog 미끼가 섞이면 안 된다');
});

test('done 날짜: 두 폴더 형식 모두', () => {
  const s = portfolion();
  const date = (slug) => s.done.find((d) => d.slug === slug).date;
  assert.equal(date('fomc-coverage-guard'), '2026-07-04');
  assert.equal(date('tech-report-outline-mobile-table'), '2026-08-12');
});

// ---------- STATUS ----------

test('status 필드: 두 형식 모두 첫 낱말', () => {
  const a = '# STATUS\n- verified: yes (npm test → 42 passing)\n';
  const b = '# STATUS\nverified: skipped (사용자 선택)\n';
  assert.equal(statusField(a, 'verified'), 'yes');
  assert.equal(statusField(b, 'verified'), 'skipped');
  assert.equal(statusField(b, 'retro'), null);
});

// ---------- 후속후보 ----------

const LEDGER =
  '# 후속후보\n\n이 제목 줄은 무시된다\n\n<!-- followup: fu-aaaaaaaaaaaa | source: old-task | task: 3 | date: 2026-10-01 | status: open | taken: - -->\n- 재시도 경우 검사 추가\n  근거: 시간 초과 분기 미검증\n<!-- followup: fu-bbbbbbbbbbbb | source: old-task | task: - | date: 2026-10-05 | status: taken | taken: 9 -->\n- 로그 정리\n<!-- followup: fu-cccccccccccc | source: other | task: 4 | date: 2026-10-03 | status: dismissed | taken: - -->\n- 필요 없음\n  사유: 대체됨\n';

test('원장: open 항목', () => {
  const { items, errors } = parseFollowups(LEDGER);
  assert.deepEqual(errors, []);
  const f = items[0];
  assert.equal(f.id, 'fu-aaaaaaaaaaaa');
  assert.equal(f.source, 'old-task');
  assert.equal(f.task, 3);
  assert.equal(f.date, '2026-10-01');
  assert.equal(f.status, 'open');
  assert.equal(f.taken, null);
  assert.equal(f.text, '재시도 경우 검사 추가');
});

test('원장: taken·dismissed', () => {
  const { items } = parseFollowups(LEDGER);
  assert.equal(items.length, 3);
  assert.equal(items[1].status, 'taken');
  assert.equal(items[1].taken, 9);
  assert.equal(items[1].task, null, 'task: - 는 번호 없음');
  assert.equal(items[2].status, 'dismissed');
});

test('원장: 여러 줄 본문', () => {
  const { items } = parseFollowups(LEDGER);
  assert.equal(items[0].body, '재시도 경우 검사 추가\n근거: 시간 초과 분기 미검증');
  assert.equal(items[2].body, '필요 없음\n사유: 대체됨');
  assert.equal(items[1].body, '로그 정리');
});

test('원장: 첫 마커 앞 제목은 무시', () => {
  const { items, errors } = parseFollowups('# 후속후보\n## 후속 후보\n- 제목 아래 항목\n');
  assert.deepEqual(items, []);
  assert.deepEqual(errors, []);
});

test('원장: 깨진 마커는 오류로', () => {
  const md =
    '<!-- followup: fu-XYZ | source: a | task: 1 | date: 2026-10-01 | status: open | taken: - -->\n- 깨짐\n<!-- followup: fu-dddddddddddd | source: a | task: 1 | date: 2026-10-01 | status: wip | taken: - -->\n- 상태 틀림\n<!-- followup: fu-eeeeeeeeeeee | source: a | task: 1 | date: 2026-10-02 | status: open | taken: - -->\n- 정상\n';
  const { items, errors } = parseFollowups(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'fu-eeeeeeeeeeee');
  assert.equal(errors.length, 2);
});

test('원장: 파일이 없으면 0', () => {
  const s = snapshot(tempProject(null, 'ref: refs/heads/main\n'));
  assert.deepEqual(s.followups, []);
  assert.deepEqual(s.errors, []);
});

test('원장: 날짜 최신순 정렬과 오류 보고', () => {
  const p = tempProject(null, 'ref: refs/heads/main\n');
  writeFileSync(join(p, '.forge/followups.md'), `${LEDGER}<!-- followup: bad -->\n- x\n`);
  const s = snapshot(p);
  assert.deepEqual(
    s.followups.map((f) => f.id),
    ['fu-bbbbbbbbbbbb', 'fu-cccccccccccc', 'fu-aaaaaaaaaaaa'],
  );
  assert.equal(s.errors.length, 1);
  assert.ok(s.errors[0].path.endsWith('followups.md'));
});

test('원장: 브랜치 root는 브랜치 원장만 읽는다', () => {
  const p = tempProject(null, 'ref: refs/heads/feat\n');
  writeFileSync(join(p, '.forge/followups.md'), LEDGER);
  assert.deepEqual(snapshot(p).followups, [], '기본 원장을 겹쳐 읽지 않는다');
  const br = join(p, '.forge/branch/feat');
  mkdirSync(br, { recursive: true });
  writeFileSync(
    join(br, 'followups.md'),
    '<!-- followup: fu-ffffffffffff | source: b | task: 1 | date: 2026-10-09 | status: open | taken: - -->\n- 브랜치 것\n',
  );
  const s = snapshot(p);
  assert.equal(s.followups.length, 1);
  assert.equal(s.followups[0].id, 'fu-ffffffffffff');
});

// ---------- 오류 격리 ----------

test('깨진 백로그 파일은 그 파일만 건너뛴다', () => {
  const s = snapshotWithHead(fixture('broken'), NOT_GIT);
  assert.deepEqual(
    s.backlog.map((p) => p.slug),
    ['a-good-plan', 'old-plan'],
  );
  assert.equal(s.backlog[1].task, null, '번호 없는 옛 계획은 —로 보인다');
  assert.equal(s.errors.length, 1);
  assert.ok(s.errors[0].path.endsWith('backlog/x.md'));
});

test('UTF-8이 아닌 파일도 그 파일만 오류로 남긴다', () => {
  const p = tempProject(null, 'ref: refs/heads/main\n');
  mkdirSync(join(p, '.forge/backlog'));
  writeFileSync(join(p, '.forge/backlog/bad.md'), Buffer.from([0x3c, 0xff, 0xfe, 0x0a]));
  writeFileSync(join(p, '.forge/backlog/good.md'), '<!-- forge-slug: good -->\n# 좋음\n');
  const s = snapshot(p);
  assert.deepEqual(
    s.backlog.map((b) => b.slug),
    ['good'],
  );
  assert.deepEqual(s.errors, [{ path: '.forge/backlog/bad.md', message: 'UTF-8 문서가 아닙니다. 이 파일만 건너뛰었습니다.' }]);
});

// ---------- 세션과 작업 연결 ----------

test('실행 세션은 running.md·drive.md의 session: 표지에서', () => {
  const p = tempProject(null, 'ref: refs/heads/main\n');
  assert.equal(snapshot(p).drivingSession, null, '표지가 없으면 짐작으로 짝짓지 않는다');
  writeFileSync(join(p, '.forge/drive.md'), '# DRIVE\nstarted: 1\nblocked: 0\nsession: abc-123\n');
  assert.equal(snapshot(p).drivingSession, 'abc-123');
  writeFileSync(join(p, '.forge/running.md'), '<!-- forge-running: x -->\nworkflow: pending\nsession: run-9\n');
  assert.equal(snapshot(p).drivingSession, 'run-9');
});

test('.forge가 없으면 forge 없음', () => {
  const s = snapshotWithHead(tempDir(), NOT_GIT);
  assert.equal(s.hasForge, false);
  assert.equal(s.headline, 'forge 없음');
});

// ---------- 프로젝트 목록 · 문서 읽기 · 감시 (lib.rs) ----------

/** 새 데이터 폴더로 forge 모듈을 시작한다. 이벤트는 events에 쌓인다. */
async function boot() {
  const events = [];
  const waiters = [];
  const ctx = {
    dataDir: join(tempDir(), 'data'),
    broadcast: (name, payload) => {
      events.push({ name, payload });
      for (const w of [...waiters]) w();
    },
  };
  await forge.init(ctx);
  /** pred를 만족하는 snapshot 이벤트를 기다린다. */
  const waitFor = (pred, ms = 5000) =>
    new Promise((ok, fail) => {
      const check = () => {
        const hit = events.find((e) => e.name === 'snapshot' && pred(e.payload));
        if (!hit) return;
        waiters.splice(waiters.indexOf(check), 1);
        clearTimeout(timer);
        ok(hit.payload);
      };
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(check), 1);
        fail(new Error(`snapshot 이벤트가 오지 않았습니다: ${pred}`));
      }, ms);
      waiters.push(check);
      check();
    });
  return { ctx, events, waitFor, cmd: (name, args = {}) => forge.commands[name](args, ctx) };
}

test('프로젝트 목록: 추가·중복·저장·다시 읽기·제거', async () => {
  const { ctx, cmd } = await boot();
  const p = tempProject(null, 'ref: refs/heads/main\n');
  assert.deepEqual(await cmd('list_projects'), []);
  const list = await cmd('add_project', { path: p });
  assert.deepEqual(
    list.map((s) => s.path),
    [p],
  );
  await cmd('add_project', { path: p });
  assert.deepEqual(JSON.parse(readFileSync(join(ctx.dataDir, 'projects.json'), 'utf8')), [p]);
  assert.equal(forge.registered(p), true);

  await forge.init(ctx); // 다시 시작해도 목록이 남는다
  assert.deepEqual(
    (await cmd('list_projects')).map((s) => s.name),
    [snapshot(p).name],
  );
  assert.deepEqual(await cmd('remove_project', { path: p }), []);
  assert.equal(forge.registered(p), false);
  assert.deepEqual(JSON.parse(readFileSync(join(ctx.dataDir, 'projects.json'), 'utf8')), []);
});

test('프로젝트 목록: 폴더가 아니면 거절', async () => {
  const { cmd } = await boot();
  const missing = join(tempDir(), 'nope');
  await assert.rejects(cmd('add_project', { path: missing }), { message: `폴더가 아닙니다: ${missing}` });
});

test('read_doc: 등록한 프로젝트의 .forge/ 안만 읽는다', async () => {
  const { cmd } = await boot();
  const p = tempProject(null, 'ref: refs/heads/main\n');
  writeFileSync(join(p, '.forge/plan.md'), '# 계획\n');
  writeFileSync(join(p, 'secret.txt'), 'secret');
  await assert.rejects(cmd('read_doc', { project: p, rel: '.forge/plan.md' }), { message: '등록하지 않은 프로젝트입니다' });
  await cmd('add_project', { path: p });
  assert.equal(await cmd('read_doc', { project: p, rel: '.forge/plan.md' }), '# 계획\n');
  const outside = { message: '.forge/ 밖의 파일은 열지 않습니다' };
  await assert.rejects(cmd('read_doc', { project: p, rel: '.forge/../secret.txt' }), outside);
  await assert.rejects(cmd('read_doc', { project: p, rel: join(p, 'secret.txt') }), outside);
  symlinkSync(join(p, 'secret.txt'), join(p, '.forge/link.md'));
  await assert.rejects(cmd('read_doc', { project: p, rel: '.forge/link.md' }), outside);
  await assert.rejects(cmd('read_doc', { project: p, rel: '.forge/none.md' }));
  await cmd('remove_project', { path: p });
});

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('감시: .forge 변경·HEAD 변경·.forge 생성 뒤 변경을 snapshot으로 보낸다', async () => {
  // macOS FSEvents는 감시를 건 직후 몇 ms 안의 변경을 놓친다(Rust notify도 같다) — 감시를 새로 걸면 잠깐 기다린다.
  const settle = () => sleep(200);
  const { cmd, waitFor, events } = await boot();
  const p = tempProject(null, 'ref: refs/heads/main\n');
  await cmd('add_project', { path: p });
  await settle();
  writeFileSync(join(p, '.forge/plan.md'), '<!-- forge-slug: w -->\n# 감시\n');
  await waitFor((s) => s.path === p && s.active?.slug === 'w');
  writeFileSync(join(p, '.git/HEAD'), 'ref: refs/heads/feat\n');
  await waitFor((s) => s.path === p && s.root.rel === '.forge/branch/feat');

  const q = tempDir();
  await cmd('add_project', { path: q });
  await settle();
  mkdirSync(join(q, '.forge'));
  await waitFor((s) => s.path === q && s.hasForge);
  await settle(); // .forge가 생겨 감시를 다시 걸었다
  writeFileSync(join(q, '.forge/plan.md'), '<!-- forge-slug: later -->\n# 나중\n');
  await waitFor((s) => s.path === q && s.active?.slug === 'later');

  await cmd('remove_project', { path: p });
  await cmd('remove_project', { path: q });
  await sleep(400);
  const before = events.length;
  writeFileSync(join(p, '.forge/plan.md'), '<!-- forge-slug: gone -->\n# 제거 뒤\n');
  await sleep(700);
  assert.equal(events.length, before, '제거한 프로젝트는 감시하지 않는다');
});
