# 검색 의미 엔진에 제목 임베딩(`content_title_embeddings`) 추가 — 스키마·동작 문서 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 2장 모듈 표(`content` 행) · 5.1 검색 인덱스 절 "의미 엔진" 줄 · 5.6 소비처 · **5.6-1 신설** · 결정 요약 표 "검색 오타 교정·하이브리드" 행 · `features/explore.md` 4.5-5 "의미 엔진" 줄 · `backend/architecture.md` 1장 임베딩 경계 줄 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 다음 통합 때 |
| 선행 | 없음 — 코드 반영 PR `feat(be)/search-title-embeddings` |
| 관련 | KAN-238(하이브리드 검색) · 측정 스크립트 `backend/scripts/measure-search-embeddings.js` |

## 배경

KAN-238 하이브리드 검색의 의미 엔진은 질의 벡터를 **대본 전문** 벡터(`content_embeddings`)와 비교했다. 대본 벡터는 대본을 여러 조각으로 나눠 임베딩한 뒤 평균한 값이다. 짧은 질의("이직"·"수면"·"인플레이션")와 견주면 코사인이 0.2~0.3대에 몰린다. 그래서 하한 0.3 근처에서 관련 편과 무관한 편이 갈리지 않았다("이직" → 경상수지·나라살림, "인플레이션" → CS 지식 시리즈).

2026-10-22 개발계에서 실측했다. 대상은 발행 편 199개, 질의는 30개(짧은 말 25 · 문장 5)이고, 관련성 라벨은 제목·주제로 판정했다. 결과는 다음과 같다.

| 비교 대상 | 쌍 단위 최고 F1(그때 하한) | 짧은 질의 P@5 | 짧은 질의 top1 관련 |
|---|---|---|---|
| A. 대본 전문(현행) | 0.263 (0.34) — 현행 하한 0.30에서는 0.224, 정밀도 0.16 | 0.30 | 16/25 |
| B. 제목 | **0.450 (0.34)** — 정밀도 0.51 | **0.37** | **19/25** |
| C. 제목 + 설명 + 태그 | 0.388 (0.34) | 0.35 | 18/25 |
| D. max(A, C) | 0.373 (0.38) | 0.37 | 17/25 |
| E. max(A, B) | 0.409 (0.40) | 0.36 | 17/25 |
| **채택: B ≥ 0.34 또는 A ≥ 0.45** | **0.454** | 결과가 있는 질의 기준 0.72 (현행 0.54) | 16/25 (현행 13/25) |

이 결과로 질의를 **제목 벡터**와 비교하는 구조를 택했다. 대본 벡터는 아주 가까울 때(0.45 이상)만 더한다. 측정 출력과 질의별 표는 코드 PR 본문에 있다.

## 수정 내용

### `backend/domain.md`

- **5.6-1 `content_title_embeddings` 신설** (5.6 바로 뒤):

  ```
  content_title_embeddings
    id                        uuid            PK
    content_id                uuid            FK → contents (CASCADE)
    embedding                 vector(1536)    contents.title의 임베딩 — 5.6과 같은 모델·차원·정규화
    model                     varchar(100)    생성 모델 식별자 — 질의 벡터와 같은 모델 행만 비교
    source_text               varchar(255)    임베딩한 글자 그대로(= 그때의 contents.title) — 지금 제목과 다르면 낡은 행

  uq_content_title_embeddings_content_id (content_id)
  ```

  - 소비처는 **탐색 검색 의미 엔진뿐이다**(`explore.md` 4.5-5). 추천 스코어링·관련 콘텐츠·관리자 "현행 임베딩" 표시는 5.6만 읽는다.
  - **생성 주체는 서버다**(5.6과 다르다). 발행(`upload`)·재발행(`republish`) 트랜잭션이 **커밋된 뒤** 백엔드가 AI 서버 `POST /embeddings`를 불러 만든다. 최선 노력이라, 실패하면 행이 없고 발행·재발행은 그대로 성공한다. 기존 편과 실패한 편은 백필(`node dist/scripts/backfill-title-embeddings.js`)이 채운다. 백필은 멱등이고 요청 간격이 기본 200ms다.
  - **유효 조건 = `model` 현행 AND `source_text` = `contents.title`.** 5.6처럼 `content_version`으로 대조하지 않는다. 제목만 바꾸는 재발행은 버전을 올리지 않으므로(KAN-236) 버전 대조로는 낡은 벡터를 가리지 못한다. 재발행 훅은 제목이 같으면 AI 서버를 부르지 않는다.
  - **5.6에 `kind` 열을 넣지 않고 표를 나눈 이유**: 5.6은 추천 스코어링·관련 콘텐츠·관리자 표시·개발계 동기화가 모두 "콘텐츠당 1행"으로 읽는다. 종류 열을 넣으면 그 읽기 전부에 조건을 더해야 하고, 하나라도 빠지면 제목 벡터가 추천 축에 섞인다. 유효 조건도 서로 다르다(버전 대조 vs 글자 대조).
  - 설명·태그는 넣지 않는다. 실측(위 표 C)에서 제목 단독보다 낮았다. 넣게 되면 `source_text`에 넣은 글자 전체를 담으면 같은 규칙이 성립한다.
  - ANN 인덱스는 두지 않는다(5.6과 같은 판단 — 전수 코사인, 수천 편 상한).
  - 개발계 동기화 표 목록(`deploy/sync-content-*.sh`)에 들어간다. 동기화로 들어온 편은 발행 훅을 타지 않고, 제목이 운영과 같으므로 운영 벡터가 그대로 유효하다.
- **5.6 소비처** "탐색 검색 의미 엔진" 항목 끝에 다음을 더한다. "**제목 벡터(5.6-1)와 함께 본다** — 제목 벡터가 있는 편은 대본 벡터를 하한 0.45로, 없는 편은 종전 0.3으로 본다(2026-10-22)."
- **5.1 검색 인덱스 절** "의미 엔진" 줄: "`content_embeddings`(5.6)를 읽는다"를 "`content_title_embeddings`(5.6-1)와 `content_embeddings`(5.6)를 읽는다"로 바꾼다. "이 표에 컬럼을 더하지 않는다"는 그대로 둔다.
- **2장 모듈 표** `content` 행에 `content_title_embeddings`를 더한다.
- **결정 요약 표** "검색 오타 교정·하이브리드" 행: "임베딩 코사인(`content_embeddings` 전수, ANN 없음)"을 "임베딩 코사인(제목 `content_title_embeddings` · 대본 `content_embeddings` 전수, ANN 없음)"으로 바꾼다. 참조 칸에 5.6-1을 더한다.

### `features/explore.md` 4.5-5 "의미 엔진" 줄

다음으로 바꾼다.

> **의미 엔진**: `query_used`의 임베딩(AI 서버 `POST /embeddings`, 저장 벡터와 같은 모델)을 **제목 벡터**(`content_title_embeddings` — `domain.md` 5.6-1)와 **대본 벡터**(`content_embeddings`) 둘에 견준다. 제목 코사인이 제목 하한 이상이거나, 대본 코사인이 대본 하한 이상이면 맞음이다. 대본 하한은 그 편에 유효한 제목 벡터가 있으면 높게, 없으면 종전 값이다. 순서는 하한을 넘은 폭이고, 상위 K. 대본 벡터는 `model` 현행·`content_version` 일치 행만, 제목 벡터는 `model` 현행·`source_text` = 지금 제목인 행만 쓴다. 두 벡터가 다 없는 콘텐츠는 이 엔진에서 빠진다. *(개정 2026-10-22 — 짧은 질의와 대본 전문 벡터의 코사인이 0.2~0.3대에 몰려 소음이 됐다. 실측과 하한 값은 서버가 소유한다.)*

4.5-5 "합산 = RRF" 줄의 "**k·임계값·K는 서버 구현이 소유한다**"는 그대로다. 임계값이 둘(제목·대본)이 되었을 뿐이고 계약에는 값을 적지 않는다.

### `backend/architecture.md` 1장 임베딩 경계 줄

"Backend가 부르게 되는 것은 재발행·소급·모델 교체의 일괄 재생성 시점이다" 뒤에 다음을 더한다. "**검색 제목 임베딩**(domain.md 5.6-1)은 Backend가 발행·재발행 커밋 뒤와 백필에서 부른다(2026-10-22)."

### 바꾸지 않는 것

- `spec/api/explore-api.md`: 응답 모양(`engines`·`items[].matched_by`)·커서(`v: 2`)·`related` 판정이 그대로라 고칠 곳이 없다. 4.5 "정렬" 단락은 k·임계값을 `explore.md`·서버에 맡기고 재정의하지 않는다.
- `spec/api/player-api.md` 4.8 관련 콘텐츠: 대본 대 대본 비교 그대로다.

## 완료 조건

- Given `domain.md` / When 5.6-1을 읽는다 / Then `content_title_embeddings`의 열·유니크 키, 유효 조건(`model` + `source_text` = 제목), 생성 주체(서버 — 커밋 뒤 최선 노력·백필), 5.6과 표를 나눈 이유가 적혀 있다
- Given `domain.md` 5.1 "의미 엔진" 줄·5.6 소비처·2장 모듈 표·결정 요약 표 / Then 모두 `content_title_embeddings`를 함께 가리킨다
- Given `explore.md` 4.5-5 "의미 엔진" 줄 / When 읽는다 / Then 질의를 제목 벡터와 대본 벡터 둘에 견주고, 제목 벡터 유무에 따라 대본 하한이 달라지며, 하한 값은 서버가 소유한다고 적혀 있다
- Given `architecture.md` 1장 / Then Backend가 제목 임베딩을 위해 AI 서버를 부르는 시점(발행·재발행 커밋 뒤, 백필)이 적혀 있다

## 처리 기록

- 2026-10-22 발행. 코드: 마이그레이션 `1791650000000-AddContentTitleEmbeddings`, `ContentTitleEmbeddingService`(`refresh` — 발행·재발행 훅, `backfill`), `TextEmbeddingClient`(타임아웃 10초 · 캐시 없음), `ContentRepository.findHybridSearchPage`의 의미 CTE, 상수 `SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY = 0.34` · `SEARCH_SEMANTIC_SCRIPT_MIN_SIMILARITY_WITH_TITLE = 0.45`, 백필 `src/scripts/backfill-title-embeddings.ts`, 동기화 표 목록. 단위 테스트(`content-title-embedding.service.spec.ts` · `text-embedding.client.spec.ts` · `admin-content.service.spec.ts` "제목 임베딩 훅")와 E2E(`test/search-title-embeddings.e2e-spec.ts`)를 붙였다(BE — 브랜치 `feat(be)/search-title-embeddings`).
