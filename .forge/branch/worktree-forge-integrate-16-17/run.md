# 실행 기록 — Node 서버 + 웹 화면으로 이 Mac에서 기능 동등 (Node 전환 1/4)

실행: 2026-10-29, Dynamic Workflow `wf_16766379-2f2`(에이전트 9개: S1→S2→S3∥S4→S5→S6→리뷰 2관점→수정, TDD). 에이전트는 커밋하지 않았고, 이 세션이 DoD 1~6을 다시 돌려 확인한 뒤 커밋했다.

## 조각별 결과
- S1 동작 고정 — ✅ 계획대로. `src-tauri/tests/golden.rs` 한 함수가 5개 사례(픽스처 폴더 4개 + portfolion의 main·dev root 두 경우)를 돈다. `ANVIL_WRITE_GOLDEN=1`이면 쓰고 아니면 비교. 골든은 `server/test/golden/*.json`.
- S2 서버 골격·보안 — ⚠ `node --test server/`가 Node 22+에서 그대로는 돌지 않아 `server/index.js` 집계 진입점을 둠. node-pty 1.1.0 prebuild의 `spawn-helper` 실행 권한 누락을 `server/pty.js`가 chmod로 메움.
- S3 forge 읽기 이식 — ✅ 골든 5개 초록, `tests/forge.rs` 27개 사례 이식 + 골든 밖 5개. `write_summary`(알림 요약)는 알림이 범위 밖이라 옮기지 않음.
- S4 세션 이식(tmux 없음) — ✅ node-pty·재생 버퍼 256K자·Node 훅 2개. 입력 대기 OS 알림은 범위 밖이라 훅에서 뺌.
- S5 화면 연결 — ⚠ 계획 밖 수정 1건(Chromium 한글 조합 입력 처리), `deps.spec.ts` 9→5(없앤 [설치]·[로그인] 확인 4개 삭제). 팝업 보드·창 기억·전체화면 복원은 `src/`에 없어서(모두 `src-tauri/src/lib.rs`) 화면에서 걷어 낼 것이 없었음.
- S6 개발 실행 경로 — ✅ `npm run dev:web`(`scripts/dev-web.js`), README 한 줄. 리뷰 뒤 토큰 처리 방식이 바뀜(아래).

## 계획과 실제가 어긋난 곳
- **DoD 1 명령**: Node 22+(실측 24.15)는 `node --test <디렉터리>`를 글롭이 아니라 모듈로 실행한다. 그래서 `server/index.js`가 `server/**/*.test.js`를 모두 불러온다(불러오기 실패도 실패 수에 잡힘). 계획의 명령은 그대로 통과하지만, 2/4에서 `package.json` `test` 스크립트로 바꾸는 편이 덜 놀랍다.
- **폴더 고르기(현장 결정)**: 브라우저는 폴더 절대 경로를 주지 않는다. macOS는 서버가 `osascript choose folder`를 띄우는 `pick_folder` 명령, 그 밖의 OS는 `{unsupported:true}` → 화면이 경로를 직접 입력받는다. 3/4 Windows가 보강 대상.
- **준비물 확인(`deps_status`)**: tmux를 준비물에서 뺐다. `installable` 필드는 결과 모양 유지용으로 늘 `false`.
- **한글 IME**: WKWebView용 한글 처리가 Chromium에선 조합된 한글을 버렸다(CDP로 재현). `compositionstart`를 보면 그 처리를 끄고 xterm에 맡기게 고쳤다. 실제 macOS 한글 입력기로는 확인 못 함 → UAT 항목으로 넘김.
- **터미널 스크롤백**: tmux가 맡던 스크롤백을 xterm이 맡게 `scrollback` 0→10000.
- **동작 변화**: 서버 프로세스가 꺼지면 세션도 끝난다(ADR대로). 서버가 다시 뜨면 화면은 "서버가 다시 시작되었습니다 — Anvil 주소를 다시 여세요"를 띄운다.

## 리뷰(보안·정확성 적대적 리뷰)
critical 0 · major 3 · minor 3. major 3건은 실패 테스트를 먼저 쓰고 고쳤다.
1. **개발 프록시가 위조 가능한 Host·Origin만 보고 서버 토큰을 붙였다** → 토큰 없이 터미널을 얻을 수 있었음(실측). 프록시는 토큰을 붙이지 않고 쿠키만 넘기게 바꿨고, 개발 화면도 `?token=` 주소로 쿠키를 받는다(`Anvil 개발:` 줄). `TAURI_DEV_HOST`가 있으면 프록시를 끈다.
2. **등록한 저장소의 `.forge/*.md`가 `marked` → `{@html}`로 그려져 그 안의 스크립트가 Anvil 권한으로 돌았다**(이전부터 있던 결함, 웹 전환으로 터미널까지 닿음). SvelteKit `csp`(script-src 'self' + 해시)와 서버 응답 CSP 헤더(`frame-ancestors`·`object-src`·`base-uri`·`form-action` 'none')로 막았다. DOMPurify는 승인된 새 의존성(ws·node-pty) 밖이라 넣지 않았다.
3. **서버 재시작 뒤 옛 쿠키로 401 → 웹소켓 재접속 무한 반복, 죽은 세션이 살아 보임** → 401이면 재접속을 멈추고 안내를 띄운다. 토큰 파일 재사용은 계획("실행할 때마다 토큰")과 어긋나 고르지 않았다.
minor 3건은 아래 후속후보로 남김.

## DoD 사전 상태 → 실행 후 (이 세션이 직접 측정)
1. `node --test server/`: `server/` 없음 → 71/71 통과(골든 5 포함)
2. `npx playwright test`: 40 passed → 43 passed(deps −4, `web.spec.ts` +7)
3. `grep -rln "@tauri-apps" src | wc -l`: 4 → 0
4. `npm run check`: 오류 0 → 오류 0 (회귀 방지, 바뀜 없음)
5. `(cd src-tauri && cargo test)`: 43+27 통과 → 43+27+골든 1 통과 (회귀 방지). `src-tauri/` 변경은 `tests/golden.rs` 추가 하나.
6. 거절 테스트: 없음 → `server/test/security.test.js` 통과(1번에 포함)
7. UAT(이 Mac, 사람): 대기

## Follow-ups
<!-- followup: fu-f1485aa3da66 | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 재접속 재생이 출력 꼬리 256K자를 임의 위치에서 잘라 보내, 처음에만 켜는 터미널 모드(브래킷 붙여넣기 `?2004h` 등)가 새 화면에 빠지고 이스케이프 중간부터 찍힐 수 있다. 서버 쪽 헤드리스 터미널(@xterm/headless + serialize)로 화면 상태를 재생할지 정할 것.
  Evidence: 리뷰 minor `server/session.js:165`, 실제 claude로는 미측정(가설).

<!-- followup: fu-346fc55b4bce | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 같은 세션을 크기가 다른 탭 두 개로 보면 마지막 resize가 이겨 다른 탭이 깨진다(tmux는 클라이언트별로 맞춰 줬다). 최소 크기로 맞출지, 마지막 입력 화면 기준으로 할지 정할 것.
  Evidence: 리뷰 minor `server/session.js:309`.

<!-- followup: fu-51f9957b2a4b | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 웹소켓만 끊긴 뒤 1초 재접속 전에 친 키가 `term_open`보다 먼저 가서 버려지고, 그 사이 놓친 `snapshot`은 다시 받지 않아 보드가 다음 변경까지 옛 상태다. 재접속 때 `term_open`·`list_projects`를 큐보다 먼저 보내게 할 것.
  Evidence: 리뷰 minor `src/lib/api.ts:14`, S5 보고.

<!-- followup: fu-793f8d367810 | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- macOS·Linux에서 claude 실행 파일을 못 찾으면 node-pty가 오류를 던지지 않아 세션이 바로 '종료'로만 보이고 이유가 안 나온다. 시작 직후 종료 코드·출력을 화면에 보여 줄 것.
  Evidence: S4 보고.

<!-- followup: fu-3ab96996279c | source: node-web-app-1of4 | task: 18 | date: 2026-10-29 | status: open | taken: - -->
- 테스트용 `ANVIL_CLAUDE` 환경변수(claude 대신 띄울 실행 파일)를 운영 서버도 읽는다. 자동 시작(2/4) 환경에서 남겨 둘지, 테스트 전용으로 좁힐지 정할 것.
  Evidence: `server/session.js` S4 보고.
