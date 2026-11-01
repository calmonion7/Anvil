# 실행 기록 — 입력 대기 알림 · Windows·Linux 트레이 상주 (작업 #26)

실행 방식: 이 세션에서 직접(워크플로 없음). S1이 "macOS 알림이 화면에 뜨는지" 사람이 보는 확인이라, 중간에 사람 입력을 받을 수 없는 자동 워크플로에 맞지 않았다.

## 조각별 결과
- S1 macOS 알림 실측 — ⚠ Electron 알림이 실패해 macOS는 `osascript`로 간다(계획의 대비책). macOS에서는 알림을 눌러도 그 프로젝트로 가지 않는다.
- S2 판정·문구 모듈 `electron/notify.js` + `server/test/notify.test.js` — ✅ 계획대로. `sessionName`은 `server/names.js`로 떼어 냈다(주 프로세스가 node-pty 없이 쓰도록).
- S3 주 프로세스 연결(감시·알림·누르면 프로젝트 고르기·AppUserModelID·훅 주석) — ⚠ 알림 언어는 화면 설정이 아니라 OS 언어(`app.getLocale()`)를 따른다.
- S4 Windows·Linux 트레이 상주 + 첫 안내 + 앱 테스트 — ⚠ `icons/icon.png`·`icon.ico`를 `electron-builder.yml` `files`에 추가해야 했다. 종료 확인은 기존 `quitApp`(30초)을 썼다(계획은 10초).
- S5 회귀·CI·UAT — ⚠ macOS·Windows UAT는 통과했다. Ubuntu UAT는 사람 결정으로 건너뛰었다(VM 없음, x86_64 AppImage). 후속후보로 남긴다.

## 계획과 달라진 것
- **macOS 알림 경로(S1, 측정)**: 실험 앱(Electron 45.1.0 본체, ad-hoc 서명)의 `new Notification().show()`가 `failed 작업을 완료할 수 없습니다.(UNErrorDomain 오류 1.)`로 두 번 실패했다. 번들 ID를 처음 보는 값(`com.taebro.anvil.notifyspike`)으로 바꿔 ad-hoc으로 다시 서명하고 `open`으로 띄워도, 권한 창 없이 `Notifications are not allowed for this application`으로 16ms 만에 거절됐다. 그래서 "예전에 꺼 둔 설정"이 아니라 서명 없는 앱이 원인이라고 판단했다(추론). 같은 Mac에서 `osascript display notification`은 사람이 화면에서 확인했다. 계획의 대비책대로 macOS는 `osascript`(인자로 문구를 넘겨 따옴표 처리 없음)를 쓰고, 알림 아이콘은 '스크립트 편집기'로 나온다.
- **알림 언어**: 주 프로세스는 화면의 언어 설정을 모른다(창이 닫혀 있을 수 있다). 화면 기본값 `auto`와 같은 기준인 OS 언어로 정했다. 화면에서 언어를 따로 바꾼 사용자는 알림 언어가 다를 수 있다.
- **누르면 프로젝트 고르기**: 토큰 주소(`/?token=`)가 `/`로 302 넘어가며 쿼리를 버려서(`server/http.js:157`) 주소 쿼리는 쓸 수 없었다. 그래서 preload를 택했다. 주 프로세스가 고를 프로젝트를 쥐고 있다가, 화면이 열릴 때(`onMount`)나 `select-project` 신호를 받을 때 `take-project`로 한 번 가져간다.
- **처음 안내 표시**: `<데이터 폴더>/tray-notice` 빈 파일이다. 앱 테스트는 이 파일로 Windows·Linux가 트레이에 들어갔는지 본다(테스트 전용 장치 없음).
- `utmctl start anvil-26`이 `-1712`(Apple Event 시간 초과)로 두 번 실패해, 사람이 UTM 창에서 켰다(메모리에 적힌 기존 증상).

## DoD 기준값 → 실행 뒤
1. `node --test server/test/notify.test.js`: 파일 없음 → 5개 통과(`server/test/session.test.js`와 함께 14 통과).
2. `grep -c 'Tray' electron/main.js`: `0` → `4`. `grep -c '트레이' e2e-app/app.spec.ts`: `0` → `4`. 앱 테스트 「창을 닫아도 앱이 남고(트레이·Dock), 끝내기로 꺼진다」는 이 Mac과 CI 세 OS에서 통과했다(CI는 OS마다 `5 passed`).
3. 회귀 방지(이미 통과하던 항목이라 그대로인 것이 기대값): `node --test server/` pass 118 → 123(fail 0, skipped 2) · `npx playwright test` 50 passed · `npm run check` 0 오류 · `npm run test:app` 5 passed · CI `electron` run `41287674897` macOS·Ubuntu·Windows pass(PR #62).
4. 사람 UAT:
   - macOS(이 Mac 개발 실행, 임시 데이터 폴더): 다른 창이 앞일 때 `알림시험 · 계획 세션 — 입력을 기다립니다` 알림이 뜸(사람 스크린샷). Anvil 창이 앞(포커스)일 때는 뜨지 않음(사람 확인). 누르기는 `osascript`라 해당 없음.
   - Windows VM `anvil-26`(CI 설치 파일 `Anvil-0.2.0-win-x64.exe`, 조용히 설치): 창 닫기 → 트레이 아이콘과 첫 안내 알림(사람 확인). 입력 대기 알림 표시 → 누르면 `proj26`이 골라진 창(사람 확인). 트레이 메뉴 [열기]·[끝내기], [끝내기] 뒤 남은 `Anvil.exe`는 서버(`…\server\main.js`) 하나뿐(SSH 측정).
   - Ubuntu: 건너뜀(사람 결정 — 이 Mac에 Ubuntu VM이 없고 CI의 Linux 설치 파일은 x86_64 AppImage). 동작은 Linux CI 앱 테스트로만 확인했다.

## 후속 후보

<!-- followup: fu-f6b74be03164 | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- 실제 Ubuntu 데스크톱 화면에서 트레이 아이콘(AppIndicator)·첫 안내·입력 대기 알림·알림 누르기를 확인한다. 이번에는 Linux CI(xvfb)에서 "창을 닫아도 앱이 남고 `tray-notice`가 생긴다"만 봤다. 순정 GNOME에서 아이콘이 안 보이는지도 함께 본다.
  Evidence: 작업 #26 UAT — `utmctl list`에 Ubuntu VM 없음, CI 산출물 `Anvil-*-linux-x86_64.AppImage`.

<!-- followup: fu-06dd2fdd4a5c | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- macOS 입력 대기 알림은 `osascript`라 아이콘이 '스크립트 편집기'로 나오고, 눌러도 Anvil의 그 프로젝트로 가지 않는다. 서명된 앱이면 Electron 알림(UNUserNotificationCenter)이 허용되는지 확인하고, 서명·공증을 들일지 정할 것.
  Evidence: 실측 2026-11-01 — ad-hoc 서명 Electron 45.1.0이 새 번들 ID에서도 `Notifications are not allowed for this application`. `electron-builder.yml` `identity: null`.

<!-- followup: fu-d1be78e58052 | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- 입력 대기 알림 문구가 화면 언어 설정이 아니라 OS 언어(`app.getLocale()`)를 따른다. 화면에서 언어를 따로 고른 사용자를 위해, 화면이 고른 언어를 데이터 폴더에 남기고 주 프로세스가 읽게 할지 정할 것.
  Evidence: `electron/main.js` `en()`, 화면 `src/lib/i18n.svelte.ts:16`(`auto`일 때만 OS 언어).
