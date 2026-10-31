#!/usr/bin/env bash
# 릴리스 준비: 버전(package.json + package-lock.json)을 맞추고 커밋 + v<버전> 태그.
# push는 하지 않는다 — 태그 push가 곧 3-OS 릴리스 빌드(release.yml)라 사람이 한다.
#   사용: scripts/release.sh <버전>      예) scripts/release.sh 0.2.0
#   현재 버전과 같으면 커밋 없이 태그만 단다(첫 릴리스).
#   먼저 릴리스 노트 docs/releases/v<버전>.md 를 커밋해 둬야 한다(없으면 실패).
set -euo pipefail
VER="${1:-}"
fail() { echo "실패: $*" >&2; exit 1; }
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || fail "버전 형식은 X.Y.Z (받은 값: '${VER}')"
cd "$(dirname "$0")/.."
TAG="v$VER"

[ "$(git branch --show-current)" = main ] || fail "main 브랜치에서만 실행"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "커밋하지 않은 변경이 있다"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "태그 $TAG 가 이미 있다"
# 릴리스 본문 = docs/releases/<태그>.md (release.yml 이 읽는다). main 에 커밋돼 있어야 한다.
NOTES="docs/releases/$TAG.md"
[ -s "$NOTES" ] && git ls-files --error-unmatch "$NOTES" >/dev/null 2>&1 || fail "릴리스 노트 $NOTES 를 먼저 써서 커밋하라"

CUR="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -1)"
if [ "$CUR" != "$VER" ]; then
  npm version "$VER" --no-git-tag-version >/dev/null # package.json + package-lock.json
  for f in package.json package-lock.json; do
    grep -q "\"$VER\"" "$f" || fail "$f 버전이 안 바뀌었다"
  done
  git add package.json package-lock.json
  git commit -q -m "release: $TAG"
  echo "버전 $CUR → $VER 커밋"
else
  echo "버전이 이미 $VER — 커밋 없이 태그만"
fi
git tag -a "$TAG" -m "Anvil $TAG"
echo "태그 $TAG 생성. 릴리스하려면:"
echo "  git push origin main $TAG"
