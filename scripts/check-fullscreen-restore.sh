#!/usr/bin/env bash
# 전체화면·최대화로 종료한 뒤 재실행했을 때 창 상태 복원을 자동 판정한다.
#   1) 900×700 @ (100,100) → 전체화면 → 종료 → 재실행 → 같은 크기·위치면 통과
#   2) 최대화 → 종료 → 재실행 → 최대화 크기로 뜨면 통과
# exit 0 통과 · 1 판정 실패 · 2 화면 잠김 · 3 실행 불가(Anvil 실행 중·접근성 권한 등)
# SKIP_BUILD=1 이면 빌드를 건너뛰고 기존 번들을 쓴다.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="src-tauri/target/release/bundle/macos/Anvil.app"
TOL=4

# grep -q 는 ioreg 를 SIGPIPE 로 끊어 pipefail 에서 거짓이 된다 — 출력을 먼저 받는다.
if [[ "$(ioreg -n Root -d1)" == *'"IOConsoleLocked" = Yes'* ]]; then
  echo "잠김: 화면이 잠겨 있어 창을 조작할 수 없다(권한 문제로 단정하지 말 것)"; exit 2
fi
running() { pgrep -f 'Anvil.app/Contents/MacOS/' >/dev/null; }
if running; then
  echo "실행 불가: Anvil이 이미 실행 중이다 — 종료한 뒤 다시 돌린다(창 상태 파일을 같이 쓴다)"; exit 3
fi

if [ "${SKIP_BUILD:-}" != 1 ]; then
  PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
    npm run tauri build -- --bundles app >/dev/null
fi

ax() { osascript -e "tell application \"System Events\" to tell process \"Anvil\" to $1"; }

launch() {
  open -n "$APP"
  for _ in $(seq 60); do
    if [ "$(ax 'count windows' 2>/dev/null || echo 0)" -gt 0 ]; then sleep 2; return; fi
    sleep 0.5
  done
  echo "실행 불가: 창이 뜨지 않았다"; exit 3
}

quit() {
  osascript -e 'tell application "Anvil" to quit'
  for _ in $(seq 40); do running || return 0; sleep 0.5; done
  echo "실행 불가: Anvil이 종료되지 않았다"; exit 3
}

# "x y w h"
geom() {
  ax 'set {p, s} to {position, size} of window 1
      return ((item 1 of p) as text) & " " & (item 2 of p) & " " & (item 1 of s) & " " & (item 2 of s)'
}

near() { # 기대값 실제값
  read -r ex ey ew eh <<<"$1"; read -r ax_ ay aw ah <<<"$2"
  for d in $((ex - ax_)) $((ey - ay)) $((ew - aw)) $((eh - ah)); do
    [ "${d#-}" -le "$TOL" ] || return 1
  done
}

zoom() { # Window 메뉴의 확대/축소(Zoom) — 녹색 버튼은 전체화면이라 메뉴를 쓴다
  ax 'click (first menu item of menu 1 of (first menu bar item of menu bar 1 whose name is "Window" or name is "윈도우") whose name is "Zoom" or name is "확대/축소")'
}

launch
if ! ax 'set position of window 1 to {100, 100}' >/dev/null 2>&1; then
  quit; echo "실행 불가: System Events 접근성 권한이 없다"; exit 3
fi
ax 'set size of window 1 to {900, 700}' >/dev/null
sleep 1
normal=$(geom)
ax 'set value of attribute "AXFullScreen" of window 1 to true' >/dev/null
sleep 3
quit
launch
after=$(geom)
fail=0
if near "$normal" "$after"; then
  echo "통과 전체화면: $normal → $after"
else
  echo "실패 전체화면: 기대 $normal, 실제 $after"; fail=1
fi

ax 'set value of attribute "AXFullScreen" of window 1 to false' >/dev/null 2>&1 || true
sleep 2
zoom
sleep 2
zoomed=$(geom)
quit
launch
after=$(geom)
if near "$zoomed" "$after" && ! near "$normal" "$zoomed"; then
  echo "통과 최대화: $zoomed → $after"
else
  echo "실패 최대화: 기대 $zoomed(일반 $normal과 달라야 함), 실제 $after"; fail=1
fi
quit
exit $fail
