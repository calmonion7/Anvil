# 2026-10-18 — 전체화면으로 종료해도 직전 일반 창 크기·위치로 다시 뜨게 (#7, 일괄 승급)

## 계획 대비 실제
- 계획대로 된 것: S1(마지막 일반 크기·위치를 따로 기억해 Exit에서 되돌림)·S2(판정 스크립트). fg-loop 재계획 1/3라운드로 끝났고, cargo test 27개와 `check-fullscreen-restore.sh` exit 0을 확인했다.
- 어긋난 것:
  - **방식 전환**: 계획은 "전체화면 중 저장 막기"였다. 그런데 window-state 플러그인은 전체화면 전환도 Resized로 받아 캐시를 갱신하므로, FULLSCREEN 플래그를 빼는 것만으로는 막을 수 없었다. 그래서 Exit 때 플러그인이 쓴 파일의 크기·위치를 덮어쓰는 방식으로 바꿨다. 플러그인 on_event가 앱 run 콜백보다 먼저 돌아서 덮어쓰기가 안전하다(tauri-2.12.4 app.rs:2815).
  - **수리 1회차**: macOS는 전체화면 창을 `maximized: true`로 보고한다. 크기·위치를 되돌린 뒤에도 최대화 플래그 때문에 확대/축소 크기로 떴다. 전체화면 직전의 최대화 여부도 기억해 함께 되돌리도록 고쳤다.
  - 점검 스크립트 첫 판의 `set -o pipefail` + `ioreg | grep -q` 조합에서 SIGPIPE가 나 화면 잠김 검사가 무력화됐다. 실행 파일명이 소문자 `anvil`이라 `pgrep -x Anvil`도 맞지 않았다.
  - 백그라운드 세션에서는 GUI 판정이 exit 3(창이 뜨지 않음)으로 막혔다. 사용자 셸에서 실행하니 통과했다.

## 배운 점
- 다음엔 다르게:
  - **macOS 창 상태 저장은 "전체화면 = 최대화"로 보고된다는 것을 전제로 짠다.** 크기·위치만 되돌리면 안 되고 maximized 플래그까지 같이 다룬다.
  - **bash 점검에서 `pipefail` 아래 `| grep -q`를 쓰지 않는다.** 출력을 변수로 받은 뒤 비교한다. 프로세스 확인은 실행 파일 경로(`pgrep -f 'Anvil.app/Contents/MacOS/'`)로 한다.
  - **GUI 판정 스크립트(osascript·System Events)는 백그라운드 에이전트 세션에서 창을 못 띄울 수 있다.** exit 3이 나면 코드 실패로 보지 말고 사용자 셸에서 `!`로 돌린다.
  - `rust-objcopy … libLLVM.dylib` strip 경고는 rustc 1.99.1 패키지의 rpath(`@loader_path/../lib`) 문제였다. 툴체인 `rustlib/aarch64-apple-darwin/lib/libLLVM.dylib` → `../../../libLLVM.dylib` 링크로 해결했다. `rustup update` 뒤 다시 나면 같은 링크를 만든다.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음
- eval: 없음(전체화면·최대화 경로는 실행 중 단위 테스트 2개와 `check-fullscreen-restore.sh`로 이미 고정)
