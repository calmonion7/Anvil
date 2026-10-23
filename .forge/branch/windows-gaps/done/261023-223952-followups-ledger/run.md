# RUN — 후속후보를 forge 원장(`followups.md`) 기반으로 (#7)

fg-loop 무인 실행. 범위가 작아 워크플로 없이 직접 실행했고, TDD로 원장 테스트를 먼저 썼다.

## 조각별 결과
- S1 원장 파서(TDD) — ✅ 계획대로. `parse_followups` + 테스트 8개(정상 open · taken/dismissed · 여러 줄 본문 · 첫 마커 앞 제목 무시 · 깨진 마커→errors · 파일 없음 0건 · 스냅샷 정렬+오류 경로 · 브랜치 루트만)
- S2 예전 수집·앱 숨김 제거 — ✅ 계획대로. `followups_in`·`push_followups`·숨김 명령 두 개 삭제, 이로 인해 안 쓰이게 된 retro 목록 맵도 삭제
- S3 화면 — ⚠ 계획 외 수정 하나: e2e가 브라우저 언어(영어)로 떠 전부 실패 → `playwright.config.ts`에 `locale: "ko-KR"` 고정(앞 커밋 52f0c90 언어 자동 선택에서 생긴 기존 문제)
- S4 ADR 한 줄 — ✅ 계획대로

## 완료 기준 baseline → after
- `cargo test --test forge`: 원장 테스트 0 → 8, 26 passed
- grep 숨김/예전 수집: 7건 → 0건
- `cargo test` 전체: → 통과
- `npm run check`: → 오류 0
- e2e: (기준 시점 22 실패 — 언어 문제) → 31 passed
