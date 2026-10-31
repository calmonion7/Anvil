<!-- forge-slug: scene-prompt-512-truncation -->
<!-- task: 363 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 한 장 프롬프트 512토큰 잘림 — 검사로 막고, 파생 중복을 고쳐 엔게디를 512 안에 넣는다

## 목표 / 하지 않을 것
- 목표: Z-Image 텍스트 인코더는 채팅 틀을 포함해 512토큰에서 자른다. diffusers `ZImagePipeline.encode_prompt`가 `max_sequence_length=512, truncation=True`이다. task 362에서 발견했다.
  - 엔게디(555토큰): `relation.en` 뒷부분과 `screen_light.en` 전체가 345 이후 내내 빠졌다.
  - 골리앗(595토큰)도 넘는다. 길갈(385)·라마(351)는 안전하다.
  - 이 과제에서 할 일:
    1. 넘침을 기계 검사로 막는다.
    2. 파생 코드의 중복·모순을 고친다.
    3. 엔게디를 512 안에 넣는다.
    4. 파생이 바뀐 세 장면(엔게디·길갈·라마)이 무너지지 않았는지 사람이 판정한다.
  - 엔게디는 362에서 남은 질문도 함께 본다. 「자세 무너짐 3→7」이 잘린 관계 문장 때문이었는지를 확인한다.
- 하지 않을 것:
  - **골리앗을 512 안에 넣기.** 파생 수리와 `david-boy` 교체를 해도 560토큰이다(그릴링 시험).
    - 남는 넘침은 방패병·골리앗의 정본 카드 층(`plain round leather cap`·`smooth bronze helmet, no crest`·`servant`)이 장면 차림(투구·볏·전사)과 부딪히는 데서 온다.
    - 골리앗은 사용자 보류 인물이고, task 355가 골리앗 차림 교정과 id 배정을 맡는다.
    - 그래서 검사에는 **이유를 단 예외**로만 올리고 355로 넘긴다.
  - 골리앗 장면의 다윗을 `david-boy`로 바꾸기. 같은 이유로 355 몫이다.
  - 문구로 그림을 고치는 다른 시도(엔게디 어둠 등). 이번에 바꾸는 것은 중복 제거뿐이다.
  - 정본 참조 편집 다시 걸기, 영상(354).
  - 사용자 미커밋 작업(`.forge/CONTEXT.md`·아둘람 2파일·`tool/glossary.json`)은 건드리지 않는다.

## 근거
- 용어: 「카드 층 / 얼굴 층」(.forge/CONTEXT.md 213행 — 「차림은 id의 기본값일 뿐이고, 장면 명세가 덮어쓴다」) → 파생 수리 (a)의 근거.
- 기록: `scripts/canon/notes/ENGEDI-TEXT.md` 「S2」(문구 B = A 화소 동일, 토큰 실측)·「읽은 것」(자세 3→7).
- 규칙: `notes/PROMPTING.md` 15(장면은 데이터 — 명세 → 파생)·6(한 장으로 판단하지 않는다).
- 메모리: 「판정 페이지는 질문 하나씩」, 「참조 구현 버그 함께 수정」(수리 (c)).
- 그릴링 시험(토큰, 채팅 틀 포함):

  | 장면 | 지금 | (a)(b)(c) 후 | + 엔게디 관계 중복 제거 |
  |---|---|---|---|
  | 골리앗 | 595 | 566 | (david-boy로 바꿔도 560) |
  | 엔게디 | 564 | 524 | **503** |
  | 길갈 | 385 | 363 | |
  | 라마 | 351 | 329 | |

  - 엔게디 564는 362 문구 A 반영 뒤 값이다.
- 재현성: 세 장면 모두 기존 바탕이 현재 파생 문구와 글자까지 같다.
  - 엔게디 = 362 `engedi-text/A`
  - 길갈·라마 = 353 `prompts.json`
  - 그래서 같은 시드로 바로 비교할 수 있다.

## 고정 절(실행 중 바꾸지 않는다)
- 파생 수리(`derive_scene.whole_prompt`):
  - (a) 인물 문장에서 정본 `costume`을 장면 `figures[].costume.en`로 바꾼다. 뒤에 붙던 장면 차림 구절은 한 번만 남긴다.
  - (b) 전원 같은 `screen_facing`이라 장면 문장(「Both/All figures …」)을 낼 때는 인물마다 붙는 방향 구절을 뺀다.
  - (c) 장면 차림에 `beardless`가 있으면 v2 카드 층 `beardVolume`도 끈다. 기존 v1 `beard: none` 덮어쓰기의 v2판이다.
  - 그 밖의 파생은 그대로 둔다.
- 엔게디 명세: `relation.en` 맨 앞 `Both men face toward the right edge of the picture, where the small bright cave mouth is far away. `를 지운다. `.ko` 맨 앞 「두 사람 모두 화면 오른쪽, 멀리 작고 밝은 굴 어귀를 향한다 — 」를 지운다. 나머지 글자는 그대로 둔다.
- 토큰 수: `tokenizer.apply_chat_template([{role:user, content:p}], tokenize=False, add_generation_prompt=True, enable_thinking=True)`의 input_ids 길이다. 토크나이저는 HF 캐시 `Tongyi-MAI/Z-Image-Turbo` `tokenizer`를 오프라인으로 쓴다. 상한은 512.
- 예외: `authored-david-goliath-gath` 하나. 이유는 「task 355 — 카드 층 머리쓰개·신분과 장면 차림 충돌, 소년 다윗 id」. 예외 장면이 512 안에 들어오면 검사가 「예외 지울 것」으로 실패한다(낡은 예외 방지).
- 생성: 세 장면 × `params.REF_EDIT_SEEDS` 8시드, 1216×640, Z-Image-Turbo, 353과 같은 경로. 산출은 `~/.local/biblemap-imggen/prompt-512/<장면>/s<시드>.png`. 한 번에 한 프로세스, `nohup`, 이미 있으면 건너뛴다.
- 판정 페이지: 장면마다 C 화면 하나 + 누른 그림의 이유 화면. 362와 같은 문구·보기(화풍·굴 어둠·빛·겉옷자락·자세·기타)를 쓰되, 길갈·라마에는 굴 어둠·빛과 겉옷자락 대신 「장면 뜻(누가 무엇을 하는지)」 보기를 쓴다.
  - 기준(`metrics_lora_scene.REFS`) + 새 8 + 이전 8을 섞기 시드 363으로 섞는다.
  - 그림 번호 ↔ 새/이전·시드 대응은 게시 전에 metrics `screens`에 적는다. 폰용 비공개 Artifact, 카드 폭 356px.
- 판정 규칙(게시 전 고정): 장면마다 새 무너짐 < 이전 무너짐 → **개선**, 같으면 **같음**, 많으면 **악화**.
  - 결론 줄: `결론: 엔게디 개선|같음|악화(새 n/8 · 이전 n/8 · 자세 새 n · 이전 n) · 길갈 …(새 n/8 · 이전 n/8) · 라마 …(새 n/8 · 이전 n/8)`.
- 결과 처리:
  - 길갈·라마 어느 하나라도 **악화**면 멈추고 사람에게 묻는다(파생 수리를 되돌릴지).
  - 그 밖에는 모든 변경을 남긴다.

## 완료 정의(DoD)
1. 회귀 + 새 검사: `cd scripts/canon && ~/.local/biblemap-imggen/.venv314/bin/python check_scenes.py` → 37/37 통과, exit 0.
   - 사전 상태: 통과 — 토큰 검사가 아직 없다. S1 뒤 엔게디로 실패했다가 S2·S3 뒤 다시 통과해야 한다.
2. 토큰 상한: `cd scripts/canon && HF_HUB_OFFLINE=1 ~/.local/biblemap-imggen/.venv314/bin/python -c "import check_scenes as c;bad=c.whole_prompt_overflow();assert not bad,bad"` → exit 0.
   - 사전 상태: 실패 — 함수가 없다. 함수가 생겨도 지금 명세라면 엔게디 555로 실패한다.
3. 생성: `cd scripts/canon && ~/.local/biblemap-imggen/.venv314/bin/python -c "import json;m=json.load(open('samples/prompt-512/metrics.json'));assert sorted(m['prompts'])==['engedi','gilgal','ramah'] and all(len(m['done'][k])==8 for k in m['prompts']) and 'screens' in m"` → exit 0.
   - 사전 상태: 실패 — 파일 없음.
4. `grep -c "^결론: " scripts/canon/notes/PROMPT-512.md` ≥ 1이고, 그 결론이 판정 규칙대로다.
   - 사전 상태: 실패 — 파일 없음.
5. 사람 확인: 판정 페이지 답이 `notes/PROMPT-512.md` 「사람 판정 원문」에 글자 그대로 있다.
6. 회귀: `git status --porcelain -- .forge/CONTEXT.md scripts/canon/attempts/authored-david-adullam-cave.json scripts/canon/scenes/authored-david-adullam-cave.json scripts/canon/tool/glossary.json` → ` M` 네 줄 그대로.
   - 사전 상태: 통과 — 사용자 작업 보존 감시라 미리 통과가 맞다.
- 회귀 eval: DoD 2의 검사 자체가 `check_scenes.py` 안에 영구 회귀 검사로 남는다.

## 작업 조각
- [ ] **S1. 검사.** `check_scenes.py`에 `whole_prompt_overflow()`(고정 절의 토큰 수·예외 규칙)를 두고, 실행 시 실패로 보고한다.
  - `notes/PROMPTING.md`에 규칙 한 줄을 더한다: Z-Image 한 장 프롬프트는 채팅 틀 포함 512토큰에서 잘린다 — 넘는 뒤쪽 문장은 무처치.
  - 완료: 엔게디로 실패하는 것을 확인했다(빨강).
- [ ] **S2. 파생 수리 (a)(b)(c).** 고정 절 그대로 한다.
  - 완료: 네 장면 토큰이 그릴링 표와 같다(엔게디 524·길갈 363·라마 329·골리앗 566).
- [ ] **S3. 엔게디 관계 중복 제거.** 고정 절 그대로 한다.
  - 완료: DoD 1·2 통과(초록). 엔게디 503 근처.
- [ ] **S4. 생성 + 판정 페이지 + 사람 판정 + 결론.**
  - `gen_prompt_512.py`로 세 장면 8시드를 그리고, metrics에 프롬프트·토큰 수·`done`을 적는다.
  - S0: 엔게디 s7 한 장을 먼저 보고 나머지를 그린다.
  - 몽타주를 눈으로 본다(인물이 사라지지 않았는지).
  - `make_ref_edit_page.py`에 `judge-512` 모드를 둔다. `notes/PROMPT-512.md`에 고정 절을 먼저 적은 뒤 게시하고, 사람 답 원문 → 결론 줄을 쓴다.
  - 완료: DoD 3~5.
