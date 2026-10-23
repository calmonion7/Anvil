<!-- forge-slug: followups-ledger -->
<!-- task: 7 -->
<!-- tdd: on -->

# 후속후보를 forge 원장(`followups.md`) 기반으로

## 목표
forge 0.9.6의 후속후보 원장을 Anvil의 유일한 후속후보 출처로 삼는다. 상태(open/taken/dismissed)를 원장 그대로 보여 주고, 착수·기각은 세션 입력창에 문장을 채우는 방식으로만 한다(Anvil은 `.forge/`에 쓰지 않음 — ADR 261017-211602).

## 정본
- 원장 형식: forge `skills/fg-learn/FOLLOWUPS-FORMAT.md` (마커 `<!-- followup: fu-<12hex> | source: S | task: N|- | date: YYYY-MM-DD | status: open|taken|dismissed | taken: N|- -->`, 본문은 다음 마커나 EOF까지, 첫 마커 앞 제목은 무시)
- 위치: 해석된 forge 루트의 `followups.md`, 브랜치별로 읽음 — 오버레이 없음
- ADR 261017-211602: 후속후보는 원장 파일로 옮겼고 `--json`은 아직 쓰지 않는다는 한 줄을 덧붙인다

## 결정
1. Rust에서 `followups.md`를 직접 파싱한다(`forge-status --json` 호출 안 함).
2. 예전 제목 기반 수집(`followups_in`, done/retro 스캔)은 지운다. 원장이 없으면 0건이다.
3. 앱 숨김(`hidden-followups.json`, `hidden_followups`/`set_followup_hidden`)은 지운다. 그 자리에 「기각」 버튼을 두고, 계획 세션 입력창에 `/forge:fg-ask 후속후보 <id> 기각 — 사유: `를 채운다.
4. 표시: 개수는 open만 센다. 목록 위쪽에 open을 날짜 최신순으로 놓고 「착수」·「기각」 버튼을 단다. 접힌 「처리됨 N건」에는 taken(→ task #N, 문서가 있으면 연다)과 dismissed(본문)를 넣는다. 제목은 본문 첫 줄을 쓰고 나머지는 펼쳐서 본다. 「착수」는 `/forge:fg-ask 후속후보 <id> 착수: <첫 줄>`를 채운다.
5. 마커가 깨진 줄은 `errors`로 보낸다.

## 조각
1. **원장 파서(TDD)** — `Followup { id, source, task, date, status, taken, text(첫 줄), body }`. 테스트: 정상 open 1건, taken/dismissed, 여러 줄 본문, 첫 마커 앞 제목 무시, 깨진 마커 → errors, 파일 없음 → 0건, 브랜치 루트 읽기(기본 원장을 겹쳐 읽지 않음). 완료: `cargo test --test forge` 통과.
2. **예전 수집·앱 숨김 제거** — `followups_in`과 관련 테스트, `push_followups`, lib.rs의 숨김 명령 두 개를 지운다. 완료: grep 결과 0건.
3. **화면** — types.ts, ListPopup(open과 처리됨 구역, 착수·기각), +page(개수 = open, hiddenSet 제거), FlowBoard 개수, e2e mock·spec 갱신. 완료: `npm run check`와 e2e 통과.
4. **ADR 한 줄 덧붙이기.**

## 완료 기준
- `cd src-tauri && cargo test --test forge` — 앞으로 확인할 항목(원장 테스트가 아직 없음. 이 셸에는 cargo가 없어 사전 실행은 못 함)
- `grep -rn "hidden_followups\|followups_in\|hidden-followups" src src-tauri/src` → 0건 — 앞으로 확인할 항목(현재 걸리는 줄 있음)
- `npm run check` · `npx playwright test e2e/board.spec.ts e2e/flow.spec.ts` 통과 — 회귀 방지

## 이번에 하지 않는 것
- `forge-status --json`으로 백로그·완료 등 다른 화면을 옮기는 일
- 예전 제목 기반 후보를 원장으로 옮기는 일
- Anvil이 원장에 직접 쓰는 일
