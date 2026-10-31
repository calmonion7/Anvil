<!-- forge-slug: electron-app-6of6 -->
<!-- task: 27 -->
<!-- part: 6/6 -->
<!-- tdd: on -->
# Tauri·tmux·WSL 제거와 문서 정리 (데스크톱 앱 6/6)

## 목표 / 하지 않을 것
- 목표: 레포에서 Tauri(Rust)·내장 tmux·jq·WSL 연결·Tauri 빌드·tauri-driver e2e를 걷어 내고, 버전 파일과 문서·ADR을 Electron 구조에 맞춘다.
- 하지 않을 것: 기능 변경, 입력 대기 알림(후속후보 fu-a0781a23120b), 후속후보 자동 정리. 무의미해진 후보(fu-3c1e7a9d52b4 e2e-desktop 재시도, 4/6에서 판단하지 못했다면 fu-62d8e42c3b92 콘솔 깜빡임)는 사람에게 보여 주고 결정을 받는다.

## 근거
- 관련 ADR: `adr/261030-005852-electron-desktop-shell.md`. 은퇴 대상은 `261017-211600`(Tauri)·`261017-211601`(tmux 세션)·`261018-190555`(launchd 추종)·`261024-202909`·`261025-163349`(tmux·jq 내장)이다. `261029-121641`은 Node 서버 결정이 유효하므로 은퇴하지 않는다(창·배포 부분은 261030이 대체).
- 1~5/6 봉인 뒤 실행을 권장한다.
- 제거·수정 대상은 아래 finder 명령의 출력으로 정한다. 실행할 때(fg-run 승격 시) 다시 돌려 목록을 갱신한다.
  - finder: `git grep -lE 'tauri|tmux|src-tauri|wsl' -- . ':!.forge' ':!package-lock.json' ':!src-tauri' ':!docs/releases'`
  - 2026-10-30 출력(37줄, `src-tauri/` 별도): `.github/workflows/{check,e2e-desktop,release}.yml`, `.gitignore`, `.vscode/extensions.json`, `README.md`, `e2e-desktop/**`(7개), `package.json`, `playwright.config.ts`, `scripts/{build-tmux-linux,build-tmux,check-fullscreen-restore,check-release,install-app,release}.sh`, `server/{deps,env,forge,i18n,session,slash}.js`, `server/hooks/{anvil-hook,anvil-statusline}.js`, `server/test/{deps,forge.golden,forge}.test.js`, `src/lib/{Terminal.svelte,types.ts}`, `src/routes/+layout.ts`, `svelte.config.js`, `vite.config.js`
  - `server/`·`src/`의 줄 상당수는 「tmux 없이」 같은 이력 주석일 수 있다 — 지울지 이유를 남기고 둘지 줄마다 정한다. 1~5/6에서 바뀐 파일은 실행 때 출력에서 빠진다.
- 완료 정의(DoD):
  1. `test -d src-tauri; echo $?` → `1`.
     - 사전 상태(실측 2026-10-30): `0`. 전진 검사.
  2. finder 출력이 `0`줄이거나, 남는 줄마다 남기는 이유가 run 기록에 있다.
  3. `node --test server/` · `npx playwright test` · `npm run check` · 세 OS Electron e2e(4/6) 모두 통과(회귀 방지).
  4. 버전 파일이 `package.json`(+lock)뿐이다. 버전을 커밋한 뒤 `scripts/check-release.sh` 통과.
  5. 대체된 ADR 5개가 `adr/retired/`로 옮겨진다(fg-cleanup로, 사람 승인).
  6. 용어집 최상위 `.forge/CONTEXT.md`의 「준비물」이 브랜치 root의 새 정의와 같아진다(fg-merge가 합치면 이미 같을 수 있다 — 그 경우 확인만).

## 작업 조각
- [ ] S1. **코드·빌드 제거**:
  - `src-tauri/`, `e2e-desktop/`, `.github/workflows/e2e-desktop.yml`, `scripts/build-tmux*.sh`, `scripts/check-fullscreen-restore.sh`를 지운다. `@tauri-apps/cli`·`tauri` 스크립트, `vite.config.js`의 `TAURI_DEV_HOST`·1420 고정 등 Tauri 흔적을 정리한다.
  - 테스트 픽스처(`src-tauri/tests/fixtures/`)는 먼저 `server/test/fixtures/`로 옮기고, Node 골든 테스트가 거기를 읽게 한다(골든 JSON은 그대로 — Rust 골든 덤프 `golden.rs`는 함께 사라진다).
  - 완료 기준: DoD 1·3.
- [ ] S2. **릴리스 스크립트 단순화** (depends: S1): `scripts/release.sh`·`check-release.sh`의 버전 파일을 5개에서 `package.json`(+lock)으로 줄인다. 완료 기준: DoD 4.
- [ ] S3. **문서** (depends: S1): README(소개·준비물 표·삭제·개발·e2e 절)를 Electron 구조로 고치고 finder 출력을 처리한다. 완료 기준: DoD 2·6.
- [ ] S4. **ADR 은퇴와 후속후보 확인** (depends: S3): 대체된 ADR 5개를 fg-cleanup로 은퇴시킨다. 무의미해진 후속후보는 사람에게 보여 주고 결정을 받는다. 완료 기준: DoD 5.
