# [AI] 에피소드 [발행 준비] 버튼 — TTS → 썸네일 생성(OpenAI) → 패키지 자동 연쇄

| 항목 | 값 |
|---|---|
| 대상 | 콘솔 `pipeline/apps/web/app/episodes/[id]/` (버튼·상태 표시) · 워커 `pipeline/apps/worker/src/stages/` (신규 `thumbnail.ts`, `tts.ts`·`package.ts` 연쇄) · `docs/ai/spec/06`·`07` |
| 요청 파트 | 파이프라인(AI) — 콘솔·워커 |
| 발행 날짜 | 2026-09-10 |
| Jira | [KAN-50](https://runtime364.atlassian.net/browse/KAN-50) |
| 요청자 | 박수헌 (2026-09-10 지시: "새 버튼을 누르면 TTS 변환 → 썸네일 생성 → 패키징까지 쭉 진행") |
| 근거 문서 | `ai/spec/06-audio.md`(TTS) · `ai/spec/07-publish.md` 2장(패키지)·4장(업로드)·재발행(2026-09-07) · `features/admin.md` 3.1(썸네일 필수, `thumb/*` 공개) · `spec/api/admin-api.md` 4.10(PATCH 재발행) · `ai/spec/10-webapp.md`(큐·연쇄) |
| 심각도 | **중** — 지금은 TTS·패키지가 별도 버튼이고 썸네일은 손으로 ChatGPT 웹에서 만들어 업로드 화면에 올린다. 편당 사람 손이 세 번 들어간다 |
| 상태 | 대기 |

## 요지 (Jira 본문용)

- 에피소드 상세에 [발행 준비] 버튼 하나를 두고, 누르면 워커가 TTS → 썸네일 → 패키지를 자동으로 이어서 실행한다. 기존 [TTS 변환]·[패키지] 버튼은 없앤다.
- 썸네일 단계를 새로 만든다: OpenAI 이미지 API(gpt-image-1-mini 기본, 첫 5편 실측 후 확정)로 1024×1024 PNG 1장. `episodes.thumbnail_key`·`runs`에 기록. 프롬프트는 `docs/ai/skills/thumbnail/prompt.md`(thumb-v1) — 제목·중분류·한 줄 요약·대분류 띠 색 슬롯을 워커가 채운다.
- 한 줄 요약(`one_liner`)은 대본 작성 완료 보고에 필드를 추가해 받고(추가 호출 없음) `episodes`·`upload-meta.json`에 저장, 업로드 화면 설명란 첫 줄로 미리 채운다.
- 대분류별 띠 색 8종은 settings 기본값 + 콘솔 설정 화면. 일정한 화풍을 위해 운영자가 고른 스타일 앵커 이미지를 참조로 넣는다.
- 음원 탭 [음원 다시 변환]·썸네일 탭 [썸네일 다시 만들기]로 한 단계만 강제 재실행하고 패키지가 자동으로 따라온다. 발행된 에피소드는 썸네일 재생성 후 [재발행 — 썸네일 교체]가 켜지고 `publish_log.parts`에 thumbnail이 남는다.
- 썸네일 작업은 tts·package처럼 `requires_ai=false`(EC2 io 워커). `OPENAI_API_KEY`는 EC2 `deploy/env.prod`에만.
- 상세 규칙(건너뛰기·연쇄·문서 갱신)과 완료 조건은 원본 문서.

## 문제

지금 에피소드 상세에는 [TTS 변환]과 [패키지] 버튼이 따로 있고, 썸네일은 파이프라인 밖에서 만든다 — 운영자가 ChatGPT 웹에 정해진 프롬프트를 주고 이미지를 받아 업로드 화면(`/publish/upload`)에 파일로 올린다. 발행 준비물 세 가지(음원·썸네일·`upload-meta.json`)를 사람이 세 번 개입해 모은다. 월 100편 목표에서는 병목이다.

## 요청 내용

1. **에피소드 상세 상단에 [발행 준비] 버튼 하나** — 누르면 워커가 `tts → thumbnail → package` 순서로 자동 연쇄한다(이미 있는 산출물은 3번 규칙대로 건너뜀). 기존 상단의 [TTS 변환]·[패키지] 버튼은 없앤다.
   **개별 다시 하기는 산출물 탭 안에 둔다** (요청자 2026-09-10: "오디오나 썸네일은 따로 다시 뽑아야 하는 경우가 생긴다"):
   - 음원 탭 **[음원 다시 변환]** — 건너뛰기 규칙을 무시하고 `tts`만 강제 실행 → 끝나면 `package`만 자동으로 다시(썸네일은 건드리지 않음).
   - 썸네일 탭 **[썸네일 다시 만들기]** — `thumbnail`만 강제 실행 → `package` 자동.
   - 즉 연쇄는 시작 단계를 지정할 수 있는 한 종류다: `publish_prep` payload `{ episode_id, from: "tts" | "thumbnail", force: boolean }`. [발행 준비] = `from: tts, force: false`, 개별 버튼 = 그 단계 `force: true` 후 `package`로 직행. 패키지만 다시 만드는 버튼은 두지 않는다(두 버튼 어느 쪽이든 패키지가 따라온다).
2. **썸네일 생성 단계 신설 (`thumbnail` job, 워커 `stages/thumbnail.ts`)** — OpenAI 이미지 생성 API로 만든다.
   - 프롬프트는 **`docs/ai/skills/thumbnail/prompt.md` (thumb-v1, 이 티켓과 같이 작성됨)** — 운영자가 ChatGPT 웹에서 쓰던 원문. DB `prompt_assets`에 등록한다(spec/10 3.2, `assets:import`). 슬롯 4개를 워커가 채운다: `{제목}` = 에피소드 제목, `{주제 분류}` = 중분류, `{핵심 개념}` = 한 줄 요약(3-1), `{띠 색}` = 대분류 색(3-2).
   - 규격은 프롬프트에 있는 대로 **정사각형 1024×1024 PNG 1장** (44pt 미니 플레이어까지 한 장으로 씀).
   - 산출물: `episodes/<id>/thumbnail.png` (S3, `WORK_ROOT` 상대 경로 = 키). `episodes.thumbnail_key`에 `s3:` 키 기록 (컬럼 신설 — 마이그레이션 + `schema.sql`).
   - 비용·모델·토큰을 `runs`(phase `thumbnail`)에 기록한다(spec/08 3.1과 같은 계측).
   - OpenAI 키는 워커 `.env`의 `OPENAI_API_KEY`만. 코드·`.env.example`에 실값 금지. 키는 팀 비밀 채널로 전달.
3-1. **한 줄 요약(`one_liner`) 단계** — 썸네일의 `{핵심 개념}`이자 발행 메타의 한 줄 설명 재료. **대본 작성(2단계 write) 완료 보고에 `one_liner` 필드를 추가**해 받는다(모델이 대본 전체 맥락을 이미 갖고 있어 추가 호출·비용 0). 규칙: 40자 이내, 사실 주장이 아니라 축을 청취자 언어로("소득이 끊겨도 버티는 현금흐름 구조"), 제목 복창 금지. 저장: `episodes.one_liner`(컬럼 신설) → `upload-meta.json.one_liner` → 업로드 화면 설명란 첫 줄로 미리 채움(지금 `description`은 백로그의 축 해설(`summary`)이 들어가는데, 한 줄 요약이 청취자 언어라 첫 줄로 더 맞다 — 축 해설은 그 뒤에 이어 붙인다). 에피소드 상세에서 사람이 고칠 수 있게(턴 편집기 옆 한 줄 입력). 구 에피소드(필드 없음)는 썸네일 단계가 설계 `축` 문장으로 대체한다.
3-2. **대분류별 띠 색** — `docs/ai/skills/thumbnail/prompt.md` 하단 표(8색, 무채색 팔레트 위에서 구분되는 비형광 색)를 기본값으로 settings `thumbnail.colors`에 두고 콘솔 설정 화면(시그니처 템플릿 옆)에서 편집한다. 프롬프트 `{띠 색}`에는 "딥 그린 (#2F6B4F)"처럼 이름+HEX.
3. **연쇄 규칙**
   - `tts` 완료 → `thumbnail` 자동 enqueue → 완료 → `package` 자동 enqueue. 어느 단계든 실패하면 연쇄를 멈추고 에피소드 상세에 실패 단계·사유를 표시한다(재시도는 [발행 준비] 다시 누르기).
   - 각 단계는 산출물이 이미 있고 입력이 그 뒤로 바뀌지 않았으면 **건너뛴다**. 현재 `tts.ts`에는 건너뛰기 규칙이 없으므로 이 티켓에서 정한다: TTS는 `audio_master_key`가 있고 **대본(script.md)의 S3 LastModified가 음원보다 오래됐으면** 건너뛴다(대본을 고쳤으면 재변환 — 실제 과금 단계라 중복 방지가 중요). 썸네일은 `thumbnail.png`가 있으면 건너뛴다([다시 만들기]로만 재생성). 패키지는 항상 다시 만든다(`upload-meta.json`이 최신 키를 가리켜야 하므로).
   - **워커 배치**: `tts`·`package`처럼 `thumbnail`도 `requires_ai: false`(OpenAI API 호출이라 Claude 구독이 필요 없다) — EC2 io 워커가 집는다. 따라서 `OPENAI_API_KEY`는 **EC2 `deploy/env.prod`**(와 io 작업도 집는 노트북 워커의 `.env`)에 둔다. 콘솔 `enqueueJob`의 `requires_ai` 분기와 워커 `index.ts`의 `["sweep","tts","package"]` 목록에 `thumbnail` 추가.
4. **패키지가 썸네일을 포함**: `upload-meta.json`에 `thumbnail_key`를 넣고, 업로드 화면(`/publish/upload?episode=`)이 그 키의 이미지를 미리 채운다(파일 선택은 교체용으로 남긴다). 업로드 시 제품 API의 썸네일 필드(`features/admin.md` 3.1, `thumb/*`)로 보낸다.
5. **상태·화면**: 에피소드 상세 상단에 세 단계 진행을 한 줄로(`TTS ✓ · 썸네일 진행 중 · 패키지 대기`). 썸네일 탭 신설: 이미지 미리보기(1024 원본과 44pt 축소본을 나란히 — 시인성 확인용) + [썸네일 다시 만들기]. 음원 탭의 기존 재생 UI 옆에 [음원 다시 변환]. 진행 중에는 세 버튼 모두 비활성.
5-1. **재발행과의 연결** (요청자 2026-09-10: "썸네일 교체도 재발행"): 지금 [재발행] 버튼은 음원의 최근 TTS 시각이 발행 시각보다 뒤일 때만 켜지고 오디오만 보낸다. 썸네일도 같은 규칙으로 넣는다 —
   - 활성 조건: `audioNewer || thumbnailNewer` (썸네일은 `thumbnail.png`의 S3 LastModified 또는 `runs` phase `thumbnail`의 최근 시각 vs `backlog.published_at`).
   - 버튼 문구: "재발행 — 오디오 교체" / "재발행 — 썸네일 교체" / "재발행 — 오디오·썸네일 교체". 누르면 새 파일만 골라 제품 `PATCH /admin/contents/:id`(spec/api/admin-api.md 4.10 — 썸네일 필드는 콘텐츠 상세 수정이 이미 쓰는 것)로 보내고 `content_version`이 오른다.
   - `publish_log`의 `parts`에 `"thumbnail"` 추가(지금 `["audio"]`). 재발행 이력에 "썸네일 교체"가 남는다.
   - 발행 전(packaged) 에피소드는 재발행 대상이 아니므로 업로드 화면이 최신 썸네일을 미리 채우는 4번 규칙으로 충분하다.
6. **문서**: spec/07 1장 순서에 썸네일 단계를 넣고(`qa_passed → TTS → 썸네일 → 패키지 → 게이트 2 → 업로드`), spec/06 또는 신규 spec 절에 썸네일 규격(크기·형식·프롬프트 자산·비용)을 적는다. spec/10 4장 큐 연쇄 표에 `tts→thumbnail→package` 추가. RUNBOOK 토글 표에 `OPENAI_API_KEY`·모델명 env.

## 결정해 둔 것 / 열린 것

- 버튼 이름 **[발행 준비]** (요청자 위임 → 제안). 다른 이름이 낫다면 바꿔도 된다.
- 순서는 요청자 지정: TTS → 썸네일 → 패키지. spec/07의 현행 순서(패키지 → 게이트 2 → TTS)와 다르므로 문서를 이 티켓대로 고친다.
- 프롬프트·규격(1:1 1024px)·대분류 색은 확정(요청자 2026-09-10 · 색 배정은 제안값, 설정 화면에서 조정 가능).
- **이미지 모델 (요청자 기준 2026-09-10: 품질보다 "한 번 생성으로 콘텐츠마다 일정하게")**: 2026-09 현재 API 후보와 1024×1024 1장 정가(제3자 계산기 기준, 담당자가 공식 가격표로 재확인):
  | 모델 | 1장 가격 | 비고 |
  |---|---|---|
  | `gpt-image-1-mini` | low $0.005 · medium $0.009 · high $0.052 | 가장 싸고 현행. **기본값 제안** (medium) |
  | `gpt-image-1.5` | low $0.009 · medium $0.013 · high $0.20 | 2026-12-01 제거 예정 — 신규 통합 비추천 |
  | `gpt-image-2` | 1K 약 $0.03 (해상도 과금; 계산기에 따라 $0.006~0.053) | 현행 플래그십, 참조 이미지 최대 16장. mini가 "사선 띠" 지시를 못 지키면 대체 |
  | `gpt-image-1` | — | 2026-10-23 종료. 쓰지 않는다 |
  DALL·E 2·3은 2026-05-12 API에서 제거됨. 월 100편이면 mini medium 기준 $1 미만.
- **일정하게 만드는 방법(재생성 루프 없이 1회 생성)**: OpenAI 이미지 API에는 seed가 없다. 대신 ① 프롬프트·규격·색 표를 고정하고 ② **스타일 앵커 이미지**를 참조로 넣는다 — 운영자가 첫 3~5편 중 마음에 드는 1장을 골라 `assets/thumbnail/anchor.png`(S3)로 지정하면, 이후 생성은 `images.edit`(참조 이미지) 경로로 "이 그림과 같은 화풍·구도·질감"을 붙여 만든다. 앵커 교체는 콘솔 설정 화면에서. ③ 생성은 편당 1회, 마음에 안 들면 [다시 만들기]만(자동 재시도 없음).
- OpenAI 키는 팀 공유(요청자 확정). 워커 `.env`의 `OPENAI_API_KEY`로만 전달·보관, 콘솔·레포에 넣지 않는다.
- **열린 것**: mini가 참조 이미지(edit) 경로에서 앵커 화풍을 얼마나 따르는지 — 첫 5편 실측 후 모델 확정(`runs`에 모델·비용이 남는다).

## 완료 조건

- Given `qa_passed`(또는 `packaged`) 에피소드 / When [발행 준비]를 누른다 / Then `tts` 작업이 큐에 들어가고, 완료되면 `thumbnail`, 완료되면 `package`가 자동으로 이어지며, 끝나면 상태가 `packaged`이고 `episodes.thumbnail_key`·`upload-meta.json.thumbnail_key`가 같은 S3 객체를 가리킨다.
- Given 생성된 `thumbnail.png` / When 업로드 화면을 연다 / Then 썸네일이 미리 채워져 있고 파일 선택 없이 업로드가 가능하다.
- Given 썸네일 단계가 실패(API 오류·키 없음) / When 에피소드 상세를 본다 / Then 실패 단계와 사유가 보이고 `package`는 시작되지 않는다. [발행 준비]를 다시 누르면 TTS는 건너뛰고 썸네일부터 재시도한다.
- Given 음원·썸네일·패키지가 모두 있는 에피소드 / When 썸네일 탭에서 [썸네일 다시 만들기]를 누른다 / Then `thumbnail`만 다시 실행되고(음원은 그대로) 끝나면 `package`가 자동으로 다시 만들어져 `upload-meta.json.thumbnail_key`가 새 객체를 가리킨다.
- Given 같은 에피소드 / When 음원 탭에서 [음원 다시 변환]을 누른다 / Then 대본이 바뀌지 않았어도 `tts`가 다시 실행되고 썸네일은 재생성되지 않으며 `package`만 따라온다.
- Given 이미 발행된(published) 에피소드 / When [썸네일 다시 만들기]가 끝난다 / Then 상세의 [재발행] 버튼이 "재발행 — 썸네일 교체"로 켜지고, 누르면 제품 콘텐츠의 썸네일만 바뀌며 `content_version`이 오르고 `publish_log`에 `parts: ["thumbnail"]`이 남는다.
- Given 썸네일 실행 / When `runs`를 조회한다 / Then phase `thumbnail` 행에 모델·비용이 기록돼 있다.
- Given 대본 완료 보고 / When 에피소드 행을 본다 / Then `one_liner`가 40자 이내로 채워져 있고, 상세 화면에서 고치면 다음 썸네일 생성과 `upload-meta.json`에 반영된다.
- Given 대분류 "돈·경제" 에피소드 / When 썸네일 프롬프트를 본다(`runs` 기록 또는 로그) / Then `{띠 색}`이 settings의 돈·경제 색(기본 딥 그린 #2F6B4F)으로 채워져 있다.
- Given 저장소 / When `git grep -i "sk-"`·`.env.example`을 본다 / Then OpenAI 키 실값이 없다.

## 진행 기록 ① (2026-09-10 — 썸네일 생성 단계만 선반영. **티켓은 pending 유지**)

요청 5개 중 **2번(썸네일 생성 단계 신설)만** 반영했다. 나머지는 아직이므로 티켓을 옮기지 않는다.

### 왜 2번부터 떼어냈나

**모델이 쓸 만한지가 아직 미결이기 때문이다.** 이 티켓의 "열린 것"이 그대로다 — `gpt-image-1-mini`가 참조 이미지(edit) 경로에서 앵커 화풍을 얼마나 따르는지, 사선 띠 지시를 지키는지는 **찍어 봐야 안다.** 안 되면 모델이 바뀌고, 그러면 비용·소요 시간이 달라져 1번 연쇄의 UI(진행 표시·비활성 조건)와 3번 건너뛰기 규칙도 같이 흔들린다.

그래서 **첫 5편을 찍어 볼 수 있는 최소 단위**까지만 만들었다: 생성 단계 + 수동 트리거 버튼 + 시인성 확인 화면.

### 반영한 것

- 워커 `stages/thumbnail.ts` — OpenAI 이미지 API로 1024×1024 PNG 1장. 프롬프트는 DB `prompt_assets`의 `skills/thumbnail/prompt.md`(thumb-v1)를 읽고 슬롯 4개를 채운다. `episodes.thumbnail_key` 기록, `runs`(phase `thumbnail`)에 모델·비용·소요 시간 계측
- `{띠 색}`은 settings `thumbnail.colors` → 없으면 코드의 thumb-v1 기본 8색. **코드에 사본을 둔 이유**: settings 행이 없는 최초 상태에서도 생성이 돌아야 첫 5편을 찍는다
- `{핵심 개념}`은 `episodes.one_liner` → 없으면 설계 축 → 후보 요약 순으로 대체(3-1의 구 에피소드 규칙)
- 스타일 앵커: `THUMBNAIL_ANCHOR_KEY`가 있으면 `images/edits`로 화풍을 참조, 없으면 그냥 생성
- 콘솔: 에피소드 상단 [썸네일 생성]/[썸네일 다시 만들기] + **썸네일 탭**(원본·156pt·72pt·**44pt**를 한 화면에 — 채택 판정 기준이 "44pt에서 알아보나"라 그 크기로 봐야 한다)
- 마이그레이션 `0018_thumbnail.sql` — **2026-09-10 팀 Supabase에 적용 완료**
- `requires_ai: false` + `claim_job`에 `p_can_thumbnail` 게이트(0010의 TTS와 같은 이유 — 키 없는 노트북 워커가 집으면 즉시 실패한다)

**과금 단계라 조용히 도는 경로를 없앴다**: 자동 재시도 없음 · 산출물 있으면 건너뜀(`force`로만 덮어씀) · 슬롯 미충족 시 중단 · 앵커 지정됐는데 파일 없으면 실패.

### 반영하지 않은 것 (남은 요청)

| 요청 | 상태 |
|---|---|
| 1. [발행 준비] 버튼 · `tts → thumbnail → package` 자동 연쇄 | **미착수** — 모델 확정 후 |
| 3-1. 대본 완료 보고에 `one_liner` 필드 | **미착수** (컬럼은 만들어 둠. 지금은 축·요약으로 대체 동작) |
| 3-2. 콘솔 설정 화면의 띠 색 편집 | **미착수** (settings 키는 읽고 있음. 기본값으로 동작) |
| 4. `upload-meta.json`에 `thumbnail_key` · 업로드 화면 미리 채우기 | **미착수** |
| 5-1. 재발행 — 썸네일 교체 · `publish_log.parts` | **미착수** (제품 API `PATCH /admin/contents/:id`는 이미 `thumbnail` 필드를 받는다 — 백엔드 작업 불필요 확인) |
| 6. spec/06·07·10 · RUNBOOK 갱신 | **미착수** — 연쇄 순서가 확정된 뒤 한 번에 |

### 다음에 집는 사람이 먼저 할 것

**첫 5편을 찍고 화풍·시인성을 눈으로 판정한다.** 그 결과에 따라 갈린다.

- **쓸 만하다** → 1장을 앵커로 지정(`THUMBNAIL_ANCHOR_KEY`)하고 1·4·5-1 연쇄 착수
- **화풍이 튄다** → `gpt-image-2`로 교체(`THUMBNAIL_MODEL`, 비용 약 3배)하고 다시 5편. 그래도 안 되면 프롬프트 자산(thumb-v2) 개정이 먼저다

`runs`의 phase `thumbnail` 행에 모델·비용·소요 시간이 남으므로 판단 근거는 거기서 본다.
