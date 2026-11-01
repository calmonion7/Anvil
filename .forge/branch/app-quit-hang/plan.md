<!-- forge-slug: app-quit-hang -->
<!-- task: 25 -->
<!-- tdd: on -->
<!-- followup-id: fu-5e0a7d31c4b2 -->
<!-- followup-id: fu-fac8aae17bea -->
<!-- playbook: bug-fix -->
<!-- eval: S1 -->
# 앱이 열기 실패·종료 때 멈추지 않게 하고 원인 찾기

## 목표 / 하지 않을 것
- 목표: 창 열기가 실패해도 데스크톱 앱이 오류를 남기고, 사람이 누르지 않아도 꺼질 수 있게 한다. 그 로그로 CI에서 가끔 앱이 멈추던 원인(fu-5e0a7d31c4b2 `app.quit` 뒤 안 꺼짐, fu-fac8aae17bea 다시 연 앱이 창을 못 열고 멈춤)을 찾고, 작으면 고친다. 고친 뒤에는 테스트 도우미가 강제 종료를 실패로 낸다.
- 하지 않을 것: 포트 고정 문제 자체의 해결(fu-d62d1b3a8c57 — 임의 포트), 업데이터·세션 복구 변경, 대기 시간(`BOOT_TIMEOUT` 20초) 변경, 테스트 전용 환경변수 추가.

## 근거
- 용어집: 없음(새 용어 없음).
- 관련 ADR: `.forge/adr/261030-005852-electron-desktop-shell.md`(창은 앱, 서버는 따로 도는 프로세스 — 앱을 꺼도 서버는 산다).
- 지금 동작(실측 2026-11-01): `electron/main.js:116-119` `fail()`이 `dialog.showErrorBox`만 부른다. 이 창은 누를 때까지 주 프로세스를 붙잡는다(추론 — Electron 동기 호출). 오류 내용은 어디에도 남지 않는다. `ensureServer`는 서버가 20초 안에 안 뜨면 던진다(`electron/main.js:41`). 서버는 포트가 이미 쓰이면 `EADDRINUSE`로 끝난다(`server/main.js:32`).
- 원인 후보(짐작): fu-fac8aae17bea의 시간(다시 실행 → 30초 창 시간 초과 → 60초 정리 시간 초과)은 「다시 연 앱이 살아 있는 서버 확인(`server/instance.js` `running()`, 3초 제한)에 실패 → 새 서버를 띄움 → 같은 포트라 `EADDRINUSE` → 20초 뒤 `fail()` → 오류 창이 앱을 붙잡음」과 맞는다. fu-5e0a7d31c4b2는 종료 도중의 어떤 열기(`followToken`·`activate`)가 실패해 같은 오류 창이 떴다면 설명된다.
- 사람이 정한 것(2026-11-01 그릴링): ① 한 계획에 진단까지. ② 실패 동작 — 오류는 늘 표준 오류와 `<데이터 폴더>/app.log`에 남긴다. 앱을 끄는 중(`before-quit` 뒤)의 오류는 창 없이 남기기만 하고 그대로 꺼진다. 시작 때의 실패는 앱을 붙잡지 않는 오류 창(`dialog.showMessageBox`)을 보이고, 그 창을 닫거나 `app.quit`이 오면 끝난다. ③ 재현은 포트 선점(테스트 전용 장치 없음, 20초 대기 그대로). ④ 진단 끝 = 원인을 로그 증거로 찾거나, 이 Mac `npm run test:app` 10번 + CI `electron` 워크플로 3번 모두 강제 종료·열기 실패 0. 그 뒤 테스트 도우미는 강제 종료를 테스트 실패로 낸다. ⑤ TDD 켬.
- 로그에 남기는 오류 문장에 서버 주소가 들면 `token=` 값을 가린다(`server.log` 첫 줄처럼 이 사용자만 읽는 파일이지만, CI 로그에는 표준 오류가 그대로 찍힌다).
- 완료 정의(DoD):
  1. 재현 테스트(eval): `npx playwright test -c playwright.app.config.ts -g '열기 실패'` — 포트를 잡아 둔 채 앱 실행 → `app.log`·표준 오류에 「서버가 뜨지 않았습니다」 → 오류 창이 떠 있어도 `app.quit`이 10초 안에 앱을 끝낸다(강제 종료 없이).
     - 사전 상태(실측 2026-11-01): 테스트 없음(`grep -c '열기 실패' e2e-app/app.spec.ts` → `0`). 테스트를 먼저 써서 지금 코드로 실패(빨강)를 본 뒤 고친다(초록).
  2. `grep -c 'showErrorBox' electron/main.js` → `0`.
     - 사전 상태: `1`. 전진 검사.
  3. 진단 기록: 이 Mac `npm run test:app` 10번과 CI `electron` 워크플로 3번(`workflow_dispatch`)의 강제 종료 수·`app.log` 열기 실패 줄이 run 기록에 있다. 원인을 찾았으면 증거(로그 줄)와 함께, 못 찾았으면 13번 모두 0이라는 기록.
  4. 테스트 도우미 `quitApp`(`e2e-app/app.spec.ts`)이 강제 종료를 하면 그 테스트가 실패한다(지금은 경고 뒤 통과).
     - 사전 상태: 경고 뒤 통과. 전진 검사.
  5. 회귀 방지: `node --test server/` · `npx playwright test` · `npm run check` · `npm run test:app` · 세 OS CI `electron` 통과.

## 작업 조각
- [ ] S1. **오류를 남기고 앱이 멈추지 않게** — `fail()`을 위 ② 동작으로 바꾼다(표준 오류 + `app.log`, 종료 중엔 창 없음, 시작 때는 앱을 붙잡지 않는 창). 재현 테스트를 먼저 쓴다. 완료 기준: DoD 1(빨강 → 초록)·2.
- [ ] S2. **원인 진단** (depends: S1) — S1이 든 빌드로 이 Mac에서 `npm run test:app`을 10번, CI `electron` 워크플로를 3번 돌려 강제 종료와 `app.log`를 모은다. 완료 기준: DoD 3.
- [ ] S3. **원인 고치기와 강제 종료를 실패로** (depends: S2) — 원인을 찾았고 작으면 실패하는 테스트를 먼저 쓰고 고친다. 크면 새 후속 후보로 남긴다. 그 뒤 `quitApp`이 강제 종료하면 테스트를 실패시키게 바꾼다. 완료 기준: DoD 4·5(원인을 고쳤다면 그 테스트도 빨강 → 초록).
