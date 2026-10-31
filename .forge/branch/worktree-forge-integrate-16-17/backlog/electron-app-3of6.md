<!-- forge-slug: electron-app-3of6 -->
<!-- task: 24 -->
<!-- part: 3/6 -->
<!-- tdd: on -->
# 첫 실행 때 준비물 자동 설치 (데스크톱 앱 3/6)

## 목표 / 하지 않을 것
- 목표: 준비물이 빠진 환경에서 앱을 처음 열면 「준비 중」 화면이 뜨고, 버튼 없이 claude CLI와 forge 플러그인을(Windows는 Git for Windows도) 사용자 범위로 설치한 뒤 보드로 넘어간다. 실패하면 그 화면에 오류와 [다시 시도]를 보여 준다. 이미 다 있으면 화면 없이 지나간다.
- 하지 않을 것: 로그인 대행(첫 세션 안에서 claude가 받는다), 관리자 권한이 필요한 설치(Linux의 git 등은 안내만), node 설치(앱에 들어 있음), Windows 실제 확인(4/6에서 VM으로).

## 근거
- 용어: 준비물 — `.forge/CONTEXT.md`(브랜치 root에 이번 그릴링에서 고친 정의)
- 관련 ADR: `adr/261030-005852-electron-desktop-shell.md`
- 옮겨 올 것: Tauri `src-tauri/src/deps.rs`의 설치 명령. forge는 `claude plugin marketplace list | grep -qw forge || claude plugin marketplace add <FORGE_MARKETPLACE>` 다음 `claude plugin install forge@forge`(`deps.rs:217`). claude는 공식 `claude.ai/install.sh`·`install.ps1`. Windows Git은 `winget --scope user`. mac에서 git이 없으면 `xcode-select --install` 창을 띄우고 기다린다.
- 추측(실행 때 확인): Windows claude는 Git Bash가 있어야 돈다. claude 설치 명령은 관리자 권한이 필요 없다.
- 완료 정의(DoD):
  1. `node --test server/` → 0 실패. 새 테스트: 빠진 항목 판정(claude·forge·Windows Git), 설치 순서(claude → forge, Windows는 Git 먼저), 설치 명령 실패 시 오류 보고, 다시 실행해도 안전(이미 있으면 건너뜀). 설치 명령은 주입한 가짜로 돈다.
     - 사전 상태: `server/deps.js`에 확인만 있고 설치 없음(1/4에서 `deps_install` 제거). 전진 검사.
  2. `npx playwright test` → 0 실패. 「준비 중」 화면의 세 상태(진행 중·실패와 [다시 시도]·완료 뒤 보드)를 가짜 서버로 확인하는 시나리오 포함.
  3. UAT(UTM macOS VM, SSH로 자동화 — 메모리 「VM test automation」, 사람은 화면만 판단): claude·forge가 없는 깨끗한 VM에서 `.dmg` 설치 → 앱 열기 → 자동 설치 → 계획 세션에서 claude 로그인 화면이 뜬다.

## 작업 조각
- [ ] S1. **서버: 자동 설치** : 앱이 시작을 알리면(또는 서버 시작 때) 빠진 항목을 순서대로 설치하고 진행 상황을 웹소켓 이벤트로 보낸다. 설치는 한 번에 하나만 돈다. 완료 기준: DoD 1.
- [ ] S2. **화면: 「준비 중」** (depends: S1): 빠진 것이 있을 때만 보드 대신 보이는 화면. 항목별 상태와 실패 시 원문 오류 일부·[다시 시도]. 화면 작업이므로 `~/.claude/design/UIUX.md`를 먼저 읽는다. 완료 기준: DoD 2.
- [ ] S3. **VM 확인** (depends: S2): DoD 3.
