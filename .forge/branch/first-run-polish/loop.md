# LOOP — [다시 확인]이 지난 설치 결과를 지우게 (v0.1.4)
started: 2026-10-24
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-24T00:00:00Z
wall: unverifiable-uat (C6)

## Stop-condition checks (ALL must pass)
- [x] C1. `npm run check` → `0 ERRORS`
- [x] C2. `cd src-tauri && rustup run stable cargo test` → 실패 0 (이 셸엔 cargo 심이 PATH에 없어 rustup run 경유)
- [x] C3. `bash scripts/check-release.sh` → 실패 0
- [x] C4. 버전 0.1.4가 다섯 파일 모두에 있고 `docs/releases/v0.1.4.md` 존재
- [x] C5. `npm run test:e2e` → 전부 통과, 그중 준비물 [다시 확인] 테스트(가짜 [설치] 결과·오류 표시 → [다시 확인] → 항목별 결과·오류 문구 사라짐) 포함
- [ ] C6. 사람 확인(가상머신, 계획 DoD 6) — 화면 판단. C1~C5 통과 후 unverifiable-uat 지점에서 사람에게 넘긴다.

## Check progress
- C1: pass · regressed: ×0 · last-evidence: "npm run check → 189 FILES 0 ERRORS"
- C2: pass · regressed: ×0 · last-evidence: "cargo test → 32+27 통과, 실패 0 (툴체인 bin PATH 경유)"
- C3: pass · regressed: ×0 · last-evidence: "check-release.sh → 6/6 통과 (커밋 후)"
- C4: pass · regressed: ×0 · last-evidence: "5파일 0.1.4 + docs/releases/v0.1.4.md 존재"
- C5: pass · regressed: ×0 · last-evidence: "playwright → 33 passed (deps.spec 2건 포함, 수정 전 빨강 확인)"
- C6: pending · last-evidence: "VM 사람 확인 미실행"

## Authorized replan scope
- 실패한 C1~C5 검사에 직결된 수정만 (기본값)
- always-halt action classes: prod data mutation/deletion · deploy/release/publish (태그 push·릴리스 게시 포함) · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- deps-recheck-clears-results
