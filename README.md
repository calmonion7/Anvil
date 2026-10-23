# Anvil

forge(Claude Code 플러그인)로 진행하는 프로젝트들의 진행 상황을 한 화면의 보드로 보고, 단계마다 Claude Code 세션을 띄워 이어 가는 데스크톱 앱(Tauri 2).

- 등록한 프로젝트의 `.forge/` 를 읽어 백로그 · 실행 · 회고 · 완료를 보드로 그린다(읽기만 한다).
- 계획 · 실행 등 역할별 `claude` 세션을 tmux 안에 띄우고, 앱을 껐다 켜도 세션이 그대로 이어진다.
- 세션이 입력을 기다리면 알림을 띄운다.

## 준비물

Anvil은 혼자 도는 프로그램이 아니라 아래 도구를 엮어 쓴다. 없으면 앱 상단에 안내 띠가 뜨고, macOS에서는 띠의 **[설치]** 로 빠진 것만 한 번에 설치한다(tmux는 Homebrew가 있어야 한다). claude CLI를 새로 설치했으면 이어서 뜨는 **[로그인]** 으로 터미널에서 한 번 로그인한다.

| 필요 | 용도 | 설치 (macOS) |
|---|---|---|
| **tmux** | 세션 유지 | `brew install tmux` |
| **Claude Code CLI** (로그인까지) | 각 세션에서 실행 | `curl -fsSL https://claude.ai/install.sh \| bash` 후 터미널에서 `claude` 한 번 실행해 로그인 |
| **forge 플러그인** | 보드가 읽는 `.forge/` 를 만든다 | `claude plugin marketplace add gyuha/forge` → `claude plugin install forge@forge` ([소개](https://gyuha.com/forge/)) |
| jq (선택) | 세션별 모델 · effort 표시 | `brew install jq` |

forge를 쓰지 않는 프로젝트를 등록하면 보드는 비어 있다.

## 설치

[Releases](https://github.com/calmonion7/Anvil/releases) 에서 OS에 맞는 파일을 받는다.

- **macOS** (`.dmg`, Apple Silicon은 `aarch64`): 서명하지 않은 앱이다. 처음 열 때 막히면 Finder에서 우클릭 → 열기. "손상되었습니다"라고 나오면 터미널에서:
  ```
  xattr -cr /Applications/Anvil.app
  ```
- **Windows · Linux**: 실험용. Windows는 WSL 안에 tmux와 claude CLI가 있어야 하고, 세션 상태 표시 · 알림은 아직 동작하지 않을 수 있다.

설치한 뒤에는 새 버전이 나오면 앱 상단 띠의 [업데이트·재시작] 으로 갱신한다.

## 개발

```
npm ci
npm run tauri dev      # 개발 실행
npm run check          # 타입 검사
cd src-tauri && cargo test
scripts/install-app.sh # 이 맥에 빌드해 설치(main을 따라가는 로컬 설치본)
scripts/release.sh X.Y.Z  # 버전 맞추고 커밋 + 태그 (push는 직접)
```

## 라이선스

[MIT](LICENSE)
