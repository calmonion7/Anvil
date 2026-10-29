<!-- forge-slug: node-web-app-2of4 -->
<!-- task: 19 -->
<!-- part: 2/4 -->
<!-- tdd: off -->
<!-- priority: high -->
# 한 줄 설치 · 자동 시작 · Releases tarball · [업데이트] (Node 전환 2/4)

## 목표 / 하지 않을 것
- 목표: mac·Linux 사용자가 터미널에 한 줄만 붙여 넣으면 준비물부터 Anvil까지 설치되고, 로그인할 때 서버가 자동으로 뜨고, 브라우저가 열린다. 버전 PR을 머지하면 tarball 릴리스가 나가고, 설치본은 보드 위 [업데이트] 한 번으로 갱신된다. 이 Mac도 이 경로로 갈아탄다.
- 하지 않을 것:
  - Windows(`install.ps1`)는 3/4에서 한다.
  - Tauri 빌드 잡과 `src-tauri/` 삭제는 4/4에서 한다. 이번에는 `release.yml`의 빌드 단계만 tarball로 바꾸고, Tauri 파일은 그대로 둔다.
  - 앱 안 준비물 설치는 만들지 않는다(설치 스크립트에만 둔다).
  - 기존 Tauri 사용자 자동 이전은 하지 않는다. 릴리스 노트로 안내만 한다.

## 근거
- 용어: 준비물, 세션 상태 — `.forge/CONTEXT.md`
- 관련 ADR: `adr/261029-121641-node-local-web-app.md`. 이번 단계에서 `.forge/adr/261018-190555-local-poll-auto-update.md`가 실제로 대체된다.
- 1/4(task 18) 봉인 뒤에 실행하기를 권장한다(순서 힌트이지 강제는 아니다).
- 완료 정의(DoD):
  1. `bash -n install.sh` → 0. `shellcheck install.sh` → 경고 0(설치돼 있으면).
  2. CI의 새 잡이 다음을 모두 통과한다.
     - 깨끗한 Ubuntu 컨테이너(curl·git 없음, e2e-desktop과 같은 조건)에서 `install.sh`를 비대화식으로 실행한다.
     - `curl -fsS http://127.0.0.1:<포트>/health` → 200.
     - 컨테이너에 systemd가 없으면 스크립트가 바로 서버를 띄우는 쪽으로 빠진다.
     - 사전 상태: 잡 없음. 전진 검사다.
  3. 버전을 올린 PR이 머지되면 `release.yml`이 tarball과 `install.sh`를 Releases에 첨부한다. 확인은 `gh release view v<버전> --json assets --jq '.assets[].name'`으로 한다.
  4. [업데이트] 동작:
     - 작업 중인 세션이 있으면 재시작하지 않고 「세션이 끝나면 재시작」을 보여 준다.
     - 세션이 없거나 모두 입력 대기·종료면 설치 후 재시작한다.
     - 둘 다 Node 테스트로 확인한다.
  5. 버전 변경을 **커밋한 뒤** `scripts/check-release.sh`를 돌려 통과한다(task 9·16·17 회고). 버전 파일은 4/4까지는 기존 5개를 그대로 맞춘다.
  6. UAT:
     - 깨끗한 macOS VM(UTM, SSH로 자동화)에서 설치 줄 하나로 보드가 열린다.
     - 재부팅 뒤 아이콘이나 북마크만으로 다시 열린다.
     - 사람은 화면만 판단한다.
  7. 이 Mac 전환:
     - 기존 launchd 폴링 에이전트와 빌드 클론을 정리한다. 실행 중 자원이라 한 줄 확인 뒤에 한다.
     - 설치 줄로 설치하고 보드가 열린다.

## 작업 조각
- [ ] S1. **`install.sh`(mac·Linux)**:
  - node 22 미만이면 Anvil 전용 폴더에 공식 node를 받고 검증한다(기존 `deps.rs`의 방식과 같다).
  - claude CLI(`claude.ai/install.sh`), git, forge 플러그인을 설치한다. git은 mac이면 `xcode-select --install`을 띄우고 기다리고, Linux면 그 자리에서 `sudo apt` 등을 실행한다. forge는 marketplace add + install이다.
  - Anvil tarball을 `npm i -g`로 Anvil 전용 prefix에 넣는다.
  - 자동 시작을 등록한다. mac은 launchd LaunchAgent이고, plist의 `EnvironmentVariables`에 HOME·USER·LOGNAME·PATH를 명시한다(전역 지침의 keychain footgun). Linux는 `systemd --user`이고, 없으면 바로 실행한다.
  - 마지막으로 브라우저를 연다.
  - 다시 실행해도 안전해야 한다(이미 있는 것은 건너뛴다).
  - 완료 기준: DoD 1·2.
- [ ] S2. **릴리스** (depends: S1):
  - `release.yml`의 4플랫폼 Tauri 빌드를 tarball 잡 하나로 바꾼다. 화면 빌드 → `npm pack` → tarball·`install.sh` 첨부 → 공개 순서다. 릴리스 노트와 태그 규칙은 유지한다.
  - 설치 줄 URL은 `releases/latest/download/install.sh`로 고정한다.
  - 완료 기준: DoD 3.
- [ ] S3. **[업데이트] 띠**:
  - 서버가 GitHub 최신 릴리스를 확인한다. 띠에서 [업데이트]를 누르면 `npm i -g <tgz URL>`을 실행한다.
  - 재시작은 작업 중인 세션이 없을 때만 한다. 재시작은 자동 시작 서비스가 맡는다.
  - 1/4의 준비물 띠에 설치 줄 안내를 채운다.
  - 완료 기준: DoD 4.
- [ ] S4. **이 Mac 전환과 README 설치 절** (depends: S2, S3):
  - README 「설치」를 설치 줄 하나로 바꾸고, 기존 Tauri 사용자 정리 안내를 릴리스 노트에 적는다. 정리 안내는 `tmux -L anvil kill-server`와 앱 휴지통이다.
  - launchd 폴링 에이전트·빌드 클론과 `scripts/install-app.sh`·`scripts/check-install-app.sh`를 정리한다.
  - 완료 기준: DoD 5·7.
