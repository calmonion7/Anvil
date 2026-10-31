// 프로젝트 폴더 고르기. 브라우저는 폴더의 절대 경로를 돌려주지 못하므로 서버가 OS 창을 띄운다.
// macOS만 지원하고, 그 밖의 OS는 {unsupported: true} — 화면이 경로를 직접 입력받는다.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr } from './i18n.js';

const run = promisify(execFile);

export const commands = {
  /** 고른 폴더의 절대 경로(끝 `/` 없음), 취소하면 null */
  pick_folder: async () => {
    if (process.platform !== 'darwin') return { unsupported: true };
    const prompt = tr('프로젝트 폴더 고르기', 'Choose project folder').replaceAll('"', '');
    try {
      const { stdout } = await run('osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`]);
      const path = stdout.replace(/\n$/, '');
      return path.length > 1 ? path.replace(/\/$/, '') : path;
    } catch (e) {
      // 사용자가 취소: "User canceled. (-128)"
      if (String(e.stderr).includes('-128')) return null;
      throw e;
    }
  },
};
