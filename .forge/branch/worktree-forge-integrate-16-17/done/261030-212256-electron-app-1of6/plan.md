<!-- forge-slug: electron-app-1of6 -->
<!-- task: 22 -->
<!-- part: 1/6 -->
<!-- tdd: on -->
<!-- priority: high -->
# Electron 창으로 이 Mac에서 Anvil 열기 — 떨어진 서버·앱 꺼도 세션 유지 (데스크톱 앱 1/6)

## 목표 / 하지 않을 것
- 목표: 이 Mac에서 `.dmg`로 설치한 Anvil 앱을 열면, 앱이 Node 서버(없으면 앱과 떨어진 프로세스로 띄움)에 붙어 보드·세션을 보여 준다. 앱을 Cmd+Q로 꺼도 서버와 세션은 계속 돌고, 다시 열면 그대로 이어진다. 세션도 창도 없이 5분이 지나면 서버가 내려간다.
- 하지 않을 것: 재부팅 뒤 세션 복구(2/6), 첫 실행 자동 준비(3/6), Windows·Linux(4/6), 릴리스·업데이터·mac x64 빌드(5/6), Tauri 제거(6/6), 코드 서명, 로그인 자동 시작, 입력 대기 OS 알림(후속후보 fu-a0781a23120b). **Tauri 쪽은 계속 동결**한다(`cargo test` 통과만 지킨다).

## 근거
- 용어: 세션·프로젝트·준비물 — `.forge/CONTEXT.md`(브랜치 root의 「준비물」이 최신)
- 관련 ADR: `adr/261030-005852-electron-desktop-shell.md`(이번 결정), `.forge/adr/261017-211601-sessions-on-dedicated-tmux-socket.md`(앱을 닫아도 세션이 살아야 한다는 요구), `adr/261029-121641-node-local-web-app.md`(Node 서버·토큰·Origin 검사는 유효), `.forge/adr/261017-211602-anvil-never-writes-forge.md`
- 회고 `retro/261030-001319-node-web-app-1of4.md`: 터미널을 여는 서버라 보안 렌즈 리뷰를 넣는다. 런타임 버전에 따라 의미가 바뀌는 명령은 형식부터 실측한다.
- 완료 정의(DoD):
  1. `node --test server/` → 0 실패. 새 테스트(서버 단일 실행, 유휴 종료, 서버 정보 파일, node 대체 실행 파일)가 포함된다.
     - 사전 상태(실측 2026-10-30): 71/71 통과. 새 테스트는 없음 — 전진 검사.
  2. `npx playwright test` → 0 실패(브라우저 화면 회귀 방지).
     - 사전 상태(실측): 43 passed. 회귀 방지라 미리 통과가 정상이다.
  3. Electron 스모크(Playwright `_electron`): 앱 실행 → 창에 보드 → 앱 종료 뒤에도 서버 프로세스가 살아 있음 → 다시 실행하면 새 서버를 띄우지 않고 같은 서버에 붙음. 가짜 claude(`server/test/fake-claude.js`)를 쓴다.
     - 사전 상태(실측): `electron/` 없음, `package.json`에 electron 없음(`grep -c '"electron' package.json` → 0). 전진 검사.
  4. `npm run check` → 오류 0.
  5. `npm run dist:mac` → `dist/`에 arm64 `.dmg`가 생긴다.
     - 사전 상태: 스크립트 없음. 전진 검사.
  6. `(cd src-tauri && cargo test)` → 통과(동결 회귀 방지).
  7. UAT(이 Mac, 사람):
     - `.dmg`로 `/Applications`에 설치하고 연다(서명 없음 — 처음 한 번 「그래도 열기」).
     - 보드가 보이고 계획 세션에서 claude와 대화한다.
     - Cmd+Q 뒤 다시 열면 같은 대화 화면이 이어진다.
     - 세션을 모두 종료하고 앱을 끈 뒤 5분이 지나면 `pgrep -f server/main.js`가 비어 있다.

## 작업 조각
- [ ] S1. **Electron 안의 Node로 서버 돌리기**:
  - `electron`·`electron-builder`를 devDependencies로 넣는다. node-pty를 Electron ABI로 다시 빌드한다(`@electron/rebuild`, `postinstall` 또는 빌드 단계). 브라우저 경로(`node server/main.js`, 시스템 node)도 계속 돌아야 하므로 두 ABI가 충돌하면 빌드 산출물을 나눈다 — 실행 때 실측해 정한다.
  - 완료 기준: `ELECTRON_RUN_AS_NODE=1 <electron> server/main.js`로 서버가 뜨고 `server/test/pty.test.js`와 같은 pty 생성이 그 런타임에서 통과.
- [ ] S2. **서버: 단일 실행·서버 정보 파일·유휴 종료** (depends: S1):
  - 데이터 폴더에 실행 중 서버 정보(포트·pid)를 남기고, 이미 살아 있는 서버가 있으면 두 번째 서버는 뜨지 않는다.
  - 살아 있는 세션 0개 + 붙은 웹소켓 0개 상태가 5분(테스트용 환경변수로 줄임) 이어지면 정상 종료한다.
  - 완료 기준: 두 테스트 통과(DoD 1).
- [ ] S3. **forge 훅용 `node` 대체 실행 파일** (depends: S1):
  - 서버가 Electron 아래서 돌 때 세션 PATH 맨 앞에 `node`(sh 스크립트, Windows는 4/6에서 `.cmd`)를 둔 폴더를 넣는다. 내용은 `ELECTRON_RUN_AS_NODE=1 exec <electron> "$@"`.
  - Node로 옮긴 상태 훅·상태줄 래퍼도 이 `node`로 돈다(지금은 `process.execPath`를 직접 쓴다 — Electron 아래서도 맞는지 확인).
  - 완료 기준: 세션 환경에서 `node -e "console.log(process.versions.node)"`가 버전을 찍는 테스트 통과.
- [ ] S4. **Electron 주 프로세스(`electron/main.js`)** (depends: S2, S3):
  - 시작: 서버 정보 파일 + 토큰으로 살아 있는 서버에 붙는다. 없으면 `ELECTRON_RUN_AS_NODE=1`로 서버를 detached·unref로 띄우고 준비될 때까지 기다린다.
  - 창: `BrowserWindow`가 `http://127.0.0.1:<포트>/?token=<토큰>`을 연다. `contextIsolation: true`, `nodeIntegration: false`, preload 없음. 서버 주소 밖으로의 이동은 막고, 바깥 링크는 `shell.openExternal`로 연다.
  - 앱 종료(Cmd+Q)는 창만 닫고 서버에 아무 신호도 보내지 않는다. mac 관례대로 창을 다 닫아도 앱은 Dock에 남는다.
  - 서버가 재시작돼 토큰이 바뀌면(1/4의 「서버가 다시 시작되었습니다」 경로) 창이 새 토큰으로 다시 연다.
  - 완료 기준: DoD 3.
- [ ] S5. **mac 패키징과 개발 실행** (depends: S4):
  - electron-builder 설정: mac arm64 `.dmg`(+ 5/6에서 쓸 `.zip`), `server/`·`build/` 포함, node-pty는 asar 밖(`asarUnpack`). `npm run dist:mac`.
  - `npm run dev:app`(vite + Electron) 한 줄을 README 「개발」에 더한다.
  - 완료 기준: DoD 5, 그리고 DoD 7을 진행할 수 있다.
- [ ] S6. **보안 리뷰**: 이 조각들의 변경(서버 기동·PATH 대체 실행 파일·창 이동 제한)을 보안 렌즈로 적대적 리뷰한다(회고의 교훈). 완료 기준: critical·major 0 또는 수정됨.
