<!-- forge-slug: scene-video-model-pilot -->
<!-- task: 354 -->
<!-- tdd: off -->
# 로컬 영상 모델 설치·시험 — 장면 그림 한 장을 3초 영상으로(Wan 2.2 TI2V-5B·LTX-2.3, 둘 다 MLX)

## 목표 / 하지 않을 것
- 목표: 최종 산출물은 **투어 카드의 지금 애니메이션을 대체할 짧은 영상**이다(사용자 2026-10-15). 정차지마다 승인된 장면 그림 한 장을 첫 프레임으로 넣고, 이 맥(M5, 32GB)에서 3초 남짓 영상을 만든다. 두 모델을 깔고 같은 입력으로 시험한다. 다음 다섯 가지를 잰다.
  1. 돌아가는가
  2. 얼마나 걸리는가 → 275 정차지 처리 시간 추정
  3. 연필·수채 화풍이 끝까지 남는가
  4. 얼굴이 무너지지 않는가
  5. 프레임이 깨지지 않는가
- 하지 않을 것:
  - **PyTorch MPS 경로(diffusers·ComfyUI)로 Wan 돌리기.** M5 32GB에서 「첫 프레임만 정상이고 나머지가 깨진다」는 미해결 보고가 있다(ComfyUI #15793, #16644). 기존 `.venv314`는 쓰지 않는다.
  - 인물 참조 영상(VACE·Phantom 등): Mac에서 돌았다는 실측이 없다. 첫 프레임 방식이 통한 뒤 따로 다룬다.
  - 앱 통합(카드에 영상 넣기, 무게·움직임 줄이기 설정 대응), 275 정차지 일괄 생성.
  - 영상 MP4 대량 커밋. 대표 1개만 커밋하고, 나머지는 스크립트·시드로 재현한다.
  - 사용자의 커밋되지 않은 작업(아둘람 2파일·`tool/glossary.json`)은 건드리지 않는다.

## 근거
- 외부 조사(2026-10-15, 이 그릴링에서 실행). 출처: `github.com/Blaizzy/mlx-video`, `github.com/garvitkhurana/mlx-video-gen`(M5 32GB에서 Z-Image Turbo → Wan 5B), `github.com/dgrauet/ltx-2-mlx`, `huggingface.co/jboone100/FastWan2.2-TI2V-5B-MLX-q8`, ComfyUI #15793·#16644.
  - **후보 1: Wan 2.2 TI2V-5B, `mlx-video` 4bit, Apache 2.0.** 보고값은 704×1280 5초 약 18분이다. 다만 5B에 `--image`를 쓴 근거는 레포 하나뿐이다.
  - **후보 2: LTX-2.3 int4, `ltx-2-mlx`.** 라이선스는 연매출 1천만 달러 미만이면 상업 이용 무료다. 프레임별 이미지 고정 앵커가 있다.
  - **제외:** HunyuanVideo·FramePack(라이선스가 한국을 적용 지역에서 뺌), CogVideoX(상업 이용에 등록 필요).
  - **확인 안 됨(이번에 잰다):** 화풍 유지, 32GB에서 LTX 소요 시간.
- 342 보고서 `.forge/reports/scene-anim-eval/REPORT-1.md`: 앱 안 MP4는 무드 색 전환·움직임 줄이기 설정·이름표 층을 잃는다. 영상으로 대체하기로 한 것은 이 판정을 뒤집는 것이므로, 앱 통합 과제에서 다시 다룬다.
- 메모리 「로컬 이미지 생성 스택」: **생성 프로세스를 겹쳐 돌리면 처리량이 20배까지 떨어진다** → 한 번에 하나만 돌린다.
- **기본값으로 정한 것:**
  - 런타임은 새 venv `~/.local/biblemap-imggen/.venv-video` 하나에 두 패키지를 깐다. `uv`가 없으므로 `python3 -m venv`를 쓴다. 3.14에서 `mlx` 휠이 없으면 `brew install python@3.12`로 만든다. 디스크 여유는 565GB다.
  - 입력은 사람이 승인한 장면 2개다. 길갈 `samples/face-widen/approved-gilgal.png`, 엔게디 `samples/face-ab/approved-engedi.png`.
  - 움직임 프롬프트는 장면마다 하나를 손으로 쓰고, 두 모델에 같은 문구를 넣는다. 예: 「느린 카메라 다가가기, 인물의 옷자락과 숨이 미세하게 움직임, 연필 선과 종이 질감 유지」. 실행 전에 notes에 고정한다.
  - 시드는 [42, 23]이다. 해상도는 각 모델의 공식 가로 해상도 중 1216×640에 가장 가까운 것을 쓴다. 길이는 약 3초다(Wan 24fps 기준 73프레임, LTX는 같은 길이에 가장 가까운 허용값).
  - 생성 수는 2모델 × 2장면 × 2시드 = 8클립이다.

## 판정 규칙(실행 전 고정 — S0에서 notes에 적는다)
- **기계 측정(참고값, 게이트 아님):**
  - 클립당 소요 시간과 피크 메모리
  - **깨짐 검사:** 프레임별 화소 표준편차와 이웃 프레임 차이. 갑자기 0이 되거나 노이즈로 튀면 깨짐이다.
  - **화풍 표류:** `judge_style.style_metrics`로 첫 프레임 대 마지막 프레임 거리를 재고, 같은 장면 시드 사이 거리와 비교한다.
  - 처리량 추정: 275 × 클립당 시간
- **사람 판정(폰 페이지, 한 화면 한 질문, 영상은 카드 폭으로 재생):** 클립마다 「연필 화풍이 끝까지 남나 → 남는다 / 사진처럼 변한다」, 「얼굴이 무너지나 → 괜찮다 / 무너진다」를 묻는다. 마지막 화면에서 「투어 카드 영상으로 쓸 만한 모델 → Wan / LTX / 둘 다 아님」을 묻는다.
- **결론:**
  - 사람이 고른 모델이 있으면 그 모델로 다음 과제(장면 10개 무인 배치 + 앱 카드 시험)를 연다.
  - 「둘 다 아님」이면 342 구조(한 장 + CSS 확대·패럴랙스 움직임 틀)로 돌아간다.

## 완료 정의(DoD)
1. `~/.local/biblemap-imggen/.venv-video/bin/python -c "import mlx_video"` → 통과 (작성 시점: 실패 — venv 없음)
2. `cd scripts/canon && python3 -c "import json;m=json.load(open('samples/video-pilot/metrics.json'));c=m['clips'];assert len(c)==8 and all(x['status'] in ('ok','failed') for x in c) and sum(x['status']=='ok' for x in c)>=4 and all('sec' in x for x in c if x['status']=='ok')"` → 통과 (작성 시점: 실패 — 파일 없음). 설치나 실행이 끝내 안 되는 모델은 `failed`와 사유로 남긴다. 최소 한 모델은 4클립이 돌아야 한다.
3. `/usr/bin/grep -q '^## 사람 판정' scripts/canon/notes/VIDEO-PILOT.md && /usr/bin/grep -qE '^결론: ' scripts/canon/notes/VIDEO-PILOT.md && echo ok` → `ok` (작성 시점: 실패 — 파일 없음). 시각 판정이라 내용은 사람 답으로 채워진다(UAT).
4. `git status --porcelain -- scripts/canon/attempts/authored-david-adullam-cave.json scripts/canon/scenes/authored-david-adullam-cave.json scripts/canon/tool/glossary.json` → ` M` 세 줄 그대로 (작성 시점: 통과 — **회귀 감시**, 사용자 작업 보존)
- 회귀 eval 면제 사유: 측정 파일럿이고 핵심 판정이 시각 판정이다.

## 작업 조각
- [ ] S0. 고정과 설치. notes `scripts/canon/notes/VIDEO-PILOT.md`에 판정 규칙·움직임 프롬프트·해상도·프레임 수를 먼저 적는다. venv를 만들고 `mlx-video`를 설치한다. Wan2.2-TI2V-5B를 내려받아 4bit로 변환한다. `ltx-2-mlx`를 설치하고 LTX-2.3 int4를 받는다. 실행 전에 각 레포 README에서 모듈 경로와 5B `--image` 지원을 확인해 notes에 적는다. — 완료 기준: DoD 1, 두 모델 각각 「설치 성공」 또는 「실패 + 사유」가 notes에 있다
- [ ] S1. 8클립 생성(`gen_video_pilot.py`, 백그라운드 한 프로세스, 이미 있으면 건너뜀) → `samples/video-pilot/<모델>-<장면>-s<시드>.mp4`. 그다음 기계 측정을 `metrics.json`에 쓴다. — 완료 기준: DoD 2 (depends: S0)
- [ ] S2. 판정 페이지를 만든다. 폰용 비공개 Artifact이고, 영상을 카드 폭으로 재생하며, 한 화면에 질문 하나, 마지막에 판정 문장 복사 단추가 있다. 기계 수치는 숨긴다. 사람 답을 notes에 옮기고 `결론:` 한 줄을 쓴다. — 완료 기준: DoD 3 (depends: S1)
- [ ] S3. 정리·커밋. 스크립트·notes·metrics와 대표 클립 1개(사람이 고른 모델의 가장 나은 것, 가능하면 webm으로 줄여서)만 커밋한다. — 완료 기준: DoD 1~4 (depends: S2)
