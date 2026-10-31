# Follow-ups

<!-- followup: fu-fe950c698c91 | source: win-linux-deps-install-1of3 | task: 13 | date: 2026-10-25 | status: taken | taken: 15 -->
- 3부 [설치]가 curl(node·claude 받기)과 git(forge 마켓플레이스)에 기댄다면, 데스크톱 Ubuntu 기본 설치에는 둘 다 없다 — 감지해 준비물로 보이거나 wget 등으로 대체해야 한다.
  Evidence: e2e-desktop 깨끗한 컨테이너 `env.log`의 `curl: 없음`, `git: 없음`(데스크톱 기본 구성을 따라 일부러 뺌).

<!-- followup: fu-6f1dafa02d5b | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: taken | taken: 16 -->
- [설치] 직후 자동 재확인이 node를 아직 없는 것으로 보여, [다시 확인]을 눌러야 띠가 사라졌다(WSL1 VM). 확인 호출 자체는 정상(같은 방식으로 v22.20.0) — 설치 직후 재확인의 시점·캐시를 살펴볼 것.
  Evidence: S5 VM 스크린샷 '필요: node 22 이상 / ✓ node 22 이상 설치됨' 뒤 [다시 확인]으로 띠 사라짐.

<!-- followup: fu-62d8e42c3b92 | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: dismissed | taken: - -->
- Windows 콘솔 창 깜빡임을 실제 x64 Windows PC(또는 빠른 VM)에서 사람이 확인 — CREATE_NO_WINDOW는 넣었지만 ARM VM이 느려 판단하지 못했다.
  Evidence: S5에서 사용자 "버벅거려서 잘모르겠음".
  Dismissed 2026-10-31(task 27, 사람 결정): Electron 앱으로 바뀐 뒤 4/6 Windows VM UAT에서 "콘솔 창 깜빡임 없음" 확인(ARM VM, x64 실기기는 아님).

<!-- followup: fu-b9bbeaeaac9c | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: taken | taken: 17 -->
- Linux·WSL에도 jq를 내장할지 — 지금은 있으면 쓰고 없으면 세션별 모델 표시만 빠진다(README에 명시). macOS처럼 정적 jq를 넣으면 준비 없이 모델 표시가 된다.
  Evidence: 상태줄 래퍼가 `command -v jq`일 때만 모델 기록(session.rs STATUSLINE_SCRIPT).

<!-- followup: fu-3c1e7a9d52b4 | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: dismissed | taken: - -->
- e2e-desktop의 `specFileRetries: 1`이 상태를 남기는 시나리오(linux.mjs — [설치]가 이미 끝남)를 처음부터 다시 돌려, 진짜 실패 하나가 ①~⑤의 가짜 실패 5개로 불어난다. 재시도를 끄거나 재시도 전에 상태를 되돌릴지 정할 것.
  Evidence: run 40659185281 Linux 잡 — 첫 시도 ①~⑤ 통과·⑥만 실패, 재시도에서 `.band.top` 없음으로 ①②③⑤ 실패.
  Dismissed 2026-10-31(task 27, 사람 결정): e2e-desktop 하네스를 5/6에서 지웠다. 뒤를 이은 electron.yml은 재시도를 끈다(첫 시도만 본다).

<!-- followup: fu-8e4b2f61c07a | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- `scripts/check-release.sh`가 커밋 안 된 버전 변경(작업본 버전 ≠ HEAD 버전)을 만나면 "같은 버전: 커밋 없이 태그만" 실패 대신 "먼저 커밋하세요"로 바로 알려 주게 할 것 — 같은 함정을 task 9·16·17에서 세 번 밟았다.
  Evidence: 이번 run의 커밋 전 실행 1건 실패 → 커밋 후 실패 0; task 16 회고 "커밋한 뒤 돌린다".

<!-- followup: fu-a0781a23120b | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
입력 대기 알림을 Node 전환 뒤 따로 만든다 — 브라우저 Notification API(창 닫으면 없음)와 상주 서버의 OS 알림(osascript·PowerShell 토스트·notify-send, 창 닫아도 옴) 중 고른다. 전환 중에는 탭 제목 표시뿐이다.

<!-- followup: fu-f1485aa3da66 | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 재접속 재생이 출력 꼬리 256K자를 임의 위치에서 잘라 보내, 처음에만 켜는 터미널 모드(브래킷 붙여넣기 `?2004h` 등)가 새 화면에 빠지고 이스케이프 중간부터 찍힐 수 있다. 서버 쪽 헤드리스 터미널(@xterm/headless + serialize)로 화면 상태를 재생할지 정할 것.
  Evidence: 리뷰 minor `server/session.js:165`, 실제 claude로는 미측정(가설).

<!-- followup: fu-346fc55b4bce | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 같은 세션을 크기가 다른 탭 두 개로 보면 마지막 resize가 이겨 다른 탭이 깨진다(tmux는 클라이언트별로 맞춰 줬다). 최소 크기로 맞출지, 마지막 입력 화면 기준으로 할지 정할 것.
  Evidence: 리뷰 minor `server/session.js:309`.

<!-- followup: fu-51f9957b2a4b | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 웹소켓만 끊긴 뒤 1초 재접속 전에 친 키가 `term_open`보다 먼저 가서 버려지고, 그 사이 놓친 `snapshot`은 다시 받지 않아 보드가 다음 변경까지 옛 상태다. 재접속 때 `term_open`·`list_projects`를 큐보다 먼저 보내게 할 것.
  Evidence: 리뷰 minor `src/lib/api.ts:14`, S5 보고.

<!-- followup: fu-793f8d367810 | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- macOS·Linux에서 claude 실행 파일을 못 찾으면 node-pty가 오류를 던지지 않아 세션이 바로 '종료'로만 보이고 이유가 안 나온다. 시작 직후 종료 코드·출력을 화면에 보여 줄 것.
  Evidence: S4 보고.

<!-- followup: fu-3ab96996279c | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 테스트용 `ANVIL_CLAUDE` 환경변수(claude 대신 띄울 실행 파일)를 운영 서버도 읽는다. 자동 시작(2/4) 환경에서 남겨 둘지, 테스트 전용으로 좁힐지 정할 것.
  Evidence: `server/session.js` S4 보고.

<!-- followup: fu-9c2e41d7a0b3 | source: node-web-app-1of4 | task: 18 | date: 2026-10-30 | status: open | taken: - -->
- 터미널에서 한글 글자 사이가 벌어져 보인다(`안 녕 하 세 요`). xterm은 한글에 2칸(12px Menlo 기준 ≈14.4px)을 주는데 대체 한글 글꼴의 글자 폭이 그보다 좁다. 2칸 폭에 맞는 한글 고정폭 글꼴(예: D2Coding 웹폰트 동봉)을 쓸지 정할 것.
  Evidence: UAT 화면(2026-10-30), 같은 xterm 설정을 Playwright Chromium과 WebKit에 그려 둘 다 같은 간격 — 전환 전 설정 그대로라 이번 전환의 회귀는 아님(추론: WebKit ≈ Tauri WKWebView).

<!-- followup: fu-c4a87e2d5f10 | source: node-web-app-1of4 | task: 18 | date: 2026-10-30 | status: dismissed | taken: - -->
- ADR이 "원하면 PWA로 설치한다"를 독립 앱 대체로 적었지만 1~4/4 어디에도 PWA(manifest·아이콘) 작업이 없다. 실행마다 새 토큰이라 자동 시작·재부팅 뒤 설치된 PWA 창이 매번 "주소를 다시 여세요"가 된다 — 토큰 정책(데이터 폴더 토큰 재사용 등)과 함께 2/4에 넣을지 정할 것.
  Evidence: 계획·ADR grep에서 PWA 작업 없음(2026-10-30), `static/`에 `favicon.png`만 있음; 재시작 401 동작은 리뷰 major 3.

<!-- followup: fu-d62d1b3a8c57 | source: electron-app-1of6 | task: 19 | date: 2026-10-30 | status: open | taken: - -->
- 서버 포트가 4517로 고정돼, 같은 Mac의 다른 사용자(빠른 사용자 전환으로 둘 다 Anvil을 쓸 때 포함)나 다른 프로세스가 먼저 잡으면 앱이 20초 기다린 뒤 오류만 띄운다. 앱이 띄우는 서버는 EADDRINUSE면 임의 포트로 열고 `server.json`에 적게 할지 정할 것. 브라우저·vite 개발 경로는 고정 포트를 쓴다.
  Evidence: S6 보안 리뷰 minor 3, `server/main.js` 포트 고정, `electron/main.js` `ensureServer`.

<!-- followup: fu-d1ed03e60db1 | source: electron-app-1of6 | task: 19 | date: 2026-10-30 | status: open | taken: - -->
- 등록한 저장소의 `.forge/*.md`를 `marked` → `{@html}`로 정제 없이 그린다. 스크립트는 CSP가 막지만, 속이는 HTML(가짜 버튼·링크)은 그대로 보인다. DOMPurify 같은 정제기를 넣을지 정할 것.
  Evidence: S6 보안 리뷰 major 2의 관련 항목, `src/routes/+page.svelte:353,658`. 이번 변경 전부터 있던 것.

<!-- followup: fu-99935ba0c75e | source: electron-app-1of6 | task: 19 | date: 2026-10-30 | status: open | taken: - -->
- `cargo test`의 `session::tests::hook_notifies_only_when_app_is_off_wsl_and_mac`이 간헐 실패한다(5번 중 2번, 3번 중 1번). 백그라운드 알림을 300ms만 기다리기 때문이다. Tauri는 6/6에서 걷어 내므로 그때까지 DoD의 "cargo test 통과"를 이 테스트를 빼고 판정할지 정할 것.
  Evidence: 실측 2026-10-30, `src-tauri/src/session.rs:794`.

<!-- followup: fu-b33fc769ce27 | source: electron-app-1of6 | task: 19 | date: 2026-10-30 | status: open | taken: - -->
- 패키징된 앱 점검(설치된 바이너리로 asar 속 `server/main.js` 기동 → `hooks.json`의 훅 명령 실행 → node-pty 생성)을 스크립트로 레포에 넣고, 5/6 릴리스 CI에서 세 OS 산출물에 돌릴 것. 이번에는 임시 스크립트로만 했다.
  Evidence: S5에서 `ENOTDIR`(`server/pty.js` asar 경로)를 이 점검으로만 잡았다. `npm run test:app`은 개발 실행(`electron/main.js`)만 띄운다.

<!-- followup: fu-7bd37db61af3 | source: electron-app-2of6 | task: 20 | date: 2026-10-31 | status: open | taken: - -->
- claude가 작업하는 도중(세션 상태 「작업 중」)에 서버가 꺼진 뒤 복구하면, 끊긴 응답이 화면에서 티 나는지 확인하지 못했다. 티 나지 않으면 「복구됨 — 끊긴 작업이 있었습니다」 같은 표시를 작은 작업으로 넣을지 정할 것.
  Evidence: 2/6 계획 '하지 않을 것'(UAT 뒤 판단으로 미룸). 에이전트 UAT는 입력 대기 상태에서만 끊었다(`.forge/verify/electron-app-2of6/261031-011305/result.txt`).
  2026-10-31: 실제 재부팅 뒤 세션 복구는 사람이 확인함 — 남은 것은 작업 중에 끊긴 경우뿐. 재부팅 때 claude가 서버보다 먼저 끝나면 목록에서 빠지던 틈은 봉인 뒤 바로 고쳤다(`server/session.js` onExit: 신호·종료 코드 128 이상이면 목록에 남김, `server/test/restore.test.js`).

<!-- followup: fu-2c6e81f04a9d | source: electron-app-3of6 | task: 21 | date: 2026-10-31 | status: open | taken: - -->
- 화면 전체가 좁은 폭(360px)에서 가로로 넘친다(보드만 있을 때도 문서 폭 987px, 본문 752px). 데스크톱 앱 창 최소 크기를 정할지, 사이드바를 접는 좁은 배치를 만들지 정할 것.
  Evidence: 2026-10-31 Playwright 360×720 측정(`section.main` 752px, `aside` 208px).

<!-- followup: fu-c3a3fcbe8a0d | source: electron-app-3of6 | task: 21 | date: 2026-10-31 | status: open | taken: - -->
- UAT 뒤에 고친 "개발자 도구 설치 창 앞으로 가져오기·[설치] 안내"를 실제 화면으로 확인하지 못했다. 다음 VM UAT(4/6 또는 5/6 릴리스 확인) 때 깨끗한 macOS 복제본에서 설치 창이 앞에 뜨는지와 「준비 중」에 안내가 보이는지 함께 볼 것.
  Evidence: VM `anvil-3of6`에는 수정 전 빌드가 들어 있었다(run.md 「UAT에서 나온 것」). 수정은 `server/test/deps.test.js`로만 확인.

<!-- followup: fu-5e0a7d31c4b2 | source: electron-app-4of6 | task: 22 | date: 2026-10-31 | status: open | taken: - -->
- CI에서 세 OS 모두 가끔 Electron 앱이 `app.quit` 뒤 30초가 지나도 끝나지 않았다(주 프로세스·렌더러·서버 자식이 그대로). 화면 코드에 `beforeunload`는 없다. 스모크는 경고 뒤 강제 종료로 넘어간다 — 실제 앱에서도 창을 닫거나 Cmd+Q 뒤 프로세스가 남는지 원인을 찾을 것.
  Evidence: CI `41180387338` macOS 잡 로그의 남은 프로세스 목록(14327 Electron·렌더러·server/main.js), Windows `⚠ … 강제로 끝낸다` 로그. 이 Mac 로컬은 7번 중 1번. Windows VM에서 사람이 창을 닫은 두 번은 재현되지 않았다.

<!-- followup: fu-c2e1e4da6e4c | source: electron-app-4of6 | task: 22 | date: 2026-10-31 | status: open | taken: - -->
- Windows 설치 파일이 x64 하나뿐이라(`electron-builder.yml` `arch: x64`) ARM64 Windows에서는 에뮬레이션으로 돈다. 그 안에서 부른 claude 설치도 x64판(`claude-2.1.316-win32-x64.exe`)을 깔았다. 동작은 했지만 느릴 수 있다 — arm64 빌드를 함께 낼지(또는 universal) 정할 것.
  Evidence: Windows VM UAT 2026-10-31, `anvil-4of6b` 프로세스 목록의 `claude-2.1.316-win32-x64.exe`, Git은 arm64판(`Git-2.56.0.4-arm64.exe` — winget이 OS 아키텍처를 따름).

<!-- followup: fu-fac8aae17bea | source: electron-app-6of6 | task: 24 | date: 2026-10-31 | status: open | taken: - -->
- macOS CI 앱 스모크에서 다시 연 두 번째 앱이 창을 열지 못하고(`activate` 직후 `firstWindow` 30초 초과) 그대로 꺼지지 않았다. 짐작: 창 열기가 실패하면 `fail()`이 띄우는 `dialog.showErrorBox`가 앱을 붙잡아 종료까지 막는다(`electron/main.js` `fail`). 열기 실패의 원인과, 오류 창이 테스트·실제 앱 종료를 막는지 확인할 것. fu-5e0a7d31c4b2(`app.quit` 뒤 안 꺼짐)와 함께 볼 것.
  Evidence: run `41205397359` 시도 1 macOS 잡 — `▶ 5. 다시 실행` 뒤 90초 만에 `F`·`Worker teardown timeout of 60000ms exceeded`. 시도 2에서는 통과.
