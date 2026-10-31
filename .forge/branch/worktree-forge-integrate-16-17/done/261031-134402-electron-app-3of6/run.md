# 실행 기록 — 첫 실행 때 준비물 자동 설치 (데스크톱 앱 3/6)

워크플로 없이 이 세션이 직접 실행했다. 조각이 S1 → S2 → S3로 이어진다. 계획에 `tdd: on`이 있어 서버 테스트(`server/test/deps.test.js` 9개)와 화면 e2e(`e2e/setup.spec.ts` 4개)를 먼저 쓰고 빨강을 확인한 뒤 구현했다.

## 조각별 결과
- S1 서버 자동 설치(`server/deps.js` `installPlan`·`installWith`·`startInstall`, 명령 `deps_install`, 이벤트 `deps_progress`) — ✅ 계획대로. 순서는 Windows Git·mac 개발자 도구 → claude → forge다. 하나가 실패해도 다음을 계속하되, 앞 항목이 안 되면 forge는 건너뛴다. 설치는 한 번에 하나만 돈다.
- S2 화면 「준비 중」(`src/lib/Prepare.svelte`) — ⚠ 기존 준비물 띠와 [다시 확인]을 없애고 이 화면으로 바꿨다. 띠를 전제로 한 e2e 4개 가운데 2개는 새 화면 기준으로 옮겼고(자동으로 설치할 수 없는 준비물, 늦게 온 확인), 띠 전용 「확인 중…」 2개는 지웠다. 360px에서 앱 전체가 원래 가로로 넘쳐(보드만 있을 때도 문서 폭 987px, 실측) 이 화면만 줄바꿈되는지 본다.
- S3 VM 확인 — UAT(아래 STATUS `verified:`).

## 계획 밖 변경·판단
- Windows는 forge 유무와 상관없이 Git을 확인한다(claude가 Git Bash로 돈다는 계획의 추측을 따랐다 — Windows 실제 확인은 4/6).
- forge 설치는 셸 파이프 대신 `claude plugin marketplace list` 출력을 JS에서 보고 `add`·`install`을 따로 부른다. 세 OS에서 같은 경로로 돌리기 위해서다.
- 자동 설치는 화면이 처음 한 번만 시작한다. 실패한 채 다시 확인할 때마다 또 설치하면 무한 반복이 되기 때문이고, 그 뒤는 [다시 시도]로만 한다.
- `server/API.md`에 `deps_install`·`deps_progress`를 적었다(1/4에서 없앤 명령이 다시 생겼다).

## DoD 기준선 → 실행 뒤
1. `node --test server/`: 89/89 → 98/98(두 번). 새 테스트 9개: Windows Git 판정·순서·claude/forge 명령·마켓플레이스 있으면 건너뜀·실패 보고와 forge 건너뜀·Linux git 안내·Windows winget/install.ps1·mac 개발자 도구 대기·한 번에 하나만.
2. `npx playwright test`: 43 passed → 45 passed(띠 전용 2개 삭제, 새 4개 + 옮긴 2개). `npm run check` 오류 0, `npm run test:app` 2 passed(회귀 방지).
3. UAT(UTM macOS 27.0.1 VM `anvil-3of6`, 원본 `macOS` 복제, 2026-10-31) — 통과. 에이전트가 SSH로 한 일: 개발자 도구·claude·`~/.claude`가 없는 것 확인 → dmg를 scp로 넣고 `/Applications`에 설치 → `open`으로 실행 → 서버 API로 진행을 지켜봄. 사람이 한 일: 화면 판단과 클릭.
   - 「준비 중」이 버튼 없이 뜨고 개발자 도구 「설치 중…」, claude·forge 「대기」(사람 스크린샷).
   - 개발자 도구 설치 창에서 [설치](사람) → 완료 → claude CLI `2.1.314`가 `~/.local/bin`에 설치됨 → `forge@forge` 설치 → `deps_status` `needs: []`(실측) → 보드로 넘어감(사람).
   - 프로젝트 추가 → 계획 세션 → claude 첫 설정 → 로그인 화면 → 로그인(사람).
   - 진행 중에 `deps_install`을 한 번 더 불렀을 때 새 설치를 시작하지 않고 지금 진행을 돌려줬다(한 번에 하나만).

## UAT에서 나온 것
- **개발자 도구 설치 창이 Anvil 창 뒤에 숨었고, 화면에는 「설치 중…」만 보여 사람이 [설치]를 눌러야 하는 줄 알 수 없었다.** Tauri `deps.rs:211`이 하던 "창을 앞으로 가져오기"가 옮겨 오지 않았다. 테스트를 먼저 쓰고(빨강) 고쳤다. 이제 `xcode-select --install` 뒤 `osascript`로 창을 앞으로 가져오고, 기다리는 동안 항목에 "열린 「개발자 도구」 설치 창에서 [설치]를 눌러 주세요"를 띄운다. VM에는 고치기 전 빌드가 들어 있어서, 이 수정은 서버 테스트로만 확인했다.
- `deps_install`은 설치할 것이 없어도 `{running:true, items:[]}`를 먼저 돌려준다. 바로 끝난 진행은 이벤트로 온다. 화면은 빠진 것이 있을 때만 부르므로 문제가 없다. 다만 진행을 따라가려고 이 명령을 되풀이해 부르면 매번 빈 설치를 다시 시작한다.

## Follow-ups
<!-- followup: fu-2c6e81f04a9d | source: electron-app-3of6 | task: 24 | date: 2026-10-31 | status: open | taken: - -->
- 화면 전체가 좁은 폭(360px)에서 가로로 넘친다(보드만 있을 때도 문서 폭 987px, 본문 752px). 데스크톱 앱 창 최소 크기를 정할지, 사이드바를 접는 좁은 배치를 만들지 정할 것.
  Evidence: 2026-10-31 Playwright 360×720 측정(`section.main` 752px, `aside` 208px).
