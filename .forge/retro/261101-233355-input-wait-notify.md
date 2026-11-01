# 2026-11-01 — 입력 대기 알림 · Windows·Linux 트레이 상주 (작업 #26)

## 계획 대비 실제
- 계획대로 된 것: 상태 전이 판정·문구는 순수 함수(`electron/notify.js`)로 떼어 `node --test`로 확인했다. 주 프로세스가 `sessions/`를 직접 지켜보는 구조, 포커스 억제, Windows·Linux 트레이 상주와 첫 안내가 그대로 들어갔다. 세 OS CI가 통과했고, macOS·Windows는 사람이 화면으로 확인했다(Windows는 알림 누르기 → 그 프로젝트 창, 트레이 [끝내기]까지).
- 어긋난 것: ① macOS에서 서명 없는(ad-hoc) Electron 알림이 권한 창도 없이 거절됐다(`UNErrorDomain 1` / `Notifications are not allowed for this application`, 새 번들 ID로도 같음). 그래서 계획의 대비책 `osascript`로 갔고, macOS 알림은 눌러도 Anvil로 오지 않는다. ② 알림 언어는 화면 설정이 아니라 OS 언어를 따른다. ③ `icons/`가 패키지에 없어 `electron-builder.yml` `files`에 추가해야 했다. ④ 토큰 주소(`/?token=`)의 302가 쿼리를 버려, 알림으로 고른 프로젝트는 주소가 아니라 preload(`take-project`)로 넘겼다. ⑤ Ubuntu UAT는 VM이 없고 Linux 산출물이 x86_64 AppImage라 사람 결정으로 건너뛰었다(fu-f6b74be03164).

## 배운 것
- 다음에 다르게 할 것:
  - macOS에서 Electron OS 기능(알림 등)을 쓰기 전에, ad-hoc 서명 본체로 작은 실험 앱을 먼저 돌려 본다. 이번에도 S1 실험 덕에 구현 전에 경로를 정했다. 번들 ID를 바꿔 다시 서명해 보면 "예전에 꺼 둔 설정"과 "서명 문제"를 가를 수 있다.
  - 주 프로세스에서 쓸 서버 코드는 node-pty 같은 무거운 import가 딸려 오는지 먼저 본다(`server/session.js` → `server/names.js`로 뗌).
  - 앱이 새 파일(아이콘 등)을 런타임에 읽으면 `electron-builder.yml` `files`에 들어 있는지 같은 조각에서 확인한다. 개발 실행과 앱 테스트는 레포 전체를 보므로 이 누락을 잡지 못한다.
  - 상태 파일을 연달아 바꿔 알림을 다시 띄울 때는 감시의 150ms 묶음 처리 때문에 「작업 중」과 「입력 대기」 쓰기를 따로(간격을 두고) 해야 한다.
  - Linux UAT는 이 Mac(Apple Silicon)에서 x86_64 AppImage를 돌릴 수 없다. Linux 화면 확인이 DoD에 들어가면 계획 단계에서 VM과 아키텍처부터 확인한다.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: `.forge/adr/261101-233530-input-wait-notify-in-app.md`(입력 대기 알림은 앱 주 프로세스가, Windows·Linux 트레이 상주, macOS osascript — 사람 채택)

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
