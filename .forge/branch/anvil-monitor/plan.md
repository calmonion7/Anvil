<!-- forge-slug: anvil-monitor-1of3 -->
<!-- task: 1 -->
<!-- part: 1/3 -->
<!-- tdd: on -->
# Anvil 1/3 — 등록한 프로젝트의 forge 상태를 보드로 보여 주는 Tauri 앱 (읽기 전용)

## 목표 / 하지 않을 것
- 목표: Tauri 2 앱을 띄운다. 사용자가 등록한 프로젝트마다 `.forge/`를 직접 읽어 ②안 보드(지금 카드 + 백로그 · 후속후보 · 최근 완료)를 보여 주고, 파일이나 브랜치가 바뀌면 2초 안에 다시 그린다. 이 part만으로도 매일 쓸 수 있는 모니터가 된다.
- 하지 않을 것:
  - 터미널·세션·세션 상태·알림 (2/3)
  - 실행 버튼 동작·후속후보 숨김 (3/3). 이번에는 버튼 자리를 비워 둔다.
  - `.forge/`에 무엇이든 쓰는 일 (ADR 261017-211602)
  - 현재 브랜치가 아닌 `branch/*` root 표시
  - 패키징·코드 서명·자동 업데이트, Windows/Linux

## 정본
- 용어: `.forge/CONTEXT.md`의 프로젝트 · 진행 영역 · 기록 영역 · 후속후보
- ADR: `.forge/adr/261017-211600-tauri-rust-for-lightweight-app.md`, `.forge/adr/261017-211602-anvil-never-writes-forge.md`
- 디자인 정본: `docs/board-mockup.html` (그릴링 때 확정한 시안). 토큰·글자 크기 3단(15/13/11)·간격 4/8 배수·상태 색은 기호+라벨과 함께. 배색은 macOS 설정을 따른다(`prefers-color-scheme`).
- forge 상태 규칙. 출처는 플러그인 `skills/fg-run/FORGE-ROOT.md`, `PLAN-FORMAT.md`, `scripts/forge-status.js`이고, 그릴링 조사로 확인했다.
  - **root**: 현재 브랜치 == `.forge/config.json`의 `defaultBranch`(없으면 `main`)이면 `.forge/`, 아니면 `.forge/branch/<branch>/`(`/`가 든 이름은 하위 폴더). detached이거나 git이 아니면 `.forge/`.
  - **진행 영역**(현재 root만): `plan.md` · `running.md` · `run.md` · `STATUS.md` · `executed/*/` · `backlog/*.md` · `loop.md`.
  - **기록 영역**(최상위 `.forge/` 위에 현재 root를 겹침, 같은 이름은 root가 우선): `done/*/`, `retro/*.md`, 후속후보.
  - **plan 마커**: `<!-- forge-slug: -->`, `task:`, `priority:`(없으면 medium), `part: N/M`, `tdd:`. 제목은 첫 `# ` 줄. 마커가 없는 옛 계획은 번호를 `—`로 보여 준다.
  - **STATUS**: `field:`와 `- field:` 모두 받고, 첫 낱말만 값으로 읽는다(`verified: yes (…)` → `yes`). `verified`의 yes·skipped·n/a는 봉인 가능, pending·failed는 막힘.
  - **단계**(보드의 단계 막대): 계획 → 실행·검증 → 회고 → 봉인. `plan.md`만 있거나 `running.md`가 있거나 `verified`가 pending/failed/없음이면 실행·검증이다. 봉인 가능한 `verified` + `retro: pending`이면 회고다.
  - **백로그 순서**: fg-run 순서와 같다. priority high → medium → low, 같으면 slug 알파벳순.
  - **loop.md**: `wall:` 줄, `replan-round`/`replan-cap`, `## Stop-condition checks`의 `- [ ] Cn.`, `## Check progress`의 `- Cn: pass|fail …`.
  - **후속후보**: retro/*.md, done/*/run.md, done/*/plan.md에서 `## `로 시작하고 `후속` 또는 `다음 탐구`가 들어간 제목 아래, 다음 `## `까지의 최상위 `- ` 항목. 출처 slug와 날짜를 붙인다.
  - **done 폴더명 날짜**: `YYMMDD-HHMMSS-slug`(새 형식)와 `YYYY-MM-DD-slug`(옛 형식) 둘 다 있다.
- 기술: Tauri 2 + Svelte 5 + TypeScript(Vite). Rust 쪽에 파서·root 해석·파일 감시(`notify`)를 두고, 화면에는 스냅샷 JSON 하나를 넘긴다. 프로젝트 목록은 앱 데이터 폴더의 JSON에 둔다. Rust는 Homebrew rustup(stable 1.99.1)으로 설치돼 있다. PATH는 `~/.zshrc`에 있다.
- 완료 정의(DoD)
  1. `cd src-tauri && cargo test` → exit 0. 아래 고정 사실이 각각 테스트로 들어 있어야 한다(픽스처는 실제 프로젝트 `.forge`에서 필요한 파일만 떠 온 사본).
     - root: BibleMap(main) → `.forge`. PortfoliOn(dev, defaultBranch 없음) → `.forge/branch/dev`. FitCheck(dev, defaultBranch dev) → `.forge`. `feature/x` → `.forge/branch/feature/x`. detached → `.forge`.
     - BibleMap 픽스처: 활성 #362, 단계 실행·검증, loop wall에 `unverifiable-uat`, C2·C3 pass, C4·C5 fail, 재계획 0/3. 백로그 순서 [363, 354, 355, 350].
     - PortfoliOn 픽스처: 기록 영역 done 수 = 최상위 + `branch/dev`. 진행 영역은 `branch/dev`에서만 읽는다.
     - STATUS 파싱: `- verified: yes (…)`와 `verified: skipped (…)` 둘 다 첫 낱말로 읽는다.
     - 후속후보: `## 후속 후보`와 `## 후속 메모` 아래 항목만 잡는다. 다른 `## ` 절에서 멈춘다.
     - 깨진 파일 하나(마커 없는 backlog)는 그 파일만 오류로 표시하고 나머지는 계속 읽는다.
  2. `npm run tauri build -- --debug` → exit 0.
  3. UAT(사람 판정 — 화면 판단이라 기계 검사로 바꿀 수 없음). 앱에서 BibleMap · PortfoliOn · FitCheck · lab-taebro · taebro-infra를 등록하고 다음을 확인한다.
     - (a) BibleMap 보드가 `docs/board-mockup.html`의 구조(머리띠, 지금 카드의 단계 막대·루프 정지·C1~C6, 3열)와 맞는다.
     - (b) PortfoliOn 머리띠에 `dev · .forge/branch/dev/`, 최근 완료 수에 겹친 총수가 나온다.
     - (c) 아무 backlog 파일 제목을 고치면 2초 안에 보드가 바뀐다(되돌려 놓을 것). 브랜치를 바꾸면 root 표시가 바뀐다.
     - (d) macOS 다크/라이트를 바꾸면 따라간다.
     - (e) 빈 백로그·forge 없음·읽기 실패 상태가 시안대로 나온다.
     - (f) 카드를 누르면 그 문서(plan/run/STATUS/retro/loop)가 마크다운 탭으로 열린다.
     - (g) 5개 프로젝트를 띄운 채 1분 둔 뒤 활성 상태 보기의 'Anvil' 앱 + 그 WebContent 프로세스 메모리 합계가 200MB 이하다(목표값은 그릴링에서 정한 기준이 아니라 계획 작성 시 가정 — 넘으면 수치를 기록하고 사람과 판단).
  - 작성 시점 사전 상태(2026-10-17): DoD 1·2는 `src-tauri/`와 `package.json`이 없어 둘 다 실패한다. 둘 다 앞으로 통과시켜야 하는 검사다. 3은 사람 판정.

## 작업 조각
- [ ] S1. Tauri 2 + Svelte 5 + TS 골격과 `.gitignore`(target/, node_modules/, dist/) — 완료 기준: `npm run tauri dev`로 빈 창이 뜨고 `cargo build`가 통과한다.
- [ ] S2. 실제 `.forge` 일부로 테스트 픽스처를 만들고, forge root 해석을 테스트 먼저 구현 — 완료 기준: DoD 1의 root 테스트가 통과한다. (depends: S1)
- [ ] S3. `.forge` 파서를 테스트 먼저 구현한다. 대상은 plan 마커, STATUS, 단계 판정, backlog 순서, loop.md, done 겹치기, 후속후보 긁기, 파일 단위 오류 격리 — 완료 기준: DoD 1의 나머지 테스트가 통과한다. (depends: S2)
- [ ] S4. 프로젝트 수동 등록(폴더 고르기)과 앱 데이터 저장, 그리고 `.forge/` 재귀 감시와 `.git/HEAD` 감시를 붙여 바뀌면 스냅샷 이벤트를 보낸다(300ms 디바운스) — 완료 기준: 등록이 앱 재시작 뒤에도 남고, 파일을 고치면 화면 쪽에 새 스냅샷이 2초 안에 도착한다. (depends: S3)
- [ ] S5. 보드 화면을 `docs/board-mockup.html` 기준으로 만든다. 사이드바(프로젝트 + 가장 중요한 사실 한 줄: 루프 정지 > 검증 실패 > 실행 중 #N > 회고 대기 > 백로그 N > forge 없음), 머리띠(이번엔 세션 칩 없이 브랜치·root만), 지금 카드, 3열(열마다 스크롤, 제목 고정), 문서 탭, 다섯 가지 상태(빈·로딩·오류·긴 글 2줄 자르기·창 최소폭 960px), 시스템 배색 — 완료 기준: DoD 3 (a)(d)(e)(f). (depends: S4)
- [ ] S6. debug 빌드와 UAT, 메모리 측정 — 완료 기준: DoD 2와 3 전부. (depends: S5)
