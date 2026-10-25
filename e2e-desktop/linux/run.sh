#!/bin/bash
# 러너(호스트)에서 부른다. 빌드한 앱·tauri-driver·하네스 node를 깨끗한 ubuntu:22.04 컨테이너에 빌려주고,
# 시나리오마다 새 컨테이너에서 돌린다. 러너 자체에는 node 등이 깔려 있어 '깨끗한 PC'가 아니기 때문.
set -u
root="$(cd "$(dirname "$0")/../.." && pwd)"
node_dir="$(dirname "$(dirname "$(command -v node)")")"
driver="$(command -v tauri-driver)"
fail=0

# 시나리오 이름 · 미리 깔 apt 패키지 · spec 목록
scenario() {
  docker run --rm -v "$root:/work" -v "$node_dir:/opt/harness-node:ro" -v "$driver:/opt/tauri-driver:ro" \
    -e SCENARIO="$1" -e PREINSTALL="$2" -e SPECS="$3" ubuntu:22.04 bash /work/e2e-desktop/linux/in-container.sh || fail=1
}

scenario clean "" "specs/smoke.mjs specs/linux.mjs"
scenario old-node nodejs "specs/linux-old-node.mjs"
exit $fail
