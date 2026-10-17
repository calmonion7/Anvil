# LOOP — Anvil #4(계획 열·실행 열 두 줄기 배치 · 세션 이름·모델 · 실제 모델·effort 표시)를 DoD와 사람 UAT 통과로 봉인한다
started: 2026-10-18
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T22:31:16Z
wall: unverifiable-uat (C3 — #4 기계 DoD 1~6a 모두 통과(2026-10-18 실측). 사람 판정 UAT (a)~(g) 결과만 대기)

## Stop-condition checks (ALL must pass)
- [ ] C1. `env PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin cargo test --manifest-path src-tauri/Cargo.toml` → exit 0, `test result: ok. N passed` 합계 ≥ 23(기존 22 + 새 테스트 — 테스트를 지워 초록이 되는 허점 차단), 그리고 출력에서 `grep -c 'session_title.* ok'` ≥ 1
- [ ] C2. `npm run check` → `0 ERRORS` 그리고 `npm run tauri build -- --debug` → exit 0 (npm 경로는 fnm 셸마다 달라질 수 있음 — `command -v npm`으로 확인)
- [ ] C3. `role-columns-and-session-names`(task 4)가 forge root의 `done/*-role-columns-and-session-names/`에 봉인돼 있고, `STATUS.md`의 `verified` 첫 낱말이 yes · skipped · n/a 중 하나 (= 계획의 DoD 2·3·4·5a·6·6a 실측과 사람 UAT (a)~(g) 통과. 테스트만 초록이고 화면은 안 맞는 가짜 완료를 막는 검사)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pass · regressed: ×0 · last-evidence: "cargo test → session 3 + forge 20 = 23 passed, exit 0, session_title_follows_cxa_rule_with_anvil_prefix ... ok"
- C2: pass · regressed: ×0 · last-evidence: "npm run check → 0 ERRORS 0 WARNINGS · tauri build --debug → exit 0 (Anvil.app 번들)"
- C3: fail ×1 · regressed: ×0 · last-evidence: "#4 verified: pending — DoD 2·3·4·5a·6(894px에서 30줄)·6a(접음 98 vs 펼침 86/88) 실측 통과, UAT (a)~(g) 사람 판정 대기"

## Authorized replan scope
- 실패한 정지 조건 검사에 직접 연결되는 fix-forward 작업만, Anvil 레포(이 워크트리) 안에서.
- 다른 프로젝트(BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra)는 픽스처용 읽기만 한다. 쓰기 금지.
- `~/.claude/` 설정·훅, `~/cc.sh`·`~/cc-all.sh`, 사용자의 평소 tmux(기본 소켓), `.forge/`를 앱이 쓰는 코드(ADR 261017-211602) 금지.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- role-columns-and-session-names
