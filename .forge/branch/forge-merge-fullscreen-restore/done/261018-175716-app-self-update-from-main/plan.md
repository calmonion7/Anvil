<!-- forge-slug: app-self-update-from-main -->
<!-- task: 7 -->
<!-- tdd: off -->

# 앱 메뉴에서 main 기준으로 Anvil을 다시 빌드·설치하기

## 목표
Anvil은 나 혼자 이 Mac에서만 쓴다. `/Applications/Anvil.app`은 항상 "로컬 main 체크아웃의 릴리스 빌드"이고, 앱 메뉴 **Anvil → 업데이트 설치…** 하나로 pull → 빌드 → 교체 → 재실행된다. 실패하면 쓰던 앱이 그대로 남는다.

## 결정 (이번 그릴링)
1. 배포 대상: 본인 한 대. 서명·공증·dmg는 없다.
2. 설치본의 출처: 항상 `main` 릴리스 빌드. 브랜치 확인은 `npm run tauri dev`나 디버그 번들로 한다.
3. 실행 시점: 사람이 직접 실행한다(자동 훅·CI 없음).
4. 입구: 앱 메뉴 항목 하나. 내부적으로는 설치 스크립트를 앱과 분리된 프로세스로 호출한다.
5. 레포 경로: 빌드할 때 상수로 박아 넣는다(`CARGO_MANIFEST_DIR`의 상위). 설정 UI는 없다.
6. 실패 처리: 앱이 떠 있는 동안 사전 점검(main 여부·변경 없음·`git pull --ff-only` 성공)과 빌드를 끝낸다. 빌드가 성공한 뒤에만 종료·교체·재실행한다. 로그는 앱 데이터 폴더의 `update.log`에 남기고, 결과는 macOS 알림으로 띄운다.

## Source of truth
- ADR `261017-211601`: 세션은 tmux 위에서 돌아서 앱을 재시작해도 끊기지 않는다. 그래서 업데이트 중 재시작이 허용된다.
- ADR `261017-211600`: Tauri 2.

## 슬라이스
1. **설치 스크립트** `scripts/install-app.sh <repo>`
   - 사전 점검 실패 시 0이 아닌 코드로 종료하고 사유 한 줄을 남긴다. 실행 중인 앱은 건드리지 않는다.
   - 통과하면 `npm ci` 필요 여부를 확인한 뒤 `npm run tauri build`를 실행한다. 빌드가 실패하면 기존 앱을 유지하고 종료한다.
   - 빌드가 성공하면 Anvil을 종료(`osascript quit`, 대기)하고 `/Applications/Anvil.app`을 교체한 뒤 `open`으로 재실행한다.
   - 빌드한 커밋 SHA를 번들 안(예: `Contents/Resources/build-commit`)에 기록한다.
   - 완료 기준: 실패 조건(브랜치≠main / 변경 있음 / pull 실패) 각각에서 앱 프로세스가 살아 있고 `/Applications/Anvil.app`이 바뀌지 않는다.
2. **앱 메뉴 연결**
   - macOS 앱 메뉴에 "업데이트 설치…"를 추가한다. 누르면 스크립트를 detach(`nohup`/`setsid` 계열)로 실행하고 출력을 `update.log`로 보낸다.
   - 결과 알림은 스크립트가 `osascript display notification`으로 띄운다. 플러그인을 추가하지 않는다.
   - 완료 기준: 메뉴를 누르면 앱이 꺼졌다 새 빌드로 다시 뜨고, `build-commit`이 main HEAD와 같다.

## Definition of Done
- `bash scripts/check-install-app.sh`: 임시 git 레포로 사전 점검 실패 3종을 재현하고, 각각 비0 종료와 "교체 없음"을 확인한다. (사전 상태: 파일 없음 → 실패. 앞으로 통과해야 할 점검)
- `cat /Applications/Anvil.app/Contents/Resources/build-commit` == `git -C ~/Project/Anvil rev-parse main`. (사전 상태: 파일 없음 → 실패. 앞으로 통과해야 할 점검이고, 메뉴로 한 번 실제 업데이트한 뒤 확인하는 UAT)

## 이번에 안 하는 것
- 업데이트 있음 표시, 자동 확인
- 코드 서명·공증, dmg, GitHub Releases, Tauri updater
- 다른 Mac·다른 사용자 배포
- 레포 경로 설정 UI
