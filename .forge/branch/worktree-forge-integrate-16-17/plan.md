<!-- forge-slug: electron-app-5of6 -->
<!-- task: 26 -->
<!-- part: 5/6 -->
<!-- tdd: on -->
# 설치 파일 릴리스와 세 OS 공통 자체 업데이터 (데스크톱 앱 5/6)

## 목표 / 하지 않을 것
- 목표: 버전을 올린 PR을 머지하면 CI가 네 가지 설치 파일(mac arm64·x64 `.dmg`+업데이트용 `.zip`, Windows x64 사용자 범위 `.exe`, Linux x64 `AppImage`)과 체크섬 목록을 GitHub Releases에 올린다. 설치된 앱은 보드 위 [업데이트] 한 번으로 새 버전으로 바뀌고, 다시 뜬 뒤 세션이 복구된다. 이 Mac도 이 경로로 갈아탄다.
- 하지 않을 것: 코드 서명, electron-updater(서명 없는 mac에서 동작하지 않음), Tauri 빌드 잡 이외의 Tauri 파일 삭제(6/6), 기존 Tauri 사용자 자동 이전(릴리스 노트로 안내만).

## 근거
- 관련 ADR: `adr/261030-005852-electron-desktop-shell.md`. 이번 단계에서 `.forge/adr/261018-190555-local-poll-auto-update.md`(launchd 로컬 빌드 추종)가 실제로 대체된다.
- 실측 근거: 지금 `release.yml`은 Tauri 4대상 행렬이다(`.github/workflows/release.yml:44-53`). 서명 없는 Tauri 앱이 앱 안 업데이터로 스스로 교체되던 선례가 있다(`src-tauri/src/updater.rs`).
- 회고(task 9·16·17): 버전 변경은 **커밋한 뒤** `scripts/check-release.sh`를 돌린다. 버전 파일은 6/6까지 기존 5개를 그대로 맞춘다.
- 1~4/6 봉인 뒤 실행을 권장한다.
- 완료 정의(DoD):
  1. `node --test server/` → 0 실패. 새 테스트(가짜 릴리스 서버): 새 버전 감지, 내려받기와 체크섬 검증(틀리면 거부), 작업 중인 세션이 있으면 「세션이 끝나면 업데이트」로 미룸, 없으면 교체 단계 호출 → 서버 재시작 → 세션 복구(2/6) 호출.
     - 사전 상태: 업데이터 없음(1/4에서 `updater_*` 제거). 전진 검사.
  2. OS별 교체 단계가 CI 세 OS에서 실제로 돈다: 옛 버전 패키지를 만들어 새 버전 패키지로 교체한 뒤 버전이 바뀌었다(mac `.app` 교체, Windows 설치 프로그램 `/S` 실행, Linux AppImage 교체).
  3. 버전을 올린 PR이 머지되면 `gh release view v<버전> --json assets --jq '.assets[].name'`에 설치 파일 6개(dmg 2·zip 2·exe 1·AppImage 1)와 체크섬 목록이 있다.
  4. 버전 변경을 커밋한 뒤 `scripts/check-release.sh` 통과.
  5. UAT(이 Mac, 사람): 옛 버전 앱을 설치하고 세션을 연 채 새 릴리스가 나오면 [업데이트] → 앱이 새 버전으로 다시 열리고 세션이 대화째 복구된다.
  6. 이 Mac 전환: 기존 launchd 폴링 에이전트와 빌드 클론을 정리하고(실행 중 자원이라 한 줄 확인 뒤), Releases의 `.dmg`로 설치한다.

## 작업 조각
- [ ] S1. **릴리스 잡**: `release.yml`의 Tauri 4대상 빌드를 electron-builder 4대상으로 바꾼다. 화면 빌드 → 패키징 → 체크섬 목록 생성 → 첨부 → 공개 순서. 릴리스 노트·태그 규칙은 유지한다. 완료 기준: DoD 3·4.
- [ ] S2. **업데이터 공통부**: 서버가 GitHub 최신 릴리스를 주기적으로(와 [다시 확인] 때) 확인하고, 화면 띠에 [업데이트]를 보인다. 내려받기·체크섬 검증·세션 가드·재시작·복구 호출. 완료 기준: DoD 1.
- [ ] S3. **OS별 교체 단계** (depends: S2): mac(`.zip` 풀어 `.app` 교체 후 재실행), Windows(앱 종료 뒤 설치 프로그램 `/S` 실행 후 재실행), Linux(`$APPIMAGE` 교체 후 재실행). 앱이 직접 내려받으므로 mac 격리 표시가 붙지 않는지 확인한다. 완료 기준: DoD 2.
- [ ] S4. **이 Mac 전환과 안내** (depends: S1, S3): README 「설치」를 Releases 설치 파일 + 처음 한 번 경고 넘기기 안내로 바꾼다. 릴리스 노트에 기존 Tauri 사용자 정리 안내(`tmux -L anvil kill-server`, 옛 앱 휴지통). launchd 폴링 에이전트·빌드 클론과 `scripts/install-app.sh`·`scripts/check-install-app.sh`를 정리한다. 완료 기준: DoD 5·6.
