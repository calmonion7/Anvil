# Anvil

forge(Claude Code 플러그인)로 진행하는 프로젝트들의 진행 상황을 한 화면의 보드로 보고, 단계마다 Claude Code 세션을 띄워 이어 가는 데스크톱 앱(Tauri 2).

- 등록한 프로젝트의 `.forge/` 를 읽어 백로그 · 실행 · 회고 · 완료를 보드로 그린다(읽기만 한다).
- 계획 · 실행 등 역할별 `claude` 세션을 tmux 안에 띄우고, 앱을 껐다 켜도 세션이 그대로 이어진다.
- 세션이 입력을 기다리면 알림을 띄운다.

## 준비물

Anvil은 혼자 도는 프로그램이 아니라 아래 도구를 엮어 쓴다. 없으면 앱 맨 위에 안내 띠가 뜨고(프로젝트를 아직 등록하지 않았어도), 그동안 세션을 여는 버튼은 꺼진다. macOS에서는 띠의 **[설치]** 한 번으로 빠진 것을 항목별로 설치하고 결과를 항목마다 보여 준다 — Homebrew는 필요 없다. 개발자 도구(git)가 없는 맥이면 [설치]가 macOS 기본 설치 창을 띄우니, 창에서 설치를 마친 뒤 **[다시 확인]** → **[설치]** 를 한 번 더 누른다(forge 플러그인을 받는 데 git이 필요하다). claude CLI를 새로 설치했으면 이어서 뜨는 **[로그인]** 으로 터미널에서 한 번 로그인한다. 직접 설치했다면 띠의 **[다시 확인]** 을 누른다.

macOS 앱에는 **tmux 3.6a와 jq 1.8.1이 들어 있어** 따로 설치하지 않는다(시스템에 tmux가 있어도 앱에 든 것을 쓴다). Windows(WSL)·Linux는 아래처럼 tmux를 직접 설치한다.

| 필요 | 용도 | 설치 (macOS) |
|---|---|---|
| **Claude Code CLI** (로그인까지) | 각 세션에서 실행 | `curl -fsSL https://claude.ai/install.sh \| bash` 후 터미널에서 `claude` 한 번 실행해 로그인 |
| 개발자 도구 (git) | forge 플러그인 받기 | [설치]가 설치 창을 띄운다 (`xcode-select --install`) |
| **forge 플러그인** | 보드가 읽는 `.forge/` 를 만든다 | `claude plugin marketplace add gyuha/forge` → `claude plugin install forge@forge` ([소개](https://gyuha.com/forge/)) |
| tmux · jq | 세션 유지 · 세션별 모델 표시 | 앱에 내장(Windows·Linux는 직접 설치) |

forge를 쓰지 않는 프로젝트를 등록하면 보드는 비어 있다.

## 설치

[Releases](https://github.com/calmonion7/Anvil/releases) 에서 OS에 맞는 파일을 받는다.

- **macOS** (`.dmg`, Apple Silicon은 `aarch64`): 서명하지 않은 앱이다. 처음 열 때 막히면 Finder에서 우클릭 → 열기. "손상되었습니다"라고 나오면 터미널에서:
  ```
  xattr -cr /Applications/Anvil.app
  ```
- **Windows** (`.msi` / `-setup.exe`, 실험용): 앱은 윈도우에서, 세션은 **WSL 안**에서 돈다. WSL(Ubuntu)에 아래를 준비한다 — [설치] 버튼은 macOS 전용이라 직접 설치한다.
  ```
  wsl -- sudo apt install tmux jq
  wsl -- bash -lc "curl -fsSL https://claude.ai/install.sh | bash"
  wsl -- bash -lc "claude"                     # 한 번 로그인
  wsl -- bash -lc "claude plugin marketplace add gyuha/forge && claude plugin install forge@forge"
  ```
  프로젝트 폴더는 윈도우 경로(`C:\…`)든 WSL 경로(`\\wsl$\…`)든 된다. 알림은 윈도우 알림으로 뜬다(앱이 꺼져 있어도).
- **Linux** (`.AppImage` / `.deb`, 실험용): tmux · claude CLI · forge를 직접 설치한다(`sudo apt install tmux jq` 등).

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
npm run check          # 타입 검사
cd src-tauri && cargo test
scripts/install-app.sh # 이 맥에 빌드해 설치(main을 따라가는 로컬 설치본)
scripts/release.sh X.Y.Z  # 버전 맞추고 커밋 + 태그 (push는 직접). 릴리스 노트 docs/releases/vX.Y.Z.md 를 먼저 커밋
# 또는: 버전(5개 파일) + docs/releases/vX.Y.Z.md 를 담은 PR 을 main 에 머지하면 태그·빌드·공개까지 자동
```

## 라이선스

[MIT](LICENSE)
