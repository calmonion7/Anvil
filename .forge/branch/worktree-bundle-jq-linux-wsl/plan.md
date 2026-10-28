<!-- forge-slug: bundle-jq-linux-wsl -->
<!-- task: 17 -->
<!-- tdd: on -->
<!-- followup-id: fu-b9bbeaeaac9c -->
# Linux·WSL에도 jq를 내장해 상태줄이 준비 없이 동작하게 한다 (v0.1.8)

## 목표 / 하지 않을 것
- 목표: Linux·Windows(WSL) 배포판에도 jq 1.8.1을 내장하고 항상 그것을 쓴다. 시스템에 jq가 없어도 Anvil 세션에서 모델 표시와 사용자의 원래 상태줄이 동작해야 한다. v0.1.8로 배포한다.
  - 계기(후속후보 fu-b9bbeaeaac9c, task 15): 지금은 jq가 없으면 모델 표시가 빠진다고 README에 적혀 있다.
  - 그릴링 중 코드에서 찾은 더 큰 영향(코드를 읽고 추론, 실행 확인은 워크트리 격리로 막힘): 상태줄 래퍼는 원래 상태줄 명령도 jq로 읽는다(`src-tauri/src/session.rs:252`, `:257`). jq가 없으면 `orig`가 비어 `:260`에서 `exit 0`으로 끝나므로, 사용자의 상태줄(claude-hud 등)이 Anvil 세션에서 통째로 사라진다.
- 하지 않을 것:
  - 상태줄 래퍼를 jq 없이(node 등으로) 다시 쓰는 것 — 결정 1에서 내장 쪽을 골랐다.
  - Linux 번들의 aarch64 지원 — tmux와 같게 Linux 번들은 x86_64만 넣는다. Windows 번들은 WSL용으로 x86_64·aarch64 두 벌을 넣는다.
  - macOS jq 변경 — 그대로 둔다.
  - jq를 준비물 확인 목록(`missing`)에 넣는 것 — 앱에 들어 있는 도구는 준비물이 아니다(CONTEXT.md **준비물**).

## 기준
- 용어: `.forge/CONTEXT.md`의 **준비물**(앱에 든 도구는 준비물이 아니다), **세션**
- 관련 ADR: `.forge/adr/261024-202909-bundle-tmux-jq-on-macos.md`(내장본을 항상 쓴다), `.forge/adr/261025-163349-bundle-static-tmux-on-linux-and-wsl.md`(WSL에는 앱이 복사해 쓴다). 이번 결정은 두 ADR의 원칙을 jq에 그대로 넓힌 것이라 새 ADR은 만들지 않는다.
- 결정(이번 그릴링):
  1. 방향 = jq 내장(래퍼를 node로 다시 쓰지 않는다). 상태줄은 자주 실행되므로 node 시작 비용을 붙이지 않는다.
  2. WSL 배치: `~/.local/share/anvil/bin/jq`. 준비물 확인(`deps::status()`, `deps.rs:325` 부근) 때 tmux 복사와 함께 놓는다. 배포판의 `uname -m`에 맞는 원본(`jq-x86_64`·`jq-aarch64`)을 쓰고, 파일이 없거나 `jq --version`이 `jq-1.8.1`이 아닐 때만 tmp에 쓴 뒤 mv로 바꾼다. tmux와 달리 jq는 금방 끝나는 프로세스라 파일 이름에 버전을 넣지 않는다.
  3. WSL PATH: `ANVIL_PATH_SH`에 `$HOME/.local/share/anvil/bin`을 `$HOME/.local/bin` 바로 뒤에 넣는다(macOS `anvil_path` 순서와 같다: node → `~/.local/bin` → 내장 → 로그인 PATH). 같은 폴더의 `tmux-3.6a`도 PATH에 보이게 되지만 이름이 `tmux`가 아니라 영향이 없다.
  4. Linux: `tauri.linux.conf.json`에 `resources/bin-linux/jq-x86_64` → `bin/jq`를 넣는다. 세션 PATH에 내장 폴더가 이미 들어가 있으므로(`session.rs:89`, `:428`) 코드 경로는 바꾸지 않는다.
  5. 바이너리: jq 공식 Linux 릴리스(`jq-linux-amd64`·`jq-linux-arm64`, 1.8.1)를 `scripts/build-tmux-linux.sh`에서 받아 `src-tauri/resources/bin-linux/jq-x86_64`·`jq-aarch64`로 커밋한다(macOS가 공식 바이너리를 받는 것과 같은 방식). 정적 링크인지는 실행 때 `file`로 확인한다(추론: 1.7부터 공식 Linux 바이너리는 정적).
  6. 검증 = 단위 테스트 + Linux e2e 컨테이너(CI `e2e-desktop`) + Windows ARM VM(SSH 자동화, 사람은 화면 판단만).
  7. 0.1.8로 올려 배포한다(다섯 곳 + `docs/releases/v0.1.8.md`). 머지하면 release.yml이 자동으로 릴리스한다.
  8. TDD on.
- 브랜치·머지: 브랜치 `worktree-bundle-jq-linux-wsl`(원장 `fu-b9bbeaeaac9c` → taken 17 커밋 포함)에서 이어 작업하고, 원장 변경과 이 작업을 같은 PR로 한 번에 머지한다. 드래프트 PR #55.
- 고칠 곳(찾기 명령 `git grep -n -w jq -- src-tauri/src src-tauri/tauri.*.json scripts README.md e2e-desktop`로 확인, 2026-10-28):
  - `src-tauri/tauri.linux.conf.json`, `src-tauri/tauri.windows.conf.json` — jq 리소스 추가
  - `src-tauri/src/session.rs:62` `ANVIL_PATH_SH`, `:709` 그 테스트, 주석 `:64`·`:88`·`:843`("macOS는 jq")
  - `src-tauri/src/deps.rs:276` 복사 명령(`wsl_tmux_copy_cmd`)과 `:325` 호출부, `:655` 그 테스트
  - `scripts/build-tmux-linux.sh` — jq 받기 추가
  - `README.md:26` — "세 OS 모두 앱에 내장"
  - `e2e-desktop/specs/linux.mjs`(또는 `e2e-desktop/linux/in-container.sh`) — 컨테이너 확인 추가

## 완료 정의(DoD)
1. `cd src-tauri && cargo test` → 실패 0, 새 테스트 포함:
   - (가) WSL 복사 명령이 tmux와 jq를 모두 놓는다. jq는 `uname -m`의 원본을 쓰고, `jq-1.8.1` 버전 확인으로 이미 맞으면 건드리지 않으며, tmp→mv로 바꾼다.
   - (나) `ANVIL_PATH_SH`가 `export PATH="$HOME/.local/share/anvil/node/bin:$HOME/.local/bin:$HOME/.local/share/anvil/bin:$PATH"; `로 시작한다.
   - (다) `tauri.linux.conf.json`의 리소스에 `bin/jq`가, `tauri.windows.conf.json`에 `bin/jq-x86_64`·`bin/jq-aarch64`가 있다(설정 JSON을 읽어 확인).
   *시작 시점: 41+27=68 통과, 새 테스트 없음 — (가)(나)(다)는 전진 검사(S0에서 쓰면 빨강이어야 한다). 기존 `session.rs:709`의 `starts_with` 단언은 지금 문자열로 통과하므로 (나)로 바꿔야 한다.*
2. `src-tauri/resources/bin-linux/jq-x86_64`·`jq-aarch64`가 있고 `file`이 각각 x86-64·aarch64의 statically linked ELF라고 말한다. docker로 `alpine`(glibc 없음) 컨테이너에서 각 플랫폼 jq가 `--version` → `jq-1.8.1`. *시작 시점: 두 파일 없음 — 전진 검사.*
3. CI `e2e-desktop` 워크플로의 Linux 잡이 초록이고, 새 확인이 들어 있다. 깨끗한 Ubuntu 22.04 컨테이너(시스템 jq 없음 — `env.log`에 `jq: 없음`을 남긴다)에서 설치된 앱의 내장 폴더를 앞에 둔 PATH로:
   - `jq --version` → `jq-1.8.1`
   - 픽스처 입력으로 상태줄 래퍼를 돌리면 ① `models/<세션>.json`에 모델이 기록되고 ② 프로젝트 `.claude/settings.local.json`의 원래 상태줄 명령(`cat` 등) 출력이 그대로 나온다.
   *시작 시점: 해당 확인 없음 — 전진 검사.*
4. Windows 11 ARM VM(SSH): v0.1.8 빌드를 설치하고 앱을 띄운 뒤, WSL 안에서 `~/.local/share/anvil/bin/jq --version` → `jq-1.8.1`, `command -v jq`(Anvil PATH 적용 셸)가 그 경로이다. 세션 하나를 열고 claude가 상태줄을 그린 뒤 앱 데이터의 `models/<세션>.json`이 생긴다. 사람 확인: 그 세션 화면에 모델 표시와 상태줄이 보이는가(스크린샷). *시작 시점: WSL에 jq 사본 없음 — 전진 검사.*
5. `npm run check` → `0 ERRORS`, `npm run test:e2e` → 전부 통과. *시작 시점: task 16 기준 통과 — 회귀 방지용(프런트엔드는 바꾸지 않는다).*
6. `bash scripts/check-release.sh` → 실패 0. *시작 시점: 통과 — 회귀 방지용.*
7. 버전 다섯 곳이 0.1.8: `node -p "[require('./package.json').version, require('./package-lock.json').version, require('./package-lock.json').packages[''].version, require('./src-tauri/tauri.conf.json').version].join(' ')"` → `0.1.8 0.1.8 0.1.8 0.1.8`, `grep -m1 '^version' src-tauri/Cargo.toml` → `version = "0.1.8"`, `grep -A1 '^name = "anvil"' src-tauri/Cargo.lock` → `version = "0.1.8"`, `docs/releases/v0.1.8.md`가 있다. `README.md:26`이 Linux·WSL도 내장이라고 말한다. *시작 시점: 모두 0.1.7, 릴리스 노트 없음, README는 "Linux·WSL은 있으면 쓴다" — 전진 검사. 파일 전체에서 `0.1.7`을 찾는 검사는 쓰지 말 것(Cargo.lock의 다른 크레이트와 겹칠 수 있다).*

## 작업 조각
- [ ] S0. DoD 1의 (가)(나)(다) 테스트를 `deps.rs`·`session.rs` 테스트 모듈에 쓰고 빨강을 확인한다 — 완료 기준: 새 테스트가 실패하고 기존 68개는 통과
- [ ] S1. `scripts/build-tmux-linux.sh`에 jq 1.8.1 공식 Linux 바이너리 받기를 넣고 돌려 `resources/bin-linux/jq-x86_64`·`jq-aarch64`를 커밋한다 — 완료 기준: DoD 2
- [ ] S2. tauri 설정 두 곳에 jq 리소스, `ANVIL_PATH_SH`에 bin 폴더, WSL 복사 명령에 jq(버전 확인 + tmp→mv)를 넣고 주석의 "macOS는 jq"를 고친다 — 완료 기준: DoD 1 초록 (depends: S0, S1)
- [ ] S3. Linux e2e 컨테이너에 jq·상태줄 래퍼 확인을 넣는다(`env.log`에 jq 줄 추가 포함) — 완료 기준: DoD 3 (depends: S2)
- [ ] S4. 버전 0.1.8(다섯 곳) + `docs/releases/v0.1.8.md` + `README.md:26` — 완료 기준: DoD 5·6·7 (depends: S2)
- [ ] S5. Windows ARM VM에서 v0.1.8 빌드로 WSL jq·세션 상태줄을 확인한다(SSH 자동화, 사람은 스크린샷 판단만) — 완료 기준: DoD 4 (depends: S4)
