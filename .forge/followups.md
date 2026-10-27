# Follow-ups

<!-- followup: fu-fe950c698c91 | source: win-linux-deps-install-1of3 | task: 13 | date: 2026-10-25 | status: taken | taken: 15 -->
- 3부 [설치]가 curl(node·claude 받기)과 git(forge 마켓플레이스)에 기댄다면, 데스크톱 Ubuntu 기본 설치에는 둘 다 없다 — 감지해 준비물로 보이거나 wget 등으로 대체해야 한다.
  Evidence: e2e-desktop 깨끗한 컨테이너 `env.log`의 `curl: 없음`, `git: 없음`(데스크톱 기본 구성을 따라 일부러 뺌).

<!-- followup: fu-6f1dafa02d5b | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: open | taken: - -->
- [설치] 직후 자동 재확인이 node를 아직 없는 것으로 보여, [다시 확인]을 눌러야 띠가 사라졌다(WSL1 VM). 확인 호출 자체는 정상(같은 방식으로 v22.20.0) — 설치 직후 재확인의 시점·캐시를 살펴볼 것.
  Evidence: S5 VM 스크린샷 '필요: node 22 이상 / ✓ node 22 이상 설치됨' 뒤 [다시 확인]으로 띠 사라짐.

<!-- followup: fu-62d8e42c3b92 | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: open | taken: - -->
- Windows 콘솔 창 깜빡임을 실제 x64 Windows PC(또는 빠른 VM)에서 사람이 확인 — CREATE_NO_WINDOW는 넣었지만 ARM VM이 느려 판단하지 못했다.
  Evidence: S5에서 사용자 "버벅거려서 잘모르겠음".

<!-- followup: fu-b9bbeaeaac9c | source: win-linux-deps-install-3of3 | task: 15 | date: 2026-10-27 | status: open | taken: - -->
- Linux·WSL에도 jq를 내장할지 — 지금은 있으면 쓰고 없으면 세션별 모델 표시만 빠진다(README에 명시). macOS처럼 정적 jq를 넣으면 준비 없이 모델 표시가 된다.
  Evidence: 상태줄 래퍼가 `command -v jq`일 때만 모델 기록(session.rs STATUSLINE_SCRIPT).
