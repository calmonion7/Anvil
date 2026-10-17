# LOOP — Anvil #1~#3(보드 모니터 · tmux 세션 · 버튼)을 구현해 세 작업 모두 UAT 통과로 봉인한다
started: 2026-10-17
replan-round: 4
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T12:20:51Z
wall: cap-exhausted (#2 한글 IME — r3도 실패. 원인 확인됨: WKWebView는 한글에 composition 이벤트 없이 insertText+insertReplacementText만 보내고 xterm.js는 바꿔치기를 무시. 수정안 있음 — 재계획 상한 상향 결정 필요)

## Stop-condition checks (ALL must pass)
- [ ] C1. `env PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin cargo test --manifest-path src-tauri/Cargo.toml` → exit 0 이고 `test result: ok. N passed`에서 N ≥ 1 (테스트 0개로 초록이 되는 허점 차단)
- [ ] C2. `env PATH=/opt/homebrew/opt/rustup/bin:/Users/calmonion/.local/state/fnm_multishells/16354_1792234843504/bin:/opt/homebrew/bin:/usr/bin:/bin npm run tauri build -- --debug` (npm 경로는 fnm 셸마다 달라질 수 있음 — `command -v npm`으로 확인) → exit 0
- [ ] C3. `anvil-monitor-1of3` · `2of3` · `3of3` 세 작업이 모두 forge root의 `done/*-<slug>/`에 봉인돼 있고, 각 `STATUS.md`의 `verified` 첫 낱말이 yes · skipped · n/a 중 하나 (= 각 계획의 DoD와 사람 UAT 통과. 테스트만 초록이고 화면은 안 맞는 가짜 완료를 막는 검사)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pass · regressed: ×0 · last-evidence: "cargo test → forge 19 passed (#1 봉인 뒤)"
- C2: pass · regressed: ×0 · last-evidence: "tauri build --debug → exit 0, Anvil.app (#1 봉인 뒤)"
- C3: fail ×1 · regressed: ×0 · last-evidence: "1of3 봉인(verified: yes) · 2of3·3of3 백로그 — 백로그 진행 중" · tried: anvil-monitor-1of3-repair-r1 (UAT 실패 — 후속후보·최근 완료 카드 제목이 안 보임 → 열 자식 flex-shrink 제거), anvil-monitor-2of3-repair-r2 (UAT (a) 실패 — 한글 자모 분리 입력·계획↔실행 경계 안 끌림 → 한글 keydown을 xterm 처리에서 제외, 세로 경계 대상 수정), anvil-monitor-2of3-repair-r3 (UAT (a) 한글 여전히 자모 분리 → xterm onData에서 한글을 걸러 내고 compositionend의 완성 글자만 직접 전송 + 임시 이벤트 로그)
      reflection: "r3의 compositionend는 한 번도 불리지 않았다(ime-debug.log composition 0건). WKWebView는 한글을 insertText(새 음절)·insertReplacementText(조합 중 바꿔치기)로만 보낸다. 다음 수리는 이 두 input 이벤트를 직접 해석해 새 음절은 보내고, 바꿔치기는 직전 글자 수만큼 DEL 뒤 새 글자를 보낸다(조합 중 글자도 실시간 표시)."

## Authorized replan scope
- 실패한 정지 조건 검사에 직접 연결되는 fix-forward 작업만, Anvil 레포(이 워크트리) 안에서.
- 다른 프로젝트(BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra)는 픽스처용 읽기만 한다. 쓰기 금지.
- `~/.claude/` 설정, 사용자의 평소 tmux(기본 소켓), `.forge/`를 앱이 쓰는 코드(ADR 261017-211602) 금지.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- anvil-monitor-1of3
- anvil-monitor-2of3
- anvil-monitor-3of3
