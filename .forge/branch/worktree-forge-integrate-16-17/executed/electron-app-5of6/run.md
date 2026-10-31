# 실행 기록 — 설치 파일 릴리스와 세 OS 공통 자체 업데이터 (데스크톱 앱 5/6)

워크플로 없이 이 세션이 직접 실행했다(사람 승인 — 4/6과 같은 방식). 순서는 S2 → S3 → S1 → S4. `tdd: on`이라 업데이터 공통부·화면 띠·재실행 환경은 테스트를 먼저 썼고, 교체 스크립트(S3)는 구현과 테스트를 같이 썼다(아래 「계획 밖」). Windows·Linux 동작은 CI(PR #57 `electron` 워크플로)로, 업데이트 흐름은 이 Mac에서 가짜 릴리스 서버로 확인했다.

## 조각별 결과
- S1 릴리스 잡 — ✅ `release.yml`을 Tauri 4대상에서 electron-builder 3잡(mac arm64·x64 dmg+zip, win x64 exe, linux x64 AppImage)으로 바꾸고, 공개 잡이 `SHA256SUMS.txt`를 만들어 설치 파일 6개 수를 확인한 뒤 draft → 공개한다. 파일 이름 규칙은 `electron-builder.yml` `artifactName`(업데이터 `pickAsset`과 짝). 실제 공개(DoD 3)는 머지 뒤라 아직 못 봤다.
- S2 업데이터 공통부 — ✅ `server/updater.js`: GitHub 최신 릴리스 확인(설치본에서만, 시작 때와 6시간마다·설정 [다시 확인]) → 이 OS 파일 → 메모리에서 체크섬 맞춰 본 뒤에만 쓰기 → `working` 세션이 있으면 `deferred`로 기다림 → 교체 단계 → 서버 종료. 다시 뜬 서버가 `restore.json`으로 세션 복구(2/6 그대로). 화면 띠(사용 가능·내려받는 중·세션이 끝나면 업데이트·다시 시작하는 중·실패 [다시 시도]). 명령 `updater_status·check·install`, 이벤트 `updater`(`server/API.md`).
- S3 OS별 교체 단계 — ⚠ `server/replace.js` 스크립트(mac `.zip`→`.app`, Windows 설치 프로그램 `/S --force-run`, Linux AppImage). CI·UAT에서 결함 넷을 찾아 고쳤다: ① mac 테스트가 번들 ID로 종료를 청해 같은 ID의 설치된 Anvil을 끌 수 있었다 → 바꿀 `.app` 경로에만, 돌 때만(`05a6a3a`). ② Linux: 남은 앱 패턴을 인자로 받아 `pgrep -f`가 스크립트 자신을 잡고 30초 뒤 `pkill -9`로 스스로를 끝냈다 → 환경변수 `ANVIL_RUNNING`(`195aef4`). ③ Windows: 설치 프로그램을 `call` 없이 불러 배치가 돌아오지 않았다(`195aef4`). ④ mac UAT: 스크립트가 서버의 `ELECTRON_RUN_AS_NODE=1`을 물려받아 다시 연 앱이 창 없는 node로 떠 바로 꺼졌다(재현: `ELECTRON_RUN_AS_NODE=1 open /Applications/Anvil.app` → 프로세스 없음) → 넘기지 않는다(`helperEnv`, `a490f7d`). 앱이 직접 받은 zip이라 격리 표시가 붙지 않았다(`xattr` → `com.apple.provenance`만).
- S4 이 Mac 전환과 안내 — ⚠ README 「설치」(Releases 파일 이름·처음 한 번 경고·[업데이트]), 릴리스 노트 `docs/releases/v0.2.0.md`(0.1.x Tauri 사용자 정리 안내 — 세션 끄기·옛 앱 휴지통·프로젝트 다시 등록: 등록 목록은 옮겨지지 않는다 `server/forge.js:544`), 버전 다섯 곳 0.1.8 → 0.2.0, `scripts/install-app.sh`·`check-install-app.sh` 삭제(`b0415b1`). launchd 폴링 에이전트·빌드 클론은 이 Mac에서 찾지 못했다(`~/Library/LaunchAgents`에 Anvil 언급 없음, `launchctl list`에 없음 — 사람도 모름). `/Applications/Anvil.app`은 이미 Electron 0.1.8 시험 빌드였다(2/6 UAT 때 깐 것).

## 계획 밖 변경·판단
- S3 교체 스크립트는 테스트보다 구현을 먼저 썼다(TDD 이탈). 대신 각 OS에서 스크립트를 실제로 돌리는 `server/test/replace.test.js`와 진짜 설치 파일 두 버전으로 바꿔 보는 `scripts/check-replace.mjs`(CI 세 OS)가 결함 ②③을 잡았다.
- DoD 2 확인 방법: CI가 같은 앱을 지금 버전과 `-c.extraMetadata.version=9.9.9`로 두 번 만들어 옛것을 설치하고 교체 스크립트로 바꾼다(다시 열기는 `ANVIL_NO_RELAUNCH`로 끔 — 다시 열기는 이 Mac UAT가 봤다).
- DoD 5 방법(사람 결정): 업데이터가 든 첫 버전이 0.2.0이라 실제 릴리스로는 0.2.1이 나와야 볼 수 있다 → 이 Mac에서 가짜 릴리스 서버(`ANVIL_UPDATE_API`, 테스트 전용 환경변수)로 9.9.9를 내줘 같은 코드 경로를 돌렸다. 그 결과 이 Mac의 `/Applications/Anvil.app`은 지금 9.9.9 시험 빌드다 — 실제 v0.2.0이 공개되면 Releases `.dmg`로 다시 깔아야 한다(DoD 6).
- 업데이트 띠는 보드(프로젝트가 있을 때)에만 뜬다. 프로젝트가 없는 첫 화면에는 없다 — 설정의 [다시 확인] 줄은 있다.
- 옛 Tauri 하네스 `e2e-desktop.yml`은 이 PR에서 늘 실패했다(최근 8번 모두) → 사람 요청으로 6/6에서 당겨 워크플로·`e2e-desktop/` 폴더·README 줄·`.gitignore` 규칙을 지웠다(`f66c15c`·`068e179`). 나머지 Tauri 정리(`src-tauri/` 등)는 6/6 그대로.
- Windows 앱 스모크: `a490f7d`에서 3번 연속 두 번째 테스트 끝의 앱이 `app.quit` 뒤 안 꺼져 강제 종료 → Playwright 워커 정리 60초 초과로 실패했다. 같은 러너 이미지(`20261021.618`)에서 `195aef4`는 다시 돌려도 통과(2/2), 두 커밋 차이(`helperEnv`)는 스모크 경로에서 돌지 않는다 — **원인 미확인**(fu-5e0a7d31c4b2와 같은 증상). 하네스가 강제 종료 때 Electron 보조 프로세스(`--type=`)도 끝내고 남은 `electron.exe` 목록을 찍게 했다(`0b71a71`, 트리째 끄면 detached 서버도 꺼진다) — 그 뒤 실행에서는 앱이 정상으로 꺼져 이 경로는 아직 돌지 않았다.

## DoD 기준선 → 실행 뒤
1. `node --test server/`: 105 통과(업데이터 없음) → 118 통과·0 실패·2 건너뜀(다른 OS 전용). 새 테스트: 버전 비교·파일 고르기·새 버전 감지·체크섬(틀림·목록에 없음 거부)·세션 가드(미룸 뒤 교체·종료)·실패 시 서버 유지·교체 스크립트·재실행 환경.
2. OS별 교체 단계: 없음 → CI `41196699778` 세 OS 통과 — Windows `0.2.0.0 → 9.9.9.0`, macOS `0.2.0 → 9.9.9`, Linux AppImage 교체.
3. `gh release view v0.2.0`: v0.1.8(Tauri)까지 → 사람이 PR #57 머지(`d35e81b`) → release `41200617370` 4잡 성공, 공개(draft=false)에 설치 파일 6개(mac arm64·x64 dmg+zip, win x64 exe, linux x86_64 AppImage) + `SHA256SUMS.txt`. 업데이터 `check({current:'0.1.8'})`가 실제 릴리스에서 `Anvil-0.2.0-mac-arm64.zip`을 찾고, 0.2.0이면 `null`.
4. `scripts/check-release.sh`: 버전 커밋 `b0415b1` 뒤 13개 모두 통과.
5. UAT(이 Mac, 사람): 0.2.0 설치 → 계획 세션에서 "안녕" → [업데이트] → 앱이 스스로 다시 열려 9.9.9, 계획 세션이 `--resume 3108dd1b…`로 대화째 복구(고친 빌드 `a490f7d` 기준, 20:50:30 서버 종료 → 20:50:33 새 서버).
6. 이 Mac 전환: launchd 에이전트·빌드 클론 없음(찾지 못함) → Releases `.dmg` 설치는 **사람 결정으로 6/6 뒤에**("끝나면 dmg로 깔아줘"). 지금 `/Applications/Anvil.app`은 이 Mac에서 빌드한 0.2.0(`a490f7d` 코드)이다.
- 회귀 방지: `npx playwright test` 47 → 50(업데이트 띠 3) · `npm run test:app` 2 · `npm run check` 0 오류·0 경고.
- 참고: 4/6 후속 후보 fu-c2e1e4da6e4c(Windows arm64판)는 node-pty에 `win32-arm64` prebuild가 있어(`node_modules/node-pty/prebuilds/`) 더하기 쉽다 — 그때 업데이터 `pickAsset`도 함께 바꾼다.
