<!-- forge-slug: scene-engedi-edit-costume -->
<!-- task: 361 -->
<!-- tdd: off -->
<!-- priority: high -->
# 엔게디 「무너짐」 수리 — 정본 참조 편집이 장면 옷(사울의 겉옷)을 지우지 않게 하고, 353 바탕 무너짐의 원인을 가린다

## 목표 / 하지 않을 것
- 목표: task 360에서 채택한 정본 참조 편집은 엔게디에서 처치 8/8 「무너짐」이었다. fg-ask(2026-10-17)에서 편집본 8장을 보니 원인은 두 갈래다.
  1. **편집이 장면 뜻을 지웠다(주원인).** 편집 지시문의 사울 외형 `params.REF_EDIT_LIGHTNING_LOOK_IMAGE["saul"]`이 정본 전신 그림대로 「plain brown short-sleeved tunic」이라, 8장 모두 사울의 어두운 겉옷이 사라졌다. 다윗이 베는 검은 천은 사울 몸과 떨어져 땅에 따로 놓였다(24:4 「사울의 겉옷자락」이 핵심). 다윗도 정본처럼 붉은 튜닉으로 바뀌었다.
     - 이것은 용어집 「카드 층 / 얼굴 층」 위반이다. 「옷 색·머리쓰개처럼 그 순간이 정하는 차림은 id의 기본값일 뿐이고 장면 명세가 덮어쓴다」.
  2. **353 바탕 대조 2/3(s7·s42)도 무너짐이었다. 이유는 모른다.** 사용자는 판정 때 이유를 기억하지 못한다.
     - 기준 그림(345 승인본)은 장면 승인 도구에서 사람이 여러 장 중 골라 승인한 그림이다. 대조는 아무 시드다. 그래서 문구 결함인지 시드 편차인지 아직 가릴 수 없다.
- 이번 과제의 일:
  - ① 편집 규칙: 편집 지시문은 **정체성(얼굴·머리·수염·체격·나이대)만 정본 그림에서** 가져오고, **차림은 장면 명세 `figures[].costume.en`**을 따른다.
  - 이 규칙으로 엔게디 8시드를 다시 편집해 판정한다.
  - ② 같은 판정에서 무너진 그림마다 이유를 받아 353 바탕 무너짐의 원인을 가린다.
- 하지 않을 것:
  - **엔게디 장면 문구(`scenes/authored-david-en-gedi-saul.json`)를 고치지 않는다.** ② 판정이 문구 탓으로 나오면, 문구 수리는 새 백로그 계획으로 쓴다(아래 S4).
  - 길갈·라마 재편집(규칙은 일반이지만 이번 재실행은 엔게디만).
  - 다른 인물로 넓히기.
  - `REF_EDIT_LIGHTNING_LOOK_IMAGE` 값 자체 수정(360 재현용으로 그대로 둔다 — 새 키·새 모드로 분리).
  - 영상(354).
  - 커밋 안 된 사용자 변경(`.forge/CONTEXT.md`·아둘람 굴 장면·`tool/glossary.json`)은 건드리지 않는다.

## 근거
- 용어: `.forge/CONTEXT.md` 「카드 층 / 얼굴 층」(차림은 장면 명세가 덮어씀) · 「판정 배율은 카드 배율」.
- ADR:
  - `.forge/adr/261017-152627-scene-identity-by-canon-reference-edit-2511-lightning.md`: 이 과제가 2항(「정본 그림과 정의가 어긋나는 곳 — 사울 체격·옷 색, 다윗 머리 숱·옷 색 — 은 그림을 따른다」)에서 **옷 색을 빼는** 개정 메모를 단다. 새 ADR은 쓰지 않는다. 용어집 규칙을 편집 단계에 맞추는 것이라 새 결정이 아니다.
  - `260904-055320`(1항 장면 생성은 문구로 — 그대로).
- 기록·회고: `scripts/canon/notes/REF-EDIT-LIGHTNING.md`, `.forge/retro/261017-153131-scene-cast-ref-edit-lightning.md`. 회고의 규칙:
  - S0은 처치 인물마다 한 장.
  - targeted 미달 장은 눈으로 본다.
  - 판정 단서는 게시 전에 고정한다.
  - 긴 생성은 `nohup`으로 돌리고, 긴 대기는 bg 셸에 맡기지 않는다.
- `scripts/canon/notes/PROMPTING.md` 17(편집 지시문 외형은 참조 그림에서 읽어 씀 — 이번 개정 후에도 **정체성 부분**에는 그대로 적용).
- 완료 정의(DoD) — 아래 명령 모두 충족 + 사람 판정 결과를 규칙대로 적음:
  1. `cd scripts/canon && /opt/homebrew/bin/python3 -c "import gen_ref_edit_lightning as L; s=L.look('engedi','saul'); assert 'cloak' in s and 'tunic reaching' not in s, s; d=L.look('engedi','david'); assert 'red' not in d, d; print('ok')"` → `ok`
     - 작성 시점: `AssertionError`(사울 look 끝 「in a plain brown short-sleeved tunic reaching the shins…」). 앞으로 충족할 검사라 실패가 맞다.
  2. `ls ~/.local/biblemap-imggen/ref-edit-costume/edit/engedi/s*.png | /usr/bin/grep -v saul | wc -l` → `8`
     - 작성 시점: 0(디렉터리 없음).
  3. `/usr/bin/grep -c "^결론:" scripts/canon/notes/REF-EDIT-COSTUME.md` → `1`
     - 작성 시점: 파일 없음.
  4. `/usr/bin/grep -c "task#361" .forge/adr/261017-152627-*.md` → `≥1`
     - 작성 시점: 0.
  - 지속 회귀 검사는 두지 않는다. 핵심 결과(겉옷이 남는가·무너짐)는 사람 시각 판정이라 기계로 영구화할 수 없다. DoD 1은 지시문 입력만 확인한다.

## 고정 절 (실행 전 확정 — 게시 후 바꾸지 않음)
- **지시문:**
  - `{look}` = 정체성 서술 + `", wearing " + 장면 명세 figures[].costume.en`.
  - 정체성 서술은 `REF_EDIT_LIGHTNING_LOOK_IMAGE`에서 차림 절(「in a plain … tunic … belt」)을 뗀 것이다. 새 키 `REF_EDIT_LIGHTNING_LOOK_IDENTITY`에 손으로 옮긴다.
  - 새 모드 `REF_EDIT_LIGHTNING_LOOK_SRC = "image+scene"`에서 쓴다. 템플릿 `REF_EDIT_LIGHTNING_PROMPT`는 그대로 둔다.
- **그 밖의 설정은 360과 같다:**
  - 2511 q8 `--low-ram` + Lightning 4스텝 세기 1.0, guidance 1 래퍼.
  - 참조는 frozen 초상 + lora-sheet-v2 전신 07.
  - 전체 편집 → 몸 상자 되붙임. 엔게디는 사울 → 다윗 차례.
- **바탕:** 360과 같은 353 바탕 8장. 시드 `[11, 42, 7, 23, 5, 101, 202, 303]`. 11·42·7은 `cast-v2-pilot/scene/`, 나머지는 `ref-edit/base/engedi/`.
- **산출 위치:** `~/.local/biblemap-imggen/ref-edit-costume/`, 목록은 `scripts/canon/samples/ref-edit-costume/metrics.json`. 360 산출을 덮지 않는다.
- **판정 페이지:** 비공개 Artifact, 폰용, 한 화면 한 질문, 카드 폭 356px, 섞기 시드 361. 쌍·그림 번호 ↔ 처치/대조·시드 대응은 **게시 전에** metrics `screens`에 적는다.
  - **C-engedi:** 기준(345 승인본) + 처치 8 + 대조 8(353 바탕 8장 모두). 「연필 화풍이나 장면 뜻이 기준보다 크게 무너진 그림을 누르세요」.
  - **C-이유:** 누른 그림마다 한 장씩 「무엇이 무너졌나? (여러 개)」. 보기는 화풍(연필·수채 결) / 굴 어둠·빛 / 겉옷자락 베기(다윗이 사울 몸에 붙은 겉옷을 벰) / 인물 자세·위치 / 기타.
  - **A-saul:** 360 길갈 처치 ↔ 새 엔게디 처치(같은 시드) 8쌍 + 대조 3쌍(353 s11·42·7). 「같은 사람으로 읽히는 쌍」. **얼굴·머리·수염·몸집(나이대)만, 옷은 빼고.**
  - **A-david:** 새 엔게디 처치 ↔ 360 라마 처치 8쌍 + 대조 3쌍. 문구는 A-saul과 같다.
  - **B-engedi:** 처치 8. 「두 인물이 서로 닮아 구별이 안 되는 그림」. 두 사람이 이제 모두 어두운 옷이라 다시 잰다.
- **규칙:**
  - 분해능: A 대조 「같은 사람」 합 ≤ 2/6. 넘으면 `판정: 보류`.
  - **수리됨** = C 처치 무너짐 ≤ 대조 무너짐 + 1(8장 기준) **그리고** 사울·다윗 A ≥ 5/8 **그리고** B ≤ 1/8.
  - **부분** = C는 충족했지만 A나 B가 미달. 옷을 장면대로 두면 정체성이나 구별이 약해진다는 뜻이다. 다음 길은 사람 결정.
  - **미수리** = C 처치 무너짐 > 대조 + 1. 무너진 이유 분포를 적는다.
  - **② 원인:** 대조 무너짐 ≥ 3/8이고 그중 과반이 같은 이유를 골랐으면 「353 문구 원인」. 아니면 「시드 편차 — 생산에서는 장면 승인 도구가 거른다」.
- **정지 조건:** S0에서 사울 겉옷이 몸에 붙어 있지 않거나 다윗이 그것을 베고 있지 않으면, 본 편집 전에 멈추고 묻는다. 지시문을 바꾸는 것은 사람 결정이다.

## 작업 조각
- [ ] S1. 지시문 개정 — 완료 기준: DoD 1이 `ok`. 360 모드(`"image"`)로 돌리면 `look()`이 바이트 그대로 360 값을 낸다.
  - `params.py`에 `REF_EDIT_LIGHTNING_LOOK_IDENTITY`·`"image+scene"` 모드, `gen_ref_edit_lightning.look()` 분기를 추가한다.
  - 산출 루트·metrics 경로는 `ref-edit-costume`로 분리한다(모드 인자 또는 상수).
- [ ] S2. S0 — 엔게디 s11 사울·다윗 각 1장(약 17분, `nohup`) — 완료 기준(depends: S1): 두 장의 크롭을 눈으로 본다. 사울 겉옷이 몸에 붙어 있고, 다윗이 그 자락을 베고 있고, 정체성 쪽(사울 짧게 깎은 머리, 다윗 곱슬·홍조)이 바뀌었는지 run.md에 적는다.
  - targeted 수치도 적는다. 어두운 장면이라 하한 미달이어도 눈으로 판단한다(ADR 3항).
  - 정지 조건에 걸리면 여기서 멈춘다.
- [ ] S3. 본 편집 8시드 × 사울·다윗(16편집, 약 2.3시간, `nohup`, 있으면 건너뜀) — 완료 기준(depends: S2): DoD 2 = 8. targeted 미달 장은 크롭을 눈으로 보고 기록한다.
- [ ] S4. 판정 페이지 게시 → 사람 판정 → 결론 — 완료 기준(depends: S3): DoD 3·4 충족.
  - 페이지: `make_ref_edit_page.py`에 `judge-costume` 하위 명령을 추가해 게시한다. 사람 답 원문과 metrics `screens`로 푼 표, `결론: 수리됨|부분|미수리|보류 · ②: 353 문구 원인|시드 편차`를 `notes/REF-EDIT-COSTUME.md`에 적는다.
  - ADR `261017-152627` 끝에 `task#361` 개정 메모를 단다. 2항에서 옷 색을 빼고 차림은 장면 명세를 따른다는 내용과 실측을 적는다. 결과가 미수리면 미수리라고 적는다.
  - ②가 「353 문구 원인」이면 `.forge/backlog/`에 엔게디 문구 수리 계획을 새로 쓴다(다음 task 번호, 무너짐 이유 분포를 목표에 옮김).
