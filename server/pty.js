// node-pty를 쓰는 곳은 이 모듈로 불러온다. node-pty 1.1.0의 macOS·Linux prebuild는 spawn-helper가
// 실행 권한 없이 풀려(npm 설치 실측) spawn이 `posix_spawnp failed`로 실패하므로 처음 부를 때 권한을 준다.
import { chmodSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pty from 'node-pty';

if (process.platform !== 'win32') {
  const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
  for (const dir of ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`]) {
    const helper = join(root, dir, 'spawn-helper');
    if (existsSync(helper) && !(statSync(helper).mode & 0o111)) chmodSync(helper, 0o755);
  }
}

export default pty;
