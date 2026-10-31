// 단축 버튼 자동완성용 슬래시 명령 목록 — slash::tests::collects_plugin_user_and_project_commands 이식
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collect } from '../slash.js';

function write(p, text) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

test('설치된 플러그인·사용자·프로젝트의 스킬과 명령을 모은다', () => {
  const root = mkdtempSync(join(tmpdir(), 'anvil-slash-'));
  try {
    const home = join(root, 'home/.claude');
    const plug = join(root, 'cache/forge/0.9.5');
    write(join(plug, 'skills/fg-ask/SKILL.md'), '---\nname: fg-ask\ndescription: x\n---\n');
    write(join(plug, 'skills/dir-only/SKILL.md'), 'no front matter');
    write(join(plug, 'commands/fg-legacy.md'), 'x');
    write(join(plug, 'skills/no-skill-md/README.md'), 'x'); // SKILL.md 없으면 스킬 아님
    write(join(home, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'forge@forge': [{ installPath: plug }] } }));
    write(join(home, 'skills/eli5/SKILL.md'), '---\nname: "eli5"\n---\n');
    write(join(home, 'commands/deploy.md'), 'x');
    const proj = join(root, 'proj');
    write(join(proj, '.claude/commands/ship.md'), 'x');

    assert.deepEqual(collect(home, proj), ['/deploy', '/eli5', '/forge:dir-only', '/forge:fg-ask', '/forge:fg-legacy', '/ship']);
    // 플러그인 목록 파일이 없어도 사용자 명령은 나온다
    unlinkSync(join(home, 'plugins/installed_plugins.json'));
    assert.deepEqual(collect(home, null), ['/deploy', '/eli5']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
