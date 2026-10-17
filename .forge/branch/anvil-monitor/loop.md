# LOOP — Anvil #1~#3(보드 모니터 · tmux 세션 · 버튼)을 구현해 세 작업 모두 UAT 통과로 봉인한다
started: 2026-10-17
replan-round: 6
replan-cap: 6  (2026-10-17 사람 결정: #2 한글 IME 원인 확인 뒤 상한 3→4, r4 첫 음절 실패 뒤 4→6)
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T12:20:51Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `env PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin cargo test --manifest-path src-tauri/Cargo.toml` → exit 0 이고 `test result: ok. N passed`에서 N ≥ 1 (테스트 0개로 초록이 되는 허점 차단)
- [ ] C2. `env PATH=/opt/homebrew/opt/rustup/bin:/Users/calmonion/.local/state/fnm_multishells/16354_1792234843504/bin:/opt/homebrew/bin:/usr/bin:/bin npm run tauri build -- --debug` (npm 경로는 fnm 셸마다 달라질 수 있음 — `command -v npm`으로 확인) → exit 0
- [ ] C3. `anvil-monitor-1of3` · `2of3` · `3of3` 세 작업이 모두 forge root의 `done/*-<slug>/`에 봉인돼 있고, 각 `STATUS.md`의 `verified` 첫 낱말이 yes · skipped · n/a 중 하나 (= 각 계획의 DoD와 사람 UAT 통과. 테스트만 초록이고 화면은 안 맞는 가짜 완료를 막는 검사)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pass · regressed: ×0 · last-evidence: "cargo test → session 2 + forge 20 passed (#2 봉인 뒤)"
- C2: pass · regressed: ×0 · last-evidence: "tauri build --debug → exit 0 (#2 봉인 뒤)"
- C3: fail ×1 · regressed: ×0 · last-evidence: "1of3·2of3 봉인(verified: yes, 2of3의 (d)는 사용자 결정 skipped) · 3of3 백로그 — 백로그 진행 중" · tried: anvil-monitor-1of3-repair-r1 (UAT 실패 — 후속후보·최근 완료 카드 제목이 안 보임 → 열 자식 flex-shrink 제거), anvil-monitor-2of3-repair-r2 (UAT (a) 실패 — 한글 자모 분리 입력·계획↔실행 경계 안 끌림 → 한글 keydown을 xterm 처리에서 제외, 세로 경계 대상 수정), anvil-monitor-2of3-repair-r3 (UAT (a), anvil-monitor-2of3-repair-r4 (input 이벤트 insertText·insertReplacementText 직접 해석, IME 중 xterm 한글 버림), anvil-monitor-2of3-repair-r5 (키 순서 무관하게 한글 insertText 직접 처리, xterm 한글은 paste 아닐 때만 버림), anvil-monitor-2of3-repair-r6 (UAT (b) 앱 알림 안 옴 — tauri 알림 플러그인이 macOS 27에서 무시되는 NSUserNotificationCenter 사용 → osascript display notification으로 교체) 한글 여전히 자모 분리 → xterm onData에서 한글을 걸러 내고 compositionend의 완성 글자만 직접 전송 + 임시 이벤트 로그)
      reflection: "r4는 둘째 음절부터 맞았다. 첫 음절만 틀린 건 WKWebView가 IME keydown(229)을 input 뒤에 보내서, 직전 키가 229일 때만 처리하는 조건이 일반 키 다음 첫 음절을 놓쳤기 때문. 다음은 키 순서에 기대지 않는다: 한글 insertText는 늘 직접 처리하고, xterm의 한글 전송은 paste 이벤트 중이 아닐 때만 버린다."

## Authorized replan scope
- 실패한 정지 조건 검사에 직접 연결되는 fix-forward 작업만, Anvil 레포(이 워크트리) 안에서.
- 다른 프로젝트(BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra)는 픽스처용 읽기만 한다. 쓰기 금지.
- `~/.claude/` 설정, 사용자의 평소 tmux(기본 소켓), `.forge/`를 앱이 쓰는 코드(ADR 261017-211602) 금지.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- anvil-monitor-1of3
- anvil-monitor-2of3
- anvil-monitor-3of3
