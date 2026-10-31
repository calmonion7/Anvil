# Anvil

forge(Claude Code 플러그인)로 진행하는 프로젝트들의 진행 상황을 한 화면의 보드로 보고, 단계마다 Claude Code 세션을 띄워 이어 가는 데스크톱 앱(Tauri 2).

- 등록한 프로젝트의 `.forge/` 를 읽어 백로그 · 실행 · 회고 · 완료를 보드로 그린다(읽기만 한다).
- 계획 · 실행 등 역할별 `claude` 세션을 tmux 안에 띄우고, 앱을 껐다 켜도 세션이 그대로 이어진다.
- 세션이 입력을 기다리면 알림을 띄운다.

## 준비물

Anvil은 혼자 도는 프로그램이 아니라 아래 도구를 엮어 쓴다. 없으면 앱 맨 위에 안내 띠가 뜨고(프로젝트를 아직 등록하지 않았어도), 그동안 세션을 여는 버튼은 꺼진다. 세 OS 모두 띠의 **[설치]** 한 번으로 빠진 것을 항목별로 설치하고 결과를 항목마다 보여 준다 — 관리자 암호도 Homebrew도 필요 없다(Windows는 WSL 안에 설치한다). 직접 설치했다면 띠의 **[다시 확인]** 을 누른다.

- **macOS**: 개발자 도구(git)가 없으면 [설치]가 macOS 기본 설치 창을 띄우니, 창에서 설치를 마친 뒤 **[다시 확인]** → **[설치]** 를 한 번 더 누른다(forge 플러그인을 받는 데 git이 필요하다). claude CLI를 새로 설치했으면 이어서 뜨는 **[로그인]** 으로 터미널에서 한 번 로그인한다.
- **Linux · Windows(WSL)**: git이 없으면 띠가 `sudo apt install git`(Windows는 `wsl -- sudo apt install git`)을 안내한다 — 관리자 암호가 필요해 직접 설치하고 **[다시 확인]** 을 누른다. claude 로그인은 Anvil에서 세션을 열면 claude가 안내한다.
- **Windows**: WSL과 리눅스 배포판이 먼저 있어야 한다. 없으면 띠가 `wsl --install`(관리자 PowerShell, 다시 시작) 또는 `wsl --install -d Ubuntu`(사용자 이름 만들기까지)를 안내한다.

tmux 3.6a는 **세 OS 모두 앱에 들어 있어** 따로 설치하지 않는다(시스템에 tmux가 있어도 앱에 든 것을 쓴다). node는 22 이상이어야 하고, 더 낮은 node가 있으면 [설치]가 Anvil 전용 폴더(`~/.local/share/anvil/node`)에 v22를 따로 받아 Anvil 세션에서만 쓴다 — 사용자의 node는 바꾸지 않는다.

| 필요 | 용도 | 설치 |
|---|---|---|
| **Claude Code CLI** (로그인까지) | 각 세션에서 실행 | [설치]가 `claude.ai/install.sh`로 `~/.local/bin`에 넣는다 |
| git (macOS는 개발자 도구) | forge 플러그인 받기 | macOS는 [설치]가 설치 창을 띄운다(`xcode-select --install`), Linux·WSL은 `sudo apt install git` |
| node 22 이상 | forge 훅(세션 시작·종료 등) 실행 | [설치]가 nodejs.org 공식본을 검증해 받는다(관리자 암호 없음) |
| **forge 플러그인** | 보드가 읽는 `.forge/` 를 만든다 | [설치]가 `claude plugin marketplace add gyuha/forge` → `claude plugin install forge@forge` ([소개](https://gyuha.com/forge/)) |
| tmux | 세션 유지 | 앱에 내장 |
| jq | 세션별 모델 표시 · 원래 상태줄 실행 | 앱에 내장 |

forge를 쓰지 않는 프로젝트를 등록하면 보드는 비어 있다.

## 설치

[Releases](https://github.com/calmonion7/Anvil/releases) 에서 OS에 맞는 파일을 받는다.

- **macOS** (`.dmg`, Apple Silicon은 `aarch64`): 서명하지 않은 앱이다. 처음 열 때 막히면 Finder에서 우클릭 → 열기. "손상되었습니다"라고 나오면 터미널에서:
  ```
  xattr -cr /Applications/Anvil.app
  ```
- **Windows** (`.msi` / `-setup.exe`, 실험용): 앱은 윈도우에서, 세션은 **WSL 안**에서 돈다. WSL과 배포판(Ubuntu 등)만 있으면 나머지는 띠의 [설치]가 WSL 안에 넣는다. 프로젝트 폴더는 윈도우 경로(`C:\…`)든 WSL 경로(`\\wsl$\…`)든 된다. 알림은 윈도우 알림으로 뜬다(앱이 꺼져 있어도).
- **Linux** (`.AppImage` / `.deb`, x86_64, 실험용): 띠의 [설치]로 준비물을 넣는다(git만 직접).

설치한 뒤에는 새 버전이 나오면 앱 상단 띠의 [업데이트·재시작] 으로 갱신한다.

## 쓰면서 알아둘 것

- **화면 언어**: 한국어 · English. 기본은 시스템 언어를 따르고, [⚙ 설정] 에서 바꾼다.
- **처음 쓰는 프로젝트**: forge가 없는 프로젝트는 보드 위 띠의 [계획 세션에서 시작] 으로 `/forge:fg-ask` 를 채워 첫 계획을 만든다.
- **모델**: 사이드바 아래 [⚙ 설정] 에서 계획 · 실행 세션 모델을 고른다(기본 opus · sonnet). 쓰는 요금제에서 opus를 못 쓰면 "claude 기본값"이나 sonnet으로 바꾼다. 새로 여는 세션부터 적용된다.
- **사용량**: 세션마다 claude가 돈다 — 쓰는 만큼 Claude 요금제 사용량이 나간다.
- **앱을 닫아도 세션은 남는다**(다시 열면 이어진다). 세션을 끝내려면 세션 창의 [세션 종료].

## 문제가 생기면

[GitHub Issues](https://github.com/calmonion7/Anvil/issues) 에 남긴다. 앱 데이터 · 로그는 `~/Library/Application Support/com.taebro.anvil/` 에 있다.

## 삭제

1. 남은 세션 끄기: `tmux -L anvil kill-server`
2. `/Applications/Anvil.app` 을 휴지통으로
3. 데이터까지 지우려면: `rm -rf ~/Library/Application\ Support/com.taebro.anvil`

프로젝트의 `.forge/` 는 Anvil이 만들거나 지우지 않는다(forge 플러그인 몫).

## 개발

```
npm ci
npm run tauri dev      # 개발 실행
npm run dev:web        # 웹 개발 실행: Node 서버 + vite 화면(찍히는 「Anvil 개발:」 주소 http://127.0.0.1:1420/?token=… 을 연다)
npm run dev:app        # 데스크톱 앱 개발 실행: vite 화면 + Electron 창(서버는 설치된 앱처럼 따로 떠 창을 닫아도 남는다)
npm run test:app       # Electron 앱 스모크(먼저 npm run build) · npm run dist:mac → dist/에 mac arm64 .dmg
npm run check          # 타입 검사
cd src-tauri && cargo test
scripts/install-app.sh # 이 맥에 빌드해 설치(main을 따라가는 로컬 설치본)
scripts/release.sh X.Y.Z  # 버전 맞추고 커밋 + 태그 (push는 직접). 릴리스 노트 docs/releases/vX.Y.Z.md 를 먼저 커밋
# 또는: 버전(5개 파일) + docs/releases/vX.Y.Z.md 를 담은 PR 을 main 에 머지하면 태그·빌드·공개까지 자동
gh workflow run e2e-desktop.yml --ref <브랜치>  # 실제 앱 첫 실행 흐름을 Linux·Windows 러너에서(버전 PR에서는 자동)
```

e2e-desktop 결과는 `gh run download <id>` 로 받는다 — `e2e-desktop-linux`·`e2e-desktop-windows` 아래 시나리오별 단계 스크린샷과 `app.log`·환경 로그. 하네스(`e2e-desktop/`)는 Linux에서 tauri-driver(WebdriverIO)로, Windows에서는 웹뷰 디버그 포트를 연 테스트 빌드(`e2e-desktop/tauri.e2e.json`)에 Playwright로 붙는다 — macOS에서는 돌지 않는다.

## 라이선스

[MIT](LICENSE)
