#!/usr/bin/env bash
# main 체크아웃을 릴리스 빌드해 /Applications/Anvil.app을 교체하고 다시 띄운다.
#   install-app.sh <repo>
# 사전 점검(main·변경 없음·pull --ff-only)과 빌드가 모두 성공한 뒤에만 앱을 종료·교체한다.
# 실패하면 0이 아닌 코드로 끝나고 설치된 앱은 그대로 남는다.
# ANVIL_APP_DEST 로 설치 위치를, ANVIL_NOTIFY 로 알림 명령을 바꿀 수 있다(점검 스크립트용).
set -euo pipefail

REPO="${1:?사용법: install-app.sh <repo>}"
DEST="${ANVIL_APP_DEST:-/Applications/Anvil.app}"
BUNDLE_ID="com.taebro.anvil"

notify() {
  if [ -n "${ANVIL_NOTIFY:-}" ]; then
    "$ANVIL_NOTIFY" "$1"
  else
    osascript -e "display notification \"$1\" with title \"Anvil 업데이트\"" || true
  fi
}
fail() { echo "실패: $1"; notify "실패: $1"; exit 1; }

echo "== $(date '+%F %T') 업데이트 시작: $REPO"
cd "$REPO" || fail "레포가 없다: $REPO"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = main ] || fail "main 브랜치가 아니다($branch)"
[ -z "$(git status --porcelain)" ] || fail "커밋하지 않은 변경이 있다"
git pull --ff-only origin main || fail "git pull --ff-only origin main 실패"
commit="$(git rev-parse HEAD)"

if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci || fail "npm ci 실패"
fi
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  npm run tauri build -- --bundles app || fail "빌드 실패"

BUILT="$REPO/src-tauri/target/release/bundle/macos/Anvil.app"
[ -d "$BUILT" ] || fail "빌드 결과가 없다: $BUILT"
echo "$commit" > "$BUILT/Contents/Resources/build-commit"

# 여기부터는 빌드가 성공한 경우에만 온다 — 쓰던 앱을 종료하고 교체한다.
osascript -e "tell application id \"$BUNDLE_ID\" to quit" || true
for _ in $(seq 60); do
  pgrep -f "$DEST/Contents/MacOS/" >/dev/null || break
  sleep 0.5
done
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
open "$DEST"
echo "완료: ${commit:0:7}"
notify "설치 완료: ${commit:0:7}"
