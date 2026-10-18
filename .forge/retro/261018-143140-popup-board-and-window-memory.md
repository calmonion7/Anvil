# 2026-10-18 — Anvil #5 보드를 「지금」 띠+건수 칩으로 줄이고 목록·문서는 팝업으로, 창 크기·위치 기억

## 계획 대비 실제
- 계획대로 된 것: S1~S4(창 상태 기억 · 고정 띠+칩 · 목록 팝업 · 문서 오버레이). 기계 DoD 1~5 통과, UAT (a)~(e) 통과, fg-loop 재계획 0/3라운드.
- 어긋난 것:
  - **범위 확장(사람 결정)**: '하지 않는 것'의 "프런트 테스트 도구 도입"을 루프 도중 철회했다. Playwright로 프런트만 띄우고 `window.__TAURI_INTERNALS__`를 심어 IPC를 모킹하는 방식(`e2e/mock-ipc.ts`·`e2e/board.spec.ts` 7건, `npm run test:e2e`)으로 UAT (b)~(e)를 자동 판정했다.
  - 새 컴포넌트를 만드는 대신 이름을 바꿨다: `RunColumn`→`NowStrip`(전체 폭 띠), `PlanColumn`→`ListPopup`(백로그 목록도 흡수).
  - **화면 확인이 막힌 줄 알았다.** 처음에는 `screencapture`가 검은 화면, 접근성 API 창 수가 0개였다. 권한 문제로 판단해 권한 추가를 안내했지만 iTerm 권한은 이미 있었다. 다시 시도하니 정상이었다 — 화면 잠금/꺼짐 같은 일시 상태로 보인다.
  - **워크트리 백로그 사본이 main에 남는 실수를 #4에 이어 또 했다.** 회고에 적혀 있었는데도 시작할 때 원본을 지우지(이동하지) 않았다.
  - 비로그인 셸에서 `cargo`가 PATH에 없어 `tauri build`에 `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin`을 앞에 붙였다.

## 배운 점
- 다음엔 다르게:
  - **화면 UAT는 먼저 IPC 모킹 e2e로 뺄 수 있는지 본다.** 목록·팝업·Esc·버튼이 채우는 명령은 브라우저에서 모킹으로 판정된다. 실제 창이 필요한 것(창 크기·위치·전체화면)만 사람 판정이나 osascript로 남긴다.
  - **screencapture가 검거나 AX 창이 0개면 권한 탓으로 단정하기 전에 다시 찍어 본다.** `ioreg`의 `IOConsoleLocked`로 잠금 여부도 확인한다.
  - **워크트리에서 forge 작업을 시작할 때는 main의 `.forge/backlog/<slug>.md`를 브랜치 root로 복사하지 말고 이동한다.** 두 번 반복된 실수다.
  - Playwright 버튼 이름에는 부가 텍스트(우선순위·브랜치명)까지 들어간다 — 앞 일치나 `exact`로 찾는다.
- 후속후보: window-state 플러그인이 전체화면에서 종료한 창을 '최대화'로 저장해, 재실행하면 화면 크기 일반 창으로 뜬다. 전체화면 종료 시 이전 일반 크기로 되돌릴지 결정 필요.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음
- eval: `e2e/board.spec.ts`(UAT b~e 회귀 검사, 실행 중 추가)
