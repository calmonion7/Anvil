<!-- forge-slug: fomc-coverage-guard -->
<!-- task: 140 -->
# 실행 노트 — FOMC 날짜 커버리지 가드

## 계획대로 된 것
- **S1 백엔드**: `calendar.fomc_coverage_status()`가 `_FOMC_DATES` 마지막 날짜와 today로 소진까지 개월수 + `needs_update`(<6개월) 계산. 신규 엔드포인트 `GET /api/batches/fomc-coverage`로 노출. API_SPEC 동기(doc-sync 테스트 통과).
- **S2 프론트**: `Settings.jsx` BatchHub가 fomc-coverage를 fetch, `needs_update`일 때만 '갱신 필요' 경고 배너(정의된 `--color-error` 토큰) 표시. 실패는 조용히 무시(배치 현황 렌더 불방해).

## 실제와의 차이(divergence)
1. **`GET /api/batches`(배열)에 필드 추가 = reshape → 금지**: 계획 S1이 "`GET /api/batches` 또는 인접 엔드포인트"를 허용했는데, batches 응답이 **배열**이라 최상위 경고 필드를 못 넣는다(배열→객체 reshape는 CLAUDE.md 소비처 파손 가토). → 계획이 허용한 **인접 신규 엔드포인트** `GET /api/batches/fomc-coverage`로 노출(fully additive, 기존 소비처 무영향). FOMC는 배치가 아니라 하드코딩 목록이라 배열에 attach할 자연스러운 엔트리도 없음.
2. **커버리지 헬퍼 위치**: `_FOMC_DATES` 옆(calendar.py)에 헬퍼를 두고 batches.py 엔드포인트가 inline import로 호출(순환참조 회피). 데이터 정본과 co-locate.
3. **"경고 표시" 브랜치 라이브 트리거 불가**: 실제 커버리지가 2027-12(17.2개월 남음)이라 needs_update=true를 라이브로 만들 수 없다(하드코딩 목록 연장은 Non-goal). → 백엔드 유닛 테스트 3종으로 결정적 커버(near→warn / far→ok / exhausted→graceful, 실행 날짜 무관 patch). 라이브는 정상(hidden) 케이스만 확인.
4. **색 토큰**: `warning`/`--warning-tint`는 CLAUDE.md 가토상 미정의(깨짐)라 경고 배너에 정의된 `--color-error`(빨강, 유지보수 알림에 적절) 사용.

## 검증(UAT) — 라이브 배포 후
- 배포: push 4217451 → GH Actions 러너 성공 → 백엔드 재기동.
- 라이브 `GET /api/batches/fomc-coverage` 200: `{last_date: "2027-12-08", months_left: 17.2, needs_update: false, threshold_months: 6}`.
- 배치 허브(Settings): 'FOMC 날짜 갱신 필요' 배너 count=0 (17.2mo > 6mo → 정상 hidden). 스크린샷 uat140_settings.png.
- 유닛: test_fomc_coverage_{needs_update_when_near_exhaustion, ok_when_far, graceful_when_exhausted, endpoint_shape} + doc-sync 통과(46 passed).

## 후속 메모
- Non-goals 미접촉: FOMC 자동 크롤/배치화, 목록 연장, 캘린더 UI.
- 소진 실제 임박 시(2027 상반기) 배치 허브에 경고가 뜨면 `_FOMC_DATES`에 federalreserve.gov 신규 일정 추가하면 됨(경고 문구가 위치를 안내).
