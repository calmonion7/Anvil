# RUN — 준비물 확인 중에는 '확인 중…'을 보이고 옛 결과를 숨긴다 (v0.1.7)

- S0 `mock-ipc.ts`에 붙잡아 둘 수 있는 가짜 `deps_status`(`__depsHold`·`__depsResolve[i]`) + `deps.spec.ts`에 (가)(나)(다) 3건 — ✅ 수정 전 새 3건 빨강·기존 37건 통과 확인. ⚠ 가짜에 `model_settings: {}`도 추가(아래)
- S1 `+page.svelte`: `depsSeq` 순번 + `depsChecking` 상태, 띠 문구 자리 '확인 중…', 두 버튼 끔 — ✅ 계획대로
- S2 버전 0.1.7(다섯 곳) + `docs/releases/v0.1.7.md` — ✅ 계획대로

## DoD 기준 → 이후
1. `npm run check`: 0 ERRORS → 0 ERRORS (회귀 방지)
2. `npm run test:e2e`: 37 통과(새 테스트 없음) → 40 통과(새 3건 포함)
3. `check-release.sh`: 통과 → 실패 0 (커밋 9ef1a63 뒤 실행 — HEAD 복제본을 쓰므로)
4. 버전·노트: 0.1.6, 노트 없음 → `0.1.7 0.1.7 0.1.7 0.1.7` · Cargo.toml·Cargo.lock(anvil) `0.1.7` · `docs/releases/v0.1.7.md` 있음

## 어긋난 점
- (다) 순서 보호 검사는 확인 두 개를 겹쳐 띄워야 하는데, 확인 중에는 두 버튼이 꺼진다(결정 2). 그래서 두 번째 확인은 다른 경로인 설정 > 언어 변경(`.then(checkDeps)`)으로 띄웠다. 설정 패널은 `model_settings`가 객체여야 그려지므로 가짜 IPC에 `model_settings: {}`를 더했다(기존 검사 영향 없음).
- 즉석 결정: 확인 중에도 띠 머리글 '✕ 준비물이 빠졌습니다'는 그대로 둔다 — 계획은 문구 자리만 바꾸라고 했고, 마지막으로 알던 상태라 틀린 말은 아니다. `deps_status`가 실패해도 `finally`에서 확인 중 표시를 푼다(옛 결과 유지).
- 의존성이 없는 새 워크트리라 기준선 전에 `npm ci`를 돌렸다(환경, 코드 무관).
- 규모가 작아 워크플로 없이 직접 실행했다.
