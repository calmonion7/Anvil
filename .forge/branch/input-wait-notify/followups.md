# Follow-ups

<!-- followup: fu-f6b74be03164 | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- 실제 Ubuntu 데스크톱 화면에서 트레이 아이콘(AppIndicator)·첫 안내·입력 대기 알림·알림 누르기를 확인한다. 이번에는 Linux CI(xvfb)에서 "창을 닫아도 앱이 남고 `tray-notice`가 생긴다"만 봤다. 순정 GNOME에서 아이콘이 안 보이는지도 함께 본다.
  Evidence: 작업 #26 UAT — `utmctl list`에 Ubuntu VM 없음, CI 산출물 `Anvil-*-linux-x86_64.AppImage`.

<!-- followup: fu-06dd2fdd4a5c | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- macOS 입력 대기 알림은 `osascript`라 아이콘이 '스크립트 편집기'로 나오고, 눌러도 Anvil의 그 프로젝트로 가지 않는다. 서명된 앱이면 Electron 알림(UNUserNotificationCenter)이 허용되는지 확인하고, 서명·공증을 들일지 정할 것.
  Evidence: 실측 2026-11-01 — ad-hoc 서명 Electron 45.1.0이 새 번들 ID에서도 `Notifications are not allowed for this application`. `electron-builder.yml` `identity: null`.

<!-- followup: fu-d1be78e58052 | source: input-wait-notify | task: 26 | date: 2026-11-01 | status: open | taken: - -->
- 입력 대기 알림 문구가 화면 언어 설정이 아니라 OS 언어(`app.getLocale()`)를 따른다. 화면에서 언어를 따로 고른 사용자를 위해, 화면이 고른 언어를 데이터 폴더에 남기고 주 프로세스가 읽게 할지 정할 것.
  Evidence: `electron/main.js` `en()`, 화면 `src/lib/i18n.svelte.ts:16`(`auto`일 때만 OS 언어).
