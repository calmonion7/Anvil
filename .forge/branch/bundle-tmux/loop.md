# LOOP — macOS tmux·jq 내장 + 첫 설치 문제 5개 해결 (v0.1.2 준비)
started: 2026-10-24
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-24T00:00:00Z
wall: unverifiable-uat (#8 DoD 6 — 가상머신 첫 설치 확인은 사람 몫)

## Stop-condition checks (ALL must pass)
- [x] C1. (PATH 앞에 /Users/calmonion/.rustup/toolchains/stable-aarch64-apple-darwin/bin — ~/.cargo/bin 프록시 부재) `cd src-tauri && cargo test` → 실패 0, 통과 테스트 수 > 54
- [x] C2. `npm run check` → `0 ERRORS`
- [x] C3. `bash scripts/check-release.sh` → 실패 0
- [x] C4. `npx tauri build --bundles app` 후 `.app/Contents/Resources/bin/{tmux,jq}`: `lipo -archs`에 arm64·x86_64 모두, `tmux -V` = `tmux 3.6a`, `jq --version` = `jq-1.8.1`
- [x] C5. 같은 두 바이너리의 `otool -L` 이 `/usr/lib`·`/System` 밖을 참조하지 않음 + 내장 tmux 로 임시 소켓(`-S`) 서버 `new -d` → `kill-server` 성공
- [x] C6. package.json·package-lock.json·tauri.conf.json·Cargo.toml·Cargo.lock(anvil) 버전 0.1.2 + `docs/releases/v0.1.2.md` 존재

## Check progress
- C1: pass ×0 · regressed: ×0 · last-evidence: "cargo test → 28 + 27 = 55 passed, 0 failed"
- C2: pass ×0 · regressed: ×0 · last-evidence: "npm run check → 0 ERRORS 0 WARNINGS"
- C3: pass ×0 · regressed: ×0 · last-evidence: "check-release.sh → 통과 13 (커밋 후)"
- C4: pass ×0 · regressed: ×0 · last-evidence: "번들 bin: lipo x86_64 arm64 ×2, tmux 3.6a, jq-1.8.1"
- C5: pass ×0 · regressed: ×0 · last-evidence: "otool -L 비시스템 참조 0줄, -S 임시 소켓 new -d → kill-server SERVER_OK"
- C6: pass ×0 · regressed: ×0 · last-evidence: "다섯 파일 0.1.2, docs/releases/v0.1.2.md 존재"

## Authorized replan scope
- 위 검사 실패에 직접 연결되는 fix-forward 작업만
- always-halt action classes: prod data mutation/deletion · deploy/release/publish(머지·태그·릴리스 포함) · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure
- 가상머신 UAT(DoD 6)는 사람 확인 — 기계 검사 아님

## Tasks
- bundle-tmux-first-run
