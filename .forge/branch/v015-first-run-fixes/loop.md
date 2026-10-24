# LOOP — v0.1.5 첫 설치 수정 세 건 (설치 창 숨음 · 세션 포커스 · node 준비물)
started: 2026-10-25
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-24T15:33:28Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `cd src-tauri && rustup run stable cargo test` → 실패 0, 그중 deps.rs의 Need::Node 테스트(node 없으면 목록에 들어감 · 설치 명령에 고정 버전·shasum 검증·~/.local/bin 심링크 · 설치 순서 개발자 도구→node→claude→forge) 포함
- [ ] C2. `npm run test:e2e` → 전부 통과, 그중 [세션 열기] 뒤 터미널 포커스 테스트와 node 띠 테스트 포함
- [ ] C3. `npm run check` → `0 ERRORS`
- [ ] C4. 버전 0.1.5가 다섯 파일 모두에 있고 `docs/releases/v0.1.5.md` 존재, README Windows·Linux 직접 설치 목록에 node, `bash scripts/check-release.sh` 실패 0
- [ ] C5. 사람 확인(VM) — ① 개발자 도구 설치 창 맨 앞 ② [세션 열기] 직후 바로 타이핑 ③ [설치] 뒤 forge 훅 node 오류 없음
      evidence: external

## Check progress
- C1: pending
- C2: pending
- C3: pending
- C4: pending
- C5: pending · last-evidence: "VM 사람 확인 미실행"

## Authorized replan scope
- 실패한 C1~C4 검사에 직결된 수정만 (기본값)
- always-halt action classes: prod data mutation/deletion · deploy/release/publish (태그 push·릴리스 게시 포함) · outbound external comms · irreversible VCS/file destruction · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- v015-first-run-fixes
