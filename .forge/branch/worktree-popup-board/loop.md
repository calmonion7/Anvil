# LOOP — #5 보드 띠+팝업·창 기억 완성
started: 2026-10-18
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-18T00:00:00Z
wall: unverifiable-uat (C6)

## Stop-condition checks (ALL must pass)
- [x] C1. `grep -q tauri-plugin-window-state src-tauri/Cargo.toml && grep -q tauri_plugin_window_state src-tauri/src/lib.rs` exit 0
- [x] C2. `! grep -qE 'hsplit|listRatio' src/routes/+page.svelte` exit 0
- [x] C3. `grep -lq 'role="dialog"' src/lib/*.svelte src/routes/+page.svelte` exit 0
- [x] C4. `npm run check` → 0 ERRORS (회귀 방지)
- [x] C5. `npm run tauri build -- --debug` exit 0 (회귀 방지)
- [ ] C6. 작업 #5 봉인(done/에 존재) — UAT (a)~(e) 사람 판정 포함

## Check progress
- C1: pass · regressed: ×0 · last-evidence: "grep 둘 다 exit 0"
- C2: pass · regressed: ×0 · last-evidence: "hsplit|listRatio 0건"
- C3: pass · regressed: ×0 · last-evidence: "ListPopup.svelte·+page.svelte에 role=dialog"
- C4: pass · regressed: ×0 · last-evidence: "184 FILES 0 ERRORS 0 WARNINGS"
- C5: pass · regressed: ×0 · last-evidence: "tauri build --debug EXIT=0"
- C6: fail ×1 · regressed: ×0 · last-evidence: "STATUS verified: pending — UAT (a)~(e) 사람 판정 대기"

## Authorized replan scope
- 실패한 검사에 직접 이어지는 fix-forward 작업만
- always-halt action classes: prod data mutation/deletion · deploy/release/publish · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure
- UAT는 사람이 판정(멈추면 사용자가 판정) — 무인 봉인 금지

## Tasks
- popup-board-and-window-memory
