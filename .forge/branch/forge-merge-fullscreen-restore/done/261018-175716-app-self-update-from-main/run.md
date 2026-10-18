# RUN — 앱 메뉴에서 main 기준으로 Anvil을 다시 빌드·설치하기

워크플로 없이 직접 실행(슬라이스 2개, 소규모).

## 슬라이스 결과
- S1 `scripts/install-app.sh <repo>` — ✅ 계획대로. 사전 점검(main·변경 없음·pull --ff-only) → 필요 시 `npm ci` → `npm run tauri build -- --bundles app` → `build-commit` 기록 → quit·대기 → `ditto` 교체 → `open`. 점검용으로 `ANVIL_APP_DEST`(설치 위치)·`ANVIL_NOTIFY`(알림 명령) 환경변수 추가.
- S2 앱 메뉴 연결 — ✅ 계획대로. `Menu::default`의 앱 메뉴 1번 자리에 "업데이트 설치…", 클릭 시 `/bin/bash install-app.sh REPO_DIR`를 `process_group(0)`으로 분리 실행, 출력은 앱 데이터 폴더 `update.log`. `REPO_DIR` = `CARGO_MANIFEST_DIR/..`.

## DoD baseline → after
- `bash scripts/check-install-app.sh`: 파일 없음(실패) → exit 0, 3/3 통과
- `build-commit == main HEAD`: 파일 없음(실패) → 미확인 — 사람이 메뉴로 실제 업데이트해야 하는 외부 UAT(loop C3)

## 갈라진 점
- Rust 툴체인이 PATH에 없다(`~/.rustup/toolchains/stable-aarch64-apple-darwin/bin`). 설치 스크립트는 이 경로를 직접 붙인다(기존 check-fullscreen-restore.sh와 같은 방식).
- `REPO_DIR`은 빌드한 체크아웃 경로라, 워크트리에서 빌드한 번들의 메뉴는 그 워크트리를 가리킨다. main 체크아웃에서 빌드한 설치본만 계획대로 동작한다.
- 빌드된 번들을 띄워 System Events로 앱 메뉴에 "업데이트 설치…"가 있는 것을 확인했다(실제 클릭·교체는 하지 않음).
