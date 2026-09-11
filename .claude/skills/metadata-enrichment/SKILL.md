---
name: metadata-enrichment
description: 발행 준비된 콘텐츠의 대본에서 추천 메타 5종(difficulty·format·is_evergreen·keywords·target_audiences)을 판정해 enrichment.json(schema_version 2)을 만들 때 사용 — origin(파트너/AI 생성) 무관 전 콘텐츠 대상, 기존 발행분 재부여 포함. 임베딩(Phase B)은 모델 확정 전까지 생략
arguments: [script-path]
argument-hint: [대본 파일 경로 — 생략 시 대본 텍스트나 위치를 사용자에게 요청]
---

# 메타데이터 부여 — 대본에서 enrichment.json까지

명세는 [`docs/ai/metadata-pipeline.md`](../../../docs/ai/metadata-pipeline.md)다. **이 스킬은 그 명세의 구현이며, 명세와 어긋나면 스킬이 틀린 것이다.** 규칙을 바꿔야 하면 명세를 먼저 고친다.

> **현재 범위 — Phase A + C만.** 임베딩(Phase B)은 모델·차원 미결(`domain.md` 15.1 #11)로 생략한다(명세 4.3). 산출물에 `embedding` 키를 넣지 않는다. 모델 확정 후 이 스킬에 Phase B 절차가 추가된다.

## 원칙

- **판정은 대본 근거로만 한다.** 대본 밖 지식으로 값을 보강하지 않는다. 대본에 없는 개념은 키워드에 넣지 않는다(FR-09의 부여판).
- **지어내지 않는다.** 판정 불능이면 해당 키를 생략한다 — 잘못된 값보다 결손이 낫다. 결손은 스코어링 중립 처리와 운영 콘솔 "추천 입력 결손"으로 회수된다.
- **enum은 `domain.md` 5.1과 글자 단위로 일치한다.** 어긋난 산출물은 내지 않고 실패로 처리한다 — 업로드 검증까지 가기 전에 이 절차가 막는다.
- **DB에 쓰지 않는다.** 산출물은 파일뿐이다. 저장은 관리자 업로드가 한다.
- 커밋·푸시는 하지 않는다.

## 필요한 도구

`Read`(대본·입력) · `Write`(초안 산출) · `Bash`(`python3` — [`scripts/finalize.py`](scripts/finalize.py)로 정규화·검증).

## 절차

### 1. 입력 수집

명세 3장의 입력값을 모은다. 하나라도 없으면 사용자에게 요청한다 — 짐작으로 채우지 않는다.

| 값 | 확인 |
|---|---|
| script | `$script-path` 인자의 파일. AI 생성이면 `runs/.../script-{n}.md`, 파트너면 전달받은 대본·원문 텍스트 |
| title · description | 콘텐츠 제목·설명. AI 생성이면 같은 runs 디렉토리의 `upload-meta.json`에서 읽는다 |
| topic_names[] | 부여된 주제 — 키워드가 주제의 단순 반복이 되지 않게 대조용 |
| origin | `partner` / `ai_generated` |
| job_categories[] · years_ranges[] | 청자 판정의 값 집합 — 직군은 `backend/src/modules/user/user.constant.ts`의 `JOB_CATEGORIES`(`GET /job-categories`와 동일), 연차 구간은 `0-1 · 2-3 · 4-6 · 7+`. **이 목록 밖의 값을 만들지 않는다** |

- **대본이 없는 파트너 콘텐츠**면 5장의 폴백으로 간다.
- **시리즈(여러 편)면 편 단위로 각각 실행한다.** 시리즈 공통 산출물은 만들지 않는다 — 스코어링 단위가 콘텐츠 행이다.

### 2. 메타 판정 (Phase A)

[`reference/judgment-criteria.md`](reference/judgment-criteria.md)를 읽고 대본 전문을 근거로 5종을 판정한다.

| 항목 | 값 집합 |
|---|---|
| `difficulty` | `beginner` \| `intermediate` \| `advanced` — 판정 불능이면 키 생략 |
| `format` | `news_analysis` \| `howto` \| `interview` \| `opinion` \| `case_study` \| `overview` — 혼합이면 분량 기준 지배 형식 하나 |
| `is_evergreen` | `true` \| `false` |
| `keywords` | 대본에 실제로 다뤄진 세부 개념의 명사구 3~8개. 주제명 반복 금지 — 주제보다 잘게 잡는 것이 존재 이유다 |
| `target_audiences` | 이 대본이 맞는 청자 — `{ job_category, years_of_experience }` 1~8세트, 복수 가능. 값은 1단계 값 집합 안에서만. **직군·연차 무관한 범용 대본이면 키 생략**(억지로 좁히지 않는다 — 소폭 가점 항목이라 없어도 불리하지 않다). 신설 2026-09-11 |

- 각 판정에 **대본의 어느 대목이 근거인지** 한 줄씩 함께 남긴다(4단계 보고용). 근거를 못 대는 판정은 판정 불능이다.
- 키워드가 3개 미만으로 나오면 억지로 채우지 않는다 — 나온 만큼만(1~2개 허용), 0개면 키 생략.

### 3. 산출·검증 (Phase C)

1. 판정 결과를 대본과 같은 디렉토리에 `enrichment.draft.json`으로 쓴다. 형식은 [`templates/enrichment.example.json`](templates/enrichment.example.json) — **`schema_version: 2`를 항상 넣고**, 판정 불능 키는 넣지 않는다.
2. 검증 스크립트를 돌린다:

   ```bash
   python3 .claude/skills/metadata-enrichment/scripts/finalize.py \
     enrichment.draft.json -o enrichment.json --topics "주제1,주제2"
   ```

   스크립트가 하는 일: 키워드 **NFC 정규화 + 공백 정리**(사용자 간 가중치 집계가 문자열 일치로 묶인다 — 명세 4.2) → enum 글자 일치·형식 검증 → 통과 시 `enrichment.json` 확정, 실패 시 산출물 없이 종료.
3. **검증 실패면 값을 고쳐서 재판정한다.** 스크립트를 우회하거나 enum에 맞춰 보이는 값을 임의로 끼워 넣지 않는다. 판정이 정말 안 되는 항목이면 키를 빼고 다시 돌린다.
4. 확정 후 `enrichment.draft.json`은 지운다.

### 4. 보고

사용자에게 남긴다:

- 산출 파일 경로와 내용 요약(5종 값 + 키워드·청자 세트 목록)
- 각 판정의 근거 한 줄
- 생략한 키와 사유(판정 불능·폴백 등) — 생략이 있으면 **partial 상태**임을 명시
- 다음 단계 안내: 관리자 업로드 화면의 **추천 메타 파일 입력**(`admin.md` 3.1)에 첨부. 개별 필드 수동 입력 경로는 없다

AI 생성 콘텐츠의 `upload-meta.json`과는 **별개 파일**로 둔다 — 실행 시점·재실행 주기가 다르다(재발행·모델 교체는 대본 재작성 없이 이 파일만 다시 만든다).

## 5. 폴백 — 대본이 없는 콘텐츠

파트너 콘텐츠 중 대본 텍스트를 확보하지 못한 경우(명세 4.5):

- `keywords`는 **제목 + 설명**으로 산출하고, 산출물에 `"source": "title_description"`을 명시한다 — 대본 기반과 품질이 다르다는 사실을 숨기지 않는다.
- `difficulty` · `format`은 제목·설명만으로는 판정이 얕다 — **판정 불능이면 비운다.** 지어내지 않는다.
- `is_evergreen`은 제목·설명으로 판정 가능한 경우가 많다 — 가능하면 판정하고, 불능이면 비운다.

## 예외 상황 (명세 7장)

| 상황 | 처리 |
|---|---|
| enum에 없는 값이 나옴 | 산출물을 내지 않고 실패 처리 — 재판정 |
| 키워드 3개 미만 | 나온 만큼만 낸다(1~2개 허용) · 0개면 키 생략 |
| 시리즈 대본 | 편 단위 각각 실행 |
| 재발행인데 대본 무변경(오디오·썸네일만 교체) | 재실행 생략 가능 — 임베딩 `content_version` 갱신은 서버 몫(미결) |
| **기존 발행분 재부여**(형식 버전이 올라갔거나 메타가 없음) | 대본으로 이 스킬을 그대로 실행해 `enrichment.json`을 만들고, 관리자 콘솔 재발행에서 **`enrichment_file`만** 첨부한다(`admin-api.md` 4.10 — 버전 무변경·재생 위치 보존). 대상은 어드민 목록의 `enrichment_schema_version`이 2 미만 또는 null인 콘텐츠 |

## Phase B — 임베딩 (모델 확정 후 추가)

이 절은 자리 표시다. `domain.md` 15.1 #11(모델·차원) 확정 후 다음을 이 스킬에 추가한다:

- 대본 전문 임베딩 — 입력 한도 초과 시 청크 분할 → 각각 임베딩 → **평균 → 정규화**(코사인 유사도 전제)
- 산출물의 `embedding: { model, vector }` — 모델 식별자 없는 벡터는 만들지 않는다
- 임베딩 API 장애 시 메타 4종만 산출하고 `embedding` 키 생략(partial) — 복구 후 재실행하면 임베딩만 채워진다
- 기존 발행분 소급 부여의 일괄 실행

검증 스크립트는 `embedding` 키의 형식 검증을 이미 지원한다 — Phase B 추가 시 스크립트 수정은 불필요하다.
