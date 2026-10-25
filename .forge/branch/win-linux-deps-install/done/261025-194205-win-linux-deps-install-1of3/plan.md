<!-- forge-slug: win-linux-deps-install-1of3 -->
<!-- task: 11 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
<!-- priority: high -->
# Windows·Linux 실제 앱 자동 테스트 장치(e2e-desktop) — 지금 동작을 기준선으로

## Goal / Non-goals
- Goal: GitHub 호스팅 러너에서 **실제 Anvil 앱을 빌드해 띄우고**(tauri-driver + WebdriverIO) '깨끗한 PC → 준비물 띠 → [설치] → 세션 열기 → 앱 안 터미널에 claude 첫 화면' 시나리오를 Linux·Windows(WSL1)에서 기계 판정하는 워크플로 `e2e-desktop.yml`을 만든다. 지금 동작을 기준선으로 잠그고, 아직 안 되는 단계(설치 이후)는 '실패 예정'으로 표시해 둔다. 3부가 그 표시를 지우는 것이 빨강→초록이다.
- Non-goals: 설치 기능 자체의 구현(3부). macOS(tauri-driver 미지원 — 기존 UTM VM UAT 유지). claude 실제 로그인 이후 동작(계정 비밀을 CI에 넣지 않음). WSL2·NSIS 설치 프로그램·자동 업데이트(2부 로컬 VM의 몫). 로컬 docker 실행 루프. 화면 논리 검증(Playwright mock 35개가 이미 덮음).

## Source of truth
- Glossary: `.forge/CONTEXT.md` — 준비물(node 22 이상·claude CLI·forge, Windows는 WSL·배포판이 바탕), 세션, 프로젝트
- ADR: `.forge/adr/261025-163349-bundle-static-tmux-on-linux-and-wsl.md`(3부가 구현 — 1부 시나리오는 그 결과를 기대값으로 적는다), `.forge/adr/261024-202909-bundle-tmux-jq-on-macos.md`
- 기존 코드: 준비물 감지 `src-tauri/src/deps.rs`(`status`·`missing`·Windows 분기 :159-175), WSL 감지 `src-tauri/src/session.rs:141-159`(`backend_missing`), 띠 `src/routes/+page.svelte:500-529`, 현 Playwright `e2e/deps.spec.ts`(mock IPC)

## 그릴링에서 정한 것
- 러너: Linux는 `ubuntu-22.04` 러너 **안의 `ubuntu:22.04` 컨테이너**에서 Xvfb로 앱 실행(러너 자체에는 node 등이 미리 깔려 있어 '깨끗한 PC'가 아니다). Windows는 `windows-latest` 러너 + `setup-wsl` 액션(WSL1 Ubuntu — 러너에서 WSL2 불가).
- Windows는 **WSL을 깔기 전에** 앱을 한 번 띄워 'WSL 없음' 띠를 확인하고, 그 뒤 setup-wsl로 배포판을 넣고 [다시 확인]한다.
- 실행 시점: `workflow_dispatch` + `package.json`·`src-tauri/tauri.conf.json`을 바꾸는 PR(= 버전 올리는 PR, 머지가 곧 릴리스이므로 릴리스 전 검사). 평소 PR에는 돌지 않는다.
- 결과물: 단계마다 스크린샷 + 앱·명령 로그를 아티팩트로. 에이전트가 `gh run download`로 받아 직접 읽고 판정한다.
- 공개 저장소라 러너 비용 0원, 1회 15~25분 추정.

## Slices
- S1 tauri-driver 하네스 골격 — `e2e-desktop/`에 WebdriverIO 설정과 앱 실행 헬퍼(빌드한 바이너리 경로, 스크린샷 저장). 로컬 macOS에서는 돌지 않음을 README 한 줄로 밝힌다.
  - 완료 기준: Linux 러너에서 앱이 뜨고 창 제목 'Anvil'을 읽어 통과하는 스모크 테스트 1건이 초록.
- S2 Linux 시나리오 (depends: S1) — 깨끗한 컨테이너: ① 띠에 'node · claude · forge' 필요 표시 ② [설치] 클릭 → 단계 ✓ 대기 ③ 띠 사라짐 ④ 테스트 프로젝트 추가 → [세션 열기] → 터미널 글자에 claude 첫 화면 문구. 오래된 node 시나리오: `apt install nodejs`(v12) 상태에서 'node 22 이상 필요' 표시 → [설치] 뒤 v22 사용. 지금 안 되는 단계(현재 Linux는 `installable: false`라 ②~④, 버전 판정)는 '실패 예정' 표시.
  - 완료 기준: 워크플로 Linux 잡 초록 + 아티팩트에 단계별 스크린샷 + 실패 예정 단계가 실제로 실패하고 있음(기대 실패가 '예상 밖 통과'로 바뀌면 빨강이 되도록).
- S3 Windows 시나리오 (depends: S1) — `windows-latest`: ⓪ WSL 없이 띄워 띠 문구 기록(지금은 'WSL에 tmux 설치 필요' — 기준선) → setup-wsl(WSL1 Ubuntu) → ① [다시 확인] → 이후 S2와 같은 흐름. 교차 확인: `wsl -- ~/.local/bin/node --version`, `wsl -- bash -lc "claude --version"`, WSL 홈 `installed_plugins.json`의 `forge@`. 지금 안 되는 단계는 '실패 예정'.
  - 완료 기준: 워크플로 Windows 잡 초록(기준선 단계 통과, 실패 예정 단계가 실제로 실패) + 스크린샷 아티팩트.
  - 위험(가장 먼저 확인): windows-latest에서 WSL1 + WebView2 드라이버(msedgedriver) 조합이 도는지, claude `install.sh`가 WSL1에서 도는지. 안 되면 멈추고 사람에게 알린다(대안을 임의로 고르지 않는다).
- S4 트리거·문서 (depends: S2, S3) — `on: workflow_dispatch` + `pull_request: paths: [package.json, src-tauri/tauri.conf.json]`. README '개발' 절에 실행법 한 줄(`gh workflow run e2e-desktop.yml --ref <브랜치>`)과 결과 읽는 법.
  - 완료 기준: 이 작업의 PR에서 `workflow_dispatch`로 한 번 돌려 두 잡 초록, 링크를 run.md에 기록.

## Definition of Done
1. `test -f .github/workflows/e2e-desktop.yml` → 성공 (작성 시점: 실패 — 전방 검사)
2. `gh workflow run e2e-desktop.yml --ref <작업 브랜치>` 후 `gh run watch <id> --exit-status` → 0 (작성 시점: 워크플로 없음 — 전방 검사)
3. `gh run download <id>` 결과에 Linux·Windows 각각 스크린샷 ≥4장 (작성 시점: 해당 없음 — 전방 검사)
4. `npm run test:e2e` → 35 passed 유지 (작성 시점: 35 passed — 회귀 방지라 미리 통과가 정상)
5. `npm run check` → 0 ERRORS 유지 (작성 시점: 0 ERRORS — 회귀 방지)
6. `cd src-tauri && cargo test` → 실패 0 유지 (작성 시점: 이 워크트리에 rust 툴체인 실행 불가로 미측정. v0.1.5 run.md 기록 34+27 통과 — 실행 전 fg-run의 DoD 기준선에서 다시 잴 것)
