#!/usr/bin/env bash
# 릴리스 준비: 버전 세 곳(package.json · tauri.conf.json · Cargo.toml/lock)을 맞추고 커밋 + v<버전> 태그.
# push는 하지 않는다 — 태그 push가 곧 3-OS 릴리스 빌드(release.yml)라 사람이 한다.
#   사용: scripts/release.sh <버전>      예) scripts/release.sh 0.2.0
#   현재 버전과 같으면 커밋 없이 태그만 단다(첫 릴리스).
set -euo pipefail
VER="${1:-}"
fail() { echo "실패: $*" >&2; exit 1; }
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || fail "버전 형식은 X.Y.Z (받은 값: '${VER}')"
cd "$(dirname "$0")/.."
TAG="v$VER"

[ "$(git branch --show-current)" = main ] || fail "main 브랜치에서만 실행"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "커밋하지 않은 변경이 있다"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "태그 $TAG 가 이미 있다"

CUR="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -1)"
if [ "$CUR" != "$VER" ]; then
  npm version "$VER" --no-git-tag-version >/dev/null # package.json + package-lock.json
  sed -i '' "s/^  \"version\": \"$CUR\",$/  \"version\": \"$VER\",/" src-tauri/tauri.conf.json
  sed -i '' "s/^version = \"$CUR\"$/version = \"$VER\"/" src-tauri/Cargo.toml
  # Cargo.lock 의 anvil 항목만 새 버전으로(네트워크 없이). cargo가 PATH에 없어도 rustup으로 부른다.
  command -v cargo >/dev/null || PATH="$(dirname "$(rustup which cargo)"):$PATH"
  (cd src-tauri && cargo update -p anvil --offline -q)
  for f in package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock; do
    grep -q "\"$VER\"" "$f" || fail "$f 버전이 안 바뀌었다"
  done
  git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -q -m "release: $TAG"
  echo "버전 $CUR → $VER 커밋"
else
  echo "버전이 이미 $VER — 커밋 없이 태그만"
fi
git tag -a "$TAG" -m "Anvil $TAG"
echo "태그 $TAG 생성. 릴리스하려면:"
echo "  git push origin main $TAG"
