# 짧은 판 코호트(KAN-298)를 계약·스키마 문서로 옮기기

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 5.1 `contents` · 5.9 `series` · `spec/api/admin-api.md` 4.6 · 4.10 · 4.24 · 8장 `AdminContentItem` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 근거 티켓 `tickets/backend/pending/exp-short-variant-cohort.md`(KAN-298) |
| 중요도 | Low — 구현이 먼저 나갔고 이 문서가 그 기록이다 |

## 배경

단기 실험 ④ 짧은 판 코호트(KAN-298 — 파이프라인 쪽 KAN-296)의 BE 구현(마이그레이션 `1792100000000-AddContentLengthProfile`)이 `contents`·`series`에 칸을 더하고 관리자 업로드·시리즈 만들기 계약에 필드를 더했다. 문서는 통합 때 옮긴다(루트 `CLAUDE.md` — `changes/`).

## 고칠 내용

### 1. `domain.md` 5.1 `contents`

```
  length_profile            varchar(16)     NOT NULL DEFAULT 'standard'  standard | short  ★KAN-298 짧은 판 코호트
  variant_of_content_id     uuid            FK → contents, NULL 허용 — 짧은 판의 원본 콘텐츠

ck_contents_length_profile      CHECK (length_profile IN ('standard','short'))
ck_contents_variant_of_content  CHECK (variant_of_content_id IS NULL OR (length_profile = 'short' AND variant_of_content_id <> id))
fk_contents_variant_of_content  variant_of_content_id → contents.id  ON DELETE RESTRICT
```

- `short`는 기존 발행 편의 주제를 재활용해 5~12분으로 다시 만든 **짧은 판**이다(파이프라인 KAN-296). 원본은 늘 `standard`다(변형의 변형 없음 — 업로드가 본다. 행 사이 조건이라 CHECK로 못 건다).
- `short` 단편은 원본이 필수, 짧은 시리즈의 편은 원본 시리즈의 같은 화(없으면 NULL), `standard`는 늘 NULL(CHECK).
- 시리즈 편의 `length_profile`은 `series.length_profile`과 같다(업로드가 맞춘다).
- 인덱스 없음 — 노출 필터는 기존 `(market, status, published_at)` 위에서 거르는 값 2개짜리 조건이고, 원본으로 변형을 찾는 질의가 아직 없다.

### 2. `domain.md` 5.9 `series`

```
  length_profile        varchar(16)   NOT NULL DEFAULT 'standard'  standard | short  ★KAN-298
  variant_of_series_id  uuid          FK → series, NULL 허용 — 짧은 시리즈의 원본 시리즈

ck_series_length_profile     CHECK (length_profile IN ('standard','short'))
ck_series_variant_of_series  CHECK (variant_of_series_id IS NULL OR (length_profile = 'short' AND variant_of_series_id <> id))
fk_series_variant_of_series  variant_of_series_id → series.id  ON DELETE RESTRICT
```

- 만든 뒤 바꾸지 않는다(`PATCH /admin/series/:id`는 이 칸을 받지 않는다).

### 3. `admin-api.md` 4.6 `POST /admin/contents` — `payload` 필드 둘

```jsonc
  "length_profile": "standard" | "short",   // 선택. 생략하면 단편은 standard, 시리즈 편은 시리즈의 값
  "variant_of_content_id": "uuid"           // short 단편이면 필수 · 짧은 시리즈 편이면 원본 시리즈의 같은 화(선택) · standard면 넣지 않는다
```

| 조건 | `details.field` |
|---|---|
| `short` 단편인데 `variant_of_content_id` 없음 | `variant_of_content_id` |
| `standard`인데 `variant_of_content_id` 있음 | `variant_of_content_id` |
| 원본 콘텐츠가 없다 | `variant_of_content_id` |
| 원본이 이미 짧은 판(`short`)이다 | `variant_of_content_id` |
| 시리즈 편인데 `length_profile`이 `series.length_profile`과 다르다 | `length_profile` |

- 전부 400 `VALIDATION_FAILED`, **저장소에 파일을 올리기 전에** 거절한다. 원본의 상태(회수·만료)는 보지 않는다.
- 파이프라인 `upload-meta.json`의 `length_profile`은 그대로, `remake_of_content_ref`(원본 제품 content_id)는 **`variant_of_content_id`로 이름을 바꿔** 보낸다.
- 감사 로그 `content.upload`의 `after`에 `length_profile`·`variant_of_content_id`가 남는다.

### 4. `admin-api.md` 4.10 재발행

- **두 필드를 받지 않는다**(보내면 종전 모르는 필드와 같은 400) — `series_*`·`origin`과 같은 발행 단위의 정체성이다. 바꾸려면 회수하고 새로 올린다. 재발행은 기존 값을 그대로 둔다. *(티켓 본문의 "및 재발행"은 이렇게 풀었다 — 짧은 판도 재발행으로 오디오·메타를 갈아끼울 수 있고 프로필은 유지된다.)*

### 5. `admin-api.md` 4.24 `/admin/series`

- `POST /admin/series` 본문에 `length_profile`(선택, 기본 `standard`)·`variant_of_series_id`(`short`면 필수, `standard`면 넣지 않는다). 원본 시리즈가 없거나 이미 `short`면 400 `VALIDATION_FAILED`(`details.field = "variant_of_series_id"`).
- `AdminSeriesItem`에 `length_profile`·`variant_of_series_id`. 감사 로그 `series.create`·`series.update` 스냅숏에도 같은 두 키.

### 6. `admin-api.md` 8장 `AdminContentItem`

- `length_profile`(`standard` | `short`) · `variant_of_content_id`(uuid | null)를 더한다.

## 완료 조건

- Given 위 문서들 / When 각 절을 읽으면 / Then 두 테이블의 칸·제약과 업로드·시리즈 만들기의 필드·400 표가 이 문서와 같고, 재발행이 두 필드를 받지 않는다고 적혀 있다

## 처리 기록

- 2026-10-29 발행(KAN-298 구현 PR과 함께).
