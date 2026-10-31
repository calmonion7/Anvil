# 실행 기록 — Tauri·tmux·WSL 제거와 문서 정리 (데스크톱 앱 6/6)

워크플로 없이 이 세션이 직접 실행했다(사람 승인 — 4/6·5/6과 같은 방식). 순서는 S1 → S2 → S3 → S4. `tdd: on`에 맞춰 S1은 골든·forge 테스트의 픽스처 경로를 먼저 바꿔 실패(15개)를 본 뒤 픽스처를 옮겼고, S2는 `check-release.sh`를 먼저 고쳐 실패를 본 뒤 `release.sh`를 고쳤다. S3·S4는 문서·forge 상태라 테스트 대신 finder와 원장 `list`로 확인했다.

## 조각별 결과
- S1 코드·빌드 제거 — ⚠ `src-tauri/`, `scripts/build-tmux.sh`·`build-tmux-linux.sh`·`check-fullscreen-restore.sh`를 지웠다. 픽스처는 `server/test/fixtures/`로 옮겼고(`git mv`, 골든 JSON은 그대로), `@tauri-apps/cli`·`tauri` 스크립트, vite의 `TAURI_DEV_HOST`·HMR 1421·`src-tauri` 감시 제외를 걷어 냈다. 1420 포트는 dev:web 주소로 남겼다(`ea54c1b`). 계획 밖 두 가지는 아래에 적었다(`check.yml` 삭제, 아이콘 이동). `e2e-desktop`은 5/6에서 이미 지웠다.
- S2 릴리스 스크립트 — ✅ 버전 파일이 `package.json`(+lock)뿐이다. `release.sh`는 `npm version` 결과만 확인·커밋하고, `check-release.sh`도 두 파일만 본다(`9b8e7fa`).
- S3 문서 — ⚠ README의 소개(Electron·세 OS, 서버가 세션을 쥠)·준비물 표(claude·forge·git·Windows Git. node·tmux·jq 줄 삭제, `[설치]`·`[로그인]` 버튼 설명을 자동 설치·[다시 시도]로)·문제 시 데이터 위치(`~/.anvil`, `server.log`)·삭제(세 OS)·개발 명령을 고쳤다. server/·src/의 출처 주석 16줄은 「옛 Rust판(v0.1.x)」으로, tmux 이력 문구는 지금 동작만 남겼다(`617d6d4`). 「세션이 입력을 기다리면 알림」 줄은 Node판에 아직 없어 뺐다(후속후보 fu-a0781a23120b). DoD 6은 머지 뒤 확인으로 미뤘다(아래).
- S4 ADR 은퇴·후속후보 — ✅ 사람 승인으로 ADR 5개를 `.forge/adr/retired/`로 옮기고 `Status: Superseded by ADR-261030-005852`를 달았다. 사람 결정으로 fu-3c1e7a9d52b4·fu-62d8e42c3b92를 dismissed로 바꾸고 본문에 이유를 적었다(`6622c08`).

## 계획 밖 변경·판단
- **`check.yml` 삭제**: Rust 컴파일 확인(`cargo check`) 잡이었다. 세 OS에서 `npm ci`·`npm run build`를 하는 일은 `electron.yml`이 PR마다 이미 한다(`electron.yml:26-27`). 남길 이유가 없어 지웠다.
- **아이콘 이동**: `electron-builder.yml`이 `src-tauri/icons/`의 `icon.ico`·`icon.png`·`icon.icns`를 쓰고 있었다(파일 안 주석이 「6/6에서 옮긴다」). 이 셋만 최상위 `icons/`로 옮겼다. `build/`는 vite 출력 폴더라 쓸 수 없다. 나머지 PNG(Tauri·Windows 스토어용)는 참조가 없어 함께 지웠다.
- **ADR·원장을 브랜치에서 직접 고침**: 은퇴 대상 ADR과 원장은 최상위 `.forge/`(main 정본)에 있다. 이 브랜치 PR에서 옮기면 머지 때 그대로 main에 들어간다. 사람에게 그렇게 밝히고 승인을 받았다.
- **finder 밖에 남긴 이력 줄**: 대소문자를 무시하면 `Tauri`·`Rust`가 더 나온다. `server/API.md:23-24·60·65`(「Tauri 명령이 돌려주던 값 그대로」 — 화면 계약이 옛 IPC와 같은 모양이라는 설명), `server/API.md:97`(옛 Tauri 데이터 폴더를 쓰지 않음), `server/forge.js`의 「Rust 의미 그대로」 도우미 주석(골든이 고정하는 동작의 근거), `server/replace.js:38`(옛 Tauri 앱을 끄지 않는 이유), README의 「WSL 필요 없음」(옛 사용자 안내)이다. 모두 지금 동작을 설명하는 이력이라 둔다. 계획의 finder(대소문자 구분)는 0줄이다.
- **DoD 6(용어집)**: 브랜치 root `CONTEXT.md`의 「준비물」은 이미 새 정의다(claude CLI·forge, Windows Git. node는 앱 안). 최상위 `.forge/CONTEXT.md:35-36`은 아직 옛 정의(node 22·tmux·WSL)다. 최상위는 main 정본이라 fg-merge(브랜치 forge 통합)가 합칠 때 바뀐다. 6/6을 머지한 뒤 fg-merge 단계에서 확인한다.

## DoD 기준선 → 실행 뒤
1. `test -d src-tauri; echo $?`: `0` → `1`.
2. finder: 28줄(계획 작성 때 37줄, 5/6에서 일부 빠짐) → `0`줄. 대소문자를 무시하면 남는 이력 줄이 있고, 그 이유는 위에 적었다.
3. 회귀 방지(기준선에서 이미 통과): `node --test server/` 118 통과·2 건너뜀 → 같음. `npx playwright test` 50 → 50. `npm run check` 0 오류 → 0. `npm run test:app` 2 → 2(이 Mac). 세 OS Electron e2e는 PR #58의 `electron` 워크플로(아래 UAT).
4. 버전 파일: 5개(package.json·lock·tauri.conf.json·Cargo.toml·Cargo.lock) → 2개. `scripts/check-release.sh` 실패(src-tauri 없음) → 10/10 통과.
5. 활성 ADR: Tauri 계열 5개 → 0개(`.forge/adr/`에 `261017-211602`와 `retired/`만 남음).
6. 최상위 용어집 「준비물」: 옛 정의 → 머지 뒤 fg-merge에서 확인(위).

## UAT
- 세 OS Electron e2e(PR #58 `electron` 워크플로 `41205397359`, `6622c08`): 첫 시도는 Ubuntu·Windows 통과, macOS 실패. 실패한 테스트는 「앱을 꺼도 서버가 살고, 다시 열면 같은 서버에 붙는다」로, 다시 연 두 번째 앱에 `activate`를 보낸 뒤 `firstWindow`가 30초 안에 오지 않았고, 이어서 앱이 꺼지지 않아 워커 정리가 60초를 넘겼다. 이번 변경은 이 경로를 건드리지 않는다(Inferred — 바뀐 것은 아이콘 경로·vite 개발 설정·주석이고, `test:app`은 `build/`를 쓴다). 같은 코드가 이 Mac `npm run test:app`에서 2/2 통과했다. 실패한 잡만 새 러너에서 처음부터 다시 돌린 시도 2는 macOS 통과 → 세 OS 모두 통과. 원인은 미확인이고 아래 후속 후보로 남긴다.
- 사람 화면 확인은 따로 하지 않는다. 기능 변경이 없는 정리 작업이라 자동 검사(위·DoD 3)를 증거로 쓴다. 이 Mac `.dmg` 설치(5/6 DoD 6)는 머지 뒤에 한다.

## 커밋
`ea54c1b`(S1) · `9b8e7fa`(S2) · `617d6d4`(S3) · `6622c08`(S4)

## 후속 후보
<!-- followup: fu-fac8aae17bea | source: electron-app-6of6 | task: 27 | date: 2026-10-31 | status: open | taken: - -->
- macOS CI 앱 스모크에서 다시 연 두 번째 앱이 창을 열지 못하고(`activate` 직후 `firstWindow` 30초 초과) 그대로 꺼지지 않았다. 짐작: 창 열기가 실패하면 `fail()`이 띄우는 `dialog.showErrorBox`가 앱을 붙잡아 종료까지 막는다(`electron/main.js` `fail`). 열기 실패의 원인과, 오류 창이 테스트·실제 앱 종료를 막는지 확인할 것. fu-5e0a7d31c4b2(`app.quit` 뒤 안 꺼짐)와 함께 볼 것.
  Evidence: run `41205397359` 시도 1 macOS 잡 — `▶ 5. 다시 실행` 뒤 90초 만에 `F`·`Worker teardown timeout of 60000ms exceeded`. 시도 2에서는 통과.
