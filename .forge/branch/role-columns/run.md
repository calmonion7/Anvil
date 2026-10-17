# RUN — 계획 열·실행 열 두 줄기 배치 · 세션 이름·모델 · 실제 모델·effort (task 4 · role-columns-and-session-names)

실행: 2026-10-18 · fg-loop 무인 구동 안에서 이 세션이 직접 직렬 실행(워크플로 미사용 — 코드 약 2,200줄 규모)

## 조각별 결과
- S1 세션 이름·모델 — ✅ `session::session_title`(이름 규칙 한 곳) + 단위 테스트, `start`가 `claude -n '<이름>' --model <opus|sonnet>`과 tmux `-e CC_SESSION_NAME=<이름>`을 넘김, `session_titles` 명령으로 머리줄이 같은 값을 받음. DoD 2·3·4는 앱 실측 대기
- S2 역할 두 줄기 배치 — ✅ 머리줄(이름·브랜치·root 경고·다음 단계)과 오류 띠, 계획 열(`PlanColumn` — 후속후보/최근 완료 탭·한 줄 카드), 실행 열(`RunColumn` — 「지금」 띠·회고 대기·루프 줄·백로그), 아래 두 터미널. `Board.svelte` 제거. UAT 대기
- S3 경계 기억과 문서 탭 자리 — ✅ 본문을 3×3 격자 하나로: 세로 경계 하나가 목록·터미널을, 가로 경계 하나가 두 열을 함께 나눔. 가로 기본 1/3. 두 비율은 localStorage `anvil.layout`. 문서는 위쪽 두 열을 합친 칸에 열림(세로 경계는 터미널 사이로만 줄어듦). DoD 6 앱 실측 대기
- S5 프로젝트 영역 접기 — ✅ «/» 토글, 48px 레일(앞 두 글자·상태 점·현재 강조·`title`), ＋ 아이콘 버튼, ×는 펼쳤을 때만, 접힘도 `anvil.layout`에 기억. 터미널 다시 맞춤은 기존 ResizeObserver(fit → `term_resize`)가 맡음. DoD 6a 앱 실측 대기
- S4 실제 모델·effort 표시 — ✅ 상태줄 래퍼 `anvil-statusline.sh`(앱 데이터)를 훅과 같은 `--settings`의 `statusLine`으로 넣음. `models/<tmux 이름>.json`에 원자적 기록 후 원래 상태줄 명령을 같은 입력으로 실행. `session_models` 명령 + `models` 이벤트(기록 폴더 감시)로 머리줄 갱신. DoD 5a 앱 실측 대기

## DoD baseline → after
- DoD 1 `session_title.* ok` 개수: 0 → 1 (전체 23 passed: session 3 + forge 20, exit 0)
- DoD 2 `ps`의 `-n`·`--model`: 측정 불가(tmux anvil 서버 없음) → 새 빌드로 세션을 연 뒤 측정 대기
- DoD 3 `/clear` 뒤 이름 유지: 측정 불가 → 사람이 `/clear` 한 뒤 측정 대기
- DoD 4 cxa dry-run의 `[Anvil]` 개수: 0 → 측정 대기(Anvil 세션이 떠 있을 때 다시 재야 의미가 있음)
- DoD 5 `npm run check`: 0 ERRORS → 0 ERRORS (회귀 방지 — 그대로)
- DoD 5a 모델·effort 기록 파일: 없음 → 래퍼 단독 검증 통과(객체 effort `high`·옛 문자열 effort `low` 기록, 원래 상태줄 출력 그대로, `ANVIL_SESSION` 없으면 기록 안 함). 실제 세션에서 측정 대기
- DoD 6 터미널 줄 수: 측정 불가 → 측정 대기(계산상 창 900px에서 약 35줄)
- DoD 6a 접었을 때 폭: 측정 불가 → 측정 대기
- UAT (a)~(g): 사람 판정 대기
- 덤: `npm run tauri build -- --debug` → exit 0

## 계획과 달라진 점 · 그 자리 결정
- **시안 파일을 읽지 못함**: 시안 아티팩트의 `.dc.html` 읽기가 자동 모드 분류기에 막혔다(외부 코드 분류). 우회하지 않고 계획의 '배치 규칙'만 보고 구현 — 세부 간격·색은 시안과 다를 수 있어 UAT (a)에서 확인이 필요하다.
- **머리줄의 세션 상태 칩 제거**: 옛 보드 머리줄에 있던 「계획 · 입력 대기」 칩은 계획 배치 규칙에 없고 터미널 머리줄이 같은 정보를 보여서 뺐다. `다음 단계` 옆 막는 조건 문구는 남겼다.
- **forge 없는 프로젝트**: 따로 큰 빈 상태 카드를 두지 않고 「지금」 띠에 "forge 없음 — …" 한 줄, 계획 열·백로그는 각자 빈 칸으로 보인다(격자를 깨지 않으려고).
- **머리줄 표기**: `[Anvil] [BibleMap] PLAN · Opus 5.5 · high`를 상태·연결 작업 뒤에 말줄임으로 둔다. 세션이 없을 때도 붙을 이름·모델(opus/sonnet)을 미리 보인다.
- **래퍼의 jq 의존**: 상태줄 JSON의 중첩 필드를 안전하게 읽으려고 jq를 쓴다(세션 PATH는 로그인 셸 PATH라 `/opt/homebrew/bin/jq`가 잡힘). jq가 없으면 기록만 건너뛰고, 원래 상태줄은 그대로 그린다.
- **자기 자신 재귀 방지**: 원래 상태줄 명령이 `anvil-statusline.sh`면 실행하지 않는다.
- **이전 버전 앱이 띄운 세션**: `-n`·`--model` 없이 떠 있던 세션은 이름이 붙지 않고, 기록 파일이 없어 머리줄에 띄울 때 모델(opus/sonnet)이 보인다. 새로 띄울 때만 적용한다는 계획 범위대로 둠.

## UAT 진행
- 에이전트가 확인한 것: DoD 1 ✅, DoD 5 ✅, 래퍼 단독 검증 ✅, debug 빌드 ✅.
- 나머지(DoD 2·3·4·5a·6·6a, UAT (a)~(g))는 새 빌드 앱을 띄워 세션을 열어야 잴 수 있다. 지금 떠 있는 앱은 main 빌드(pid 49757)라, 앱 교체는 사람 몫 — 사람 판정 대기.
