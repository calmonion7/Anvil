# RUN — 전체화면으로 종료해도 직전 일반 창 크기·위치로 다시 뜨게 (#7)

- S1 전체화면 중 저장 막기 — ⚠ 방식: 플러그인 저장을 막지 않고, 앱이 마지막 일반 크기·위치를 따로 기억했다가 전체화면으로 끝났을 때 Exit에서 플러그인이 쓴 파일의 크기·위치만 되돌림
- S2 판정 스크립트 — ⚠ 작성·빌드 완료, 화면 잠김으로 GUI 판정 미실행(수정 전 실패 확인도 미실행)

## 계획 대비
- 원인: window-state 플러그인이 Resized/Moved 때마다 캐시를 갱신하는데 전체화면 전환도 Resized로 들어와 화면 크기가 일반 크기로 남는다. FULLSCREEN 플래그 제외만으로는 막을 수 없다.
- 플러그인 on_event가 앱 run 콜백보다 먼저 돈다(tauri-2.12.4 app.rs:2815) → Exit에서 덮어쓰기가 안전.
- 최대화 경로는 건드리지 않음(전체화면이 아닐 때는 아무것도 하지 않는다).
- 스크립트 첫 판에 `set -o pipefail` + `ioreg | grep -q` 조합이 SIGPIPE로 잠금 검사를 무력화하는 버그가 있었다 → 출력을 먼저 받아 비교하도록 수정. 실행 파일명이 소문자 `anvil`이라 `pgrep -x Anvil`도 부정확 → 경로 기준으로 바꿈.
- 릴리스 빌드에서 rust-objcopy가 libLLVM.dylib를 못 찾아 디버그 정보 strip 경고가 난다(빌드는 성공, 기존 환경 문제).

## DoD baseline → after
1. cargo test: 통과(25) → 통과(27, 새 단위 테스트 2개 포함) — 회귀 가드 유지
2. check-fullscreen-restore.sh: 스크립트 없음 → exit 2(화면 잠김, 판정 불가)
3. 사람 UAT: 미실행

## 수리 1회차 (fg-loop in-place repair, replan-round 1/3)
- C2 실패 증거: 재실행 창 `0 33 1512 894`(확대/축소 크기). 저장 파일의 크기·위치는 맞았지만 `maximized: true` — macOS는 전체화면 창을 최대화로 보고해 플러그인이 그대로 저장한다.
- 수리: 전체화면 직전의 최대화 여부도 기억해 함께 되돌린다(`patch_window_state(.., maximized)`). 단위 테스트 입력을 `maximized: true`로 바꿔 이 경우를 고정.
- 스크립트: 한글 조사가 변수명에 붙던 `$normal과` → `${normal}과`.
- S1 — ✅ 수리 후 통과 · S2 — ✅ 첫 판 코드에서 실패(전체화면 케이스), 수리 후 통과

## DoD (수리 후)
1. cargo test: 27 passed
2. check-fullscreen-restore.sh: exit 0 — "통과 전체화면: 100 100 960 700 → 100 100 960 700", "통과 최대화: 0 33 1512 894 → 0 33 1512 894"
3. 사람 UAT (a)·(b): 같은 시나리오를 C2·C3가 자동 판정
