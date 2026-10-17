<!-- forge-slug: scene-cast-ref-edit-lightning -->
<!-- task: 360 -->
<!-- tdd: off -->
# 사울·다윗 정본 참조 편집을 2511 + Lightning 4스텝으로 — 외형 명시 지시문, 상자 안−밖 조작 확인, 카드 크기 같은 인물 판정

## 목표 / 하지 않을 것
- 목표: 359는 Qwen-Image-Edit-2511이 이 맥에서 장당 48~60분이라 「실행 불가」였다. 후속 시험(2026-10-17, `notes/REF-EDIT-2511.md` 「후속 시험」)에서 다음을 확인했다.
  - Lightning 4스텝 LoRA + guidance 1 래퍼(`mflux_qwen_edit_cfg1.py`)로 장당 **약 8분**.
  - **지시문에 외형을 명시하면** 인물이 실제로 바뀐다. 상자 안 변화 49.6, 밖 16.3이었다. 고정 절 지시문 그대로는 무처치였다(안 12.5, 밖 15.2).
  - 이번에는 이 설정으로 358·359와 같은 32번 편집을 하고, 같은 규칙으로 판정한다.
  - 2511과 LoRA가 모두 Apache-2.0이라 결과가 좋으면 영상 패키지에 쓸 수 있는 첫 경로가 된다.
- 하지 않을 것:
  - FLUX 3 Image Klein(업그레이드·라이선스 동의 필요 — 사람 결정), Qwen-Image-2.1(비상업).
  - 사울 정본 정의와 정본 전신 그림의 어긋남 고치기. 카드 층은 「통짜 몸통」, `lora-sheet-v2/saul/07.png`은 마른 체격이다. 이번에는 기록만 한다(아래 결정 2).
  - 지시문 여러 개 비교, 스텝·LoRA 세기 미리보기. 하나로 고정하고 조작 확인으로 대신한다.
  - 엔게디 353 장면 문구 수리, 생산 배치, 앱 통합, 생성 그림 커밋.
  - 사용자의 커밋되지 않은 작업(아둘람 2파일·`tool/glossary.json`·`.forge/CONTEXT.md`)은 건드리지도, 커밋하지도 않는다.

## 근거
- 기록: `scripts/canon/notes/REF-EDIT-2511.md`(359 고정 절 · 결론 · 후속 시험), `REF-EDIT.md`(358 판정 규칙 · 사후 조작 확인).
- 회고: `.forge/retro/261017-062657-scene-cast-ref-edit-2511.md`.
  - 「안 돔」은 짧은 시험으로 한다.
  - 기준(시간)과 원인을 분리해서 기록한다.
  - 시간 제한은 프로세스 그룹째 종료한다.
- ADR `260904-055320`(어휘 정본 1층, 얼굴 앵커는 자격 게이트). 채택이면 뒤집는 새 ADR을 쓴다.
- 용어: 「카드 층 / 얼굴 층」, 「인물 정본」(.forge/CONTEXT.md).
- 재사용 자산:
  - 바탕 24장·마스크는 358·359와 같다.
  - 코드:
    - `gen_ref_edit_2511.py`(`side`·`paste`·`mask_diff`)
    - `try_ref_edit_lightning.py`(명령 조립)
    - `mflux_qwen_edit_cfg1.py`
    - `make_ref_edit_page.py`(`judge2511` 모드를 일반화)
  - 판정 틀: `~/.local/biblemap-imggen/pages/cast-v2-pilot.html`.
- 메모리 「로컬 이미지 생성 스택」: 생성 프로세스를 겹치지 않는다.

## 결정(기본값으로 정함 — 사용자 메모리 「확인 묻지 말 것」에 따라 통보로 갈음)
1. **모델:**
   - 2511, q8 `--low-ram`, Lightning `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16` 세기 1.0.
   - 4스텝, guidance 1, `mflux_qwen_edit_cfg1.py` 래퍼.
   - 「안 돔」 = 첫 1장 장당 10분 초과 또는 오류. 그러면 q6 한 번만 보고, 그래도 안 되면 `stop`.
2. **지시문:** 「Change the man on the {side} in image 1 into the man shown in image 2 and image 3: {외형}. Keep his pose, his position and size in the scene, and keep the pencil and watercolor drawing style and everything else in image 1 unchanged.」
   - {외형}은 `derive_scene.cast_describe`(정본 카드 층, 장면 문구와 같은 낱말)에서 기계적으로 넣는다. 손으로 쓰지 않는다.
   - 사울의 「통짜 몸통」과 전신 그림(마른 체격)이 어긋나도 **정의(카드 층)를 따른다.**
   - 조작 확인에 걸리면 멈추고 묻는다. 그림 쪽 서술로 바꾸는 것은 사람 결정이다.
3. **조작 확인(359 결함 수정):**
   - `targeted` = 전체 편집 원본과 입력 그림의 **몸 상자 안 평균 차 − 상자 밖 평균 차**(0~255, RGB 평균).
   - S0 첫 1장과 32장 평균 모두 **≥ 10**이어야 한다(후속 시험 외형 명시 33.4, 무처치 −2.7).
   - S0 첫 1장은 눈으로도 본다: 정본 쪽으로 바뀌었는가, 이음매가 있는가.
   - 미달이면 본 편집 전 또는 게시 전에 멈추고 묻는다.
4. **대상·시드·참조·되붙임:** 359와 같다.
   - 장면: 길갈 사울 · 엔게디 사울→다윗(사울 되붙인 결과 위) · 라마 다윗.
   - 시드: `[11, 42, 7, 23, 5, 101, 202, 303]`.
   - 참조: 초상 + 전신 07.
   - 되붙임: 몸 상자, 페더 8px.
   - 편집 수: 32번(약 4.5시간). `nohup` 한 프로세스로 돌리고, 이미 있으면 건너뛴다.

## 판정 규칙(실행 전 고정 — S0에서 notes 「고정 절」에 적고 결과를 보고 바꾸지 않는다)
- **358 `REF-EDIT.md` 「판정 규칙」과 같다. 섞기 시드만 360이다.**
  - 화면 A 2(사울 길갈↔엔게디, 다윗 엔게디↔라마): 처치 8 + 대조 3(353 s11·42·7).
  - 화면 B 1(엔게디 섞임).
  - 화면 C 3(장면마다 기준 + 처치 8 + 대조 3).
  - 카드 폭 356 CSS px(DPR 3), 확대·크롭 없음, 한 화면 한 질문, 폰용 비공개 Artifact.
- 분해능: 대조 「읽힌다」 ≤ 2/6. 넘으면 `판정: 보류`.
- 결론:
  - 채택: 사울·다윗 모두 ≥ 5/8. (처치 무너짐 − 대조 무너짐) > 0.5면 조건부로 내린다.
  - 조건부: 한 명만 ≥ 5/8, 또는 화풍 감점.
  - 다른 길: 그 밖.
- 결론 줄 끝: 「영상 패키지 사용: 가능(apache-2.0 — 2511·Lightning LoRA)」.
- 판정 결과 표에 `targeted` 평균과 장면별 평균을 같이 적는다.
- 쌍 대응은 게시 전에 metrics `screens`에 적는다.
- 채택이면 ADR `260904-055320`을 뒤집는 새 ADR(실측표 포함). 아니면 그 ADR 개정 메모에 한 줄.

## 완료 정의(DoD)
1. (회귀 감시) `~/.local/biblemap-imggen/.venv-mflux/bin/python -c "import glob,os;from mflux.models.common.config.model_config import ModelConfig;ModelConfig.qwen_image_edit_2511();assert glob.glob(os.path.expanduser('~/.cache/huggingface/hub/models--lightx2v--Qwen-Image-Edit-2511-Lightning/snapshots/*/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'))" && echo ok` → `ok`
   - 작성 시점: 통과.
   - 회귀 감시라 미리 통과하는 것이 맞다.
2. `cd scripts/canon && python3 -c "import json;m=json.load(open('samples/ref-edit-lightning/metrics.json'));s=m.get('stop');assert (isinstance(s,str) and s.strip()) or (len(m['edits'])==32 and all(e['status']=='ok' and 'sec' in e and 'targeted' in e for e in m['edits']) and m['targeted_mean']>=10 and m.get('screens'))"` → 통과
   - 작성 시점: 실패 — 파일 없음.
3. `/usr/bin/grep -q '^## 고정 절' scripts/canon/notes/REF-EDIT-LIGHTNING.md && /usr/bin/grep -qE '^결론: .*영상 패키지 사용' scripts/canon/notes/REF-EDIT-LIGHTNING.md && echo ok` → `ok`
   - 작성 시점: 실패 — 파일 없음.
   - 「사람 판정」 절과 결론은 사람 답으로 채워진다(UAT).
4. (회귀 감시 — 사용자 작업 보존) `git status --porcelain -- scripts/canon/attempts/authored-david-adullam-cave.json scripts/canon/scenes/authored-david-adullam-cave.json scripts/canon/tool/glossary.json` → ` M` 세 줄 그대로
   - 작성 시점: 통과.
- 회귀 eval 면제 사유: 측정 파일럿이고, 핵심 판정이 사람 시각 판정이다.

## 작업 조각
- [ ] S0. 고정·첫 1장.
  - notes `REF-EDIT-LIGHTNING.md` 「고정 절」과 `params.REF_EDIT_LIGHTNING_*`(LoRA 파일·스텝·guidance·지시문 틀·targeted 하한·섞기 시드)를 **먼저** 적는다.
  - 길갈 사울 s11 1장으로 시간·피크·targeted·눈 확인(정본 쪽 변화·이음매)을 기록한다.
  - 엔게디 s11 사울→다윗 1장으로 left/right 지목과 다윗 외형 서술을 확인한다.
  - 완료 기준: 쓸 양자화와 첫 장 targeted ≥ 10, 눈 확인 메모가 notes에 있다. 또는 `stop`과 사유가 있다.
- [ ] S1. 본 편집 32번 (depends: S0)
  - 산출: `~/.local/biblemap-imggen/ref-edit-lightning/edit/<장면>/s<시드>.png`, 원본은 `raw/`.
  - metrics `edits`에 시간·피크·targeted를 적고, 끝에 `targeted_mean`·장면별 평균을 적는다.
  - 완료 기준: DoD 2의 편집 부분. 평균 < 10이면 `stop`하고 묻는다.
- [ ] S2. 판정 페이지 (depends: S1) **사람 관문.**
  - `make_ref_edit_page.py`의 2511 모드를 metrics·산출 경로·섞기 시드를 받는 형태로 일반화한다(358 `judge` 경로는 바이트 동일 유지).
  - 화면 A 2·B 1·C 3을 만든다. 16MB 이내로 한다.
  - 사람 답을 notes 「사람 판정」에 원문으로 옮기고 `결론:` 줄을 쓴다. ADR은 채택이면 새로 쓰고, 아니면 개정 메모만.
  - 완료 기준: DoD 3.
- [ ] S3. 정리·커밋 (depends: S2)
  - 스크립트·params·notes·metrics만 커밋한다. 그림·사용자 미커밋 파일·`.forge/done`은 뺀다.
  - 완료 기준: DoD 1~4.
