<!-- forge-slug: node-web-app-3of4 -->
<!-- task: 20 -->
<!-- part: 3/4 -->
<!-- tdd: off -->
# Windows 네이티브(WSL 없음) + 세 OS CI (Node 전환 3/4)

## 목표 / 하지 않을 것
- 목표: Windows 사용자가 PowerShell에 한 줄만 붙여 넣으면 WSL 없이 Anvil이 설치되고 세션이 돈다. 세 OS(mac·Linux·Windows)에서 실제 서버를 띄운 e2e가 CI에서 돈다.
- 하지 않을 것: Tauri·WSL 코드 삭제(4/4), Windows on ARM 공식 지원 보장(x64 우선, ARM VM은 확인용), 입력 대기 알림(별도 작업).

## 근거
- 용어: 준비물 — `.forge/CONTEXT.md`. Windows에서 「WSL이 바탕」이라는 정의는 4/4에서 고친다.
- 관련 ADR: `adr/261029-121641-node-local-web-app.md`
- 실측 근거: forge 훅은 Windows 겸용이다. 훅은 `run-hook.cmd`로 실행되고(`shell: bash`), `run-hook.windows.test.js` 테스트가 있다(forge 0.9.8 `hooks/`).
- 추측(실행 때 확인): Windows용 claude는 Git for Windows(Git Bash)가 필요하다. Git for Windows는 winget으로 관리자 권한 없이(사용자 범위) 설치된다.
- 완료 정의(DoD):
  1. CI 행렬(macos-latest · ubuntu · windows-latest)에서 실제 서버를 띄운 Playwright 스모크가 통과한다. 시나리오는 프로젝트 등록 → 보드 → 세션 열기 → pty 출력 수신이다. claude 대신 가짜 명령을 쓴다.
     - 사전 상태: 잡 없음. 전진 검사다.
  2. CI의 windows-latest에서 `install.ps1`을 비대화식으로 실행한 뒤 `/health` → 200.
  3. Windows 경로(`C:\…`)의 프로젝트에서 `.forge/` 읽기와 세션 시작 작업 폴더가 맞다. Node 테스트로 확인한다.
  4. UAT(UTM Windows ARM VM, SSH로 자동화 — 메모리 「VM test automation」):
     - 설치 줄 하나로 보드가 열린다.
     - 계획 세션에서 claude가 돈다.
     - 콘솔 창이 깜빡이지 않는다(후속후보 fu-62d8e42c3b92를 여기서 판단하거나, 느린 VM이라 판단할 수 없으면 그대로 둔다).
     - 사람은 화면만 판단한다.

## 작업 조각
- [ ] S1. **`install.ps1`**:
  - Git for Windows를 winget 사용자 범위로 설치한다.
  - 공식 node zip을 `%LOCALAPPDATA%\anvil\node`에 받고 검증한다.
  - claude(`claude.ai/install.ps1`)와 forge 플러그인을 설치하고, `npm i -g` tarball을 실행한다.
  - 자동 시작은 시작 프로그램 폴더의 바로가기로 등록한다. 콘솔 창은 숨긴다.
  - 마지막으로 브라우저를 연다. 다시 실행해도 안전해야 한다.
  - 완료 기준: DoD 2.
- [ ] S2. **Windows 서버 동작** (depends: S1):
  - node-pty가 ConPTY로 세션을 띄운다.
  - 경로를 정규화한다. 1/4의 Node 상태 훅과 상태줄 래퍼가 Windows에서 그대로 도는지 확인하고, 다르면 고친다.
  - 릴리스에 `install.ps1`을 첨부한다(2/4의 `release.yml`에 한 줄).
  - 완료 기준: DoD 3.
- [ ] S3. **세 OS e2e 잡**: `.github/workflows/`에 실제 서버를 띄우는 Playwright 스모크 행렬을 추가한다. 기존 `e2e-desktop.yml`은 4/4에서 지운다. 완료 기준: DoD 1. (depends: S2)
- [ ] S4. **README Windows 절**: 설치 줄과 「WSL 불필요」로 바꾼다. 완료 기준: README에 `wsl --install` 안내가 남지 않는다(`grep -c 'wsl --install' README.md` → `0`. 사전 상태는 ≥1이다). (depends: S2)
