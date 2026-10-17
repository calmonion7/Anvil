# RUN — Anvil 1/3 보드 모니터 (task 1 · anvil-monitor-1of3)

실행: 2026-10-17 · fg-loop 무인 구동 안에서 이 세션이 직접 직렬 실행(워크플로 미사용)

## 조각별 결과
- S1 Tauri 2 + SvelteKit(Svelte 5) + TS 골격, `.gitignore` — ⚠ create-tauri-app 템플릿이 SvelteKit SPA(adapter-static)라 그대로 씀. 번들 대상을 `.app`만으로 줄임(아래)
- S2 픽스처 + forge root 해석(테스트 먼저) — ⚠ BibleMap #362 시점 STATUS·loop.md는 원본이 이미 사라져 재구성(픽스처 README에 표시)
- S3 `.forge` 파서(테스트 먼저) — ✅ 계획대로. 19개 테스트 통과
- S4 프로젝트 등록·앱 데이터 저장·`.forge`/git HEAD 감시(300ms 디바운스) — ✅ 계획대로(실제 2초 안 도착은 사람 UAT (c)로 확인 필요)
- S5 보드 화면 — ⚠ 구현 완료, 화면 판정은 미확인(이 세션은 화면 기록 권한이 없어 스크린샷이 검은 화면)
- S6 debug 빌드·UAT·메모리 — ⚠ DoD 2 통과, 메모리는 측정, UAT (a)~(f)는 사람 판정 대기

## DoD baseline → after
- DoD 1 `cargo test --manifest-path src-tauri/Cargo.toml`: 실패(src-tauri 없음) → exit 0, forge 테스트 19 passed
- DoD 2 `npm run tauri build -- --debug`: 실패(package.json 없음) → exit 0 (`Anvil.app` 32.6MB)
- DoD 3 UAT: 미실행 → (g)만 측정, (a)~(f)는 사람 판정 대기

## 계획과 달라진 점 · 그 자리 결정
- **워크플로 대신 직접 실행**: S1→S6가 전부 직렬 의존이라 병렬 이득이 없고, 워크플로 스크립트 승인은 무인 구동을 멈춘다. fg-run의 "작으면 직접" 규칙을 따름.
- **워크트리·브랜치 root**: 백그라운드 세션 격리 규칙으로 `anvil-monitor` 브랜치 워크트리에서 작업. forge 상태는 `.forge/branch/anvil-monitor/`(git 추적)에 있고, 백로그 3개는 main의 `.forge/backlog/`에서 **복사**했다(main 쪽 원본은 그대로 남음 — fg-merge 뒤 중복 정리 필요).
- **픽스처 재구성**: 계획의 BibleMap 고정 사실(#362 실행·검증, wall `unverifiable-uat`, C2·C3 pass, C4·C5 fail, 0/3)은 계획 작성 시점 스냅샷이다. 지금 BibleMap은 #362를 봉인하고 #363을 실행 중이라, plan/run은 done 아카이브에서, #363 계획은 현재 plan.md에서 복사하고 STATUS·loop.md는 forge 형식대로 다시 썼다. 실제 loop.md에서 본 원장 변형(`fail x1`, `미실행`)을 섞어 관대한 파싱을 검사한다.
- **PortfoliOn 진행 영역 검사용 미끼**: 실제 최상위 backlog가 비어 있어 `top-level-decoy.md`를 합성.
- **root 테스트**: 중첩 `.git`은 git이 추적하지 않아 임시 폴더에 `.git/HEAD`를 만들어 검사. 워크트리처럼 `.git`이 파일(`gitdir:`)인 경우도 추가로 검사.
- **DMG 번들 실패 → `.app`만**: 첫 debug 빌드가 컴파일은 됐으나 DMG 단계에서 Finder AppleScript 시간 초과(-1712)로 exit 1. 패키징은 「하지 않을 것」이라 `bundle.targets`를 `["app"]`로 줄였다.
- **'다음 단계' 버튼 자리**: 계획대로 비워 둠(머리띠 오른쪽 여백). 후속후보 카드의 착수·숨김 버튼도 3/3으로 미룸.
- **실제 데이터 확인**: 5개 프로젝트를 파서로 읽어 오류 0건. BibleMap 실행 중 #363·완료 331·후속후보 121, PortfoliOn `branch/dev` root·완료 379, 이 워크트리 자신도 `.forge/branch/anvil-monitor`로 읽힘.
- **후속후보 수**: 시안의 BibleMap 21과 달리 121이 잡힌다. 규칙("## 제목에 후속/다음 탐구" + done의 plan/run + retro)대로 세면 이 수가 맞다 — 시안 숫자는 예시였던 것으로 보인다. 많으면 숨김(3/3)으로 다룬다.
- **마크다운 렌더**: `marked` 출력을 그대로 `{@html}`에 넣는다. 등록한 프로젝트의 로컬 문서만 열고 `.forge/` 밖은 거부하지만, HTML 정화는 하지 않는다(신뢰하는 로컬 파일 전제).

## 막힌 곳
- 화면 판정: 이 세션 프로세스에 화면 기록 권한이 없어 `screencapture`가 검은 화면 → UAT (a)~(f)는 사람이 봐야 한다.

## 메모리 (UAT g)
5개 프로젝트를 앱 데이터 `projects.json`에 등록하고 debug `.app`을 띄운 뒤 1분 3초 시점 측정(`footprint` = 활성 상태 보기의 '메모리' 열):
- anvil 28MB + WebContent 50MB = **78MB** (목표 200MB 이하 ✅). GPU 13MB · Networking 4.8MB까지 더하면 약 96MB.
- 참고 RSS: anvil 103MB · WebContent 62MB · GPU 30MB · Networking 12MB.

## 수리 r1 (fg-loop 제자리 수리 · 재계획 1/3)
- UAT 결과(사람): 후속후보·최근 완료 열의 카드 제목이 안 보임 → `verified: failed`.
- 원인: 열이 세로 flex 스크롤 컨테이너인데 카드에 `min-height: 44px`를 줘서 flex 기본 최소 높이(내용 높이)가 덮어써졌다. 카드가 넘치는 열에서 카드가 44px로 줄고 위쪽 제목 줄이 잘렸다. 카드가 적은 백로그 열은 넘치지 않아 멀쩡했다.
- 수정: 열의 자식에 `flex: none`(Board.svelte). debug 빌드 다시 exit 0, 앱 재시작.
- 재검증: UAT (a)~(f) 사람 판정 다시 대기.
