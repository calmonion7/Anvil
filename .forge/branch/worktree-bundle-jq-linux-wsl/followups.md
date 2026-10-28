# Follow-ups

<!-- followup: fu-3c1e7a9d52b4 | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- e2e-desktop의 `specFileRetries: 1`이 상태를 남기는 시나리오(linux.mjs — [설치]가 이미 끝남)를 처음부터 다시 돌려, 진짜 실패 하나가 ①~⑤의 가짜 실패 5개로 불어난다. 재시도를 끄거나 재시도 전에 상태를 되돌릴지 정할 것.
  Evidence: run 40659185281 Linux 잡 — 첫 시도 ①~⑤ 통과·⑥만 실패, 재시도에서 `.band.top` 없음으로 ①②③⑤ 실패.

<!-- followup: fu-8e4b2f61c07a | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- `scripts/check-release.sh`가 커밋 안 된 버전 변경(작업본 버전 ≠ HEAD 버전)을 만나면 "같은 버전: 커밋 없이 태그만" 실패 대신 "먼저 커밋하세요"로 바로 알려 주게 할 것 — 같은 함정을 task 9·16·17에서 세 번 밟았다.
  Evidence: 이번 run의 커밋 전 실행 1건 실패 → 커밋 후 실패 0; task 16 회고 "커밋한 뒤 돌린다".
