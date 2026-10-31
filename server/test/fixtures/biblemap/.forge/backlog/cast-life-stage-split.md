<!-- forge-slug: cast-life-stage-split -->
<!-- task: 355 -->
<!-- tdd: off -->
<!-- priority: low -->
# 인물 생애 단계 분할과 기존 값 교정 — 다윗·솔로몬을 나이대별 id로 나누고, 1/2 판정이 찾은 기존 결함(오인용 소품 등)을 고친다

## 목표 / 하지 않을 것
- 목표: task 352 판정에서 「2/2로 미룰 값」이 나왔다. 이 중 2/2(#353) 파일럿에 속하지 않는 것을 정리한다.
  - **생애 단계 id 분할.** 원칙은 CONTEXT.md 「카드 층 / 얼굴 층」이다(정체성은 id마다 한 값, 나이가 갈리면 id를 나눔).
    - 다윗: 「david」는 도망자 정차지(기브아 창~시글락, 20대)로 남긴다. 헤브론 이후(헤브론·예루살렘 정복·궤·나단 언약·솔로몬 출생·마하나임·귀환)는 새 id로 뺀다. 마하나임·귀환(압살롬 반란, 60세 전후)을 한 id에 둘지 따로 나눌지는 이 과제의 그릴링에서 정한다.
    - 솔로몬: 즉위 초(기혼·다윗 유언·기브온 꿈·두 여인)와 재위 후반(궁전·에시온게벨·스바, 왕상 7:1·9:10 이후)을 나눌지 정한다.
    - 나눈 id마다 `cast/<id>.json`·`CAST.md` 명단과 역표·장면 명세 `figures[].cast`를 고친다. 동석 구별 검사(`check_cast_v2.py` (d))를 통과해야 한다.
  - **기존 값 교정.** 1/2이 잠갔던 기존 필드다.
    - 오인용 `propCandidates` 5건:
      - 요나단 활: 삼상 31:3 → 삭제(삼하 1:22로 충분)
      - 솔로몬 기름 뿔: 왕상 1:39 → 삭제(사독의 것)
      - 솔로몬 성전 모형: 왕상 6:14 → 「a plan of the temple」, 근거 대상 28:11
      - 나단 기름 뿔: 왕상 1:39 → 삭제
      - 둘째 어머니 칼: 왕상 3:24 → 삭제
    - 요나단 `age`: young prince → 성인 지휘관(삼상 13:2-3).
    - 골리앗 `costume`: barefoot → 놋경갑(삼상 17:6). 사용자 3차 보류 인물이라 장면에서 다시 확인한다.
    - 판정 「약함」의 제안 2건: 도엑 칼 근거 22:18 → 22:19, 요압 칼 근거 삼하 2:16 → 20:8.
- 하지 않을 것: 나눈 id의 정본 그리기(#353 파일럿 결과를 보고 따로) · 차림 건(노년 사울 길보아 갑옷·면류관, 다윗 면류관 — 장면 명세 몫) · 사용자의 커밋되지 않은 작업 건드리기.
- **#353 파일럿 결과를 본 뒤 이 계획을 다시 다듬는다.** 파일럿이 실패하면 분할보다 정의 방식부터 다시 본다.

## 근거
- 용어: 「카드 층 / 얼굴 층」(.forge/CONTEXT.md), 「인물 정본」
- 기록: `scripts/canon/cast/APPEARANCE-VERSES.md` 「2/2로 미룰 값」, `.forge/reports/cast-v2-review.md`(판정 원문, gitignored), 회고 `.forge/retro/261015-230238-cast-define-1of2.md`

## 완료 정의(DoD)
1. **회귀 감시**: `cd scripts/canon && python3 check_cast_v2.py` → exit 0 (작성 시점: exit 0)
2. `cd scripts/canon && python3 -c "import json;W={('jonathan','삼상 31:3'),('solomon','왕상 1:39'),('solomon','왕상 6:14'),('nathan','왕상 1:39'),('mother-b','왕상 3:24')};bad=[(i,p['verse']) for i in ('jonathan','solomon','nathan','mother-b') for p in json.load(open(f'cast/{i}.json'))['propCandidates'] if (i,p['verse']) in W];assert not bad,bad;print('ok')"` → `ok` (작성 시점: 실패 — 오인용 5건. 솔로몬의 칼 왕상 3:24는 바른 근거라 대상이 아니다)
3. `cd scripts/canon && python3 check_scenes.py` → exit 0. 분할 뒤 장면의 `figures[].cast`가 있는 id를 가리킨다. (작성 시점: exit 0, 37/37 — 회귀 감시라 미리 통과가 맞다)

## 작업 조각
- [ ] S0. 분할 경계를 정한다(그릴링 — 다윗 마하나임 포함 여부, 솔로몬 분할 여부). — 완료 기준: 계획에 id 목록과 정차지 배정이 고정된다
- [ ] S1. 기존 값 교정(`data-author`), `scripture-reviewer`로 재판정. — 완료 기준: DoD 1·2
- [ ] S2. id 분할: cast 파일·CAST.md·장면 명세. — 완료 기준: DoD 1·3 (depends: S0)

## 추가(2026-10-17, task 363 그릴링에서 넘겨받음)
- 골리앗 장면(`authored-david-goliath-gath`)의 한 장 프롬프트가 512토큰을 넘는다(363 파생 수리 뒤 566). `check_scenes.py` 토큰 검사의 예외로 이 과제를 가리킨다.
  - 소년 다윗(삼상 17:33·42 「소년」)이 20대 `david` 정본이라 장면 차림이 「beardless boy of about fifteen」으로 억지로 덮는다 → `david-boy` 배정 검토(교체 시험만으로 560).
  - 방패병 카드 층 `servant`·`plain round leather cap`, 골리앗 카드 층 `smooth bronze helmet, no crest`가 장면 차림(투구·볏·전사)과 부딪힌다.
  - 정리 뒤 512 안으로 들면 검사 예외를 지운다(낡은 예외는 검사가 실패로 알린다).
