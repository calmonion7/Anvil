#!/usr/bin/env bash
# forge-sync.sh 를 임시 레포 + worktree로 재현한다.
#   새 파일은 복사 · 같은 파일은 그대로 · 다른 파일은 덮어쓰지 않고 경고(exit 1) · 메인에서 실행하면 할 일 없음
set -uo pipefail
SCRIPT="$(cd "$(dirname "$0")" && pwd)/forge-sync.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

MAIN="$TMP/main"
git init -q -b main "$MAIN"
git -C "$MAIN" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$MAIN" worktree add -q "$TMP/wt" -b wt
WT="$(cd "$TMP/wt" && pwd)"
mkdir -p "$MAIN/.forge/backlog" "$WT/.forge/backlog" "$WT/.forge/done/x"
echo same > "$MAIN/.forge/backlog/same.md"; echo same > "$WT/.forge/backlog/same.md"
echo main > "$MAIN/.forge/backlog/diff.md"; echo wt > "$WT/.forge/backlog/diff.md"
echo new > "$WT/.forge/backlog/new.md"
echo run > "$WT/.forge/done/x/run.md"

fail=0
check() { if eval "$2"; then echo "통과: $1"; else echo "실패: $1"; fail=1; fi; }

"$SCRIPT" "$WT" >"$TMP/log" 2>&1
code=$?
check "새 파일 복사" '[ "$(cat "$MAIN/.forge/backlog/new.md")" = new ]'
check "하위 폴더째 복사" '[ "$(cat "$MAIN/.forge/done/x/run.md")" = run ]'
check "다른 파일 덮어쓰지 않음" '[ "$(cat "$MAIN/.forge/backlog/diff.md")" = main ]'
check "다르면 경고 + exit 1" '[ "$code" -eq 1 ] && grep -q "경고: 내용 다름.*diff.md" "$TMP/log"'
check "메인에서 실행하면 할 일 없음" '"$SCRIPT" "$MAIN" | grep -q "옮길 것 없음"'
exit $fail
