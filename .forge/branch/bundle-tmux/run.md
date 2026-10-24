# RUN — macOS에 tmux·jq 내장 + 첫 설치 문제 5개 해결 (v0.1.2)

워크플로 없이 이 세션에서 직접 실행(조각이 S1→S4 직렬 의존이라). fg-loop 드라이브 안에서 실행.

## 조각별 결과
- S1 build-tmux.sh 작성·실행, resources/bin/{tmux,jq} 유니버설 커밋 — ⚠ 리소스 등록을 tauri.conf.json 대신 `tauri.macos.conf.json`에(Windows·Linux 번들에 macOS 바이너리가 섞이지 않게)
- S2 내장 경로 선택(`tmux_prog`·`path_with`·`run_path`, setup에서 `set_bundled_bin`) — ⚠ 단위 테스트는 통과, "로컬 앱에서 세션이 내장 tmux로 뜸(ps)"은 미확인 → UAT로
- S3 준비물 macOS tmux 제외 + 항목별 이어서 설치(`install_with`·`Step`) — ✅ 계획대로. 옛 install_script 테스트 3개를 새 테스트 2개로 교체, 선택 jq 설치(brew) 삭제(내장이라)
- S4 띠를 앱 맨 위로 + [다시 확인], 항목별 결과, URL 클릭, 세션 버튼 비활성화+안내 — ⚠ `npm run check` 통과, "claude를 PATH에서 숨기고 띄워 확인"은 미확인 → UAT로
- S5 git 아닌 폴더 판정(`RootInfo.git`) + 칩·배지 숨김 — ✅ 계획대로(새 테스트 `root_not_git_has_no_branch_badge`)
- S6 README·버전 0.1.2·릴리스 노트 — ✅ 계획대로(release.sh 대신 직접 수정 — 커밋·태그를 만들기 때문)

## DoD baseline → after
1. cargo test: 54 통과 → 55 통과(실패 0) — 회귀 방지, 새 테스트 2개 추가·옛 테스트 1개 순감
2. npm run check: 0 ERRORS → 0 ERRORS
3. check-release.sh: 13/13 → 13/13 (커밋 전에는 "같은 버전: 태그만"이 실패 — 작업 트리 버전과 복제본 HEAD 버전이 달라서. 커밋 후 통과)
4. 번들 bin: 없음 → `x86_64 arm64` ×2, `tmux 3.6a`, `jq-1.8.1`, otool 시스템 라이브러리만, 임시 소켓 서버 기동·종료 성공
5. 버전 0.1.2 다섯 파일 + docs/releases/v0.1.2.md — 반영(머지·릴리스는 사람)
6. 가상머신 UAT — 미실행(사람 확인)

## 계획과 다른 점 · 그 자리 결정
- 로컬 앱 실행 확인(S2·S4)을 건너뜀: 빌드한 앱은 설치된 Anvil과 같은 identifier라 앱 데이터·`tmux -L anvil` 서버를 공유 → 사용자의 실행 중 세션을 건드릴 위험. 가상머신 UAT가 같은 항목을 덮는다.
- cargo가 PATH에 없음(~/.cargo/bin 프록시 부재) — rustup 툴체인 bin을 PATH 앞에 붙여 사용.
- tmux 빌드: pkg-config 없이 LIBEVENT_CFLAGS/LIBS 환경변수로 libevent_core.a 정적 링크, `--disable-utf8proc`, MACOSX_DEPLOYMENT_TARGET=11.0.
- 로컬 `tauri build`는 업데이터 서명 키가 없어 마지막에 오류로 끝나지만 .app은 생성됨(CI는 키가 있음).

## 수리 r1 (VM UAT 실패 → v0.1.3)
v0.1.2 가상머신 UAT: 문제 1·2·3(항목별 결과)·5 통과. 실패 2건 —
forge 마켓플레이스 등록이 git 부재로 실패(`|| true`가 숨겨 "not found in marketplace"만 보임),
[로그인] 터미널 `claude: command not found`(공식 설치 위치 ~/.local/bin이 새 셸 PATH 밖).
사람 결정: 개발자 도구를 준비물로.

- R1 `Need::DevTools` — forge가 빠진 macOS에서 `xcode-select -p`로 확인(설치 창이 뜨지 않는 질의), [설치]는 `xcode-select --install` → `Outcome::Started` — ✅
- R2 forge는 개발자 도구가 끝나기 전엔 건너뜀(안내: 마친 뒤 [다시 확인] → [설치]) — ✅
- R3 마켓플레이스: `list | grep -qw forge || add` (이미 있으면 통과, 실패는 노출) — ✅
- R4 [로그인]: `export PATH="$HOME/.local/bin:$PATH"; claude` — ✅
- R5 화면: 「…설치 중」 결과 표시, 버전 0.1.3·README·릴리스 노트 — ✅

검사: cargo test 55 → 59, npm run check 0 ERRORS, check-release 13/13. tmux·jq 바이너리 무변경(C4·C5 이전 측정 유지).
