<!-- forge-slug: node-web-app-4of4 -->
<!-- task: 21 -->
<!-- part: 4/4 -->
<!-- tdd: off -->
# Tauri·tmux·WSL 제거와 문서 정리 (Node 전환 4/4)

## 목표 / 하지 않을 것
- 목표: 레포에서 Tauri(Rust)·내장 tmux·jq·WSL 연결·4플랫폼 빌드·tauri-driver e2e를 걷어 내고, 버전 파일과 문서·용어집·ADR을 새 구조에 맞춘다.
- 하지 않을 것: 기능 변경, 입력 대기 알림(별도 작업), 후속후보 자동 정리. 무의미해진 후보(fu-3c1e7a9d52b4 e2e-desktop 재시도, fu-62d8e42c3b92 콘솔 깜빡임)는 사람에게 보여 주고 결정을 받는다.

## 근거
- 용어: 준비물 — `.forge/CONTEXT.md`(이번에 정의를 고친다)
- 관련 ADR: `adr/261029-121641-node-local-web-app.md`. 은퇴 대상은 `261017-211600`·`261017-211601`·`261018-190555`·`261024-202909`·`261025-163349`이다.
- 1~3/4 봉인 뒤 실행을 권장한다.
- 제거·수정 대상은 아래 finder 명령의 출력으로 정한다. 2026-10-29 실행 결과에 `src-tauri/`(추적 파일 74개)를 더한 것이다. 실행할 때(fg-run 승격 시) 다시 돌려 목록을 갱신한다.
  - finder: `git grep -lE 'tauri|tmux|src-tauri|wsl' -- . ':!.forge' ':!package-lock.json' ':!src-tauri' ':!docs/releases'`
  - 2026-10-29 출력: `.github/workflows/{check,e2e-desktop,release}.yml`, `.gitignore`, `.vscode/extensions.json`, `e2e-desktop/**`(7개), `e2e/deps.spec.ts`, `package.json`, `playwright.config.ts`, `README.md`, `scripts/{build-tmux-linux,build-tmux,check-fullscreen-restore,check-release,install-app,release}.sh`, `src/lib/{i18n.svelte.ts,SessionPane.svelte,Terminal.svelte,types.ts}`, `src/routes/{+layout.ts,+page.svelte}`, `svelte.config.js`, `vite.config.js`
  - 1~3/4에서 이미 바뀐 파일은 실행 때 finder 출력에서 빠진다.
- 완료 정의(DoD):
  1. `test -d src-tauri; echo $?` → `1`.
     - 사전 상태(실측): `0`. 전진 검사다.
  2. finder 명령의 출력이 `0`줄이다. 남는 줄이 있으면 각 줄에 남기는 이유를 run 기록에 적는다(예: 기존 Tauri 사용자 정리 안내 문구).
  3. `node --test server/` · `npx playwright test` · `npm run check` 모두 통과(회귀 방지).
  4. 버전 파일이 `package.json`(+lock)뿐이다. 버전을 커밋한 뒤 `scripts/check-release.sh`가 통과한다.
  5. `.forge/CONTEXT.md`의 「준비물」에서 「Windows는 WSL이 바탕」과 「앱에 들어 있는 도구(tmux 등)」가 빠지고, 새 구조(설치 줄이 설치한다, Windows는 Git for Windows)가 반영된다.
  6. 대체된 ADR 5개가 `adr/retired/`로 옮겨진다(fg-cleanup로, 사람 승인).

## 작업 조각
- [ ] S1. **코드·빌드 제거**:
  - `src-tauri/`, `e2e-desktop/`, `.github/workflows/e2e-desktop.yml`, `scripts/build-tmux*.sh`, `scripts/check-fullscreen-restore.sh`를 지운다.
  - `package.json`의 `@tauri-apps/*`·`tauri` 스크립트와, finder 출력의 나머지 Tauri 참조를 정리한다. 테스트 픽스처(`src-tauri/tests/fixtures/`)는 먼저 `server/test/fixtures/`로 옮긴다.
  - 완료 기준: DoD 1·3.
- [ ] S2. **릴리스 스크립트 단순화**: `scripts/release.sh`·`check-release.sh`의 버전 파일을 5개에서 `package.json`(+lock)으로 줄인다. 완료 기준: DoD 4. (depends: S1)
- [ ] S3. **문서와 용어집**: README(소개·준비물 표·삭제·개발·e2e 절)와 `.forge/CONTEXT.md`의 「준비물」을 고친다. 완료 기준: DoD 2·5. (depends: S1)
- [ ] S4. **ADR 은퇴와 후속후보 확인**: 대체된 ADR 5개를 fg-cleanup로 은퇴시킨다. 무의미해진 후속후보 2건은 사람에게 보여 주고 결정을 받는다. 완료 기준: DoD 6. (depends: S3)
