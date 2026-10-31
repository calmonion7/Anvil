<!-- forge-slug: electron-app-4of6 -->
<!-- task: 25 -->
<!-- part: 4/6 -->
<!-- tdd: on -->
# Windows·Linux에서 앱이 돌고, 세 OS e2e가 CI에서 돈다 (데스크톱 앱 4/6)

## 목표 / 하지 않을 것
- 목표: 같은 Electron 앱이 Windows x64(WSL 없이)와 Linux x64에서 세션까지 돈다. 세 OS(mac·Linux·Windows)에서 실제 앱을 띄우는 Playwright Electron e2e가 CI에서 돈다.
- 하지 않을 것: 릴리스·업데이터(5/6), Tauri·WSL 코드 삭제(6/6), Windows ARM 공식 지원(ARM VM은 확인용으로만), 코드 서명.

## 근거
- 용어: 준비물 — `.forge/CONTEXT.md`
- 관련 ADR: `adr/261030-005852-electron-desktop-shell.md`
- 실측 근거: node-pty 사전 빌드는 darwin·win32만 있고 Linux는 없다(`node_modules/node-pty/prebuilds/`, 2026-10-30) — Linux는 CI에서 Electron ABI로 컴파일한다. forge 훅은 Windows 겸용이다(forge 0.9.8 `hooks/run-hook.cmd`, `run-hook.windows.test.js`).
- 추측(실행 때 확인): Windows claude는 Git Bash가 필요하다(3/6이 설치).
- 완료 정의(DoD):
  1. CI 행렬(macos-latest · ubuntu · windows-latest)에서 Playwright `_electron` 스모크가 통과한다. 시나리오: 픽스처 프로젝트 등록 → 보드 → 세션 열기 → pty 출력 수신 → 앱 종료 뒤 서버 생존 → 재실행 시 같은 서버에 붙음. claude 대신 가짜 명령을 쓴다.
     - 사전 상태: 잡 없음(기존 `e2e-desktop.yml`은 Tauri용). 전진 검사.
  2. Windows 경로(`C:\…`)의 프로젝트에서 `.forge/` 읽기와 세션 작업 폴더가 맞다 — Node 테스트(`node --test server/` 0 실패에 포함).
  3. Windows용 `node.cmd` 대체 실행 파일로 forge 훅·상태 훅·상태줄 래퍼가 돈다 — Node 테스트(Windows CI에서 실행).
  4. `grep -c 'wsl --install' README.md` → `0`.
     - 사전 상태(실측): `1`. 전진 검사.
  5. UAT(UTM Windows ARM VM, SSH로 자동화 — 메모리 「VM test automation」, 사람은 화면만): 설치 프로그램으로 설치 → 앱 열기 → 계획 세션에서 claude가 돈다 → 콘솔 창이 깜빡이지 않는다(후속후보 fu-62d8e42c3b92를 여기서 판단하고, 느린 VM이라 판단할 수 없으면 그대로 둔다).

## 작업 조각
- [ ] S1. **Windows 동작**: node-pty ConPTY 세션, 경로 정규화, `node.cmd` 대체 실행 파일, 서버를 띄울 때 콘솔 창 숨김(`windowsHide`), 1/4의 Node 훅이 Windows에서 그대로 도는지 확인(다르면 고친다), 1/4 보고의 `PATH`/`Path` 키 겹침 처리. 완료 기준: DoD 2·3.
- [ ] S2. **Linux 동작**: CI에서 node-pty를 Electron ABI로 빌드, AppImage 개발 빌드가 뜨고 세션이 돈다. 완료 기준: DoD 1의 ubuntu 칸.
- [ ] S3. **세 OS e2e 잡** (depends: S1, S2): `.github/workflows/`에 Playwright `_electron` 행렬을 더한다. Linux는 `xvfb-run`. 회고(task 17): 재시도는 끄고 첫 시도 결과만 본다. 완료 기준: DoD 1.
- [ ] S4. **README**: Windows 절을 「WSL 불필요, 설치 프로그램 실행」으로 바꾸고 처음 한 번의 SmartScreen 「추가 정보 → 실행」을 그림 없이 한 줄로 안내한다. 완료 기준: DoD 4.
- [ ] S5. **VM 확인** (depends: S1, S3): DoD 5.
