<!-- forge-slug: fomc-coverage-guard -->
<!-- task: 140 -->
<!-- tdd: off -->
# FOMC 날짜 커버리지 가드 — 소진 임박 시 배치 허브에 경고

## Goal / Non-goals
- Goal: `_FOMC_DATES` 하드코딩(`backend/routers/calendar.py:27-35`, 커버리지 ~2027-12)이 소진되면 FOMC 이벤트가 무음으로 사라지는 실패(CONCERNS §7)를 제거한다. 커버리지가 임박 소진(마지막 날짜가 6개월 미만 남음)이면 **배치 허브(Settings)** 에 '갱신 필요' 경고를 노출해, 유지보수자가 새 날짜를 붙일 시점을 놓치지 않게 한다.
- Non-goals: FOMC 날짜 자동 크롤/배치화(fg-ask에서 "커버리지 가드"를 명시 선택 — 크롤 fragility 회피); 하드코딩 목록 자체를 이번에 연장하는 것; 캘린더 UI 변경.

## Source of truth
- Glossary terms: [[배치 현황]] in .forge/CONTEXT.md
- Related ADRs: none
- Definition of Done: 배치 허브에서 FOMC 커버리지가 6개월 미만이면 '갱신 필요' 경고(카드/배지)가 보이고, 충분하면 안 보인다. 목록이 실제로 소진돼도 크래시 없이(graceful) FOMC만 미표시된다(기존 동작 유지).

## Work slices
- [ ] S1. 백엔드 커버리지 체크 + 배치 현황 표면에 additive 노출 — `_FOMC_DATES`의 최신 날짜와 today를 비교해 "커버리지 소진까지 개월수"를 계산하고, 6개월 미만이면 경고를 배치 허브가 읽는 응답(`GET /api/batches` 또는 인접 배치-현황 엔드포인트)에 **필드 추가(비-additive reshape 금지 — 기존 소비처 보존)**. 완료 기준: 커버리지 < 6개월일 때만 응답에 경고 플래그/메시지가 포함된다(단위 확인). — 주의: 응답 shape을 바꾸면 CLAUDE.md의 배치 응답 소비처 전수 grep 가토 적용; 신규 필드/엔드포인트면 `API_SPEC.md` 동기.
- [ ] S2. 프론트: 배치 허브(Settings)에서 그 경고를 배지/카드로 렌더 — 정상 시 미표시. 완료 기준: 라이브에서 (커버리지 임박 상태를 만들었을 때) 배치 허브에 'FOMC 날짜 갱신 필요'가 보이고, 정상 커버리지에선 안 보인다. (depends: S1)
