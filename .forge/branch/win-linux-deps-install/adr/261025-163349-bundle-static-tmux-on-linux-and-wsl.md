---
author: taebro
decided: 2026-10-25 16:33
---
# Linux·Windows(WSL)도 정적 tmux를 내장하고, WSL에는 앱이 버전 이름으로 복사해 쓴다

ADR 261024-202909는 macOS만 tmux를 내장하고 Windows(WSL)·Linux는 시스템 tmux를 쓰게 했다. 그러면 두 OS에서 [설치]가 tmux를 깔려면 `sudo apt/dnf …`가 필요하다. 비밀번호를 받을 창, 배포판마다 다른 패키지 관리자, 터미널 찾기가 모두 따라붙는다. 그래서 두 OS도 macOS처럼 **musl로 정적 링크한 tmux 3.6a**를 미리 빌드해 커밋하고 항상 그것을 쓴다. Linux 배포판(x86_64)은 앱 번들에 넣는다. Windows 배포판은 x86_64·aarch64 두 벌을 넣고, WSL이 있으면 앱이 배포판의 `uname -m`에 맞는 것을 `~/.local/share/anvil/bin/tmux-<버전>`으로 **한 번 복사해 그 경로를 실행**한다. 버전이 파일 이름에 들어가 있어서, 자동 업데이트가 설치 폴더를 바꿔도 이미 떠 있는 `tmux -L anvil` 서버의 실행 파일은 바뀌지 않는다. 이로써 tmux는 어느 OS에서도 준비물이 아니고, 준비물 설치에 관리자 권한이 필요한 항목이 없다.

## Considered Options
- [설치]가 터미널 창을 열어 `sudo apt/dnf install tmux` — 시스템 패키지라 익숙하지만 배포판·터미널 분기가 생기고 비밀번호 입력이 [설치] 한 번이라는 목표를 깬다.
- tmux는 안내만 하고 나머지만 [설치] — 가장 작지만 첫 실행에서 사용자가 여전히 명령을 쳐야 한다.
- WSL에서 Windows 설치 폴더(`/mnt/c/…`)의 tmux를 바로 실행 — 복사가 없지만, 업데이트가 실행 중인 파일을 바꿀 때의 동작이 검증되지 않았다.

## Consequences
- tmux 버전을 올릴 때는 정적 빌드 스크립트를 다시 돌려 세 아키텍처 결과물을 함께 커밋한다(macOS 유니버설 + linux x86_64·aarch64).
- Windows-on-ARM(WSL arm64)도 덤으로 지원된다. 로컬 Windows 11 ARM VM 검증이 이 경로를 쓴다.
- 이미 시스템 tmux로 `-L anvil` 서버를 띄워 둔 기존 Linux·WSL 사용자는 업데이트 뒤 버전이 달라질 수 있으니 릴리스 노트에 알린다.
