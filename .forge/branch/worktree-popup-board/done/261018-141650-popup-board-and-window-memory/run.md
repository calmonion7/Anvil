# RUN — 보드 띠+팝업·창 기억 (#5)

워크플로 없이 직접 실행(규모 작음). fg-loop 무인 드라이브.

## 슬라이스 결과
- S1 창 상태 기억 — ✅ as planned (`tauri-plugin-window-state` 2, FULLSCREEN 제외 플래그, `window-state:default` 권한)
- S2 위쪽 고정 띠 + 건수 칩 — ⚠ `RunColumn`→`NowStrip`(전체 폭 띠)로 개명, 칩 3개는 띠 아래 줄. `PlanColumn`은 팝업으로 흡수
- S3 목록 팝업 — ⚠ 새 파일 대신 `PlanColumn`→`ListPopup`(백로그 목록도 흡수). 팝업은 터미널 영역 위에 겹침(띠는 가리지 않음)
- S5 화면 검사(사용자 결정으로 추가) — ✅ Playwright + `__TAURI_INTERNALS__` 모킹, `e2e/board.spec.ts` 7건(UAT b~e), `npm run test:e2e`
- S4 문서 오버레이 — ✅ 터미널 영역을 덮는 오버레이, Esc는 맨 위 하나만 닫음(문서→목록). 탭 줄은 그대로 두고 '보드' 탭 = 오버레이 닫기

## DoD baseline → after
1. C1 fail → pass
2. C2 fail → pass
3. C3 fail → pass
4. npm run check 0 ERRORS → 0 ERRORS 0 WARNINGS (회귀 방지, 유지)
6. test:e2e (없음) → 7 passed
5. tauri build --debug (미실행) → exit 0 (cargo가 PATH에 없어 rustup 툴체인 경로를 앞에 붙여 실행)

## 메모
- 기존 `anvil.layout`의 `listRatio` 키는 읽지 않고 무시(남아 있어도 무해)
- UAT (b)~(e)는 e2e로 자동 판정 통과. (a)는 실제 창이 필요해 사람 판정 대기 → verified: pending
- 백그라운드 세션은 화면 기록 권한이 없어 screencapture가 검은 화면, 접근성 API 창 0개
