# RUN — 어두운 고정 테마 + forge 정보 흐름도 + 실시간 흐름 애니메이션

- S1 app.css를 어두운 토큰으로 고정(color-scheme: dark) — ✅ 계획대로
- S2 FlowBoard.svelte 추가, NowStrip 건수 칩을 흐름도 노드로 이전 — ⚠ NowStrip 전체가 아니라 칩 줄만 대체(「지금」 띠·루프 줄은 유지 — 기존 기능·테스트 보존)
- S3 e2e/flow.spec.ts 7건 + mock-ipc에 이벤트 주입(__emit) — ✅ 계획대로, board.spec 보정 불필요(노드 버튼 이름을 칩과 같게 유지)

## 계획과 다른 점
- 규모가 작아 워크플로 없이 직접 실행.
- 새 색 토큰 없이 기존 토큰만 사용(계획 세션=warn, 실행=accent, 완료=good).
- 고정폭 글꼴에서 한글 자간이 벌어져 Apple SD Gothic Neo를 대체 글꼴로 추가.
- 귀환 화살표(후속후보→계획)는 선 대신 "↺ 계획" 표시로 단순화.

## DoD 기준선 → 이후
- C1 svelte-check 오류: 0 → 0 (회귀 가드, 원래 통과)
- C2 build: 성공 → 성공 (회귀 가드)
- C3 board.spec: 7 통과 → 7 통과 (회귀 가드)
- C4 flow.spec: 파일 없음(실패) → 7 통과

## 후속후보
- 실제 앱(tauri)에서 애니메이션 체감 확인 — 사람 판정.
- 로그 띠 펼쳐 보기(현재 최근 3줄만).
