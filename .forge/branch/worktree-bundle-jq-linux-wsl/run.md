# run — Linux·WSL에도 jq를 내장해 상태줄이 준비 없이 동작하게 한다 (v0.1.8)

실행 방식: 메인 세션 직접(TDD, 위임 없음 — 조각 6개가 대부분 직렬이라 워크플로보다 싸다). `cargo test`는 이 맥의 rustup 툴체인으로 바로 돌았다(task 15·16 때와 달리 docker 불필요).

## 조각별 결과
- S0 테스트 3개(WSL 복사 동작·`ANVIL_PATH_SH` 순서·tauri 리소스) 먼저 작성 — ✅ 빨강 확인(40 통과 · 3 실패). 컴파일되게 `JQ_VERSION`·`WSL_JQ` 상수와 jq를 놓지 않는 `wsl_bin_copy_cmd` 껍데기를 먼저 넣었다
- S1 jq 1.8.1 공식 Linux 바이너리 — ⚠ `build-tmux-linux.sh`에 받기 단계를 넣었지만 스크립트 전체(docker로 tmux 재빌드)는 돌리지 않고 같은 curl 두 줄만 실행했다(tmux 바이너리를 다시 만들어 diff를 내지 않으려고)
- S2 tauri 설정·`ANVIL_PATH_SH`·WSL 복사 명령·주석 — ✅ 계획대로. WSL 복사는 tmux 명령 뒤에 `t=$?; [버전 확인] || {tmp→mv} && exit $t`로 붙여 wsl.exe 호출 수를 늘리지 않았다
- S3 Linux e2e 컨테이너 ⑥ 단계 + `env.log` jq 줄 — ⚠ 첫 CI에서 실패: Ubuntu `sh`(dash)의 `command -v`는 못 찾으면 1이 아니라 127. jq 부재 확인을 "0 아님"으로 고쳐 재실행 초록
- S4 버전 0.1.8 다섯 곳 + `docs/releases/v0.1.8.md` + README 26행 — ✅ 계획대로
- S5 Windows ARM VM(`win-s5`, WSL1 aarch64) — ⚠ claude가 VM에서 로그인돼 있지 않아 실제 세션의 상태줄은 볼 수 없었다. 대신 앱 실행 뒤 claude가 상태줄을 부르는 것과 같은 명령(`bash '/mnt/c/…/anvil-statusline.sh'`, `ANVIL_PATH_SH` 적용)으로 래퍼를 돌려 확인했다(사용자 선택 없이 추천안 (가)로 진행)

## 계획과 달라진 점
- **S5 확인 방식**: DoD 4는 "세션 하나를 열고 claude가 상태줄을 그린 뒤 `models/<세션>.json`"과 사람의 스크린샷 판단이었다. VM의 WSL에 claude 로그인이 없어(`~/.claude/.credentials.json` 없음) 로그인 전 화면에서는 상태줄이 그려지지 않는다(추론). 바뀐 것은 jq 배치와 PATH뿐이고 claude가 상태줄 명령을 부르는 경로는 그대로라, 같은 명령으로 래퍼를 직접 실행해 대신했다. 사람은 앱 실행·스크린샷(준비물 띠 없음)만 했다.
- **CI 실패 1회**: 위 S3의 종료 코드 가정. 첫 실행의 나머지 ①~⑤ 실패는 `specFileRetries: 1`이 이미 설치를 마친 상태에서 스펙을 처음부터 다시 돌려 생긴 것으로, 첫 시도에서는 ①~⑤가 모두 통과했다(run 40659185281 로그).
- **`check-release.sh` 1건 실패 후 통과**: 커밋 전에는 작업본 버전(0.1.8)과 복제한 HEAD(0.1.7)가 달라 "같은 버전: 커밋 없이 태그만"이 실패했다. 커밋 뒤 실패 0.

## DoD 시작 → 끝
1. `cargo test`: 41+27=68 통과 → 43+27=70 통과, 실패 0 (새 테스트 2개 + 기존 `anvil_path_leads_with_anvil_node`의 단언 갱신)
2. jq 바이너리: 없음 → `jq-x86_64`·`jq-aarch64` 모두 `ELF … statically linked`, docker alpine:3.22에서 각 플랫폼 `--version` → `jq-1.8.1`
3. CI `e2e-desktop` Linux: ⑥ 없음 → run 40660820525 성공(clean 6 passing · old-node 4 passing, Windows 잡도 성공). `env.log`에 `jq: 없음`
4. VM WSL: `~/.local/share/anvil/bin/`에 tmux-3.6a만 → 앱 시작 때 `jq`(19:33) 추가, `jq --version` → `jq-1.8.1`; 시스템 PATH의 jq 없음; Anvil PATH의 `command -v jq` → `/home/tester/.local/share/anvil/bin/jq`; 래퍼 출력이 입력과 일치(원래 상태줄 `cat`), `models/vm-sl.json` → `{"model":"Opus 5.5","effort":"high"}`. 기존 `tmux-3.6a`(10-27)는 건드리지 않음
5. `npm run check` 0 ERRORS → 0 ERRORS, `npm run test:e2e` 통과 → 40 passed (회귀 방지, 프런트엔드 변경 없음)
6. `check-release.sh` 실패 0 → 실패 0 (회귀 방지)
7. 버전 0.1.7×5 → 0.1.8×5, `docs/releases/v0.1.8.md` 있음, README 26행 → "세션별 모델 표시 · 원래 상태줄 실행 | 앱에 내장"

## Follow-ups
<!-- followup: fu-3c1e7a9d52b4 | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- e2e-desktop의 `specFileRetries: 1`이 상태를 남기는 시나리오(linux.mjs — [설치]가 이미 끝남)를 처음부터 다시 돌려, 진짜 실패 하나가 ①~⑤의 가짜 실패 5개로 불어난다. 재시도를 끄거나 재시도 전에 상태를 되돌릴지 정할 것.
  Evidence: run 40659185281 Linux 잡 — 첫 시도 ①~⑤ 통과·⑥만 실패, 재시도에서 `.band.top` 없음으로 ①②③⑤ 실패.
