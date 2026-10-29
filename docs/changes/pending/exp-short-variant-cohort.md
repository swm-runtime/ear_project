# 짧은 판 코호트(KAN-298)를 계약·스키마 문서로 옮기기

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 5.1 `contents`(노출 조건) · 5.9 `series` · `spec/api/admin-api.md` 4.6 · 4.10 · 4.24 · 8장 `AdminContentItem` · `features/drip-scheduling.md` 4.2·4.8·7 · `features/explore.md` 노출 조건 · `backend/architecture.md` 9.1(access token 클레임) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 근거 티켓 `tickets/backend/pending/exp-short-variant-cohort.md`(KAN-298) |
| 중요도 | Low — 구현이 먼저 나갔고 이 문서가 그 기록이다 |

## 배경

단기 실험 ④ 짧은 판 코호트(KAN-298 — 파이프라인 쪽 KAN-296)의 BE 구현(마이그레이션 `1792100000000-AddContentLengthProfile` — PR #2147, 노출 분리 — 후속 PR)이 `contents`·`series`에 칸을 더하고 관리자 업로드·시리즈 만들기 계약에 필드를 더했으며, 가입 시점 코호트로 노출을 나눴다. 실험 기간의 계약 원본은 `spec/api/experiments-api.md` 4.3이다(그 절은 이번에 직접 썼다 — 티켓 지시). 문서는 통합 때 옮긴다(루트 `CLAUDE.md` — `changes/`).

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

### 7. `domain.md` 5.1 노출 조건 — 넷째 항(노출면만)

- 노출 조건 "published + 라이선스 유효 + `market = users.market`"에 **노출면(발견 경로)만** `length_profile = 사용자 코호트`가 붙는다(`content.visibility.ts` `contentExposureScope`, 저장소의 `applyVisibility`가 위치 인자로 **필수**로 받는다 — 새 조회는 넘길지 `null`일지 컴파일러가 묻는다).
- 코호트: 가입 시각 ≥ `SHORT_CONTENT_COHORT_SINCE`면 `short`, 아니면 `standard`. 설정이 비면 전원 `standard`(`content-cohort.policy.ts` · `ContentCohortService` 한 곳).
- 붙는 곳: 드립 후보(첫 드립·정규·탐험 — 시리즈 연속 편 포함), 탐색 피드·주제 목록·인기·새로 나온, 검색(키워드·의미·교정어·빈 결과 대체), 관련 콘텐츠 후보, 온보딩 추천, 시리즈 카드·같은 간행물의 다른 시리즈, 리텐션 알림 "듣던 콘텐츠"(같은 규칙의 SQL판 `cohortLengthProfileSql`).
- 붙지 않는 곳(단건·이미 가진 것): 상세·재생·서명 URL·대본·담기(`getPublishedById`), 시리즈 화면 편 목록, 관련 콘텐츠의 기준 편, 라이브러리 목록, 드립 시리즈 다음 편 판정의 편 상태 조회(대상 시리즈가 이미 코호트로 거른 풀에서 온다).

### 8. `drip-scheduling.md` 4.2(후보 필터)·4.8(탐험)·7(고갈)

- 후보 필터에 "사용자 코호트와 같은 길이 프로필(KAN-298)"을 더한다. 첫 드립의 인기 대체 편성도 같은 프로필 안에서만 고른다.
- **폴백 없음** — 짧은 판 재고가 없는 주제·사용자는 종전 고갈 규칙(그날 적립 건너뜀)을 따른다. standard로 대체하지 않는다.

### 9. `architecture.md` 9.1 — access token 클레임 `signed_up_at`

- access token에 가입 시각(epoch ms, `signed_up_at`)을 싣는다. 요청마다 `users`를 읽지 않고 코호트를 판정하기 위해서다(`market` 클레임과 같은 이유). **코호트가 아니라 가입 시각**을 실어 경계 설정 변경·롤백이 토큰 수명(30분)을 기다리지 않는다. 클레임이 없는 옛 토큰은 `standard`다.

### 10. `explore.md` · `features/README.md`

- 노출 조건에 코호트 항을 더하고, 주제 칩·주제 목록은 코호트로 거르지 않는다는 점(짧은 판이 없는 주제는 목록이 빈다)을 적는다.

## 완료 조건

- Given 위 문서들 / When 각 절을 읽으면 / Then 두 테이블의 칸·제약과 업로드·시리즈 만들기의 필드·400 표가 이 문서와 같고, 재발행이 두 필드를 받지 않는다고 적혀 있다
- Given `domain.md` 5.1 · `drip-scheduling.md` · `explore.md` / When 노출 조건을 읽으면 / Then 코호트 항이 걸리는 곳·안 걸리는 곳과 폴백 없음이 7·8·10과 같고, `architecture.md` 9.1에 `signed_up_at` 클레임이 있으며, `experiments-api.md` 4.3은 "통합됨"으로 표시되거나 지워져 있다

## 처리 기록

- 2026-10-29 발행(KAN-298 구현 PR #2147과 함께) · 같은 날 노출 분리 절(7~10) 추가(후속 PR).
