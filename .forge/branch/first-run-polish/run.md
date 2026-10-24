# RUN — [다시 확인]이 지난 설치 결과를 지우게 (v0.1.4)

- S0 `e2e/deps.spec.ts` 2건(항목별 결과·오류 문구) + `mock-ipc.ts`에 선택적 `deps_status`/`deps_install` 가짜 응답 — ✅ 수정 전 빨강(19·35행) 확인
- S1 `recheckDeps()` 추가, [다시 확인]만 연결 — ✅ 계획대로
- S2 버전 0.1.4(package.json·package-lock.json·Cargo.toml·Cargo.lock·tauri.conf.json) + `docs/releases/v0.1.4.md` — ✅ 계획대로

## DoD 기준 → 이후
1. `npm run check`: 0 ERRORS → 0 ERRORS (회귀 방지)
2. `cargo test`: 59 통과 → 59 통과 (회귀 방지)
3. `check-release.sh`: 통과 → 통과 (커밋 후 재실행 기준 — 미커밋 상태에선 복제본이 HEAD를 써서 「같은 버전」이 실패함)
4. 버전·노트: 0.1.3 → 0.1.4 + 노트
5. `npm run test:e2e`: 새 테스트 없음 → 33 통과(새 2건 포함)
6. VM 사람 확인: 미실행

## 어긋난 점
- 이 셸엔 cargo 심이 PATH에 없고 `rustup run`도 rustc를 못 찾아, 툴체인 bin을 PATH에 넣어 실행했다(환경 문제, 코드 무관).
- 계획에 없던 S0(e2e)을 fg-loop 문의에서 추가했다 — 「npm run check」만으론 버튼 동작을 보장하지 못해서.
