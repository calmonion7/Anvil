<!-- forge-slug: win-linux-deps-install-2of3 -->
<!-- task: 13 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
<!-- priority: high -->
# 로컬 Windows 11 ARM 테스트 VM — SSH로 몰고 사람은 화면만

## Goal / Non-goals
- Goal: 이 맥(M5·32GB)의 UTM에 **Windows 11 ARM** VM을 만들어, macOS VM과 같은 방식으로 에이전트가 SSH로 다운로드·설치·로그 수집을 하고 사람은 화면 판단만 하는 손 테스트 환경을 갖춘다. 깨끗한 원본을 두고 테스트마다 복제한다.
- Non-goals: Anvil 코드 변경. Linux 손 테스트 VM(Linux는 1부 러너 스크린샷으로 판정). WSL·Ubuntu를 원본에 미리 까는 것(첫 설치 경험을 재현해야 하므로 원본은 WSL 없이 둔다 — 아래 '정할 것' 참고).

## Source of truth
- 메모리 `vm-test-automation`(macOS VM 절차: 원본은 깨끗하게 + SSH·호스트 공개키·자동 로그인·잠자기 끔만, 테스트마다 `utmctl clone`, utmctl start·stop 불안정 → 실행·삭제는 사람이 UTM 창에서)
- ADR `.forge/adr/261025-163349-bundle-static-tmux-on-linux-and-wsl.md`(WSL arm64용 tmux 내장 — 3부)

## 사람이 해야 하는 일 (실행 중 사람 확인 지점)
- Windows 11 ARM ISO 받기(UTM 갤러리 또는 CrystalFetch)와 UTM에서 새 VM 설치 마법사(로컬 계정 `tester`). 30~60분, 한 번만.
- 설치가 끝나면 에이전트가 넘기는 PowerShell 한 덩어리를 VM 안 관리자 PowerShell에 붙여 넣기 — VM 안 붙여넣기가 안 되면 호스트 http 서버에서 스크립트를 받게 한다(macOS VM 때 실측).

## Slices
- S1 VM 만들기(사람) — UTM 새 VM `Windows`(Windows 11 ARM, 메모리 8GB·코어 4·디스크 64GB 권장). 에이전트는 받을 링크와 설정값을 정리해 넘긴다.
  - 완료 기준: `utmctl list`에 `Windows`가 보이고 사람이 바탕화면 스크린샷을 준다.
- S2 SSH 자동화 바탕 (depends: S1) — VM 안: OpenSSH 서버 켜기·자동 시작, 호스트 공개키를 `administrators_authorized_keys`(또는 사용자 키)에 넣기(키는 호스트 `192.168.64.1` http 서버에서 받기), 자동 로그인, 잠자기·화면 꺼짐 끔. WSL은 **켜지 않는다**.
  - 완료 기준: 호스트에서 `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null tester@<ip> "cmd /c ver"` 가 Windows 버전을 출력.
- S3 복제·접속 절차 기록 (depends: S2) — `utmctl clone Windows --name <이름>` 후 IP 찾기(`/var/db/dhcpd_leases`), 종료(`ssh … "shutdown /s /t 0"`), WSL 켜기 명령(`wsl --install --no-distribution` 또는 `wsl --install -d Ubuntu`)과 재부팅 대기 방법, WSL2 가능 여부(중첩 가상화)를 **실측**해 메모리 `vm-test-automation`에 Windows 절을 더한다(사람 메모리 — 저장소 문서 아님).
  - 완료 기준: 복제본 하나에서 SSH 접속 → `wsl --install -d Ubuntu` → 재부팅 뒤 `wsl -l -v`가 Ubuntu와 버전(1 또는 2)을 출력, 그 결과가 메모리에 기록됨.

## 정할 것 (실행 중 실측 후 기록 — 그릴링에서 미결)
- UTM 안 WSL2가 되는가(M3 이후 칩이라 가능성 있음, 미검증). 안 되면 WSL1(`wsl --set-default-version 1`)로 손 테스트하고 그 사실을 기록한다.

## Definition of Done
1. `utmctl list` 출력에 `Windows` (작성 시점: `macOS` 하나뿐 — 전방 검사)
2. `ssh … tester@<ip> "cmd /c ver"` → `Microsoft Windows` 포함 (작성 시점: VM 없음 — 전방 검사)
3. 복제본에서 `ssh … "wsl -l -v"` → `Ubuntu` 포함 (작성 시점: VM 없음 — 전방 검사)
4. `grep -c "Windows" ~/.claude/projects/-Users-calmonion-Project-Anvil/memory/vm-test-automation.md` ≥ 1 이고 그 절에 clone·IP·SSH·WSL 설치 명령이 있음 (작성 시점: 0 — 전방 검사)
