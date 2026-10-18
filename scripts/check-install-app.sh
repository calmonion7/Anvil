#!/usr/bin/env bash
# install-app.sh 의 사전 점검 실패 3종을 임시 레포로 재현한다.
#   브랜치≠main / 커밋하지 않은 변경 / pull --ff-only 실패
# 각각 0이 아닌 코드로 끝나고 설치 위치(임시 Anvil.app)가 바뀌지 않아야 통과.
# 실제 /Applications 와 실행 중인 앱은 건드리지 않는다.
set -uo pipefail
SCRIPT="$(cd "$(dirname "$0")" && pwd)/install-app.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

DEST="$TMP/Anvil.app"
mkdir -p "$DEST/Contents"
echo original > "$DEST/Contents/marker"
export ANVIL_APP_DEST="$DEST" ANVIL_NOTIFY=true

new_repo() {
  local r="$TMP/$1"
  git init -q -b main "$r"
  git -C "$r" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  echo "$r"
}

pass=0
expect_fail() {
  local name="$1" repo="$2"
  "$SCRIPT" "$repo" >"$TMP/$name.log" 2>&1
  local code=$?
  if [ "$code" -ne 0 ] && [ "$(cat "$DEST/Contents/marker")" = original ] \
    && [ "$(ls "$DEST/Contents")" = marker ]; then
    echo "통과: $name (exit $code — $(grep '^실패' "$TMP/$name.log"))"
    pass=$((pass + 1))
  else
    echo "실패: $name (exit $code, 설치 위치가 바뀌었거나 성공으로 끝남)"; cat "$TMP/$name.log"
  fi
}

r="$(new_repo branch)"; git -C "$r" checkout -q -b feature
expect_fail "브랜치≠main" "$r"

r="$(new_repo dirty)"; echo x > "$r/file"
expect_fail "변경 있음" "$r"

r="$(new_repo nopull)"   # upstream 이 없어 pull 이 실패한다
expect_fail "pull 실패" "$r"

[ "$pass" -eq 3 ] && echo "3/3 통과" && exit 0
echo "$pass/3 통과"; exit 1
