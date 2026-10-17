# 테스트 픽스처

실제 프로젝트 `.forge/`에서 필요한 파일만 떠 온 사본이다(2026-10-17). 원본 프로젝트는 읽기만 했다.

재구성·합성한 파일(원본이 이미 사라졌거나 일부러 만든 것):
- `biblemap/.forge/STATUS.md`, `biblemap/.forge/loop.md` — 계획 작성 시점(#362 실행·검증, 루프 정지)의 상태. #362는 그 뒤 봉인돼 원본 loop.md가 지워졌으므로, `docs/board-mockup.html`에 기록된 값(C1~C6, C2·C3 pass, C4·C5 fail, 재계획 0/3)과 forge loop.md 형식대로 다시 썼다. 원장에는 실제 파일에서 본 변형(`fail x1`, `미실행`)을 일부러 섞었다.
- `biblemap/.forge/backlog/scene-prompt-512-truncation.md` — 당시 백로그에 있던 #363. 지금은 BibleMap의 활성 plan.md라 거기서 복사했다.
- `portfolion/.forge/backlog/top-level-decoy.md` — 진행 영역을 `branch/dev`에서만 읽는지 확인하는 미끼.
- `broken/` — 파일 단위 오류 격리용.

git HEAD는 픽스처에 넣을 수 없어서(중첩 `.git`은 추적되지 않음) root 테스트가 임시 폴더에 `.git/HEAD`를 만든다.
