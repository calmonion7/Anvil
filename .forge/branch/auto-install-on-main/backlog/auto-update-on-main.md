<!-- forge-slug: auto-update-on-main -->
<!-- task: 8 -->
<!-- tdd: off -->

# main 머지 후 자동 빌드·설치, 다음 실행 때 반영

## 목표
main에 머지하면 5분 안에 이 Mac이 알아서 새 빌드를 `/Applications/Anvil.app`에 깔아 둔다. 쓰는 중인 앱은 끄지 않고, 앱 상단에 "새 버전 준비됨 · 재시작" 띠가 뜬다. 재시작을 누르거나 다음에 열면 새 버전이 뜬다. 빌드가 실패하면 쓰던 설치본이 그대로 남고 알림으로 알려 준다.

## 결정 (이번 그릴링)
1. 촉발: launchd 에이전트가 5분마다 `git ls-remote origin refs/heads/main`으로 SHA만 비교한다. 바뀌었을 때만 빌드한다.
2. 빌드 위치: 전용 빌드 클론(`~/Library/Application Support/com.taebro.anvil/build`). 없으면 origin에서 clone한다. 사용자의 작업 트리는 건드리지 않는다.
3. 반영: 빌드가 성공하면 앱을 종료하지 않고 번들만 교체한다(새 경로에 `ditto` 후 이름 바꿔 끼우기). 실행 중인 앱은 옛 버전으로 계속 돈다.
4. 앱 안 표시: 앱이 1분마다 자기 번들의 `Contents/Resources/build-commit`을 읽어, 빌드 시 박아 넣은 자기 커밋과 다르면 메인 영역 맨 위에 기존 띠(`.band`) 패턴으로 "새 버전 준비됨 (abc1234) · [재시작] [나중에]"를 띄운다. "나중에"는 그 커밋에 대해서만 숨긴다. 개발 빌드(파일 없음)에서는 띄우지 않는다.
5. 기존 메뉴 "업데이트 설치…" → "지금 업데이트 확인": 같은 에이전트를 즉시 한 번 돌린다(`launchctl kickstart`). 앱을 강제로 끄는 경로는 없앤다.
6. 실패: 빌드 실패는 macOS 알림 + `update.log`. 실패한 SHA를 기록해 새 커밋이 올 때까지 다시 시도하지 않는다.
7. 에이전트 등록(`launchctl bootstrap`)은 사람이 한다. 준비와 검증까지 하고 `!` 한 줄로 넘긴다.

## Source of truth
- ADR `261018-190555`: 로컬 폴링 + 다음 실행 때 반영(task 7의 "자동 훅 없음"을 대체)
- ADR `261017-211601`: 세션은 tmux 위라 앱 재시작에도 끊기지 않는다
- task 7(`app-self-update-from-main`): `scripts/install-app.sh`, 사전 점검 실패 3종

## 슬라이스
1. **업데이트 스크립트** — `scripts/install-app.sh`를 바꾼다(종료·재실행 제거, 번들만 교체).
   - `scripts/auto-update.sh`: ls-remote 비교 → 같으면 종료 → 다르면 빌드 클론 pull·빌드 → 교체 → `build-commit` 기록 → 알림. 실패 SHA를 기록하고 건너뛴다.
   - 테스트를 위해 origin URL·클론 위치·설치 위치·빌드 명령·알림을 환경변수로 바꿀 수 있게 한다.
   - 완료 기준: `scripts/check-auto-update.sh`가 임시 bare origin과 가짜 빌드로 세 경우를 확인한다. (a) SHA가 같으면 빌드 안 함. (b) 새 SHA면 교체되고 `build-commit` == 새 SHA. (c) 빌드가 실패하면 설치본이 그대로이고, 같은 SHA로 다시 돌려도 빌드하지 않음.
2. **launchd 에이전트** — `scripts/com.taebro.anvil.updater.plist` 템플릿(StartInterval 300). `EnvironmentVariables`에 `HOME`·`USER`·`LOGNAME`·PATH(fnm npm, rustup 툴체인)를 명시한다.
   - 완료 기준: 격리된 `launchctl bootstrap`으로 한 번 돌려 `git ls-remote`가 성공한다(비공개 레포 인증이 keychain에 막히지 않음). 막히면 토큰 파일 방식으로 우회한다.
3. **앱: 새 버전 띠 + 메뉴** — 빌드할 때 커밋을 박아 넣는다(build.rs, 없으면 표시 안 함). 디스크 `build-commit`과 비교하는 명령을 두고, 띠와 재시작(`app.restart()`), 메뉴 "지금 업데이트 확인"을 만든다.
   - 완료 기준: "다른 커밋이면 준비됨, 같거나 파일이 없으면 아님"을 단위 테스트로 단언한다.

## Definition of Done
- `bash scripts/check-auto-update.sh` → exit 0. (사전 상태: 파일 없음 → 실패. 앞으로 통과해야 할 점검)
- `cargo test --manifest-path src-tauri/Cargo.toml` → 녹색이고, 새 버전 판정 단위 테스트를 포함한다. (사전 상태: 녹색 27개. 기존 테스트는 회귀 방지, 새 테스트는 앞으로 통과해야 할 점검)
- `bash scripts/check-install-app.sh` → exit 0. (사전 상태: 3/3 통과 — 사전 점검 실패 3종 회귀 방지)
- UAT(사람): 에이전트를 등록하고 main에 머지한 뒤 5분 안에 앱에 띠가 뜨는지, 재시작하면 `build-commit` == origin/main인지 확인한다.

## 이번에 안 하는 것
- Tauri updater, GitHub Actions, Releases, 코드 서명
- 여러 대 배포
- 사용 중 자동 재시작
