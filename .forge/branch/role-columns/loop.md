# LOOP — Anvil #4(계획 열·실행 열 두 줄기 배치 · 세션 이름·모델 · 실제 모델·effort 표시)를 DoD와 사람 UAT 통과로 봉인한다
started: 2026-10-18
replan-round: 2
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-17T22:31:16Z
wall: unverifiable-uat (C3 — #4 기계 DoD 1~6a 통과, UAT (a)(b)(c)(f)(g) 통과. 수리 r1(클래스 충돌)·r2(단계 묶음 폭 — '봉인' 덮임) 재빌드 완료 — 앱 재시작 뒤 (d)·(e) 사람 판정 대기)

## Stop-condition checks (ALL must pass)
- [ ] C1. `env PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin cargo test --manifest-path src-tauri/Cargo.toml` → exit 0, `test result: ok. N passed` 합계 ≥ 23(기존 22 + 새 테스트 — 테스트를 지워 초록이 되는 허점 차단), 그리고 출력에서 `grep -c 'session_title.* ok'` ≥ 1
- [ ] C2. `npm run check` → `0 ERRORS` 그리고 `npm run tauri build -- --debug` → exit 0 (npm 경로는 fnm 셸마다 달라질 수 있음 — `command -v npm`으로 확인)
- [ ] C3. `role-columns-and-session-names`(task 4)가 forge root의 `done/*-role-columns-and-session-names/`에 봉인돼 있고, `STATUS.md`의 `verified` 첫 낱말이 yes · skipped · n/a 중 하나 (= 계획의 DoD 2·3·4·5a·6·6a 실측과 사람 UAT (a)~(g) 통과. 테스트만 초록이고 화면은 안 맞는 가짜 완료를 막는 검사)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pass · regressed: ×0 · last-evidence: "cargo test → session 3 + forge 20 = 23 passed, exit 0, session_title_follows_cxa_rule_with_anvil_prefix ... ok"
- C2: pass · regressed: ×0 · last-evidence: "npm run check → 0 ERRORS 0 WARNINGS · tauri build --debug → exit 0 (Anvil.app 번들)"
- C3: fail ×1 · regressed: ×0 · last-evidence: "#4 verified: pending — DoD 2·3·4·5a·6(894px에서 30줄)·6a(접음 98 vs 펼침 86/88) 실측 통과, UAT (a)(b)(c)(f)(g) 통과 · (d) 루프 정지 화면에서 「지금」 띠 현재 단계가 상자로 부풀고 '봉인' 글자가 밀림(클래스 `now` 충돌) → 수리 r1, (d) 나머지·(e) 대기" · tried: role-columns-and-session-names-repair-r1 (「지금」 띠 클래스 now → band, 현재 단계 클래스와 충돌 제거), role-columns-and-session-names-repair-r2 (단계 묶음 간격을 gap → margin, 연결선 flex-basis → width)
      reflection: "r1 뒤 상자 부풂은 사라졌지만 ④ 뒤 '봉인'은 여전히 plan 버튼에 덮였다 — 클래스 충돌과 별개로, flex:none 단계 묶음의 내용 폭 계산에서 WebKit이 gap과 flex-basis를 빼먹어 묶음이 실제보다 좁게 잡힘. 그래서 r2는 계산에 확실히 들어가는 margin·width로 바꿨다. 그래도 덮이면 다음은 단계 묶음을 버튼 뒤로 옮기거나 min-width를 명시한다."

## Authorized replan scope
- 실패한 정지 조건 검사에 직접 연결되는 fix-forward 작업만, Anvil 레포(이 워크트리) 안에서.
- 다른 프로젝트(BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra)는 픽스처용 읽기만 한다. 쓰기 금지.
- `~/.claude/` 설정·훅, `~/cc.sh`·`~/cc-all.sh`, 사용자의 평소 tmux(기본 소켓), `.forge/`를 앱이 쓰는 코드(ADR 261017-211602) 금지.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- role-columns-and-session-names
