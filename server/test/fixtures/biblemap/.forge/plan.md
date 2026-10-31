<!-- forge-slug: scene-engedi-text-dark-light -->
<!-- task: 362 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 엔게디 장면 문구 수리 — 굴 벽의 색 낱말로 「굴 어둠·빛」 무너짐을 고친다

## 목표 / 하지 않을 것
- 목표: 361 판정에서 353 바탕 대조의 「굴 어둠·빛」 무너짐이 3/8(s7·202·303)이었다. 이것을 장면 명세 문구만 고쳐서 같은 8시드로 ≤ 1/8로 줄인다.
  - 진단(그릴링에서 확정): 「어둠·빛」은 처치·대조 모두에서 **s7·202·303에만** 찍혔다.
    - 이 셋은 353 바탕 8장 중 가장 밝은 세 장이다(평균 밝기 0.443·0.401·0.372).
    - 나머지 다섯 장은 0.191~0.347, 기준(345 승인본)은 0.219다. 밝기 0.36에서 판정과 정확히 갈린다.
    - 무너진 세 장은 굴 벽 전체가 옅은 바위색으로 밝다. 어귀도 크고 가까워 「깊은 굴 안」이 아니라 바위 그늘로 읽힌다.
  - 가설: PROMPTING 14(「톤은 형용사가 아니라 대상의 색 낱말이 움직인다」)에 어긋난다.
    - 굴 벽의 색 낱말은 `pale limestone` 하나뿐이다. `dark`·`deep darkness`·`brown-black shadow`는 형용사다.
    - `pale limestone`은 한국어 정본(`whole_background.ko`)에 없고 영문에만 있다. 정본과 파생이 어긋난 자리다.
  - 한 장 모드 문구에 들어가는 필드는 `whole_background.en`·`relation.en`·`screen_light.en`과 인물 필드다(`derive_scene.whole_prompt`). 그래서 고칠 곳은 `whole_background`·`screen_light`의 ko·en이다. 초안이 든 `meaning`·`background`는 문구에 들어가지 않아 제외한다.
- 하지 않을 것:
  - 겉옷자락 베기·자세 무너짐(s5·s42). 원인이 다르고, 섞으면 효과를 가를 수 없다. 이번 결과를 보고 별도로 판단한다.
  - 새 바탕에 정본 참조 편집 다시 걸기. 361이 「수리됨」으로 확정했고, 생산에서는 바탕이 바뀌어도 같은 편집을 건다.
  - 정본 참조 편집 설정 변경, 길갈·라마 문구, 영상(354).
  - 아둘람 굴 명세의 `pale limestone`. 사용자 미커밋 작업이다. 이번 결론을 거기 옮길지는 사람이 정한다.
  - 사용자 미커밋 작업(`.forge/CONTEXT.md`·아둘람 2파일·`tool/glossary.json`)은 건드리지 않는다. 그래서 용어집 갱신도 하지 않는다.
  - 부정 프롬프트. Z-Image-Turbo는 guidance 0이라 듣지 않는다(`run_scene.py`).

## 근거
- 기록: `scripts/canon/notes/REF-EDIT-COSTUME.md` 「판정 결과」·판정 원문(C-why 그림 번호 ↔ metrics `screens` 시드).
- 규칙: `scripts/canon/notes/PROMPTING.md` 14(대상의 색 낱말)·6(한 장으로 판단하지 않는다)·15(장면은 데이터 — 명세 → 파생).
- ADR: `261017-152627` 개정 메모(task#361 — 남은 위험).
- 회고 `261017-153131`: 판정 단서는 게시 전에 고정한다 · S0 첫 장을 본다 · 긴 생성은 `nohup`으로 돌린다.
- 메모리: 「판정 페이지는 질문 하나씩」.
- 그림: 353 바탕 `~/.local/biblemap-imggen/cast-v2-pilot/scene/authored-david-en-gedi-saul/s{11,42,7}.png`·`ref-edit/base/engedi/s{23,5,101,202,303}.png`. 기준 `samples/face-ab/approved-engedi.png`.
- 재현성: 현재 명세가 파생하는 문구는 353 `prompts.json`과 글자까지 같다. 따라서 문구만 바꾼 효과를 같은 시드로 바로 비교할 수 있다.

## 고정 절(실행 중 바꾸지 않는다)
- 문구 A(색 낱말만):
  - `whole_background.en`의 `a huge, deep, dark cave of pale limestone` → `a huge, deep, dark cave with dark brown-black rock walls and a low dark rock ceiling`.
  - `.ko`의 「크고 깊고 어두운 굴 내부」 → 「짙은 갈흑색 바위 벽과 낮고 어두운 바위 천장의 크고 깊은 굴 내부」.
  - `verse`의 「석회암」 → 「바위 색」.
  - 나머지 글자는 그대로 둔다.
- 문구 B(A + 빛 문장): A에 더해 `screen_light.en`을 `A thin beam of light from the tiny cave mouth far on the right falls only on these two men`으로 바꾼다(`Daylight` 제거). `.ko`는 「오른쪽 멀리 작은 굴 어귀에서 가는 빛줄기가 두 사람에게만 떨어진다」로 바꾼다.
- 밝기 지표: 그림 전체를 회색조로 바꾼 평균(0~1). 「밝음」 = ≥ 0.36(353 판정 경계). 「너무 어두움」 = < 0.15(기준 0.219·최저 s11 0.191 아래).
- 시드: `params.REF_EDIT_SEEDS`(11·42·7·23·5·101·202·303). 캔버스 1216×640. Z-Image-Turbo. 생성 경로·설정은 353과 같다(`gen_cast_v2_pilot.SCENE_SIZE`·`run_scene.gen_zimage`).
- 판정 규칙(게시 전 고정):
  - **수리됨**: 새 바탕 「어둠·빛」 ≤ 1/8 **그리고** 새 바탕 무너짐 < 같은 페이지의 353 무너짐.
  - **부분**: 「어둠·빛」은 줄었으나, 다른 이유를 더한 무너짐 수가 353과 같거나 많다.
  - **미수리**: 새 「어둠·빛」 ≥ 같은 페이지의 353 「어둠·빛」.
  - 결론 줄 형식: `결론: 수리됨|부분|미수리 · 문구 A|B · 새 무너짐 n/8(어둠·빛 n) · 353 n/8(어둠·빛 n) · 밝음 n/8`.
- 결과 처리: 수리됨·부분이면 명세 변경을 남긴다. 미수리면 명세를 `git checkout`으로 되돌리고 기록만 남긴다.

## 완료 정의(DoD)
- [ ] `cd scripts/canon && ~/.local/biblemap-imggen/.venv314/bin/python check_scenes.py` → 37/37 통과, exit 0.
  - 사전 상태: 이미 통과. 회귀 지킴이라 정상이다.
- [ ] `cd scripts/canon && ~/.local/biblemap-imggen/.venv314/bin/python -c "import json;m=json.load(open('samples/engedi-text/metrics.json'));L=m['lum'][m['chosen']];assert sum(v>=0.36 for v in L.values())<=1 and min(L.values())>=0.15"` → exit 0.
  - 사전 상태: 파일이 없어 실패. 앞으로 채울 항목이라 정상이다.
- [ ] `! grep -q "pale limestone" scripts/canon/scenes/authored-david-en-gedi-saul.json`. 미수리로 되돌린 경우에는 이 항목을 「되돌림 — n/a」로 적는다.
  - 사전 상태: 1곳 남아 실패. 앞으로 채울 항목이라 정상이다.
- [ ] `grep -c "^결론: " scripts/canon/notes/ENGEDI-TEXT.md` ≥ 1(사람 판정을 반영한 결론 줄).
  - 사전 상태: 파일이 없어 실패. 앞으로 채울 항목이라 정상이다.
- [ ] 사람 확인: 폰 판정 페이지 답이 notes에 원문으로 남아 있다.

## 작업 조각
- [ ] **S1. 생성 스크립트 + S0.**
  - `scripts/canon/gen_engedi_text.py`를 만든다. 문구 A·B를 명세 사본에 덮어 `whole_prompt`로 파생한다. 출력은 `~/.local/biblemap-imggen/engedi-text/<A|B>/s<시드>.png`이고, 밝기를 `samples/engedi-text/metrics.json`의 `lum`에 적는다.
  - S0: 문구 A로 s7(353에서 가장 밝았던 장) 1장을 그린다. 밝기를 재고 눈으로 본다.
    - < 0.36이면 S2로 간다.
    - 아니면 문구 B로 s7을 그린다. B도 ≥ 0.36이면 **멈추고 묻는다**(가설이 깨진 것이므로 사람이 정한다).
  - 완료: s7 그림 1~2장과 밝기를 보고했다.
- [ ] **S2. 8시드 생성 + 기계 거르기.**
  - S0을 통과한 문구로 8시드를 그린다. 생성은 한 번에 하나이고, `nohup`으로 돌린다. 장당 약 65초다.
  - 밝음이 2장 이상이면, 아직 안 그린 문구(B)로 8시드를 그린다. 그다음 「밝음 수가 적은 쪽, 같으면 평균이 기준 0.219에 가까운 쪽」을 `chosen`으로 적는다.
  - 「너무 어두움」이 있으면 그 장을 눈으로 보고 기록한다.
  - 완료: DoD 2번이 통과한다. 8장 몽타주를 눈으로 봤다(인물·겉옷자락이 사라지지 않았는지).
- [ ] **S3. 명세 반영.** 고른 문구를 `scenes/authored-david-en-gedi-saul.json`에 적는다(고정 절 그대로).
  - 완료: DoD 1·3번이 통과한다. 파생 문구 = 생성에 쓴 문구(글자 비교).
- [ ] **S4. 판정 페이지 → 사람 판정 → 결론.**
  - `make_ref_edit_page.py`에 모드를 하나 더한다. 361 C-engedi·C-why와 같은 문구·보기(화풍·굴 어둠·빛·겉옷자락·자세·기타)를 쓴다. 기준 + 새 바탕 8 + 353 바탕 8을 섞는다(섞기 시드 362).
  - 「굴 어둠·빛」 보기에는 설명을 붙인다: 「굴 안이 기준처럼 어둡지 않다 — 벽 전체가 밝거나 어귀가 크고 가까워 바깥처럼 보임」.
  - 그림 번호 ↔ 새/353·시드 대응은 게시 전에 metrics `screens`에 적는다.
  - 폰용 비공개 Artifact. 한 화면에 한 질문, 카드 폭 356px, 확대 없음.
  - 답을 `notes/ENGEDI-TEXT.md`에 원문으로 남기고 고정 규칙으로 결론 줄을 쓴다. 미수리면 명세를 되돌린다.
  - 완료: DoD 4·5번이 통과한다.
