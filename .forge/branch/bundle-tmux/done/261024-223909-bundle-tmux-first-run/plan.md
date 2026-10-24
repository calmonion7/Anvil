<!-- forge-slug: bundle-tmux-first-run -->
<!-- task: 8 -->
<!-- priority: high -->
<!-- tdd: on -->
<!-- repaired-by: fg-loop -->
# macOS에 tmux·jq 내장 + 첫 설치 테스트에서 나온 문제 5개 해결 (v0.1.2)

## 목표 / 하지 않을 것
- 목표: 깨끗한 맥에서 dmg 설치 → [설치] 한 번(Homebrew·sudo 없이 claude CLI·forge) → [로그인] → 계획 세션이 뜨는 데까지 막힘이 없게 한다. 가상머신 첫 설치 테스트(v0.1.1)에서 나온 문제 1~5를 모두 고치고 v0.1.2로 배포한다.
- 하지 않을 것:
  - Windows(WSL)·Linux의 tmux 내장 — 그쪽은 기존대로 시스템 tmux. (단, 문제 3·4의 설치 결과·링크 처리는 모든 OS에 적용)
  - Apple Developer 서명·공증("손상되었습니다" 경고 제거) — 비용 결정이 따로 필요하다.
  - tmux 없이 앱이 직접 세션을 유지하는 구조 변경.

## 기준
- 용어: `.forge/CONTEXT.md`(브랜치 root 포함)의 **준비물**, **세션**, **프로젝트**
- 관련 ADR: `adr/261024-202909-bundle-tmux-jq-on-macos.md`(이번에 추가), `adr/261017-211601-sessions-on-dedicated-tmux-socket.md`
- 결정 요약:
  - tmux 3.6a(libevent 정적, macOS 기본 ncurses) · jq 1.8.1(공식 macOS 바이너리)를 **유니버설(arm64+x86_64)**로 `scripts/build-tmux.sh`가 만들어 `src-tauri/resources/bin/`에 커밋, `tauri.conf.json` `bundle.resources`로 앱에 넣는다. CI는 빌드하지 않는다.
  - macOS는 시스템 tmux가 있어도 **항상 내장본**. 상태줄 스크립트의 jq도 내장본 경로를 쓴다.
  - 문제 1: 준비물 띠를 프로젝트 화면 안이 아니라 **앱 맨 위**에(프로젝트 0개여도) + [다시 확인] 버튼.
  - 문제 5: 준비물이 빠진 동안 [세션 열기]·[계획 세션에서 시작] **비활성화** + "먼저 위 띠에서 준비물을 설치하세요".
  - 문제 2: git 저장소가 아닌 폴더는 브랜치 칩·"기본 .forge/를 읽습니다" 배지 **둘 다 숨김**(git인데 detached HEAD면 기존대로 배지).
  - 문제 3: 설치를 항목별로 이어서 진행(하나 실패해도 나머지 계속, claude 실패 시 forge는 "claude가 먼저 필요"로 건너뜀), 띠에 **항목별 결과**.
  - 문제 4: 준비물 띠 문구 속 URL은 클릭하면 브라우저로 열린다.

## 완료 정의(DoD)
1. `cd src-tauri && cargo test` → 실패 0 (새 테스트 포함). *시작 시점: 통과(54개) — 회귀 방지용이라 미리 통과가 정상.*
2. `npm run check` → `0 ERRORS`. *시작 시점: 통과 — 회귀 방지용.*
3. `bash scripts/check-release.sh` → 실패 0. *시작 시점: 13/13 통과 — 회귀 방지용.*
4. 로컬 `npx tauri build --bundles app` 결과 `.app` 에서:
   - `lipo -archs Anvil.app/Contents/Resources/bin/tmux` → `x86_64 arm64` (순서 무관), jq도 동일
   - `Anvil.app/Contents/Resources/bin/tmux -V` → `tmux 3.6a`, `…/bin/jq --version` → `jq-1.8.1`
   - *시작 시점: 실패(`resources/bin` 없음) — 전진 검사.*
5. 같은 PR에 버전 0.1.2(5개 파일)와 `docs/releases/v0.1.2.md` 포함 → 머지 시 release 워크플로가 태그·빌드·공개(자동 배포 첫 실전).
6. **사람 확인(가상머신, UAT)** — `macOS` 원본을 새로 복제한 가상머신에 v0.1.2 dmg 설치:
   - 프로젝트 0개 첫 화면에 준비물 띠(claude CLI · forge)가 보인다 (문제 1)
   - 그동안 세션 버튼이 비활성화되고 안내가 보인다 (문제 5)
   - [설치] 한 번으로 Homebrew 없이 claude·forge가 설치되고 항목별 결과가 보인다 (문제 3)
   - [로그인] 후 계획 세션이 실제로 뜬다 — **내장 tmux가 Gatekeeper에 막히지 않는지** 확인
   - git이 아닌 폴더에서 브랜치 칩·배지가 없다 (문제 2)
   - 이 항목은 기계 검사가 아니라 화면 판단이라 사람 확인으로 남긴다.

## 작업 조각
- [ ] S1. `scripts/build-tmux.sh` 작성·실행 → `src-tauri/resources/bin/{tmux,jq}` 유니버설 바이너리 커밋, `tauri.conf.json`에 리소스 등록 — 완료 기준: DoD 4
- [ ] S2. (TDD) 내장 도구 경로: macOS에서 tmux·jq 실행 경로를 앱 리소스의 `bin/`으로 고르는 함수 + 세션 실행·상태줄 스크립트가 그것을 쓰게 — 완료 기준: 경로 선택 단위 테스트 통과, 로컬 앱에서 세션이 내장 tmux로 뜸(`ps`로 확인) (depends: S1)
- [ ] S3. (TDD) 준비물 검사·설치: macOS에서 tmux·jq를 준비물에서 제외, 설치 스크립트를 항목별로 이어 가며 결과를 돌려줌(claude 실패 → forge 건너뜀) — 완료 기준: `deps.rs` 단위 테스트(제외·이어 가기·건너뜀) 통과 (depends: S2)
- [ ] S4. 화면: 준비물 띠를 앱 맨 위로(프로젝트 0개 포함) + [다시 확인], 항목별 결과 표시, 띠 속 URL 클릭 열기, 준비물 누락 시 세션 버튼 비활성화+안내 — 완료 기준: 로컬에서 claude를 PATH에서 숨긴 상태로 띄워 띠·비활성화 확인 (depends: S3)
- [ ] S5. (TDD) git이 아닌 폴더: 판정 함수 + 브랜치 칩·배지 숨김 — 완료 기준: 판정 단위 테스트 통과, 로컬 git 아닌 폴더에서 칩·배지 없음
- [ ] S6. README 준비물·설치 절 갱신(macOS는 Homebrew 불필요), 버전 0.1.2 + `docs/releases/v0.1.2.md` — 완료 기준: DoD 1~5 (depends: S1~S5)
