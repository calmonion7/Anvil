# 2026-10-28 — Linux·WSL에도 jq를 내장해 상태줄이 준비 없이 동작하게 한다 (v0.1.8)

## 계획 대비 실제
- 계획대로 된 것: S0(테스트 먼저, 빨강 확인) → S1(공식 정적 jq) → S2(tauri 리소스·`ANVIL_PATH_SH`·WSL 복사) → S4(0.1.8). `cargo test` 68 → 70, CI e2e-desktop Linux·Windows 초록, VM WSL에서 jq 복사·PATH·래퍼 동작 확인.
- 어긋난 것:
  - **CI 첫 실행 실패**: Linux e2e의 "시스템 jq 없음" 확인이 `sh -c "command -v jq"`의 종료 코드를 1로 가정했는데, Ubuntu `sh`(dash)는 127을 돌려준다. 그리고 `specFileRetries: 1`이 상태를 남긴 시나리오를 처음부터 다시 돌려, 진짜 실패 1개가 ①~⑤의 가짜 실패 5개로 불어나 보였다.
  - **VM 확인 방식(S5)**: VM의 WSL에 claude 로그인이 없어 실제 세션의 상태줄을 볼 수 없었다. claude가 부르는 것과 같은 명령으로 래퍼를 직접 돌려 대신했다.
  - **S1 빌드 스크립트**: tmux를 다시 빌드하지 않으려고 스크립트 전체 대신 jq curl 두 줄만 실행했다.
  - **`check-release.sh`를 커밋 전에 돌려 한 번 실패**: task 16 회고에 "커밋한 뒤 돌린다"가 이미 있었는데 다시 밟았다(task 9 · 16 · 17, 세 번째).

## 배운 점
- 다음엔 다르게:
  - **셸 명령의 "없음"을 종료 코드 값으로 단언하지 말고 "0 아님"으로 단언한다.** `command -v`의 미발견 코드는 셸마다 다르다(bash 1, dash 127). 계획 DoD에 넣는 부재 검사도 같다.
  - **e2e-desktop 실패는 첫 시도의 결과만 본다.** 재시도 출력은 이미 바뀐 상태에서 다시 돈 것이라 원인 판단에 쓰지 않는다(후속후보 fu-3c1e7a9d52b4).
  - **실제 claude 세션이 필요한 VM 확인은 그릴링 때 VM의 claude 로그인 여부를 먼저 본다.** 로그인이 없으면 DoD를 "같은 명령으로 래퍼 실행"으로 처음부터 적는다. 실행 중에 확인 방식을 바꾸지 않게 하려는 것이다.
  - **버전을 올리는 조각의 완료 기준에 "커밋 후 `check-release.sh`"를 순서로 적는다.** 회고에 적어 두는 것만으로는 세 번째 재발을 막지 못했다(후속후보 fu-8e4b2f61c07a).

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음(ADR 261024-202909·261025-163349의 원칙을 jq에 그대로 넓혔다)

## Follow-ups
<!-- followup: fu-3c1e7a9d52b4 | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- e2e-desktop의 `specFileRetries: 1`이 상태를 남기는 시나리오(linux.mjs — [설치]가 이미 끝남)를 처음부터 다시 돌려, 진짜 실패 하나가 ①~⑤의 가짜 실패 5개로 불어난다. 재시도를 끄거나 재시도 전에 상태를 되돌릴지 정할 것.
  Evidence: run 40659185281 Linux 잡 — 첫 시도 ①~⑤ 통과·⑥만 실패, 재시도에서 `.band.top` 없음으로 ①②③⑤ 실패.

<!-- followup: fu-8e4b2f61c07a | source: bundle-jq-linux-wsl | task: 17 | date: 2026-10-28 | status: open | taken: - -->
- `scripts/check-release.sh`가 커밋 안 된 버전 변경(작업본 버전 ≠ HEAD 버전)을 만나면 "같은 버전: 커밋 없이 태그만" 실패 대신 "먼저 커밋하세요"로 바로 알려 주게 할 것 — 같은 함정을 task 9·16·17에서 세 번 밟았다.
  Evidence: 이번 run의 커밋 전 실행 1건 실패 → 커밋 후 실패 0; task 16 회고 "커밋한 뒤 돌린다".
