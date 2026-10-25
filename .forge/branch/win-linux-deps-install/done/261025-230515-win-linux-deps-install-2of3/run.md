# run — #13 로컬 Windows 11 ARM 테스트 VM

실행 방식: 메인 세션 직접(사람 단계와 SSH 실측이 번갈아 나오는 직렬 작업). Anvil 코드 변경 없음.

## 슬라이스별 결과
- S1 VM 만들기(사람) — ✅ UTM `Windows`(Windows 11 Pro ARM64 빌드 26300, 정품 인증 없음, 8GB·4코어·64GB), 계정 `tester`, 바탕화면 스크린샷 받음
- S2 SSH 자동화 바탕 — ⚠ 설정 스크립트 한 줄로 OpenSSH·호스트 키·자동 로그인·잠자기 끔. 방화벽 규칙이 Private 전용이라 한 번 더(수정 스크립트) 실행해야 했음
- S3 복제·접속 절차 기록 — ⚠ `utmctl clone`→`start`→SSH→WSL1 Ubuntu 설치 성공, 메모리에 Windows 절 추가. 계획의 `wsl --install …`은 SSH에서 거부돼 DISM + WSL MSI로 우회

## 계획과 달라진 것 · 그 자리에서 정한 것
- **방화벽**: OpenSSH 설치가 만든 `OpenSSH-Server-In-TCP` 규칙이 Private 프로필 전용인데 UTM 네트워크는 Public이라 SSH가 시간 초과. 수정 스크립트로 네트워크를 Private, 규칙을 Any로 — 원본에 적용됨.
- **설정 스크립트 형식**: Windows PowerShell 5.1이 모르는 확장자를 바이트로 받거나 한글을 깨뜨릴 수 있어 ASCII 전용 `.txt`로 내려줌.
- **WSL 설치 경로**: Windows 기본 `wsl.exe`(본체 없는 껍데기)가 SSH 세션에서는 `--install`을 어떤 인자로도 받지 않고 "설치되어 있지 않습니다"만 냄. DISM으로 `Microsoft-Windows-Subsystem-Linux`·`VirtualMachinePlatform` 켜고 재부팅 → GitHub `microsoft/WSL` 3.0.3 arm64 MSI를 `msiexec /qn`으로 설치 → `wsl --install -d Ubuntu --no-launch`. 사람이 데스크톱에서 하는 `wsl --install`은 다른 경로라 3부 S5 손 테스트에서 따로 봐야 함.
- **WSL2 불가(정할 것 → 결정)**: `HCS_E_HYPERV_NOT_INSTALLED` — UTM VM에 중첩 가상화가 없다. `wsl --set-default-version 1`로 WSL1 사용, 메모리에 기록.
- `utmctl start`가 QEMU 기반 Windows VM에서는 정상(macOS VM 메모와 다름). 복제본은 MAC을 물려받아 IP·호스트 이름이 원본과 같음(192.168.64.3).
- WSL Ubuntu는 26.04.1 LTS(aarch64), tmux·curl·git·wget 있음, node 없음. `--no-launch`로 넣어 기본 사용자가 root(사람 첫 실행의 계정 만들기와 다름).
- 시험 복제본 `win-test1`(WSL1 Ubuntu 설치됨)은 꺼 둠 — 3부 S5는 WSL 없는 새 복제본이 필요하니 이건 지워도 됨.

## DoD 기준선 → 실행 후
1. `utmctl list`에 `Windows` — `macOS` 하나뿐 → `Windows`·`win-test1` 추가됨
2. `ssh … tester@192.168.64.3 ver` → `Microsoft Windows` — VM 없음 → `Microsoft Windows [Version 10.0.26300.9457]`
3. 복제본에서 `wsl -l -v` → `Ubuntu` — VM 없음 → `* Ubuntu  Stopped  1`
4. `grep -c "Windows" …/memory/vm-test-automation.md` ≥1, clone·IP·SSH·WSL 설치 명령 포함 — 0 → 5 (절 `## Windows VM (2026-10-25 실측, forge #13)`)
