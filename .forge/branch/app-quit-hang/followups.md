# Follow-ups

<!-- followup: fu-2ddd5995f51b | source: app-quit-hang | task: 25 | date: 2026-11-01 | status: open | taken: - -->
- fu-fac8aae17bea(macOS CI에서 다시 연 앱이 창을 못 만들고 멈춤)는 작업 #25에서 재현되지 않아 원인을 확정하지 못했다. 이제 그 경로는 앱을 붙잡지 않고 `app.log`·표준 오류에 `[열기: … ]` 까닭을 남긴다. CI에서 「다시 열면 같은 서버에 붙는다」가 다시 실패하면 그 줄로 원인(살아 있는 서버 확인 `running()` 3초 제한 실패 등)을 확정할 것.
  Evidence: 작업 #25 run.md S2 — 이 Mac 10번·CI 9잡에서 0회. 원래 증상은 run `41205397359` 시도 1.
