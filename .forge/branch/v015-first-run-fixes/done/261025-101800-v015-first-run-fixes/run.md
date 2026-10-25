# RUN — v0.1.5 첫 설치 수정 세 건

규모가 작아 워크플로 없이 메인 세션에서 직접 실행(fg-loop 무인 주행).

- S1 node 준비물 — ✅ 계획대로. `Need::Node`(DevTools 뒤·Claude 앞), `missing()`에서 forge 여부와 무관하게 `node --version` 확인, macOS 설치는 `NODE_VERSION = v22.20.0` 공식 tar.xz + SHASUMS256 `shasum -a 256 -c` + `~/.local/share/anvil/node` 풀기 + `~/.local/bin` 심링크. Windows는 WSL `bash -lc "node --version"`으로 띠 표시만. cargo 테스트 2건 추가.
- S2 설치 창 앞으로 — ✅ 계획대로. DevTools 명령을 `xcode-select --install || exit $?` + 최대 5초(0.25s×20) `if application "Install Command Line Developer Tools" is running then … activate` 재시도 + `exit 0`으로. `is running` 확인이라 창이 안 떴는데 앱을 새로 띄우지는 않는다. 화면 확인은 VM UAT(C5).
- S3 세션 열기 포커스 — ✅ 계획대로. `SessionPane`에 `onstarted` 콜백, 페이지가 `focus = {name, tick+1}`. e2e 추가, 수정 빼면 빨강(inactive) 확인.
- S4 릴리스 준비 — ✅ 다섯 파일 0.1.5, `docs/releases/v0.1.5.md`, README 준비물 표에 node 행 + Windows `apt install … nodejs` + Linux 목록.

## 계획과 다른 점
- node 설치 스크립트를 임시 HOME에서 실제로 돌려 보는 리허설은 워크트리 격리 가드에 막혀 못 했다. 대신 nodejs.org에 v22.20.0 darwin-arm64·x64 압축본과 SHASUMS 항목이 있는 것은 확인했다. 실제 설치는 VM UAT ③에서 확인된다.
- README Windows 안내는 Ubuntu 기본 `nodejs` 패키지로 적었다(버전이 낮을 수 있음 — 훅 호환은 VM 밖이라 미검증).

## DoD 기준선 → 이후
- cargo test: deps.rs node 언급 0건, 32+27 → 34+27 통과(node 테스트 2건 포함)
- npm run test:e2e: 33 → 35 통과(node 띠·세션 열기 포커스)
- npm run check: 0 ERRORS → 0 ERRORS(회귀 방지 유지)
- 버전: 0.1.4 → 0.1.5 (다섯 파일)
- VM UAT: 미실행(사람)
