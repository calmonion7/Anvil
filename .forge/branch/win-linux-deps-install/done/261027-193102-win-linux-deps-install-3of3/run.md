# run — #14 Windows(WSL)·Linux에서도 [설치] 한 번으로 준비물 설치 + v0.1.6

실행 방식: 메인 세션 직접(TDD — cargo 테스트는 이 맥에 rust가 없어 docker `rust:1-bookworm`+WebKitGTK 컨테이너에서). 실제 동작은 e2e-desktop(Linux·Windows 러너)과 2부 VM(`win-s5`, Windows 11 ARM + WSL1)으로 확인.

## 슬라이스별 결과
- S1 정적 tmux — ✅ `scripts/build-tmux-linux.sh`(alpine musl, ncurses 직접 빌드) → `resources/bin-linux/tmux-x86_64·aarch64`, linux·windows 설정에 등록. ⚠ ncurses에 터미널 정의 내장(22.04는 /lib/terminfo, 26.04는 /usr/share/terminfo — 계획에 없던 문제)
- S2 Linux 감지·설치 — ✅ node 22 미만=없음, Anvil PATH, linux tar.gz+sha256sum, 옛 node면 심링크 안 함. ⚠ git 안내(Need::Git)·wget 대체 추가(사람 결정: git은 안내만)
- S3 WSL 감지·설치 — ✅ WSL 없음/배포판 없음 구분, tmux 버전 이름 복사, Windows needs 목록·installable, 설치는 WSL 로그인 셸. ⚠ `wsl.exe --`→`-e`(셸이 `$` 펼침), `\\?\` 경로, claude 홈 캐시, WSL1 tar 실패(python3 대체) 고침
- S4 로그인 띠 — ✅ 비 macOS면 '세션을 열면 claude가 로그인을 안내' + 버튼 없음, e2e 2건
- S5 VM 손 테스트 — ✅ 스크린샷 3장 + tmux 3.6a. ⚠ 콘솔 깜빡임은 VM이 느려 사람이 판단 못 함(CREATE_NO_WINDOW는 선제 적용)
- S6 릴리스 준비 — ✅ 0.1.6, docs/releases/v0.1.6.md, README 준비물·설치

## 계획과 달라진 것 · 그 자리에서 정한 것
- **git(사람 결정)**: forge 마켓플레이스 등록은 git clone이라 git이 꼭 필요(실측: `Executable not found in $PATH: "git"`). 데스크톱 Ubuntu엔 git이 없고 설치엔 sudo가 필요 → 사람이 'git은 안내만'을 골랐다. Linux·WSL에 `Need::Git`(띠에 `sudo apt install git`), [설치]는 git을 건너뛰고 forge도 git 뒤로. e2e 깨끗한 PC 시나리오는 '안내 확인 → 사용자처럼 sudo apt install git → [다시 확인] → [설치]'로.
- **curl 없음**: claude install.sh는 wget으로도 돈다(실측) — node·claude 받기에 curl 없으면 wget.
- **terminfo**: 정적 tmux가 배포판마다 다른 terminfo 위치를 못 찾을 위험 → ncurses를 직접 빌드해 xterm-256color 등을 내장, 세 경로 검색. 22.04·26.04 × amd64·arm64에서 세션 열림 확인.
- **WSL 호출**: `wsl.exe --`는 WSL 기본 셸이 인자를 다시 해석해 `$`가 사라진다(1부 env.log에서 확인) → tmux·claude·확인·설치 모두 `wsl.exe -e`. tmux는 `-e sh -c 'exec "$HOME/…/tmux-3.6a" "$@"'`. 기존 `backend_missing`은 쓸모가 없어져 지움.
- **Windows 리소스 경로**: Tauri가 `\\?\D:\…`로 줘서 `to_wsl`이 깨지고 tmux 복사가 조용히 실패 → 접두어를 걷어 냄(+테스트), 복사 실패를 로그로.
- **세션 시작**: 동기 명령은 메인 스레드에서 돈다 → `session_start`를 spawn_blocking으로(wsl.exe가 느려도 화면이 굳지 않게).
- **콘솔 창(결정 8)**: 5초마다 상태 확인이 wsl.exe를 띄우므로 깜빡임이 확실하다고 보고 `hidden_command`(CREATE_NO_WINDOW)를 선제 적용 — VM 손 테스트로 보려 했으나 VM이 느려 사람이 판단하지 못했다.
- **S5에서 찾은 버그 둘**: ① WSL1 + Ubuntu 26.04의 GNU tar 1.35가 WSL1에 없는 시스템 호출로 node 풀기 실패(`Function not implemented`) → tar 실패 시 python3 tarfile로(생성된 명령 그대로 VM에서 v22.20.0 확인) ② 앱이 배포판보다 먼저 떠 있으면 claude 홈을 윈도우 폴더로 기억해 WSL에 깐 forge를 못 봄 → WSL 홈을 찾았을 때만 기억.
- **e2e-desktop**: Windows 단계에 시간 제한(이전엔 요소가 없으면 15분 대기)·콘솔 숨김·가려진 창 그리기 옵션, `workflow_dispatch` 입력 `installer`로 VM 손 테스트용 NSIS 설치 파일을 만든다.
- **VM 손 테스트 진행**: 에이전트가 SSH로 설치 파일 조용히 설치·프로젝트 등록 → 사람: 'WSL 필요' 띠 → 에이전트: DISM+재부팅+WSL MSI(배포판 없음) → 사람: '배포판 필요' 띠 → `wsl --install -d Ubuntu`·사용자 만들기 → [다시 확인](목록+[설치]) → [설치](1차: node 실패·forge 미인식 → 고쳐 재설치 → node ✓) → [세션 열기] → claude 첫 화면. claude·forge는 1차 [설치]에서, node는 2차에서 들어갔다.

## DoD 기준선 → 실행 후
1. `cargo test` — 34+27=61 통과(docker) → 41+27=68 통과, 실패 0
2. `npm run test:e2e` — 35 passed → 37 passed
3. `npm run check` — 0 ERRORS → 0 ERRORS
4. `grep -rnE "\.fails\(|xfail|expectedFailure|실패 예정" e2e-desktop/` — 24줄 → 0줄, e2e-desktop 두 잡 초록(run 40485967406, 커밋 2cce094 — Windows는 WSL1 안 [설치] → claude 첫 화면까지)
5. 버전 다섯 곳 — 모두 0.1.5 → `0.1.6 0.1.6 0.1.6 0.1.6`, Cargo.toml·Cargo.lock anvil `0.1.6`
6. `grep -nE "apt install.*nodejs" README.md` — 2줄 → 0줄
7. VM 손 테스트 — 사람 스크린샷: 'WSL이 필요합니다' 띠([설치] 없음), [설치] 뒤 준비물 띠 사라짐(claude·forge·node ✓), 세션 터미널에 claude 첫 화면('Choose the text style') + VM `wsl -- ~/.local/share/anvil/bin/tmux-3.6a -V` → `tmux 3.6a`

## 후속 후보
<!-- followup: fu-6f1dafa02d5b | source: win-linux-deps-install-3of3 | task: 14 | date: 2026-10-27 | status: open | taken: - -->
- [설치] 직후 자동 재확인이 node를 아직 없는 것으로 보여, [다시 확인]을 눌러야 띠가 사라졌다(WSL1 VM). 확인 호출 자체는 정상(같은 방식으로 v22.20.0) — 설치 직후 재확인의 시점·캐시를 살펴볼 것.
  Evidence: S5 VM 스크린샷 '필요: node 22 이상 / ✓ node 22 이상 설치됨' 뒤 [다시 확인]으로 띠 사라짐.
<!-- followup: fu-62d8e42c3b92 | source: win-linux-deps-install-3of3 | task: 14 | date: 2026-10-27 | status: open | taken: - -->
- Windows 콘솔 창 깜빡임을 실제 x64 Windows PC(또는 빠른 VM)에서 사람이 확인 — CREATE_NO_WINDOW는 넣었지만 ARM VM이 느려 판단하지 못했다.
  Evidence: S5에서 사용자 "버벅거려서 잘모르겠음".
<!-- followup: fu-b9bbeaeaac9c | source: win-linux-deps-install-3of3 | task: 14 | date: 2026-10-27 | status: open | taken: - -->
- Linux·WSL에도 jq를 내장할지 — 지금은 있으면 쓰고 없으면 세션별 모델 표시만 빠진다(README에 명시). macOS처럼 정적 jq를 넣으면 준비 없이 모델 표시가 된다.
  Evidence: 상태줄 래퍼가 `command -v jq`일 때만 모델 기록(session.rs STATUSLINE_SCRIPT).
