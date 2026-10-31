// 단축 버튼 자동완성용 슬래시 명령 목록 — 설치된 플러그인·사용자·프로젝트의 스킬과 명령 파일을 읽는다(옛 Rust판(v0.1.x) slash.rs 이식).
// Claude 내장 명령(/clear 등)은 파일이 없어 여기서 못 읽는다(화면이 덧붙인다).
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const entries = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** 앞머리(--- … ---) 안의 `name:` 값 */
function frontName(text) {
  if (!text.startsWith('---')) return null;
  const body = text.slice(3);
  const end = body.indexOf('\n---');
  if (end < 0) return null;
  for (const line of body.slice(0, end).split('\n')) {
    if (!line.startsWith('name:')) continue;
    const v = line.slice(5).trim().replace(/^["']+|["']+$/g, '');
    if (v) return v;
  }
  return null;
}

/** `<dir>/skills/<스킬>/SKILL.md`와 `<dir>/commands/<명령>.md`를 `/{prefix}이름`으로 모은다. 스킬 이름은 앞머리 `name:`, 없으면 폴더 이름. */
function scan(dir, prefix, out) {
  for (const e of entries(join(dir, 'skills'))) {
    let text;
    try {
      text = readFileSync(join(dir, 'skills', e.name, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    out.add(`/${prefix}${frontName(text) ?? e.name}`);
  }
  for (const e of entries(join(dir, 'commands'))) {
    if (extname(e.name) === '.md') out.add(`/${prefix}${e.name.slice(0, -3)}`);
  }
}

/** 설치된 플러그인(`plugins/installed_plugins.json`) · 사용자(`~/.claude`) · 프로젝트(`<project>/.claude`)의 명령 */
export function collect(claudeHome, project) {
  const out = new Set();
  let plugins;
  try {
    plugins = JSON.parse(readFileSync(join(claudeHome, 'plugins/installed_plugins.json'), 'utf8')).plugins;
  } catch {}
  if (plugins && typeof plugins === 'object') {
    for (const [key, list] of Object.entries(plugins)) {
      const path = Array.isArray(list) ? list[0]?.installPath : undefined;
      if (typeof path === 'string') scan(path, `${key.split('@')[0]}:`, out);
    }
  }
  scan(claudeHome, '', out);
  if (project) scan(join(project, '.claude'), '', out);
  return [...out].sort();
}
