# Follow-ups

<!-- followup: fu-fe950c698c91 | source: win-linux-deps-install-1of3 | task: 11 | date: 2026-10-25 | status: open | taken: - -->
- 3부 [설치]가 curl(node·claude 받기)과 git(forge 마켓플레이스)에 기댄다면, 데스크톱 Ubuntu 기본 설치에는 둘 다 없다 — 감지해 준비물로 보이거나 wget 등으로 대체해야 한다.
  Evidence: e2e-desktop 깨끗한 컨테이너 `env.log`의 `curl: 없음`, `git: 없음`(데스크톱 기본 구성을 따라 일부러 뺌).
