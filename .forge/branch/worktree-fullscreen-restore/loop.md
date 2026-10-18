# LOOP — 전체화면으로 종료해도 직전 일반 창 크기·위치로 복원 (#7)
started: 2026-10-18
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-18T06:11:58Z
wall: blocked-health (화면 잠김 — IOConsoleLocked=Yes, C2·C3 GUI 판정 불가)

## Stop-condition checks (ALL must pass)
- [x] C1. `cargo test --manifest-path src-tauri/Cargo.toml` 통과 (회귀 가드)
- [ ] C2. `bash scripts/check-fullscreen-restore.sh` 의 전체화면 케이스 통과: 900×700 @ (100,100) → 전체화면 → 종료 → 재실행 → 크기·위치 일치(±몇 px)
- [ ] C3. 같은 스크립트의 최대화 케이스 통과: 최대화 → 종료 → 재실행 → 최대화로 뜸. 스크립트 전체 exit 0

## Check progress
- C1: pass · regressed: ×0 · last-evidence: "cargo test → 7 + 20 passed, 0 failed (patch_window_state 테스트 2개 포함)"
- C2: blocked-health · last-evidence: "SKIP_BUILD=1 bash scripts/check-fullscreen-restore.sh → '잠김: 화면이 잠겨 있어…' exit 2"
- C3: blocked-health · last-evidence: "같은 실행 — 잠금 검사에서 중단, 최대화 케이스 미도달"

## Authorized replan scope
- 실패한 검사에서 직접 이어지는 fix-forward 작업만 (기본값)
- always-halt action classes: prod data mutation/deletion · deploy/release/publish · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure
- 화면 잠금·접근성 권한 부재로 GUI 검사를 못 돌리면 blocked-health (코드 문제로 취급하지 않음)

## Tasks
- fullscreen-window-restore
