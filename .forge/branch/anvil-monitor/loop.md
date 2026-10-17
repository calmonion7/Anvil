# LOOP — Anvil #1~#3(보드 모니터 · tmux 세션 · 버튼)을 구현해 세 작업 모두 UAT 통과로 봉인한다
started: 2026-10-17
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T12:20:51Z
wall: unverifiable-uat (C3 — #1 anvil-monitor-1of3의 UAT (a)~(f) 화면 판정 대기. DoD 1·2와 (g) 메모리는 통과)

## Stop-condition checks (ALL must pass)
- [ ] C1. `PATH=/opt/homebrew/opt/rustup/bin:$PATH cargo test --manifest-path src-tauri/Cargo.toml` → exit 0 이고 `test result: ok. N passed`에서 N ≥ 1 (테스트 0개로 초록이 되는 허점 차단)
- [ ] C2. `PATH=/opt/homebrew/opt/rustup/bin:$PATH npm run tauri build -- --debug` → exit 0
- [ ] C3. `anvil-monitor-1of3` · `2of3` · `3of3` 세 작업이 모두 forge root의 `done/*-<slug>/`에 봉인돼 있고, 각 `STATUS.md`의 `verified` 첫 낱말이 yes · skipped · n/a 중 하나 (= 각 계획의 DoD와 사람 UAT 통과. 테스트만 초록이고 화면은 안 맞는 가짜 완료를 막는 검사)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: not run
- C2: not run
- C3: not run

## Authorized replan scope
- 실패한 정지 조건 검사에 직접 연결되는 fix-forward 작업만, Anvil 레포(이 워크트리) 안에서.
- 다른 프로젝트(BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra)는 픽스처용 읽기만 한다. 쓰기 금지.
- `~/.claude/` 설정, 사용자의 평소 tmux(기본 소켓), `.forge/`를 앱이 쓰는 코드(ADR 261017-211602) 금지.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- anvil-monitor-1of3
- anvil-monitor-2of3
- anvil-monitor-3of3
