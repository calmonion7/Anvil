# 실행 기록 — Electron 창으로 이 Mac에서 Anvil 열기 (데스크톱 앱 1/6)

실행 방식: 워크플로 없이 이 세션이 직접 실행했다. 조각이 S1 → (S2·S3) → S4 → S5로 거의 한 줄로 이어졌고, S1처럼 실측해서 정할 부분이 많았기 때문이다. S6 보안 리뷰만 적대적 리뷰 에이전트 하나에 맡겼다. 계획에 `tdd: on`이 있어 조각마다 실패하는 테스트를 먼저 썼다. S4는 `electron/main.js`를 먼저 쓰고 스모크를 뒤에 썼다. 대신 토큰 감시를 빼는 변이 검사로 스모크가 실패하는 것을 확인했다.

## 조각별 결과
- S1 Electron 안의 Node로 서버 돌리기 — ⚠ node-pty를 다시 빌드할 필요가 없었다. 1.1.0이 N-API prebuild라 Electron 45(Node 24.22.1)에서 그대로 불러진다(실측). 그래서 `@electron/rebuild`도, ABI별 산출물 분리도 넣지 않았다. `server/test/electron.test.js`가 Electron 런타임에서 `pty.test.js`·`session.test.js`·`server/main.js`를 돌린다.
- S2 단일 실행·서버 정보 파일·유휴 종료 — ✅ 계획대로. 더해서: 토큰 파일을 포트를 잡은 **뒤에** 쓰게 고쳤다. 전에는 포트를 못 잡은 두 번째 서버가 살아 있는 서버의 토큰을 덮었다. `server/instance.js`(정보 파일·`running()`), `ANVIL_IDLE_MS`(기본 5분, `0`이면 끔)를 만들었다. `npm run dev:web`은 유휴 종료를 끈다.
- S3 forge 훅용 `node` 대체 실행 파일 — ✅ 계획대로(`server/env.js` `setupNode`). 훅·상태줄 명령도 이 파일로 돌고, 세션 환경에서는 `ELECTRON_RUN_AS_NODE`를 지운다. 준비물 확인의 `node`도 Electron 안의 node로 채워진다.
- S4 Electron 주 프로세스 — ✅ 계획대로. 더해서: 단일 인스턴스 잠금과, 앱이 띄운 서버의 출력을 `server.log`(600)에 남기는 것.
- S5 mac 패키징·개발 실행 — ⚠ 패키징된 앱에서 서버가 바로 죽었다. `server/pty.js`가 asar 안 경로의 `spawn-helper`에 chmod하다 `ENOTDIR`가 났다. node-pty처럼 `app.asar.unpacked` 경로를 보게 고쳤다. `npm run dev:app`·`test:app`·`dist:mac`과 README 두 줄을 더했다.
- S6 보안 리뷰 — ⚠ major 2·minor 2. major 2건과 minor 1건은 고쳤고, minor 1건은 후속 후보로 넘겼다(아래).

## 계획 밖 변경
- `vite.config.js`에서 `@ts-expect-error`를 지웠다. electron-builder가 `@types/node`를 같이 끌어와 지시문이 "쓰이지 않음" 오류가 됐다(DoD 4).
- `server/test/session.test.js`의 재생 테스트에 있던 경쟁 상태를 고쳤다. 가짜 claude가 훅을 부른 뒤에야 `ready>`를 찍기 때문이다. 변경 전 코드에서도 10번 중 4번 실패했고(실측), 고친 뒤에는 10번 중 0번 실패했다. 가짜 claude 래퍼는 Electron 런타임에서도 node로 돌게 `ELECTRON_RUN_AS_NODE=1`을 직접 붙이고, 받은 값은 `FAKE_RUN_AS_NODE`에 남긴다.
- `server/API.md`에 단일 실행·유휴 종료·`/instance`·데이터 폴더의 새 파일을 적었다.

## 보안 리뷰(S6) 처리
- major — 낡은 `server.json`의 포트를 다른 사용자가 잡으면 앱이 가짜 화면에 붙어 입력을 뺏길 수 있었다. 두 가지로 고쳤다. EPERM pid는 살아 있지 않은 것으로 본다. 그리고 토큰을 보내지 않는 확인(`GET /instance?nonce=` → `HMAC(token, nonce)`)을 통과해야 붙는다. 테스트: 가짜 서버가 있으면 붙지 않고 토큰도 받지 못한다.
- major — 권한 요청 처리기가 없어 문서 속 iframe이 권한을 자동으로 얻을 수 있었다. 모든 권한 요청·검사를 거절하고, CSP에 `frame-src 'none'`을 더하고, 하위 프레임이 출처 밖으로 이동하는 것을 막았다. 테스트: CSP 헤더 검사.
- minor — 설치된 앱에서는 `ANVIL_DEV_URL`을 읽지 않게 했다(`app.isPackaged`).
- minor(후속으로) — 고정 포트 4517을 다른 사용자가 잡으면 앱을 쓸 수 없다. 임의 포트로 바꾸면 vite 프록시와 브라우저 접속 규약이 바뀌는 설계 변경이라 이번에는 하지 않았다.

## DoD 기준선 → 실행 뒤
1. `node --test server/`: 71/71 → 82/82 통과(새 테스트: 단일 실행·유휴 종료 2·서버 정보 파일·낡은 정보 파일·가짜 서버·node 대체 실행 파일 2·Electron 런타임 3).
2. `npx playwright test`: 43 passed → 43 passed. 미리 통과하던 회귀 방지 검사라 그대로인 것이 정상이다.
3. Electron 스모크 `npm run test:app`: 없음 → 1 passed. 앱을 끈 뒤에도 서버가 살아 있고, 다시 열면 같은 서버에 붙고, 서버가 재시작돼 토큰이 바뀌면 창이 다시 열린다. 토큰 감시를 빼면 401로 실패한다(변이 검사).
4. `npm run check`: 0 오류 → 0 오류(중간에 1 오류가 생겨 위처럼 고침).
5. `npm run dist:mac`: 스크립트 없음 → `dist/Anvil-0.1.8-arm64.dmg`(약 125MB)와 `.zip`. 패키징된 앱의 asar 속 서버 기동·훅 실행·pty 생성을 점검했다(실측).
6. `(cd src-tauri && cargo test)`: 기준선부터 `session::tests::hook_notifies_only_when_app_is_off_wsl_and_mac`이 간헐 실패했다(5번 중 2번). 실행 뒤에도 같은 테스트만 3번 중 1번 실패한다. `src-tauri/`는 변경 0이다. 원인은 백그라운드 알림을 300ms 기다리는 타이밍(`src-tauri/src/session.rs:794`). Tauri는 동결 대상이라 고치지 않았다.
7. UAT(이 Mac, 사람, 2026-10-30) — 통과.
   - `.dmg` 설치·열기: ✅
   - 보드·계획 세션 대화: ✅
   - Cmd+Q 뒤 다시 열면 같은 대화가 이어짐: 첫 시도 ❌ → 고친 뒤 ✅. 같은 서버(pid 50590, 서버 로그 3줄 그대로)였고, claude(pid 52572)도 살아 있었다. 설치된 앱에서도 훅이 `node` 대체 실행 파일로 돌아 상태가 `waiting`으로 기록됐다.
   - 5분 유휴 종료: 사람 세션을 끊지 않으려고 설치된 앱의 서버를 임시 데이터 폴더·포트 4597·기본 유휴 시간으로 따로 띄워 쟀다. 300.1초 뒤 종료 코드 0으로 내려갔고 `server.json`도 지웠다.

## UAT에서 나온 것
- **다시 열 때 `ERR_ABORTED (-3)` 오류창.** Finder·Dock으로 열면 macOS가 시작 직후 `activate`를 보낸다. 서버 확인을 기다리는 동안 창이 아직 없어 `open()`이 두 번 돌았고, 뒤의 `loadURL`이 앞의 것을 끊었다. 처음 실행 때는 서버를 띄우느라 순서가 달라 드러나지 않았다. 스모크에 `app.emit('activate')`를 넣어 먼저 재현하고(창이 끝내 안 뜸), 여는 중이면 같은 열기를 기다리게 고쳤다(`electron/main.js` `open`). Playwright `_electron`은 `activate`를 보내지 않아 자동 테스트로는 못 잡았다.
- 아이콘이 옛것으로 보였는데, 앱 안의 `icon.icns`는 레포의 최신 아이콘(`ba53eba`)과 해시가 같았다(실측). 잠시 뒤 제대로 보였으니 macOS 아이콘 캐시로 본다(추론).
- 사용자가 백그라운드 서버를 끄고 다시 열었더니 세션이 복구되지 않았다(세션 `ended`). 서버가 쥔 claude는 서버와 함께 끝나는 것이 1/6의 설계다. 재시작 뒤 복구는 2/6 범위다. 대화 ID는 상태 파일에 남는다.
- 직전 작업 UAT 때 띄운 옛 서버(pid 47606)가 4517을 잡고 있어, 사용자 승인을 받고 껐다.

## Follow-ups
<!-- followup: fu-d62d1b3a8c57 | source: electron-app-1of6 | task: 22 | date: 2026-10-30 | status: open | taken: - -->
- 서버 포트가 4517로 고정돼, 같은 Mac의 다른 사용자(빠른 사용자 전환으로 둘 다 Anvil을 쓸 때 포함)나 다른 프로세스가 먼저 잡으면 앱이 20초 기다린 뒤 오류만 띄운다. 앱이 띄우는 서버는 EADDRINUSE면 임의 포트로 열고 `server.json`에 적게 할지 정할 것. 브라우저·vite 개발 경로는 고정 포트를 쓴다.
  Evidence: S6 보안 리뷰 minor 3, `server/main.js` 포트 고정, `electron/main.js` `ensureServer`.

<!-- followup: fu-d1ed03e60db1 | source: electron-app-1of6 | task: 22 | date: 2026-10-30 | status: open | taken: - -->
- 등록한 저장소의 `.forge/*.md`를 `marked` → `{@html}`로 정제 없이 그린다. 스크립트는 CSP가 막지만, 속이는 HTML(가짜 버튼·링크)은 그대로 보인다. DOMPurify 같은 정제기를 넣을지 정할 것.
  Evidence: S6 보안 리뷰 major 2의 관련 항목, `src/routes/+page.svelte:353,658`. 이번 변경 전부터 있던 것.

<!-- followup: fu-99935ba0c75e | source: electron-app-1of6 | task: 22 | date: 2026-10-30 | status: open | taken: - -->
- `cargo test`의 `session::tests::hook_notifies_only_when_app_is_off_wsl_and_mac`이 간헐 실패한다(5번 중 2번, 3번 중 1번). 백그라운드 알림을 300ms만 기다리기 때문이다. Tauri는 6/6에서 걷어 내므로 그때까지 DoD의 "cargo test 통과"를 이 테스트를 빼고 판정할지 정할 것.
  Evidence: 실측 2026-10-30, `src-tauri/src/session.rs:794`.
