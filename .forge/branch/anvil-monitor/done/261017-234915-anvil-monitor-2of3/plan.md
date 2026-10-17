<!-- repaired-by: fg-loop -->
<!-- forge-slug: anvil-monitor-2of3 -->
<!-- task: 2 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
# Anvil 2/3 — 프로젝트마다 계획·실행 세션을 tmux 위에 띄우고, 상태와 알림을 보여 준다

## 목표 / 하지 않을 것
- 목표: 보드 아래에 계획 | 실행 좌우 분할 터미널 패널을 붙인다. 두 세션은 Anvil 전용 tmux 소켓 위의 claude다. 세션 상태(작업 중 · 입력 대기 · 종료)를 claude 훅으로 확실하게 판별해 사이드바·머리띠·상태줄에 보여 준다. 입력 대기가 되면 알린다. 앱을 닫아도 세션은 살아 있고, 다시 열면 다시 붙는다.
- 하지 않을 것:
  - 보드 버튼이 세션에 명령을 채우는 일 (3/3)
  - 역할 없는 자유 세션 (계획·실행 두 자리만)
  - Anvil 밖에서 띄운 claude 추적
  - 사용자의 평소 tmux나 `~/.claude/settings.json` 수정

## 정본
- 용어: `.forge/CONTEXT.md`의 세션 · 계획 세션 · 실행 세션 · 세션 상태
- ADR: `.forge/adr/261017-211601-sessions-on-dedicated-tmux-socket.md`, `.forge/adr/261017-211602-anvil-never-writes-forge.md`
- 디자인 정본: `docs/board-mockup.html`의 아래 패널(좌 계획 · 우 실행, 각 머리줄에 상태 점 + 라벨), 상태줄(🔔 다른 프로젝트 입력 대기), 사이드바의 두 점(계획·실행), 머리띠 세션 칩.
- 세션 규칙
  - tmux: `tmux -L anvil -f <앱이 만든 tmux.conf>`. 설정은 status off, mouse on, history-limit 50000, `default-terminal xterm-256color`. 세션 이름은 `anvil-<프로젝트키>-plan` / `anvil-<프로젝트키>-run`. 터미널 패널은 xterm.js이고, 앱 pty 안에서 `tmux attach`로 붙는다.
  - claude는 프로젝트 폴더에서 `claude --settings <앱 훅 설정>`으로 띄운다. 훅이 할 일은 다음과 같다.
    - SessionStart: 세션 ID를 기록한다.
    - UserPromptSubmit: 작업 중으로 바꾼다.
    - Stop / Notification: 입력 대기로 바꾼다.
    - SessionEnd: 종료로 바꾼다.
    - 기록 위치: 앱 데이터 폴더 `sessions/<tmux 세션 이름>.json` (`{state, session_id, ts}`).
  - 알림: 입력 대기로 바뀔 때 앱이 떠 있으면 앱이 알린다(지금 보고 있는 세션은 제외). 앱이 꺼져 있으면 훅이 `osascript`로 직접 알린다(앱은 pid 파일로 자신이 떠 있음을 알린다). 알림 문구에는 프로젝트와 forge 상태를 붙인다(예: `BibleMap · 입력 대기 — #362 실행·검증`).
  - 세션과 작업 연결: 진행 영역의 `running.md`나 `drive.md`의 `session:`이 그 세션 ID와 같을 때만 "이 세션이 #N 실행 중"으로 표시한다. 그 밖에는 프로젝트 단위 forge 상태만 보인다. 짐작으로 짝짓지 않는다.
  - 앱 종료(Cmd+Q)는 세션을 죽이지 않는다. 세션을 끝내는 것은 세션 머리줄의 '세션 종료'뿐이다(확인창 띄움, `tmux kill-session`).
- 알려진 함정(실행 전에 확인할 것)
  - Finder에서 띄운 GUI 앱은 PATH가 최소라서 `claude`(~/.local/bin 등)와 `tmux`(/opt/homebrew/bin)를 못 찾는다. 로그인 셸에서 PATH를 받아 tmux 서버와 claude에 넘긴다.
  - `claude --settings`로 넘긴 훅이 사용자 설정·forge 플러그인 훅과 함께 실행되는지(대체하지 않는지)는 문서만 믿지 말고 한 번 재현해서 확인한다.
- 완료 정의(DoD)
  1. 앱에서 BibleMap 계획 세션을 연 뒤 앱을 종료(Cmd+Q)하고 `tmux -L anvil ls | grep -c '^anvil-'` → 1 이상.
  2. 그 세션에서 프롬프트 하나를 보내고 끝나기를 기다린 뒤 `cat "<앱 데이터>/sessions/anvil-<키>-plan.json"` → `state`가 입력 대기이고, 응답 중에 같은 파일을 읽으면 작업 중이었다(두 값을 실행 기록에 남긴다).
  3. `claude --settings` 훅 병합 재현 — 앱 훅 파일과 forge 플러그인의 SessionStart 훅이 한 세션에서 둘 다 실행된 흔적(앱 상태 파일 + forge 세션 시작 출력)이 있다.
  4. UAT(사람 판정 — 터미널 조작·알림·화면 배치는 기계 검사로 바꿀 수 없음)
     - (a) 좌우 분할 패널에서 claude를 그대로 쓸 수 있다(한글 입력, 마우스 스크롤, 크기 조절, 경계 끌기).
     - (b) 다른 프로젝트 세션이 입력 대기가 되면 상태줄 🔔와 macOS 알림이 온다. 지금 보고 있는 세션은 알리지 않는다.
     - (c) 앱을 다시 열면 살아 있는 세션에 다시 붙고, 상태가 맞게 보인다.
     - (d) fg-run 중인 실행 세션의 머리줄과 머리띠에 `#N`이 나온다.
     - (e) 사용자의 평소 tmux 세션 목록(`tmux ls`)에는 anvil 세션이 보이지 않는다.
  - 작성 시점 사전 상태(2026-10-17): 1은 `error connecting to /private/tmp/tmux-501/anvil (No such file or directory)`로 0, 2·3은 앱이 없어 실행 불가. 모두 앞으로 통과시켜야 하는 검사다.

## 작업 조각
- [ ] S1. GUI 앱 PATH 문제 해결(로그인 셸 환경 받기)과 Anvil 전용 tmux 설정·소켓 관리(세션 만들기·목록·없애기) — 완료 기준: debug 빌드를 Finder에서 띄워도 `tmux -L anvil` 세션이 만들어지고 그 안에서 `claude --version`이 돈다.
- [ ] S2. 앱 훅 설정과 훅 스크립트(상태 파일 기록, 앱이 꺼져 있을 때 알림), 그리고 `--settings` 병합 재현 — 완료 기준: DoD 2·3. (depends: S1)
- [ ] S3. xterm.js 좌우 분할 패널 + pty로 tmux 붙기, 세션 열기·종료, 앱 재시작 시 다시 붙기 — 완료 기준: DoD 1, UAT (a)(c)(e). (depends: S1)
- [ ] S4. 상태 표시와 알림. 사이드바 두 점, 머리띠 세션 칩, 패널 머리줄, 상태줄 🔔, 앱 알림(보고 있는 세션 제외), `running.md`/`drive.md` 세션 ID로 #N 연결 — 완료 기준: UAT (b)(d). (depends: S2, S3)
