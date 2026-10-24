<!-- forge-slug: v015-first-run-fixes -->
<!-- task: 10 -->
<!-- tdd: off -->
<!-- priority: high -->

# v0.1.5 — 첫 설치 수정 세 건 (설치 창 숨음 · 세션 포커스 · node 준비물)

## 목표
깨끗한 맥에서 v0.1.4 첫 설치 흐름을 VM으로 확인하다가 세 가지 문제가 나왔다. 이를 고쳐 v0.1.5로 낸다.
1. 개발자 도구 설치 창이 Anvil 창 뒤로 숨는다.
2. [세션 열기]를 눌러도 터미널에 포커스가 가지 않는다. 첫 실행 때 뜨는 신뢰 질문에서 특히 눈에 띈다.
3. 깨끗한 맥에는 node가 없어서 forge 훅(SessionStart·Stop 등)이 오류를 낸다.

## 결정 (이번 그릴링)
1. node를 준비물(`Need::Node`)로 추가한다. 확인은 `node --version`으로 하고, forge 설치 여부와 관계없이 항상 한다.
2. macOS [설치]: nodejs.org 공식 tar.xz(darwin-arm64/x64)를 받아 SHASUMS256으로 검증한다. 검증한 압축본은 `~/.local/share/anvil/node`에 풀고, `~/.local/bin`에 node·npm·npx 심링크를 건다.
   - 관리자 암호와 설치 창이 필요 없다. 그래서 claude CLI처럼 결과가 `Ok`로 끝난다.
   - `login_path()`에 이미 `~/.local/bin`이 들어 있어서 PATH를 따로 손댈 필요가 없다.
3. node 버전은 앱 안에 상수로 고정한다(LTS `v22.x.y`). 올릴 때는 상수만 바꿔 릴리스한다. 최신 LTS를 그때그때 조회하는 방식은 결과가 설치 시점마다 달라져서 기각했다.
4. Windows(WSL)·Linux는 node를 확인하고 띠에 표시만 한다. 설치는 사용자가 직접 하고, 이는 기존 규칙과 같다. 자동 설치는 백로그 #11에서 다룬다.
5. 설치 순서는 개발자 도구 → node → claude → forge다.
6. 개발자 도구 설치 창(`deps.rs`의 `xcode-select --install`): 설치를 시작한 직후 "Install Command Line Developer Tools" 앱이 뜰 때까지 최대 수 초 동안 재시도하면서, `osascript`로 그 창을 맨 앞으로 가져온다. 앞으로 가져오지 못해도 결과는 그대로 `Started`로 둔다.
7. 세션 포커스: [세션 열기]에서도 `focus = {name, tick+1}`을 올린다. 보드 버튼이 명령을 채울 때 쓰는 것과 같은 경로다(`src/routes/+page.svelte` 근처 691행 `focusTick`, `src/lib/Terminal.svelte`).

## Source of truth
- ADR `261024-202909`: macOS 앱에 tmux·jq 내장. 그래서 준비물은 claude·forge(+개발자 도구)이고, 이번에 node가 추가된다.
- task 9(`deps-recheck-clears-results`): 항목별 설치 결과와 [다시 확인]
- `/clear` 전 VM 첫 설치 테스트(v0.1.4)에서 나온 발견 세 건

## 슬라이스
1. **node 준비물** — `Need::Node`, `missing()`, `step_cmd()`(macOS 압축본 설치), `install_with()` 순서, 라벨·i18n
   - 완료 기준: cargo 단위 테스트로 다음을 단언한다.
     - node가 없으면 목록에 들어간다.
     - 설치 명령에 고정 버전·`shasum` 검증·`~/.local/bin` 심링크가 있다.
     - 설치 순서가 개발자 도구 → node → claude → forge다.
2. **설치 창 앞으로** — `xcode-select --install` 뒤 재시도하며 활성화
   - 완료 기준: VM UAT에서 설치 창이 Anvil 앞에 뜬다.
3. **세션 열기 포커스** — [세션 열기]에서 focus tick을 올린다.
   - 완료 기준: e2e에서 [세션 열기] 뒤 터미널에 포커스가 있다.
4. **릴리스 준비** — 버전 0.1.5를 다섯 파일(package.json·package-lock.json·Cargo.toml·Cargo.lock·tauri.conf.json)에 반영하고 `docs/releases/v0.1.5.md`를 쓴다. README의 Windows·Linux 직접 설치 목록에 node를 추가한다.
   - 완료 기준: 다섯 파일 모두 0.1.5다. 머지와 릴리스는 사람이 한다.

## Definition of Done
- `cargo test --manifest-path src-tauri/Cargo.toml` → 녹색이고 node 관련 테스트를 포함한다.
  - 사전 상태: `deps.rs`에 node 언급 0건. 새 테스트는 앞으로 통과해야 할 점검이고, 기존 테스트는 회귀 방지다.
- `npm run test:e2e` → 통과하고, [세션 열기] 포커스 테스트와 node 띠 테스트를 포함한다.
  - 사전 상태: 두 테스트 모두 없다(앞으로 통과해야 할 점검).
- `npm run check` → 오류 0(회귀 방지)
- VM UAT(사람): 깨끗한 맥 복제본에서 SSH로 자동화하고, 사람은 화면 판단만 한다.
  - ① 개발자 도구 설치 창이 맨 앞에 뜬다.
  - ② [세션 열기] 직후 바로 타이핑된다.
  - ③ [설치] 뒤 forge 훅에서 node 오류가 없다.

## 이번에 안 하는 것
- Windows·Linux node 자동 설치(→ #11)
- 최신 LTS 자동 추적
- Homebrew나 .pkg 기반 설치
