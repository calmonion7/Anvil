<!-- forge-slug: input-wait-notify -->
<!-- task: 26 -->
<!-- tdd: off -->
<!-- followup-id: fu-a0781a23120b -->
# 입력 대기 알림 — 앱이 켜져 있을 때 OS 알림, Windows·Linux는 창을 닫으면 트레이에 상주

## 목표 / 하지 않을 것
- 목표: claude 세션이 「입력 대기」로 바뀌면 데스크톱 앱이 OS 알림을 띄운다. 알림을 누르면 그 프로젝트가 선택된 창이 열린다. 그리고 Windows·Linux에서도 창을 닫은 뒤 알림이 끊기지 않도록, 창을 닫으면 앱이 macOS의 Dock처럼 트레이에 남는다.
- 하지 않을 것:
  - 앱이 완전히 꺼진 뒤(Cmd+Q·트레이 [끝내기])의 알림. 서버나 훅이 알리는 방식은 사람이 고르지 않았다.
  - 브라우저·`dev:web` 경로의 알림. 탭 제목 `🔔 Anvil`만 그대로 둔다.
  - 알림 켜고 끄기 설정과 소리. OS의 앱별 알림 설정에 맡긴다.
  - macOS 트레이(메뉴 막대) 아이콘. macOS는 Dock이 그 역할을 한다.
  - 서명·공증, Windows arm64(fu-c2e1e4da6e4c).

## 근거
- 용어집: 없음(새 용어 없음).
- 관련 ADR: `.forge/adr/261030-005852-electron-desktop-shell.md`(창은 앱, 서버는 따로 도는 프로세스 — 앱을 꺼도 서버와 세션은 산다).
- 지금 동작(실측 2026-11-01):
  - 훅이 `<데이터 폴더>/sessions/<세션 이름>.json`에 `{state, session_id, ts}`를 쓴다(`server/hooks/anvil-hook.js`). 알림은 없다. 파일 머리 주석에 "입력 대기 OS 알림은 별도 작업"이라고 적혀 있다.
  - 서버는 같은 폴더를 `watch`해 화면에 보낸다(`server/session.js:154`). 세션 이름은 `anvil-<폴더>-<해시6>-<plan|run>`이다(`server/session.js:37` `sessionName`). 등록된 프로젝트는 `<데이터 폴더>/projects.json`에 있다.
  - 주 프로세스는 이미 데이터 폴더를 `watch`한다(`electron/main.js` `followToken`). Windows·Linux는 창을 다 닫으면 `app.quit`한다(`electron/main.js:180-182`). 렌더러의 권한 요청은 알림을 포함해 모두 거절한다(`setPermissionRequestHandler`).
  - 화면의 대기 표시: 보드 `class:wait`(`src/lib/FlowBoard.svelte:56`), 다른 프로젝트 `waitingElsewhere`(`src/routes/+page.svelte:244`), 탭 제목(`+page.svelte:295`). 선택한 프로젝트는 `localStorage`에 있다(`+page.svelte:300`).
  - 옛 Tauri 앱은 "앱이 켜져 있으면 앱이, 꺼져 있으면 훅이" 알렸다. Tauri 알림 플러그인이 macOS 27에서 무시돼 `osascript display notification`으로 바꿨다(`git show ea54c1b^:src-tauri/src/session.rs` 203-238·329-336행, 커밋 `4b086bb`).
  - macOS 앱은 서명이 없다(`electron-builder.yml:38` `identity: null`). Electron은 45.1.0이다.
- 사람이 정한 것(2026-11-01 그릴링):
  1. 알림은 **앱이 켜져 있을 때만** 띄운다. 처음에는 "꺼져 있을 때도"로 답했다가 바꿨다. 그 결과 생기는 Windows·Linux의 빈 곳은 2로 메운다.
  2. **Windows·Linux: 창을 닫으면 트레이에 상주**한다. 창은 숨기지 않고 닫아서 없앤다. 그래야 서버의 "세션도 창도 없이 5분이면 내려감" 규칙이 유지된다. 트레이 메뉴는 [열기]·[끝내기]다.
  3. **처음 트레이로 들어갈 때 안내 알림을 한 번** 띄운다(Windows·Linux). 순정 GNOME처럼 트레이가 안 보이는 환경을 위한 안전장치다. 그런 환경에서도 다시 실행(`second-instance`)하거나 알림을 누르면 창이 열린다.
  4. 알림을 띄우는 주체는 **주 프로세스**다. `sessions/`를 직접 지켜보다가 상태가 다른 값에서 `waiting`으로 **바뀌는 순간에만** 띄운다. 이미 `waiting`인데 또 온 `Notification` 훅은 무시한다. 화면(렌더러)에서 IPC로 받는 방식은 쓰지 않는다. macOS에서 창을 닫아 Dock에만 있을 때 끊기기 때문이다.
  5. **포커스된 Anvil 창이 있으면 띄우지 않는다.** 창이 없거나, 최소화했거나, 다른 앱이 앞에 있을 때만 띄운다.
  6. 문구: 제목 `Anvil`, 본문 `<폴더 이름> · 계획 세션 — 입력을 기다립니다`(실행 세션이면 `실행 세션`). 영어는 앱의 `tr` 규칙을 따른다. **누르면** 창을 열거나 앞으로 가져오고, 그 프로젝트를 선택한다.
  7. TDD 끔.
- 알려진 함정(추론, 실측 전):
  - 서명 없는 macOS 앱에서 Electron `Notification`이 실제로 화면에 뜨는지 모른다(옛 Tauri 함정). 안 뜨면 macOS만 `osascript`로 대신 띄운다. 이 경우 "누르면 그 프로젝트로"는 macOS에서 빠진다. run 기록에 남기고 사람에게 알린다.
  - Windows 토스트는 AppUserModelID가 맞아야 뜬다(`app.setAppUserModelId`, 설치판은 electron-builder가 바로가기에 `appId`를 넣는다).
  - Linux 알림은 알림 데몬(libnotify)이 있어야 뜨고, 트레이는 AppIndicator가 있어야 보인다. 데스크톱 Ubuntu는 둘 다 기본으로 있다.
  - 트레이를 넣으면 앱이 꺼지는 경로가 바뀐다. 지난 작업 #25의 교훈대로, 종료를 붙잡는 것이 없는지 `app.quit` 테스트로 본다(`.forge/retro/261101-142351-app-quit-hang.md`).
- 완료 정의(DoD):
  1. `node --test server/test/notify.test.js` 통과. 순수 함수 두 가지를 확인한다.
     - 상태 전이 판정: `working→waiting`은 알림, `waiting→waiting`은 무시, 처음 본 세션이 `waiting`이면 알림, 포커스된 창이 있으면 무시.
     - 세션 이름 → 프로젝트·역할·문구 변환: 등록된 프로젝트에 `sessionName` 규칙을 적용해 찾고, 모르는 이름은 무시.
     - 사전 상태(실측 2026-11-01): 파일 없음(`ls server/test/notify.test.js` → No such file). 전진 검사.
  2. `grep -c 'Tray' electron/main.js` → 1 이상, `grep -c '트레이' e2e-app/app.spec.ts` → 1 이상. 앱 테스트에서 Windows·Linux 창을 닫으면 앱 프로세스가 남아 있고 트레이가 있으며, 트레이 [끝내기](같은 함수 호출)로 10초 안에 꺼진다. macOS에서는 창을 닫아도 남는 기존 동작을 확인한다.
     - 사전 상태: 둘 다 `0`. 전진 검사.
  3. 회귀 방지: `node --test server/`(사전 상태: pass 118 · fail 0 · skipped 2 — 이미 통과하는 회귀 방지 항목) · `npx playwright test` · `npm run check` · `npm run test:app` · 세 OS CI `electron` 통과.
  4. 사람 UAT(화면 판단, VM은 SSH 자동화로 띄우고 사람은 보기만 — 메모리 「VM test automation」):
     - macOS(이 Mac 설치판): 다른 앱을 쓰는 중에 대기 알림이 뜨고, 누르면 그 프로젝트 창이 열린다. 창에 포커스가 있으면 뜨지 않는다.
     - Windows VM: 창을 닫으면 트레이 아이콘이 생기고 처음 한 번 안내가 뜬다. 그 상태에서 대기 알림이 뜨고, 누르면 그 프로젝트 창이 열린다. 트레이 [끝내기]로 꺼진다.
     - Ubuntu VM: Windows와 같은 항목.

## 작업 조각
- [ ] S1. **macOS 알림 실측** — 서명 없는 작은 실험 앱(`node_modules/electron/dist/…` 본체를 직접 띄움)으로 Electron `Notification`이 화면에 뜨는지, 눌렀을 때 `click`이 오는지 사람이 본다. 처음 권한 요청이 뜨는지도 본다. 완료 기준: 뜸/안 뜸과 그에 따른 macOS 경로(Electron 알림 또는 `osascript`)가 run 기록에 있다.
- [ ] S2. **알림 판정·문구 모듈** (depends: S1) — `electron/notify.js`에 상태 전이 판정과 세션 이름 → 프로젝트·문구 변환을 순수 함수로 만든다. `sessionName`은 `server/session.js`의 것을 그대로 쓴다. 완료 기준: DoD 1.
- [ ] S3. **주 프로세스 연결** (depends: S2) — `electron/main.js`가 `<데이터 폴더>/sessions/`를 지켜보다가 S2의 판정대로 알림을 띄운다. 누르면 창을 열고 그 프로젝트를 선택한다. 선택을 화면에 넘기는 방식은 실행 때 정한다(주소 쿼리나 preload 중 작은 쪽). Windows는 AppUserModelID를 둔다. 훅 머리 주석의 "별도 작업" 문장을 지금 사실로 고친다. 완료 기준: 이 Mac 개발 실행(`npm run dev:app`)에서 가짜 상태 파일로 알림과 누르기를 확인하고 run 기록에 남긴다.
- [ ] S4. **Windows·Linux 트레이 상주** — 창을 다 닫으면 `app.quit` 대신 트레이를 만든다(이미 있으면 그대로). 트레이 메뉴는 [열기]·[끝내기]이고 아이콘은 `icons/` 것을 쓴다. 처음 트레이로 들어갈 때 안내 알림을 한 번 띄우고, 띄웠다는 표시는 데이터 폴더에 남긴다. 앱 테스트를 넣는다. 완료 기준: DoD 2.
- [ ] S5. **회귀와 UAT** (depends: S3, S4) — 회귀 묶음과 세 OS CI를 돌리고 macOS·Windows·Ubuntu 사람 UAT를 한다. 완료 기준: DoD 3·4.

## 진행 메모
- 작업 브랜치: `input-wait-notify`(origin/main `ab03adc`에서 만듦). 후속후보 원장의 `taken` 표시 커밋도 이 브랜치에 있다. 따로 머지하지 않고 작업과 한 PR로 합친다.
