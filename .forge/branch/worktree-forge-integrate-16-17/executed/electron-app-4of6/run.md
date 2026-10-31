# 실행 기록 — Windows·Linux에서 앱이 돌고, 세 OS e2e가 CI에서 돈다 (데스크톱 앱 4/6)

워크플로 없이 이 세션이 직접 실행했다. Windows·Linux 동작은 이 Mac에서 돌릴 수 없어 CI(PR #57, `electron` 워크플로)로 확인하며 고쳤다. CI는 10번 돌았고 마지막 `41180714200`(`e314165`)에서 세 OS가 모두 통과했다. 계획에 `tdd: on`이 있어, 이 Mac에서 돌릴 수 있는 부분은 테스트를 먼저 썼다(`server/test/env.test.js`, `ANVIL_SKIP_DEPS` 대조 테스트). Windows 분기는 운영체제를 인자로 받는 함수로 만들어 이 Mac에서도 테스트했다.

## 조각별 결과
- S1 Windows 동작 — ⚠ 계획에 없던 근본 문제가 나왔다. Windows node-pty는 실행 파일을 **서버 자신의 Path에서 이름 그대로만** 찾는다(확장자를 붙이지 않는다 — `node_modules/node-pty/src/win/path_util.cc`). 그래서 `claude`를 그대로 넘기면 `claude.exe`를 못 찾는다. 세션 PATH에서 `.exe`·`.cmd`·`.bat`까지 붙여 찾아 경로로 넘기고(`env.js` `findCommand`), `.cmd`·`.bat`은 `cmd.exe`로 감싸 명령줄 문자열로 넘긴다(`spawnTarget`). 이 밖에 `Path`·`PATH` 겹침을 하나로(`withPath`), `node.cmd` 대체 실행 파일과 Git Bash용 sh, 서버·설치 명령 콘솔 창 숨김(`windowsHide`)을 넣었다. Windows CI에서 forge 상대 경로가 `\`로 나오던 결함을 고쳤다(`forge.js` `rel`).
- S2 Linux 동작 — ✅ node-pty가 CI에서 컴파일되고 Electron에서 그대로 돈다(N-API). AppImage 산출물(약 128MB)이 나온다. Electron 실행에는 `--no-sandbox`를 붙였다(테스트 쪽 인자).
- S3 세 OS e2e 잡(`.github/workflows/electron.yml`) — ⚠ 안정될 때까지 9번 고쳤다. 원인은 모두 테스트·환경 쪽이었다. ① 러너에 claude·forge가 없어 「준비 중」이 보드를 가렸고, 자동 설치가 러너에 실제로 깔려 했다 — `ANVIL_SKIP_DEPS`(테스트 전용). ② 러너 화면 언어가 영어였다. ③ Windows는 테스트가 끝나도 node-pty ConPTY가 테스트 하위 프로세스를 붙잡아 30분 제한까지 멈췄다 — `server/index.js`가 Windows에서만 2초 뒤 내보낸다(같은 프로세스 실행은 파일 사이 상태가 섞여 되돌렸다). ④ Playwright `close()`가 Linux에서 끝나지 않았다 — `app.quit` 뒤 프로세스 종료만 기다린다. ⑤ **세 OS 모두 가끔 앱이 `app.quit` 뒤에도 남았다**(주 프로세스·렌더러가 산다, 원인 미확인) — 30초 뒤 경고·강제 종료하고 판정은 이어 간다(후속 후보). 마지막 실행에서는 강제 종료가 0번이었다. ⑥ 창이 새 토큰으로 다시 열리는 순간의 확인 요청은 다시 시도한다. 재시도(retries)는 껐다.
- S4 README — ✅ Windows는 WSL 없이 설치 프로그램, 처음 한 번 SmartScreen 「추가 정보 → 실행」.
- S5 VM 확인 — ⚠ 깨끗한 Windows 11 ARM VM(UTM, 원본 `Windows` 복제)에서 첫 실행을 돌려 CI가 못 잡은 결함 셋을 찾아 고쳤다(테스트 먼저). ① 「준비 중」 forge 설치가 `Command 'git' not found`로 실패 — Windows 서버 PATH는 뜰 때 값이라 그 뒤 winget으로 깐 Git이 없다 → Git 표준 설치 폴더를 붙인다(`env.js` `windowsLoginPath`, `ad1a120`). ② 설치가 다 끝나도 「준비 중」에 멈춤 — `node --version` 확인이 Windows 대체 실행 파일 `node.cmd`를 `execFile`로 못 불러 늘 「필요: node」 → Electron 안이면 자신의 node 버전을 쓴다(`deps.js` `ownNode`, `12b1086`). ③ [프로젝트 추가]가 아무 반응 없음 — Electron에는 `prompt()`가 없다 → 사람이 VM에서 Electron 기본 폴더 창과 서버 PowerShell 창을 비교해 보고 **Electron 기본 창**으로 결정: preload(`electron/preload.cjs`, `pickFolder` 하나만)로 주 프로세스 `dialog.showOpenDialog`를 Anvil 창에 붙여 연다, 세 OS 모두(`3de810d` 입력칸 → `2e70c8b`). 마지막 빌드(`2e70c8b`, CI `41194453158`)를 새 복제 VM `anvil-4of6b`에 깔아 사람이 확인: Git → claude → forge 자동 설치 → 앱을 다시 켜지 않고 보드 → 폴더 창으로 `C:\Users\tester\demo` 등록 → 계획 세션에서 claude v2.1.316 실행·키 입력 → 콘솔 창 깜빡임 없음(fu-62d8e42c3b92). 창을 닫으면 앱 본체는 바로 끝나고 서버만 남았다가 몇 분 뒤 스스로 내려갔다(설계대로) — fu-5e0a7d31c4b2는 VM에서 두 번 다 재현되지 않았다.

## 계획 밖 변경·판단
- `electron/main.js`: `activate`가 `ready`보다 먼저 와도 창은 준비 뒤에 만든다(macOS CI에서 창이 끝내 안 뜨던 경쟁).
- `electron-builder.yml`: Windows nsis(사용자 범위·원클릭)·Linux AppImage 대상. 아이콘은 아직 `src-tauri/icons/`를 쓴다 — 6/6에서 `src-tauri/`를 지울 때 옮겨야 한다.
- 테스트: 가짜 claude가 `^U`를 스스로 처리(ConPTY는 지워 주지 않는다), 토큰 권한(600) 확인은 POSIX에서만, 임시 폴더 정리는 Windows 파일 잠금을 기다린다, dev-web 테스트는 Windows에서 건너뛴다(dev-web만 죽고 서버·vite가 고아로 남는다). 복구 테스트(2/6)는 POSIX 신호·`pgrep`에 기대 Windows에서 건너뛰지만, Electron 스모크가 Windows에서 서버 SIGKILL 뒤 `--resume` 복구를 확인했다.
- DoD 1 명령: CI는 `node --test server/`를 그대로 쓴다.
- `electron/main.js`·`electron/preload.cjs`: 1/6 계획의 「preload 없음」을 「preload는 폴더 고르기 하나만」으로 바꿨다(사람 결정, 위 S5 ③). contextIsolation·sandbox·nodeIntegration 없음은 그대로, 주 프로세스는 서버 출처 화면의 요청만 받는다. macOS도 osascript 창 대신 이 창을 쓴다(브라우저로 띄우면 여전히 서버 `pick_folder`).

## DoD 기준선 → 실행 뒤
1. CI 행렬 Electron 스모크: 잡 없음 → macOS·Ubuntu·Windows 모두 통과(`41180714200`). 시나리오: 픽스처 프로젝트 → 보드 → 세션 열기 → pty 출력(`ready>`) → 앱 종료 뒤 서버 생존 → 재실행 시 같은 서버 → 서버 재시작 뒤 새 토큰 → 서버 SIGKILL 뒤 `--resume` 복구.
2. Windows 경로의 `.forge/` 읽기·세션 작업 폴더: Windows CI `node --test server/` 89 통과·0 실패(골든·forge·세션 cwd 포함). 이 Mac 103 통과.
3. Windows `node.cmd`로 훅이 돈다: Windows CI 「Electron 런타임에서 session.test.js가 통과한다」(훅이 `node.cmd`로 상태를 기록).
4. `grep -c 'wsl --install' README.md`: 1 → 0.
5. UAT — Windows VM 첫 실행 통과(위 S5, STATUS `verified:`).
- 마지막 확인(`2e70c8b`): CI `41194453158` 세 OS 통과 · 이 Mac `node --test server/` 105 · `npx playwright test` 47 · `npm run test:app` 2 · `npm run check` 0 오류·0 경고.

## Follow-ups
<!-- followup: fu-5e0a7d31c4b2 | source: electron-app-4of6 | task: 25 | date: 2026-10-31 | status: open | taken: - -->
- CI에서 세 OS 모두 가끔 Electron 앱이 `app.quit` 뒤 30초가 지나도 끝나지 않았다(주 프로세스·렌더러·서버 자식이 그대로). 화면 코드에 `beforeunload`는 없다. 스모크는 경고 뒤 강제 종료로 넘어간다 — 실제 앱에서도 창을 닫거나 Cmd+Q 뒤 프로세스가 남는지 원인을 찾을 것.
  Evidence: CI `41180387338` macOS 잡 로그의 남은 프로세스 목록(14327 Electron·렌더러·server/main.js), Windows `⚠ … 강제로 끝낸다` 로그. 이 Mac 로컬은 7번 중 1번. Windows VM에서 사람이 창을 닫은 두 번은 재현되지 않았다.
<!-- followup: fu-c2e1e4da6e4c | source: electron-app-4of6 | task: 25 | date: 2026-10-31 | status: open | taken: - -->
- Windows 설치 파일이 x64 하나뿐이라(`electron-builder.yml` `arch: x64`) ARM64 Windows에서는 에뮬레이션으로 돈다. 그 안에서 부른 claude 설치도 x64판(`claude-2.1.316-win32-x64.exe`)을 깔았다. 동작은 했지만 느릴 수 있다 — arm64 빌드를 함께 낼지(또는 universal) 정할 것.
  Evidence: Windows VM UAT 2026-10-31, `anvil-4of6b` 프로세스 목록의 `claude-2.1.316-win32-x64.exe`, Git은 arm64판(`Git-2.56.0.4-arm64.exe` — winget이 OS 아키텍처를 따름).
