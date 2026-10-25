# run — #11 Windows·Linux 실제 앱 자동 테스트 장치(e2e-desktop)

실행 방식: 서브에이전트 워크플로 없이 메인 세션이 직접 실행(CI 결과를 보고 고치는 직렬 반복이라 병렬 이득 없음). 브랜치 `win-linux-deps-install`, 초안 PR #50.

## 슬라이스별 결과
- S1 tauri-driver 하네스 골격 — ✅ `e2e-desktop/`(WebdriverIO v9 + tauri-driver 2.1.0), Linux 스모크 '제목 Anvil' 초록
- S2 Linux 시나리오 — ✅ 깨끗한 PC(①통과·②~④ 실패 예정 대로 실패) + 옛 node v12(①②④ 실패 예정, ③ 사용자 node v12 유지 통과) 모두 초록
- S3 Windows 시나리오 — ❌ WebDriver 세션이 안 열림(`DevToolsActivePort file doesn't exist`). 계획의 '가장 먼저 확인할 위험'이 실제로 터져 계획대로 멈춤
- S4 트리거·문서 — ⚠ `workflow_dispatch` + 버전 PR 트리거, README 한 줄. 트리거 경로에 하네스 자신(`e2e-desktop/**`, 워크플로 파일) 추가 — 계획과 다름

## 계획과 달라진 것 · 그 자리에서 정한 것
- **Windows가 막힘(핵심)**: msedgedriver 155.0.4283.62(WebView2 런타임과 같은 버전)가 앱을 띄우지만 디버그 포트에 붙지 못해 60초씩 4번 재시도 후 실패. 진단 결과 앱 자체는 정상 — 드라이버 없이 직접 띄우면 10초 뒤에도 살아 있고 msedgewebview2 프로세스 6개가 뜬다. 드라이버는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`(`--remote-debugging-port=0` 포함)로 인자를 넣는데, wry 0.57은 앱 쪽에서 `AdditionalBrowserArguments`를 항상 따로 지정한다(`--disable-features=msWebOOUI,…`). 이 둘이 부딪쳐 디버그 포트가 안 열린다는 것이 가장 유력한 가설(미검증). Tauri에도 같은 증상의 미해결 이슈가 있다(tauri-apps/tauri#10670). 대안(앱 디버그 빌드에서 CDP 켜고 Playwright로 구동, 앱이 환경 변수를 이어 붙이게 고치기, 옛 wdio)은 모두 앱 코드·도구를 바꾸는 결정이라 계획 지시대로 고르지 않고 멈췄다.
- WSL은 windows 러너에 **이미 있었다**(`wsl --status` → 기본 버전 2, 배포판 없음). setup-wsl@v7.2.0으로 WSL1 Ubuntu-22.04 설치는 성공.
- 하네스 node 격리: Linux는 `env -i` 깨끗한 PATH + 하네스 node는 `/opt`에서 절대 경로로. 추가로 WebdriverIO 작업 프로세스가 심는 `NODE_OPTIONS=--import …`가 자식 셸·앱으로 새어 옛 node(v12)가 거부하는 것을 1차 실행에서 발견 — tauri-driver·셸 호출 모두에서 지웠다(새면 3부에서 앱이 띄우는 node·claude도 깨질 뻔했다).
- 깨끗한 컨테이너 구성: 데스크톱 Ubuntu에 원래 있는 것(WebKitGTK·인증서·wget) + 테스트 도구(WebDriver·Xvfb·dbus)만. **curl·git은 일부러 넣지 않았다** — 데스크톱 기본 설치에 없다. 3부 [설치]가 curl·git에 기대면 이 컨테이너에서 실패한다(후속 후보).
- 앱은 `tauri build --debug --no-bundle`로 빌드. 시험 프로젝트는 앱 데이터의 `projects.json`에 미리 등록(네이티브 폴더 창은 WebDriver로 못 다룸).
- Windows 진단 단계(앱 10초 직접 실행, msedgedriver 상세 로그 래퍼)를 워크플로에 남겼다 — 다음 결정 뒤에도 쓸모 있음.

## DoD 기준선 → 실행 후
1. `test -f .github/workflows/e2e-desktop.yml` — 실패 → **통과**
2. `gh workflow run e2e-desktop.yml --ref win-linux-deps-install` 후 `--exit-status` 0 — 워크플로 없음 → **실패**: 디스패치는 받아들여짐(run 40182331749, 확인 뒤 취소). 마지막 전체 실행 run 40181157740: linux ✅ / windows ❌
3. 아티팩트 스크린샷 ≥4장(Linux·Windows 각각) — 해당 없음 → **Linux 9장(깨끗한 PC 5 · 옛 node 4) / Windows 0장** — 실패
4. `npm run test:e2e` — 35 passed → 35 passed (회귀 방지, 유지)
5. `npm run check` — 0 ERRORS → 0 ERRORS (유지)
6. `cargo test` — 이 맥에 rust 툴체인 없어 미측정 → 미측정(rust 코드 변경 없음, PR의 check 워크플로 3-OS `cargo check` 성공)

## 후속 후보
<!-- followup: fu-fe950c698c91 | source: win-linux-deps-install-1of3 | task: 11 | date: 2026-10-25 | status: open | taken: - -->
- 3부 [설치]가 curl(node·claude 받기)과 git(forge 마켓플레이스)에 기댄다면, 데스크톱 Ubuntu 기본 설치에는 둘 다 없다 — 감지해 준비물로 보이거나 wget 등으로 대체해야 한다.
  Evidence: e2e-desktop 깨끗한 컨테이너 `env.log`의 `curl: 없음`, `git: 없음`(데스크톱 기본 구성을 따라 일부러 뺌).
