<!-- forge-slug: win-linux-deps-install-3of3 -->
<!-- task: 14 -->
<!-- part: 3/3 -->
<!-- tdd: on -->
<!-- priority: high -->
# Windows(WSL)·Linux에서도 [설치] 한 번으로 준비물 설치 + v0.1.6

## Goal / Non-goals
- Goal: macOS처럼 Windows(WSL 안)와 Linux에서도 [설치] 한 번으로 빠진 준비물(node 22 이상·claude CLI·forge)을 관리자 권한 없이 깐다. tmux는 정적 빌드를 앱에 내장해 어느 OS에서도 준비물에서 빠진다. 1부 하네스의 '실패 예정' 단계가 모두 초록이 되고, 2부 VM 손 테스트를 통과한 뒤 v0.1.6으로 릴리스한다.
- Non-goals: WSL·배포판 자동 설치(`wsl --install`은 UAC·재부팅·계정 생성이 필요 — 구분해 **안내만**). WSL 없는 Windows. sudo·apt/dnf로 까는 길. Linux 외부 터미널 로그인 창. Linux arm64 릴리스(번들은 x86_64만, aarch64 tmux는 Windows 번들 전용). WSL 명령 생성 코드의 전면 통합(필요한 곳만 손댄다).

## Source of truth
- Glossary: `.forge/CONTEXT.md` — 준비물(세 OS 공통 node 22 이상·claude CLI·forge, 22 미만은 없는 것으로, 앱 내장 도구는 준비물 아님, WSL·배포판은 바탕이며 안내만)
- ADR: `.forge/adr/261025-163349-bundle-static-tmux-on-linux-and-wsl.md`(정적 tmux 내장, WSL은 버전 이름으로 복사), `.forge/adr/261024-202909-bundle-tmux-jq-on-macos.md`(macOS 내장 — 그대로)
- 기존 코드: `src-tauri/src/deps.rs`(`Need`·`missing`·`step_cmd`·`install_with`·Windows 분기·`installable`), `src-tauri/src/session.rs`(`login_path`·`path_with`·`bundled_bin`·`tmux_argv`·`backend_missing`·`session_cmd`), `src-tauri/src/lib.rs:360-372,490`, `scripts/build-tmux.sh`, `src/routes/+page.svelte:90-122,500-529`

## 그릴링에서 정한 것
1. tmux: musl 정적 링크 tmux 3.6a를 linux x86_64·aarch64로 빌드해 커밋(이 맥의 docker로). Linux 번들은 x86_64, Windows 번들은 두 벌. Linux는 시스템 tmux가 있어도 항상 내장본.
2. WSL: 앱이 WSL을 확인할 때 `~/.local/share/anvil/bin/tmux-3.6a`가 없으면 배포판 `uname -m`에 맞는 내장본을 복사하고, `tmux_argv`는 그 경로를 실행한다. tmux는 [설치] 단계가 아니다.
3. WSL·배포판 없음: 'WSL 없음'(`wsl --install` 안내)과 '배포판 없음'(`wsl --install -d Ubuntu` 안내)을 따로 감지해 띠에 표시. 이 둘이 해결돼야 [설치]가 보인다.
4. 설치 방식: macOS와 같은 사용자 권한·`~/.local`. node는 nodejs.org `node-v22.20.0-linux-<x64|arm64>.tar.gz` + `sha256sum -c` → `~/.local/share/anvil/node` + `~/.local/bin` 심링크. claude는 `install.sh`(Windows 안내의 `npm install -g`도 이것으로). forge는 `claude plugin marketplace add` + `claude plugin install`. Linux는 숨은 bash, WSL은 `wsl.exe -- bash -lc '…'`.
5. node 버전: 주 버전 < 22면 없는 것으로(띠 문구 'node 22 이상 필요'). v22는 언제나 Anvil 전용 폴더 `~/.local/share/anvil/node`에 따로 풀어 옛 node와 공존한다. **사용자의 node는 절대 바꾸지 않는다**:
   - 사용자 PATH에 node가 **아예 없으면** 지금처럼 `~/.local/bin`에 심링크해 채운다(사용자 터미널의 claude 훅도 동작, v0.1.5 macOS 동작 그대로).
   - 22 미만 node가 **있으면** 심링크하지 않는다 — Ubuntu 기본 `~/.profile`이 `~/.local/bin`을 PATH 맨 앞에 넣어서, 심링크하면 사용자 일반 터미널의 node까지 v22로 바뀌기 때문이다.
   - Anvil이 tmux·세션에 넘기는 PATH(세 OS 공통)는 맨 앞에 `~/.local/share/anvil/node/bin`, 그 다음 `~/.local/bin`. 버전 판정도 이 PATH로 해서 설치 뒤 [다시 확인]이 통과한다.
6. 로그인: Linux·WSL은 claude 설치 뒤 로그인 띠 문구를 'Anvil에서 세션을 열면 claude가 로그인을 안내합니다'로, 외부 창 버튼 없음. macOS는 지금 그대로.
7. Windows 감지는 첫 문제 하나의 문장이 아니라 macOS·Linux처럼 항목 목록(`needs`)으로 돌려주고 `installable`을 켠다.
8. Windows 숨은 명령의 콘솔 창 깜빡임: 2부 VM 손 테스트에서 보이면 이 작업 안에서 `CREATE_NO_WINDOW`로 고친다.

## Slices
- S1 정적 tmux 빌드 — `scripts/build-tmux-linux.sh`(docker alpine, musl 정적, x86_64·aarch64) → `src-tauri/resources/bin-linux/tmux-x86_64`·`tmux-aarch64` 커밋. `tauri.linux.conf.json`(x86_64), `tauri.windows.conf.json`(두 벌) 리소스 등록.
  - 완료 기준: docker로 `ubuntu:22.04` amd64·arm64 컨테이너 각각에서 해당 파일 `-V` → `tmux 3.6a`, `file`이 statically linked.
- S2 Linux 감지·설치 (depends: S1) — `bundled_bin`을 Linux에도, node 버전 판정(<22 = 없음), `installable`을 Linux에서 켬, `step_cmd`의 node를 OS·아키텍처별로(linux tar.gz + sha256sum), 심링크는 사용자 PATH에 node가 없을 때만, Anvil PATH 맨 앞에 `~/.local/share/anvil/node/bin`·`~/.local/bin`(결정 5). 먼저 실패하는 cargo 테스트(가짜 probe·run 주입)부터.
  - 완료 기준: 새 cargo 테스트(Linux installable, node 21 = 없음·22 = 있음, linux node 명령에 `linux-`·`sha256sum`, 옛 node가 있으면 설치 명령에 `ln -sf`가 없고 없으면 있음, Anvil PATH가 `~/.local/share/anvil/node/bin`으로 시작)가 빨강→초록. 1부 Linux 잡의 실패 예정 표시를 지운 상태로 초록 — 옛 node 시나리오는 설치 뒤 컨테이너 셸 `bash -lc 'node --version'`이 여전히 v12(사용자 node 보존)인 것까지 확인.
- S3 WSL 감지·설치 (depends: S1) — WSL 없음/배포판 없음 구분 감지, 내장 tmux 버전 이름 복사(+ `tmux_argv`가 그 경로), Windows `needs` 목록화와 `installable`, 설치 단계를 `wsl.exe -- bash -lc`로 감싸기, Windows claude 안내를 install.sh로. 먼저 실패하는 cargo 테스트부터.
  - 완료 기준: 새 cargo 테스트(WSL 없음·배포판 없음 문구 구분, uname 별 tmux 복사 명령, Windows needs 목록, wsl 감싼 설치 명령)가 빨강→초록, 1부 Windows 잡의 실패 예정 표시를 지운 상태로 초록.
- S4 로그인 띠 문구 (depends: S2, S3) — Linux·WSL에서 로그인 띠 문구 교체·버튼 숨김. Playwright mock에 OS 값 주입해 확인.
  - 완료 기준: e2e 1건 추가(비 macOS면 버튼 없음 + 안내 문구) 빨강→초록.
- S5 VM 손 테스트 (depends: S3, 2부 VM 필요) — 2부 VM 복제본에 SSH로 이 브랜치 Windows 빌드(arm64 VM이라 x64 exe 에뮬레이션) 설치 → 사람: 띠 'WSL 없음' 확인 → 에이전트가 `wsl --install -d Ubuntu` → 사람: 계정 만들기 → [다시 확인]·[설치]·[세션 열기] 화면 판단(콘솔 깜빡임 여부 포함). 깜빡임이 있으면 `CREATE_NO_WINDOW` 수정 후 재확인.
  - 완료 기준: 사람 스크린샷 3장(띠 'WSL 없음', [설치] 뒤 모두 ✓, 세션 터미널에 claude 첫 화면) + VM에서 `wsl -- ~/.local/share/anvil/bin/tmux-3.6a -V` → `tmux 3.6a`.
- S6 릴리스 준비 (depends: S2, S3, S4) — 버전 0.1.6, `docs/releases/v0.1.6.md`(기존 Linux·WSL 시스템 tmux 사용자에게 버전 변경 알림 포함), README 준비물 표와 Windows·Linux 안내(`apt install … nodejs` 제거, [설치] 한 번으로).
  - 완료 기준: 아래 DoD 5·6, 버전 PR에서 1부 하네스가 자동으로 돌아 초록.

## Definition of Done
1. `cd src-tauri && cargo test` → 실패 0, 테스트 수가 기준선보다 늘어남 (작성 시점: 이 워크트리에서 rust 툴체인 실행 불가 — v0.1.5 기록 34+27. fg-run DoD 기준선에서 다시 잴 것)
2. `npm run test:e2e` → 전부 통과, 36건 이상 (작성 시점: 35 passed — 36 이상은 전방 검사)
3. `npm run check` → 0 ERRORS (작성 시점: 0 ERRORS — 회귀 방지)
4. `grep -rnE "\.fails\(|xfail|expectedFailure|실패 예정" e2e-desktop/` → 0줄, 그리고 e2e-desktop 워크플로 두 잡 초록 (작성 시점: e2e-desktop 없음 — 1부 뒤에는 ≥1줄이 정상. 0줄만으로는 실행 불능도 0이 되므로 워크플로 초록과 함께 판정)
5. Anvil 자신의 버전 다섯 곳이 모두 0.1.6 — `node -p "[require('./package.json').version, require('./package-lock.json').version, require('./package-lock.json').packages[''].version, require('./src-tauri/tauri.conf.json').version].join(' ')"` → `0.1.6 0.1.6 0.1.6 0.1.6`, `grep -m1 '^version' src-tauri/Cargo.toml` → `0.1.6`, `grep -A1 '^name = "anvil"' src-tauri/Cargo.lock` → `version = "0.1.6"` (작성 시점: 모두 0.1.5 — 전방 검사. 파일 전체 `0.1.5` 검색은 쓰지 말 것: Cargo.lock의 http-body-util·simdutf8도 0.1.5라 영원히 0줄이 안 된다)
6. `grep -nE "apt install.*nodejs" README.md` → 0줄 (작성 시점: README.md:35·41 두 줄 — 전방 검사)
7. S5 VM 손 테스트 스크린샷 3장과 tmux 버전 출력이 run.md에 기록됨 (사람 확인)
