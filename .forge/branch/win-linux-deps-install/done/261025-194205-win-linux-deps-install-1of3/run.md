# run — #11 Windows·Linux 실제 앱 자동 테스트 장치(e2e-desktop)

실행 방식: 서브에이전트 워크플로 없이 메인 세션이 직접 실행(CI 결과를 보고 고치는 직렬 반복이라 병렬 이득 없음). 브랜치 `win-linux-deps-install`, 초안 PR #50. 두 번 실행했다 — 1차는 Windows에서 멈춰 `verified: failed`, 사람이 ②(Windows만 Playwright·CDP)를 골라 고친 뒤 재실행.

## 슬라이스별 결과
- S1 하네스 골격 — ✅ `e2e-desktop/`(Linux: WebdriverIO v9 + tauri-driver 2.1.0), 스모크 '제목 Anvil' 초록
- S2 Linux 시나리오 — ✅ 깨끗한 PC(①통과 · ②~④ 실패 예정 대로 실패) + 옛 node v12(①②④ 실패 예정 · ③ 사용자 node v12 유지) 초록
- S3 Windows 시나리오 — ⚠ 도구가 계획과 다름: msedgedriver가 WebView2에 붙지 못해 Playwright(CDP)로 교체. ⓪ WSL 없이 + WSL1 뒤 ①~⑤ 초록
- S4 트리거·문서 — ⚠ `workflow_dispatch` + 버전 PR 트리거에 하네스 자신(`e2e-desktop/**`, 워크플로 파일) 경로를 더함, README 실행법·결과 읽는 법

## 계획과 달라진 것 · 그 자리에서 정한 것
- **Windows 도구 교체(사람 결정)**: 1차에서 msedgedriver 155.0.4283.62(WebView2와 같은 버전)가 `DevToolsActivePort file doesn't exist`로 매번 실패. 드라이버 없이 띄우면 앱은 정상이었다. 원인 가설: 드라이버가 환경 변수로 넣는 `--remote-debugging-port`와 wry 0.57이 앱 쪽에서 항상 지정하는 `AdditionalBrowserArguments`가 부딪친다(tauri-apps/tauri#10670과 같은 증상, 미검증). 계획 지시대로 멈추고 세 가지 길을 제시했고, 사람이 ②를 골랐다. 테스트 빌드만 `e2e-desktop/tauri.e2e.json`으로 창 설정을 덮어써(`tauri build --debug --config …`) `--remote-debugging-port=9222`를 열고 Playwright가 `connectOverCDP`로 붙는다 — 제품 코드·배포 빌드는 그대로. 대가: 하네스가 둘(Linux wdio · Windows Playwright), 창 설정을 테스트 설정이 복사해 들고 있다(워크플로 주석에 맞춰 둘 것을 적음).
- 첫 실행의 WebView2는 잠시 `about:blank` — 앱 화면 주소가 될 때까지 기다리게 했다(⓪이 이것으로 한 번 실패).
- 하네스 node 격리: Linux는 `env -i` 깨끗한 PATH + 하네스 node는 `/opt`에서 절대 경로로. WebdriverIO가 심는 `NODE_OPTIONS=--import …`가 자식 셸·앱으로 새어 옛 node가 거부하는 것을 발견 — tauri-driver·앱·셸 호출 모두에서 지웠다(새면 3부에서 앱이 띄우는 node·claude도 깨질 뻔).
- Linux 세션 정리 단계에서 WebKitWebDriver가 가끔 먼저 내려가 DELETE가 실패(단계는 모두 기대대로 끝난 뒤, 1회 관찰) — `specFileRetries: 1`. 마지막 실행에선 재시도 없이 통과.
- 깨끗한 컨테이너 구성: 데스크톱 Ubuntu에 원래 있는 것(WebKitGTK·인증서·wget·한글 글꼴) + 테스트 도구만. **curl·git은 일부러 뺐다**(데스크톱 기본 설치에 없음) → 후속 후보. 한글 글꼴이 없으면 스크린샷이 네모로 깨져 `fonts-noto-cjk`를 넣었다.
- windows 러너에는 WSL이 **이미 있었다**(기본 버전 2, 배포판 없음). setup-wsl로 넣은 Ubuntu-22.04에는 tmux가 이미 있어 WSL 뒤 띠는 'claude CLI 설치 필요'.
- 앱 빌드는 `tauri build --debug --no-bundle`, 시험 프로젝트는 앱 데이터 `projects.json`에 미리 등록(네이티브 폴더 창은 자동화 불가).

## DoD 기준선 → 실행 후
1. `test -f .github/workflows/e2e-desktop.yml` — 실패 → 통과
2. `gh workflow run e2e-desktop.yml --ref win-linux-deps-install` → `gh run watch 40185220713 --exit-status` — 워크플로 없음 → exit 0 (커밋 4ef49e6, linux·windows 모두 success)
3. 스크린샷 ≥4장(각 OS) — 해당 없음 → Linux 9장(깨끗한 PC 5 · 옛 node 4), Windows 7장(WSL 없이 1 · WSL 뒤 6)
4. `npm run test:e2e` — 35 passed → 35 passed (회귀 방지, 유지)
5. `npm run check` — 0 ERRORS → 0 ERRORS (유지)
6. `cargo test` — 이 맥에 rust 툴체인 없어 미측정 → 미측정(rust 코드 변경 없음, PR check 워크플로 3-OS `cargo check` 성공)

## 후속 후보
<!-- followup: fu-fe950c698c91 | source: win-linux-deps-install-1of3 | task: 11 | date: 2026-10-25 | status: open | taken: - -->
- 3부 [설치]가 curl(node·claude 받기)과 git(forge 마켓플레이스)에 기댄다면, 데스크톱 Ubuntu 기본 설치에는 둘 다 없다 — 감지해 준비물로 보이거나 wget 등으로 대체해야 한다.
  Evidence: e2e-desktop 깨끗한 컨테이너 `env.log`의 `curl: 없음`, `git: 없음`(데스크톱 기본 구성을 따라 일부러 뺌).
