#!/usr/bin/env bash
# release.sh 를 이 레포의 임시 복제본에서 돌려 본다(원본·원격은 건드리지 않는다).
#   새 버전 → package.json·lock 일치 + 커밋 + 태그 · 같은 버전 → 태그만 · 잘못된 입력/main 아님/태그 중복/노트 없음 → 실패
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0
check() { if eval "$2"; then echo "통과: $1"; else echo "실패: $1"; fail=1; fi; }

clone() {
  git clone -q "$ROOT" "$TMP/$1"
  git -C "$TMP/$1" checkout -q -B main HEAD
  cp "$ROOT/scripts/release.sh" "$TMP/$1/scripts/release.sh" # 커밋 전 작업본도 시험
  mkdir -p "$TMP/$1/docs/releases" && echo "노트" > "$TMP/$1/docs/releases/v9.8.7.md"
  git -C "$TMP/$1" add -A
  git -C "$TMP/$1" -c user.name=t -c user.email=t@t commit -q -m "test: 작업본" --allow-empty
  git -C "$TMP/$1" remote remove origin
  echo "$TMP/$1"
}
CUR="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT/package.json" | head -1)"

R="$(clone bump)"
(cd "$R" && git config user.name t && git config user.email t@t && scripts/release.sh 9.8.7) >"$TMP/bump.log" 2>&1
code=$?
check "새 버전: 종료 0" '[ $code -eq 0 ] || { cat "$TMP/bump.log"; false; }'
for f in package.json package-lock.json; do
  check "새 버전: $f" '[ "$(grep -c "\"version\": \"9.8.7\"" "$R/$f")" -ge 1 ]'
done
check "새 버전: 커밋 + 태그" '[ "$(git -C "$R" log -1 --format=%s)" = "release: v9.8.7" ] && git -C "$R" rev-parse -q --verify refs/tags/v9.8.7 >/dev/null'
check "새 버전: 작업 트리 깨끗" '[ -z "$(git -C "$R" status --porcelain --untracked-files=no)" ]'
check "태그 중복이면 실패" '! (cd "$R" && scripts/release.sh 9.8.7) >/dev/null 2>&1'

R="$(clone same)"
before="$(git -C "$R" rev-parse HEAD)"
(cd "$R" && git config user.name t && git config user.email t@t && scripts/release.sh "$CUR") >"$TMP/same.log" 2>&1
check "같은 버전: 커밋 없이 태그만" '[ "$(git -C "$R" rev-parse HEAD)" = "$before" ] && git -C "$R" rev-parse -q --verify "refs/tags/v$CUR" >/dev/null'

check "릴리스 노트 없으면 실패" '! (cd "$R" && scripts/release.sh 9.7.0) >/dev/null 2>&1 && ! git -C "$R" rev-parse -q --verify refs/tags/v9.7.0 >/dev/null'
check "잘못된 버전 형식이면 실패" '! (cd "$R" && scripts/release.sh 1.2) >/dev/null 2>&1'
git -C "$R" checkout -q -b other
check "main 아니면 실패" '! (cd "$R" && scripts/release.sh 9.9.9) >/dev/null 2>&1'
exit $fail
