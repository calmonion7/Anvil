---
author: taebro
decided: 2026-10-24 20:29
---
# macOS에서는 tmux·jq를 앱에 내장하고 항상 그것을 쓴다

깨끗한 맥(가상머신)에서 v0.1.1을 설치해 보니, 준비물 중 tmux(와 선택 사항인 jq)만 Homebrew를 요구했다 — 관리자 비밀번호·터미널 명령·개발자 도구 설치(5~10분)라 개발자가 아닌 사용자는 여기서 막힌다. 그래서 macOS 배포판은 유니버설 tmux(libevent 정적 링크)와 공식 jq 실행 파일을 `src-tauri/resources/bin/`에 **미리 빌드해 커밋**하고 앱 번들에 넣으며, 시스템에 tmux가 있어도 **항상 내장본**을 쓴다. 이미 떠 있는 `tmux -L anvil` 서버에 붙을 수 있도록 내장 버전은 지금 Homebrew 최신과 같은 tmux 3.6a · jq 1.8.1로 고정한다. 그 결과 macOS의 준비물은 claude CLI와 forge 플러그인(둘 다 sudo 없이 설치)만 남는다. Windows(WSL)와 Linux는 기존대로 시스템 tmux를 쓴다.

## Considered Options
- release 워크플로에서 매번 tmux를 빌드 — 저장소는 깨끗하지만 4-OS 릴리스에 실패 지점이 늘고 빌드가 느려진다.
- 시스템 tmux 우선, 없을 때만 내장본 — 기존 사용자 경험은 그대로지만 환경마다 동작이 갈려 테스트 경우가 둘이 된다.
- tmux 없이 앱이 직접 세션을 유지 — 가장 깔끔하지만 "앱을 꺼도 세션 유지"(ADR 261017-211601)를 새로 설계해야 한다.

## Consequences
- tmux·jq 버전을 올릴 때는 `scripts/build-tmux.sh`를 다시 돌려 커밋한다. 버전을 바꾸면 이미 떠 있는 세션 서버와 프로토콜이 어긋날 수 있으니 릴리스 노트에 알린다.
