#!/usr/bin/env bash
# 작업 폴더(git worktree)의 .forge 기록을 원래 저장소(메인 체크아웃)로 옮긴다.
# main에서 .forge/*는 git이 추적하지 않아, worktree에서 fg-merge로 통합한 기록은 그 폴더에만 남는다.
# 덮어쓰지 않는다 — 같은 이름이 이미 있으면 건너뛰고, 내용이 다르면 경고한다.
#   사용: scripts/forge-sync.sh [worktree 경로]   (기본: 현재 폴더)
set -uo pipefail
SRC="$(cd "${1:-.}" && git rev-parse --show-toplevel)" || exit 1
DEST="$(cd "$SRC" && cd "$(git rev-parse --git-common-dir)/.." && pwd)" || exit 1
if [ "$SRC" = "$DEST" ]; then
  echo "원래 저장소에서 실행했다 — 옮길 것 없음"
  exit 0
fi

copied=0 skipped=0 differ=0
for d in backlog done adr retro dropped; do
  [ -d "$SRC/.forge/$d" ] || continue
  while IFS= read -r f; do
    rel="${f#"$SRC"/}"
    if [ ! -e "$DEST/$rel" ]; then
      mkdir -p "$(dirname "$DEST/$rel")"
      cp "$f" "$DEST/$rel"
      echo "복사: $rel"
      copied=$((copied + 1))
    elif cmp -s "$f" "$DEST/$rel"; then
      skipped=$((skipped + 1))
    else
      echo "경고: 내용 다름, 건너뜀 — $rel"
      differ=$((differ + 1))
    fi
  done < <(find "$SRC/.forge/$d" -type f)
done
if [ -f "$SRC/.forge/CONTEXT.md" ] && ! cmp -s "$SRC/.forge/CONTEXT.md" "$DEST/.forge/CONTEXT.md"; then
  echo "경고: CONTEXT.md 내용 다름 — 직접 합칠 것"
  differ=$((differ + 1))
fi
echo "복사 $copied · 같음 $skipped · 다름 $differ ($SRC → $DEST)"
[ "$differ" -eq 0 ]
