# RUN — Anvil 2/3 tmux 세션·상태·알림 (task 2 · anvil-monitor-2of3)

실행: 2026-10-17 · fg-loop 무인 구동 안에서 이 세션이 직접 직렬 실행(워크플로 미사용)

## 조각별 결과
- S1 GUI PATH(로그인 셸에서 받기) + Anvil 전용 tmux 설정·소켓 관리 — ✅ PATH·LANG을 지운 최소 환경에서도 세션이 열리고 claude가 뜬다. ⚠ 로캘도 함께 넘김(아래)
- S2 앱 훅 설정·훅 스크립트·`--settings` 병합 재현 — ✅ DoD 2·3 통과. ⚠ 병합 증거는 SessionStart가 아니라 Stop 훅 기록으로 잡음(아래)
- S3 xterm.js 좌우 분할 + pty `tmux attach`, 세션 열기·종료, 재시작 시 다시 붙기 — ✅ 구현, 앱 재시작 뒤 살아 있는 세션에 자동으로 붙는 것 확인(`list-clients`). 조작감은 사람 UAT
- S4 상태 표시·알림(사이드바 두 점, 머리띠 칩, 패널 머리줄, 상태줄 🔔, 앱 알림, `running.md`/`drive.md` 세션 ID로 #N) — ✅ 구현. 화면·알림은 사람 UAT

## DoD baseline → after
- DoD 1 `tmux -L anvil ls | grep -c '^anvil-'`: `error connecting to /private/tmp/tmux-501/anvil` (0) → 앱 `quit`(Cmd+Q와 같은 정상 종료) 뒤 **1**
- DoD 2 상태 파일: 앱 없음 → `anvil-biblemap-641f90-plan.json`이 SessionStart 뒤 `waiting`, 프롬프트 제출 뒤 t+2s `working`, 응답 뒤 t+4~5s `waiting` (세 번 재현, 세션 ID 기록됨)
- DoD 3 훅 병합: 미재현 → 같은 Stop 이벤트의 `stop_hook_summary`가 `hookCount: 2` — `anvil-hook.sh waiting`(앱 `--settings`) + forge 플러그인 `run-hook.cmd stop`. `--settings` 훅은 대체가 아니라 병합된다
- DoD 4 UAT: (e) 사용자 기본 tmux 소켓에 anvil 세션 0개 ✅ — (a)(b)(c)(d)는 사람 판정 대기

## 계획과 달라진 점 · 그 자리 결정
- **로캘**: Finder에서 띄운 앱에는 LANG도 없어서, 그대로 두면 tmux가 한글을 `_`로 바꾼다. tmux 서버·클라이언트에 `-u`와 `LANG`(없으면 `en_US.UTF-8`)을 넘기고 claude에도 `-e LANG`로 넘긴다. 한글 프롬프트가 tmux를 거쳐 그대로 transcript에 들어간 것을 확인했다.
- **세션 이름**: `anvil-<폴더 이름>-<경로 해시 6자리>-<plan|run>`(예: `anvil-biblemap-641f90-plan`). 같은 이름의 폴더를 구분하려고 해시를 붙였다. 해시는 실행마다 같아야 해서 FNV-1a를 쓴다.
- **훅 이벤트**: 계획의 다섯 가지에 `PostToolUse → working`을 더했다. 권한 확인(Notification → 입력 대기)을 승인한 뒤 claude가 다시 일할 때 '작업 중'으로 돌아올 길이 없었기 때문이다.
- **병합 증거**: forge의 SessionStart 훅은 빚진 상태가 없으면 출력하지 않는다(BibleMap은 #363 승격만 된 상태라 침묵). 그래서 출력이 없어도 실행 목록이 남는 Stop 훅 기록(`stop_hook_summary.hookInfos`)으로 병합을 확인했다. 같은 이벤트에 두 훅이 함께 돈 것은 같은 증거다.
- **검증 프로젝트**: 이 워크트리는 claude에서 아직 신뢰한 폴더가 아니라 신뢰 확인창이 떴다. 폴더 신뢰는 권한 결정이라 대신 고르지 않고, 이미 신뢰된 BibleMap(DoD가 지정한 프로젝트)에서 "도구 쓰지 말고 한 단어로 답" 프롬프트로 검증했다. BibleMap 파일은 건드리지 않았다(transcript만 `~/.claude/projects/`에 생김).
- **앱 경로로 검증**: 버튼은 누를 수 없어서, 앱과 같은 `session::start`를 부르는 임시 예제를 PATH·LANG을 지운 환경에서 돌렸다(검증 뒤 삭제). 앱의 터미널 부착·상태 표시는 실제 앱에서 `tmux list-clients`로 확인했다.
- **앱 알림 시점**: 지금 보고 있는 프로젝트의 세션은 창에 초점이 있을 때만 알리지 않는다. 창이 뒤에 있으면 보고 있는 게 아니라서 알린다.
- **훅 알림 문구**: 앱이 스냅샷마다 `summary/<세션 이름>.txt`에 `<프로젝트> <역할> 세션 · 입력 대기 — <한 줄 사실>`을 써 두고, 앱이 꺼져 있으면 훅이 그 문구로 `osascript` 알림을 띄운다. 앱이 꺼져 있는 동안 forge 상태가 바뀌면 문구가 낡을 수 있다.
- **세션 생존 확인**: 훅이 남기지 못하는 변화(claude 밖의 이유로 tmux 세션이 사라짐)를 따라가려고 화면이 5초마다 상태를 다시 읽는다.

## 막힌 곳 · 미해결
- **첫 세션이 저절로 끝남(재현 안 됨)**: 첫 BibleMap 세션이 응답 12초 뒤 `ended`(SessionEnd)로 끝나고 tmux 서버도 내려갔다. transcript에 사용자 `/exit` 같은 입력은 없다. 같은 조건으로 세 번(앱 없이, 앱이 붙은 채, 앱이 붙은 채 프롬프트) 다시 해 봤지만 재현되지 않았다. UAT 중 세션이 저절로 닫히면 알려 달라고 사람에게 넘긴다.
- **화면 판정**: 이 세션은 화면 기록 권한이 없어 터미널 조작감·알림·배치는 볼 수 없다.

## UAT 상태
- (a) 한글 입력·스크롤·크기·경계 끌기 — 사람 판정 대기
- (b) 다른 프로젝트 입력 대기 시 🔔·macOS 알림, 보고 있는 세션은 제외 — 사람 판정 대기
- (c) 앱 재시작 시 다시 붙고 상태가 맞음 — 기계로는 재부착 확인(`list-clients`), 화면은 사람 판정 대기
- (d) fg-run 중인 실행 세션 머리줄·머리띠의 `#N` — 사람 판정 대기(실행 세션에서 fg-run을 돌려야 함)
- (e) 기본 `tmux ls`에 anvil 세션 없음 — ✅
