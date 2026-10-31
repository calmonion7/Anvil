# Anvil

forge(Claude Code 플러그인)로 진행하는 프로젝트들의 진행 상황을 한 화면의 보드로 보고, 단계마다 Claude Code 세션을 띄워 이어 가는 데스크톱 앱(Electron — macOS · Windows · Linux).

- 등록한 프로젝트의 `.forge/` 를 읽어 백로그 · 실행 · 회고 · 완료를 보드로 그린다(읽기만 한다).
- 계획 · 실행 등 역할별 `claude` 세션을 띄운다. 세션은 앱과 따로 도는 Anvil 서버가 쥐고 있어 앱을 껐다 켜도 그대로 이어지고, 서버가 다시 떠도(업데이트 등) 대화째 복구된다.

## 준비물

Anvil은 혼자 도는 프로그램이 아니라 아래 도구를 엮어 쓴다. 처음 열 때 빠진 것이 있으면 보드 대신 「준비 중」 화면이 떠 항목별로 사용자 범위에 자동 설치하고 결과를 항목마다 보여 준다 — 관리자 암호도 Homebrew도 필요 없다. 실패하면 **[다시 시도]**.

| 필요 | 용도 | 설치 |
|---|---|---|
| **Claude Code CLI** (로그인까지) | 각 세션에서 실행 | 자동 — 공식 설치 스크립트(`claude.ai/install.sh`, Windows는 `install.ps1`). 로그인은 첫 세션 안에서 claude가 안내한다 |
| **forge 플러그인** | 보드가 읽는 `.forge/` 를 만든다 | 자동 — `claude plugin marketplace add gyuha/forge` → `claude plugin install forge@forge` ([소개](https://gyuha.com/forge/)) |
| git (macOS는 개발자 도구) | forge 플러그인 받기(플러그인이 이미 있으면 확인하지 않는다) | macOS는 기본 설치 창이 뜬다(`xcode-select --install`) — 창에서 설치를 마치면 이어서 진행한다. Linux는 관리자 암호가 필요해 직접 `sudo apt install git` |
| Git for Windows (Windows만) | claude가 Git Bash로 돈다 | 자동 — `winget`으로 사용자 범위 설치 |

node는 따로 설치하지 않아도 된다 — forge 훅과 상태줄은 앱 안에 든 node로 돈다.

forge를 쓰지 않는 프로젝트를 등록하면 보드는 비어 있다.

## 설치

[Releases](https://github.com/calmonion7/Anvil/releases) 에서 OS에 맞는 파일을 받는다. 서명하지 않은 앱이라 **처음 한 번만** 경고를 넘긴다.

- **macOS** (`Anvil-<버전>-mac-arm64.dmg` — Apple Silicon, Intel 맥은 `mac-x64.dmg`): dmg를 열어 Anvil을 응용 프로그램 폴더로 옮긴다. 처음 열 때 막히면 Finder에서 우클릭 → 열기. "손상되었습니다"라고 나오면 터미널에서:
  ```
  xattr -cr /Applications/Anvil.app
  ```
- **Windows** (`Anvil-<버전>-win-x64.exe`): 실행하면 사용자 범위로 설치된다(관리자 권한 없음, WSL 필요 없음). 처음 한 번 SmartScreen 창이 뜨면 「추가 정보 → 실행」을 누른다. ARM Windows에서도 x64 에뮬레이션으로 돈다. 프로젝트 폴더는 윈도우 경로(`C:\…`)를 쓴다.
- **Linux** (`Anvil-<버전>-linux-x86_64.AppImage`): 실행 권한을 주고(`chmod +x`) 실행한다.

처음 열면 「준비 중」 화면에서 빠진 준비물(claude CLI·forge 플러그인, Windows는 Git for Windows)을 자동으로 설치한 뒤 보드로 넘어간다.

**업데이트**: 새 버전이 나오면 보드 위 띠에 [업데이트]가 뜬다. 누르면 앱이 새 버전으로 다시 열리고, 열려 있던 세션은 대화째 이어진다. 작업 중인 세션이 있으면 그 세션이 끝난 뒤 바뀐다. [⚙ 설정] 의 [다시 확인]으로 바로 확인할 수도 있다.

## 쓰면서 알아둘 것

- **화면 언어**: 한국어 · English. 기본은 시스템 언어를 따르고, [⚙ 설정] 에서 바꾼다.
- **처음 쓰는 프로젝트**: forge가 없는 프로젝트는 보드 위 띠의 [계획 세션에서 시작] 으로 `/forge:fg-ask` 를 채워 첫 계획을 만든다.
- **모델**: 사이드바 아래 [⚙ 설정] 에서 계획 · 실행 세션 모델을 고른다(기본 opus · sonnet). 쓰는 요금제에서 opus를 못 쓰면 "claude 기본값"이나 sonnet으로 바꾼다. 새로 여는 세션부터 적용된다.
- **사용량**: 세션마다 claude가 돈다 — 쓰는 만큼 Claude 요금제 사용량이 나간다.
- **앱을 닫아도 세션은 남는다**(다시 열면 이어진다). 세션을 끝내려면 세션 창의 [세션 종료]. 세션도 열린 창도 없으면 서버는 5분 뒤 스스로 내려간다.

## 문제가 생기면

[GitHub Issues](https://github.com/calmonion7/Anvil/issues) 에 남긴다. 앱 데이터 · 서버 로그(`server.log`)는 세 OS 모두 홈 폴더의 `.anvil/` 에 있다.

## 삭제

1. 열린 세션을 모두 [세션 종료]로 끄고 앱을 닫는다(5분 뒤 서버도 내려간다).
2. 앱 지우기 — macOS: `/Applications/Anvil.app` 을 휴지통으로 · Windows: 설정 → 앱 → Anvil 제거 · Linux: AppImage 파일을 지운다.
3. 데이터까지 지우려면 홈 폴더의 `.anvil/` 을 지운다(macOS·Linux: `rm -rf ~/.anvil`).

프로젝트의 `.forge/` 는 Anvil이 만들거나 지우지 않는다(forge 플러그인 몫).

## 개발

```
npm ci
npm run dev:app        # 데스크톱 앱 개발 실행: vite 화면 + Electron 창(서버는 설치된 앱처럼 따로 떠 창을 닫아도 남는다)
npm run dev:web        # 웹 개발 실행: Node 서버 + vite 화면(찍히는 「Anvil 개발:」 주소 http://127.0.0.1:1420/?token=… 을 연다)
node --test server/    # 서버 테스트
npx playwright test    # 화면 e2e(서버는 가짜)
npm run test:app       # Electron 앱 스모크(먼저 npm run build) · npm run dist:mac → dist/에 mac .dmg
npm run check          # 타입 검사
scripts/release.sh X.Y.Z  # 버전 맞추고 커밋 + 태그 (push는 직접). 릴리스 노트 docs/releases/vX.Y.Z.md 를 먼저 커밋
# 또는: 버전(package.json + lock) + docs/releases/vX.Y.Z.md 를 담은 PR 을 main 에 머지하면 태그·빌드·공개까지 자동
```

## 라이선스

[MIT](LICENSE)
