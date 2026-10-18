# LOOP — 앱 메뉴 "업데이트 설치…"로 main을 다시 빌드·설치 (task 7)
started: 2026-10-18
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-18T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [x] C1. `bash scripts/check-install-app.sh` → exit 0. 임시 git 레포에서 실제 `scripts/install-app.sh`를 호출해 실패 3종(브랜치≠main / 변경 있음 / `pull --ff-only` 실패)을 각각 재현하고, 매번 비0 종료와 대상 앱 경로 미변경을 단언한다(3종 단언이 모두 있어야 함 — 존재만 확인하는 테스트는 불충분).
- [x] C2. `PATH=~/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH cargo test --manifest-path src-tauri/Cargo.toml` → 녹색 (메뉴 연결 컴파일 + 기존 테스트 회귀 방지), 그리고 `bash scripts/check-fullscreen-restore.sh` → exit 0 (기존 점검 회귀 방지)
- [ ] C3. `cat /Applications/Anvil.app/Contents/Resources/build-commit` == main HEAD SHA (사람이 메뉴로 한 번 실제 업데이트한 뒤 확인)
      evidence: external

## Check progress
- C1: pass · regressed: ×0 · last-evidence: "check-install-app.sh → 3/3 통과 (브랜치≠main·변경 있음·pull 실패 각각 exit 1, 설치 위치 미변경)"
- C2: pass · regressed: ×0 · last-evidence: "cargo test → 7+20 passed · check-fullscreen-restore.sh → 전체화면·최대화 둘 다 통과"
- C3: waiting ×1 · last-evidence: "cat /Applications/Anvil.app/Contents/Resources/build-commit → No such file (아직 메뉴로 설치 안 함)"

## Authorized replan scope
- 실패한 정지 조건에 직접 연결되는 fix-forward 작업만 (scripts/install-app.sh, scripts/check-install-app.sh, src-tauri 메뉴 연결 코드)
- always-halt action classes: prod data mutation/deletion · deploy/release/publish (실행 중 Anvil 종료·/Applications 교체 포함 — 루프는 install-app.sh를 실제 대상으로 실행하지 않는다) · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- app-self-update-from-main
