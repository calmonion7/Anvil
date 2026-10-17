# LOOP — 엔게디 장면 문구 수리(#362)를 사람 판정까지 무인으로 민다
started: 2026-10-17
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T00:00:00Z
wall: unverifiable-uat (C5)

## Stop-condition checks (ALL must pass)
- [ ] C1. 8시드 생성 — `ls .forge/reports/loop-362/*.png | wc -l` → 16
- [x] C2. `python3 scripts/canon/check_scenes.py` 종료 0
- [x] C3. 회귀 가드 — `python3 judge_scene.py v42` 종료 0
- [ ] C4. 무너짐 ≥ 7/8 — `python3 scripts/canon/count_collapse.py loop-362` 종료 0
- [ ] C5. 사람 판정 열 8칸 채움 — `grep -c '| ✅' notes/REVIEW-362.md` ≥ 8
- [ ] C6. 판정 요약을 run.md에 기록

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: 미실행
- C2: pass · regressed: ×0 · last-evidence: "check_scenes 37/37 종료 0"
- C3: pass · regressed: ×0 · last-evidence: "judge_scene v42 exit 0"
- C4: fail x1 · regressed: x0 · last-evidence: "무너짐 5/8 < 7/8"
- C5: fail ×1 · regressed: ×0 · last-evidence: "grep -c → 0 (사람 판정 대기)"
- C6: 미실행

## Authorized replan scope
- 실패한 검사에 직접 연결되는 fix-forward만

## Tasks
- scene-engedi-text-dark-light
