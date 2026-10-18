<!-- forge-slug: flow-board -->
<!-- task: 8 -->
<!-- tdd: off -->
# 어두운 고정 테마 + forge 정보 흐름도 + 실시간 흐름 애니메이션

## 목표 / 범위 밖
- 목표: 상단 NowStrip 자리를 forge 정보 흐름도로 바꾼다 — [계획 세션] → [백로그 N] → [실행 세션·활성 작업] → [완료·회고 N] → [후속후보 N] ↺ 계획. 역할별 색 테두리 패널·고정폭 글꼴. 세션이 working이면 나가는 화살표에 점이 흐르고, waiting이면 노드가 맥동, 종료면 멈춘다. snapshot 변화(백로그 증감·완료 증가·후속후보 증가·활성 작업 변화)는 해당 화살표에 펄스 1회 + 하단 세션 로그 띠(시간순, 최근 N줄)에 한 줄. 앱 전체를 어두운 테마로 고정(기존 다크 토큰 재사용, 역할 색만 추가).
- 범위 밖: Rust 백엔드 변경, 새 이벤트 종류, 터미널 영역 재배치, 설치/배포.

## Source of truth
- 용어: CONTEXT.md 계획 세션·실행 세션·세션 상태·진행 영역·기록 영역·후속후보
- 화면 지침: ~/.claude/design/UIUX.md (기존 토큰 우선 · 빈/로딩/에러/긴 텍스트/좁은 폭 · 포커스 링 유지)
- 완료 정의: loop.md C1~C4 전부 통과.

## 작업 조각
- [ ] S1. app.css를 어두운 테마로 고정(color-scheme: dark, 다크 토큰을 :root 기본값으로) — 완료 기준: OS 밝음 에뮬레이션에서 body 배경이 #0d0d0d
- [ ] S2. FlowBoard 컴포넌트(NowStrip 대체, 건수 칩→목록 팝업·문서 열기 동작 보존) + 흐름 상태 도출(sessions→data-flow, snapshot diff→펄스·로그) + reduced-motion — 완료 기준: C1·C2 통과 (depends: S1)
- [ ] S3. e2e/flow.spec.ts(mock-ipc로 이벤트 주입) 작성, board.spec 보정 — 완료 기준: C3·C4 통과 (depends: S2)
