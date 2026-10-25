# 관리자 API 명세서

> 기준 문서: [`docs/features/admin.md`](../../features/admin.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md) 9.10
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 4.1 · 5.1 · 5.5
> 연관: [`features/partner-control.md`](../../features/partner-control.md) 4.4(라이선스 만료 거부)

작성: 2026-09-03 (구현 계약 등재 — `changes/archive/admin-web-console.md`) · 2026-09-07 4.10 재발행 등재·구현(`tickets/backend/archive/content-republish-audio.md`) · 2026-09-18 4.16 편성 미리보기 등재 · 2026-10-01 4.17 추천 테스트(구현 2026-09-29) · 4.20 일일 지표 수동 트리거(구현 2026-09-29) 등재 · 2026-10-02 4.20 삭제

## 1. 범위

`admin.md`가 정의한 운영 동작 중 **현재 구현된 것**을 HTTP 계약으로 옮긴 문서다.

- 주제 관리 — 목록·생성·수정·삭제 (FR-38, `admin.md` 4.5)
- 콘텐츠 목록 조회
- 콘텐츠 업로드 → 즉시 발행 (FR-37, `admin.md` 4.2)
- 콘텐츠 **회수·복구** (FR-32, `admin.md` 4.4)
- 콘텐츠 **재발행** — 오디오·메타 교체, **오디오를 바꾸면** `content_version` 증가 (`admin.md` 4.3)
- **편성 미리보기** — 추천 검증 콘솔용 읽기 전용 계산 (`drip-scheduling.md` 4장·5장 "편성 품질", 2026-09-18)
- **추천 테스트** — 테스트 계정 한 명에 행동을 대신 수행하는 **개발계 전용·쓰기 있는** 경로 (`admin.md` 4.7, 2026-09-29)
- **대본(자막) 적재** — 업로드·재발행의 `script_file` 파트 → `content_scripts` (FR-25, KAN-71, 2026-09-19)

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `admin.md`가 기준이며, 스키마는 `domain.md`가 유일한 기준이다.

**이 문서는 구현이 먼저 나온 뒤 작성됐다.** `backend/CLAUDE.md` 6장 3항("api 문서가 없으면 만들지 말고 물어본다")에 어긋난 경로였고, 그 사실을 `changes/`로 보고한 뒤 이 문서로 등재했다. 이후 계약 변경은 이 문서가 먼저다.

**다루지 않는 것** — 아직 구현되지 않았다. 필요해지면 이 문서에 절을 더한다.

| 미구현 | 사유 |
|---|---|
| 운영 현황 조회 (`admin.md` 4.6) | |

> ~~스크립트 업로드~~ — **구현(2026-09-19, KAN-71)**: 4.6·4.10의 `script_file` 파트.

> **회수·복구는 발행 요청서가 "범위 밖"으로 적었으나 그 뒤 구현됐다**(코드 대조 2026-09-03). 4.7·4.8로 등재한다.

## 2. 공통 규약

- 모든 라우트에 `Authorization: Bearer <access_token>`이 필요하고, **`users.role == 'admin'`이어야 한다.** 아니면 401(토큰 문제) 또는 403 `FORBIDDEN`(권한 문제)다.
- **UI 은닉에 의존하지 않는다**(`admin.md` 2장·4.1). 콘솔이 버튼을 감추는 것과 무관하게 서버가 매 요청 판정한다.
- 응답 본문·오류 규격은 `common-error-handling.md` 6장의 `ApiError`를 따른다.
- 검증 실패(400 `VALIDATION_FAILED`)는 **`details.field`에 문제 필드명을 싣는다.** 콘솔이 필드별 인라인 오류로 표시하기 때문이다(`admin.md` 5장).

## 3. 엔드포인트 목록

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/admin/topics` | 주제 목록 (콘텐츠 건수 포함) |
| POST | `/admin/topics` | 주제 생성 |
| PATCH | `/admin/topics/:topicId` | 주제 수정 |
| DELETE | `/admin/topics/:topicId` | 주제 삭제 |
| GET | `/admin/contents` | 콘텐츠 목록 + 현재 추천 메타 형식 버전 (4.5) |
| POST | `/admin/contents` | 콘텐츠 업로드 → 즉시 발행 |
| POST | `/admin/contents/:contentId/withdraw` | 콘텐츠 회수 |
| POST | `/admin/contents/:contentId/restore` | 회수 복구 |
| PATCH | `/admin/contents/:contentId` | 재발행 — 오디오·메타 교체, **오디오를 바꾸면** `content_version` 증가 (4.10) |
| DELETE | `/admin/contents/:contentId/storage` | 저장소 파일 회수 — 회수된 콘텐츠의 오디오·썸네일 삭제 (4.11) |
| GET | `/admin/notices` | 공지 목록 — 초안·예약 포함, 작성 최신순, 커서 (4.12) |
| POST | `/admin/notices` | 공지 작성 — `published_at` 없으면 초안 (4.13) |
| PATCH | `/admin/notices/:noticeId` | 공지 부분 수정 — `published_at: null`은 발행 취소 (4.14) |
| DELETE | `/admin/notices/:noticeId` | 공지 삭제(soft) (4.15) |
| GET | `/admin/system-stats` | 서버 자원·DB 부하 스냅샷 (로그 콘솔 대시보드 — 옛 서버 상태 탭, 2026-10-08 통합) |
| GET | `/admin/drip/preview` | 편성 미리보기 — 지금 데이터로 배치를 돌리면 갈 정규·탐험 편성분과 점수 분해, 읽기 전용 (4.16) · 가명 `user_id`로 조회, 열람 감사 로그(2026-10-22) |
| GET | `/admin/recommend-test/account` | 추천 테스트 계정 상태 — 환경·계정·관심 주제·라이브러리. **개발계 전용** (4.17) |
| GET | `/admin/recommend-test/feed` | 추천 테스트 계정의 탐색 피드 — `explore-api.md` 4.1과 같은 본문 (4.17) |
| POST | `/admin/recommend-test/actions` | 추천 테스트 계정에 행동 수행 — `play` `complete` `save` `unsave` `delete` `replay`. **쓰기 있음** (4.17) |
| PUT | `/admin/recommend-test/interests` | 추천 테스트 계정의 관심 주제 전체 교체 (4.17) |
| PUT | `/admin/recommend-test/career` | 추천 테스트 계정의 커리어 교체 (4.17) |
| POST | `/admin/recommend-test/reset` | 추천 테스트 계정의 소비 이력 전부 삭제 (4.17) |
| POST | `/admin/recommend-test/first-drip` | 추천 테스트 계정의 첫 드립 다시 실행 (4.17, 2026-10-13) |
| GET | `/admin/recommend-eval/snapshot` | 추천 평가 스냅샷 내보내기 — 발행 콘텐츠·익명 사용자 행동, 읽기 전용 (4.18) |
| GET | `/admin/drip-feedback/versions` | 추천 알고리즘 버전별 별점 — 편성 수·평가 수·평균·분포, 버전 역순 (4.19) |
| GET | `/admin/search-query-logs/summary` | 검색 질의 로그 요약 — 미스율·일별 추이·0건 질의·상위 질의, 읽기 전용 (4.21) |
| GET | `/admin/insights/summary` | 서비스 지표 요약 — 가입·탈퇴·활성 사용자·청취 시간·완청률·사용자/콘텐츠 순위·리텐션·탈퇴 사유, 읽기 전용 (4.22) |
| GET | `/admin/insights/recommendations/users` | 추천 검증 후보 사용자 — `user_id`와 행동 수치만, 청취 순·최근 순, 읽기 전용 (4.22-1, 2026-10-22) |
| GET | `/admin/insights/recommendations/users/:userId` | 추천 검증 상세 — 프로필·관심 주제·청취·편성 이력·현재 시점 추천 재계산, 읽기 전용 · 감사 로그 (4.22-1) |
| GET · POST | `/admin/invite-codes` | 초대 코드 목록(사용 현황 포함)·만들기 (4.23, 2026-10-10) |
| PATCH | `/admin/invite-codes/:inviteCodeId` | 초대 코드 고치기 — 이름·켜기/끄기·한도·입력 기간만 (4.23) |
| GET · POST | `/admin/series` | 시리즈 목록(편 현황 포함)·만들기 (4.24, 2026-10-17 — KAN-134) |
| PATCH | `/admin/series/:seriesId` | 시리즈 고치기 — 제목·소개·총 편수·상태 (4.24) |
| PUT | `/admin/series/:seriesId/cover` | 시리즈 표지 올리기·교체 — multipart `cover` (4.24, 2026-10-21 — KAN-234) |

## 4. 엔드포인트 상세

### 4.1 `GET /admin/topics`

쿼리 `market`(선택, `kr` | `global`) — 그 시장 주제만 준다. 없으면 전 시장(종전과 같음). 그 밖의 값은 400 `VALIDATION_FAILED`(추가 2026-10-21 — KAN-237, 4.5 `market` 필터와 같은 방식).

```jsonc
// 200
{ "items": [
  { "id": "...", "name": "생산성", "parent_category": "자기계발", "slug": "productivity", "market": "kr",
    "is_visible": true, "display_order": 1, "content_count": 12, "visible_content_count": 10 }
] }
```

- **`content_count`는 조회 시 집계한다.** `topics`에 컬럼을 두지 않는다 — 파생값이라 컬럼과 집계가 어긋날 수 있다(`admin.md` 4.5).
- **`content_count`는 원시 연결 건수**(회수·만료 포함 — 4.4 삭제 판정), **`visible_content_count`는 노출 가능 건수**(`published` + 라이선스 미만료 — 4.3 노출 판정)다(추가 2026-09-17, KAN-58). 콘솔은 `is_visible = false`이고 `visible_content_count = 0`인 주제의 노출 켜기를 비활성으로 그린다.
- **`slug`**(string | null)는 주제 이미지 매핑 키다(`global-api.md` 4.5). 아직 채우지 않은 주제는 `null`(추가 2026-10-14 — KAN-189).
- **`market`**(`kr` | `global`)은 주제의 시장이다(4.2 — 생성 후 바뀌지 않는다). 콘솔은 이 값으로 국내·글로벌 주제를 가른다(추가 2026-10-21 — KAN-237). 4.2·4.3 응답 항목에도 같은 값이 실린다.

### 4.2 `POST /admin/topics`

```jsonc
{ "name": "생산성", "parent_category": "자기계발", "display_order": 1, "market": "kr", "slug": "productivity" }  // display_order · market · slug 선택
```

201로 4.1의 항목 한 건을 반환한다. **`is_visible`은 `false`로 고정 생성된다** — 요청으로 받지 않는다(`admin.md` 4.5 — 콘텐츠 수급 후 노출을 시작한다).

- `market`(`kr` | `global`, 선택 — 없으면 `kr`)은 주제의 시장이다(`global-api.md` 4.9). **생성 후 바꾸지 않는다** — 4.3은 `market`을 받지 않는다. GLOBAL 주제는 영어 이름으로 만든다(추가 2026-10-14 — KAN-190).
- `slug`(선택)는 소문자·숫자를 하이픈으로 이은 것(예 `k-pop`, `^[a-z0-9]+(-[a-z0-9]+)*$`), 최대 64자. 형식이 틀리면 400 `VALIDATION_FAILED`. **같은 시장에 같은 `slug`가 있으면 409 `CONFLICT`**(`uq_topics_market_slug`) — 시장이 다르면 같은 값을 쓸 수 있다(추가 2026-10-14 — KAN-189).

### 4.3 `PATCH /admin/topics/:topicId`

```jsonc
{ "name": "...", "parent_category": "...", "is_visible": true, "display_order": 2, "slug": "k-pop" }  // 전부 선택
```

200으로 갱신된 항목을 반환한다.

- `slug` — 형식·409 `CONFLICT`는 4.2와 같다. **`slug: null`은 비운다.** 키가 없으면 바꾸지 않는다(추가 2026-10-14 — KAN-189).

- 409 `ADMIN_TOPIC_HAS_NO_CONTENTS` — `is_visible` false → true 전이인데 **노출 가능 콘텐츠가 0건**이다. `content_count: 0`을 싣고 주제는 바뀌지 않는다. 이미 노출 중인 주제의 다른 필드 수정·끄기는 판정하지 않는다(`admin.md` 4.5 — 개정 2026-09-17, 종전 "서버가 거부하지 않는다"를 번복). 콘솔은 서버 `message`를 표시하고 목록을 재조회한다.
- 노출 중인 주제가 0건이 되면 서버가 자동으로 숨긴다(회수 4.7 · 재발행 주제 교체 4.10 · 매일 04:15 일일 판정). 이 엔드포인트를 거치지 않으며 감사 로그 `topic.auto_hide`로 남는다.

### 4.4 `DELETE /admin/topics/:topicId`

- 204 — 삭제됨
- **관심사로 고른 사용자가 있어도 삭제한다** — 그 `user_interests` 행을 함께 지운다(2026-09-17, `admin.md` 4.5). 감사 로그 `after.removed_interest_count`
- 409 `ADMIN_TOPIC_HAS_CONTENTS` — 연결된 콘텐츠가 있다. `details.content_count`에 건수를 싣는다. 콘솔은 삭제 대신 `is_visible = false`를 안내한다(`admin.md` 4.5 — FK 위반 방지)

### 4.5 `GET /admin/contents`

| 파라미터 | 규격 |
|---|---|
| `status` | 선택. `domain.md` 5.1의 3값 |
| `market` | 선택. `kr` \| `global` — 없으면 전 시장. 그 밖의 값은 400 `VALIDATION_FAILED`(추가 2026-10-14 — KAN-190) |
| `offset` | 선택, 기본 0 |
| `limit` | 선택, **기본 20 · 최대 50** (`convention.md` 3.3) |

```jsonc
// 200
{
  "items": [ /* AdminContentItem — 8장 */ ],
  "total": 137,
  "current_enrichment_schema_version": 3   // 서버가 아는 현재 추천 메타 형식 버전 (4.6 schema_version 상한과 같은 값). 2026-09-11
}
```

- `current_enrichment_schema_version`은 콘솔이 8장의 구형 메타 판정에 쓰는 기준값이다. 콘솔이 같은 숫자를 상수로 따로 들지 않는다 — 형식이 3으로 오를 때 서버만 바꾸면 콘솔 판정이 함께 따라온다(KAN-55).

### 4.6 `POST /admin/contents`

`multipart/form-data`.

| 파트 | 규격 | 필수 |
|---|---|---|
| `audio` | **압축 음질**(`compressed`) — mp3 / m4a(파이프라인 렌더는 m4a AAC 192k), **≤200MB** | 필수 |
| `audio_aac` | **고음질**(`aac`) — m4a, ≤200MB. 길이가 `audio`와 ±1초 안이어야 한다. **파이프라인은 올리지 않는다**(압축이 이미 AAC 192k — `domain.md` 1.3-1). 계약만 남겨 둔다 | 선택 (2026-10-06 — KAN-141) |
| `audio_lossless` | **무손실**(`lossless`) — **flac**(`audio/flac`), ≤200MB(20분 스테레오 약 45MB). 길이 조건 같음. wav 는 받지 않는다(같은 음질에 네 배 크기 — 2026-10-06 확정. 320MB 상향도 되돌렸다) | 선택 (2026-10-06 — KAN-141) |
| `thumbnail` | jpg / png / webp, **≤5MB** — **서버가 긴 변 768px WebP 로 다시 써서 저장한다**(개정 2026-09-19, 아래). `thumbnail_url` 은 항상 `.webp` 로 끝난다 | 필수 |
| `payload` | JSON **문자열** | 필수 |
| `enrichment_file` | `enrichment.json`(`ai/metadata-pipeline.md` 4.4), **≤1MB** | 선택 (등재 2026-09-08 — 구현 완료) |
| `script_file` | 대본 JSON(아래) — 세그먼트 배열, 또는 세그먼트 + 구간 제목 객체, **≤2MB** | 선택 (등재 2026-09-19 — KAN-71 · 객체 형식 2026-10-06 — KAN-144) |

`payload` 필드:

```jsonc
{
  "title": "...", "description": "...",
  "origin": "partner" | "ai_generated",
  "author_name": "...",        // partner 필수 / ai_generated 선택
  "source_name": "...",        // 필수, 500자 이내 (ai_generated는 "참고한 자료: 발행처1, 발행처2, …" 전수 — 개정 2026-09-10)
  "source_url": "...",         // partner 필수 / ai_generated 선택
  "partner_id": "uuid",        // partner 필수
  "license_expires_at": "2027-01-01T00:00:00Z",  // partner 필수
  "series_id": "...", "episode_no": 1, "total_episodes": 5,  // 선택 (series_id 있으면 나머지 필수). series_id 는 4.24로 먼저 만든 시리즈의 id (2026-10-17)
  "topic_ids": ["..."],        // 필수, 최소 1개
  "sources": [{ "title": "...", "author": "...", "url": "..." }],  // ai_generated 필수, 최소 1개
  "review_confirmed": true,    // 필수, true여야 한다
  "market": "kr" | "global",   // 필수(2026-10-19 — KAN-190 2단계)
  "language": "ko" | "en"      // 필수(2026-10-19 — KAN-190 2단계)
}
```

- **origin별 필수 분기는 `admin.md` 3.1 그대로다.** 이 문서가 분기를 새로 정하지 않는다. **`partner`면 `sources`를 넣지 않는다 — 넣으면 400 `VALIDATION_FAILED`(`details.field = "sources"`)**, 4.10과 같은 규칙(명시 2026-09-26 — 업로드 구현도 같은 날 400으로 정렬됐다).
- `sources[]`의 **입력 순서가 곧 표시 순서**다(`content_sources.position` — `domain.md` 5.5).
- `duration_sec`은 받지 않는다. **서버가 오디오에서 추출한다**(`admin.md` 3.1).
- `review_confirmed`는 **저장 컬럼이 없다.** 미체크 업로드를 막는 게 목적이고 증적은 `audit_logs`가 담당한다(`domain.md` 5.1, 확정 2026-08-06).
- `partner_id`는 **존재 검증을 하지 않는다.** `partners` 테이블이 아직 없어 uuid 형식만 본다 — 9장 미결.
- **`market`·`language`**(추가 2026-10-14 — KAN-190, `global-api.md` 4.9). **필수**(2026-10-19 — KAN-190 2단계, 종전 1단계는 선택·없으면 `kr`·`ko`). 빠지면 400 `VALIDATION_FAILED`(`details.field = "market"` 또는 `"language"`). 재발행(4.10)은 두 필드를 받지 않는다. 검증:
  - 조합이 `kr↔ko` · `global↔en`이 아니면 400 `VALIDATION_FAILED`(`details.field = "language"`).
  - `topic_ids`가 전부 같은 시장(`market`)의 주제가 아니면 400 `VALIDATION_FAILED`(`details.field = "topic_ids"`).
  - `market = global`인데 `enrichment_file`에 `target_audiences`가 있으면 400 `VALIDATION_FAILED`(`details.field = "target_audiences"`).

**시리즈 필드 검증** (추가 2026-10-17 — KAN-134, `domain.md` 5.1·5.9)

`series_id`가 있으면(종전대로 `episode_no`·`total_episodes`도 필수) 다음을 본다. 전부 **400 `VALIDATION_FAILED`** 이고 `details.field`로 칸을 알린다(이 문서의 다른 필드 오류와 같은 표기 — 응답 본문에서는 `details`가 펼쳐져 최상위 `"field": "series_id"`로 온다). **저장소에 파일을 올리기 전에** 거절하고, 발행 트랜잭션 안에서 시리즈 행을 잠그고 한 번 더 본다.

| 조건 | `details.field` | 메시지(예) |
|---|---|---|
| `series_id`인 시리즈가 없다 | `series_id` | 존재하지 않는 시리즈예요 |
| `total_episodes` ≠ `series.total_episodes` | `total_episodes` | 총 편수가 시리즈의 편수(3편)와 달라요 |
| `episode_no`가 1..`series.total_episodes` 밖 | `episode_no` | 편 번호는 1~3 사이여야 해요 |
| 같은 `(series_id, episode_no)`로 발행 중인 편이 있다 | `episode_no` | 이 시리즈에 같은 번호로 발행된 편이 이미 있어요 |
| 시리즈에 이미 올라간 편(상태 무관)과 `market`이 다르다 | `series_id` | 다른 시장의 편이 있는 시리즈예요 |

- 종전 검사(시리즈인데 편 번호·총 편수가 없음 / 편 번호 > 총 편수 → `episode_no`)는 그대로다.
- 동시 업로드가 같은 번호로 경합해 부분 유니크(`uq_contents_series_id_episode_no_published`)에 걸려도 500이 아니라 같은 400(`episode_no`)이다.
- **시리즈는 먼저 `POST /admin/series`(4.24)로 만들고 그 `id`를 보낸다.** 기존 콘텐츠를 시리즈로 지정하는 API는 없다 — 4.10(업로드 뒤 시리즈 필드는 바꾸지 않는다)은 그대로다.

**`enrichment_file` — 추천 메타 파일** (`admin.md` 3.1의 계약 표현, 등재 2026-09-08)

- 저장 대상: `difficulty` · `format` · `is_evergreen` · `keywords` · **`target_audiences`**(형식 v2, 2026-09-11) · **`tags`**(형식 v3, 2026-10-08 KAN-162) → `contents` 메타,
  `embedding.vector` → `content_embeddings` upsert(콘텐츠당 1행). 생략된 키는 저장하지 않는다(재부여 시에는 기존 값을 유지한다 — 부분 갱신, 2026-09-26)
  (결손 = 스코어링 중립 — `domain.md` 5.1·5.6).
- **`schema_version`**(정수, 생략 시 1)을 `contents.enrichment_schema_version`에, 적용 시각을 `enriched_at`에 기록한다.
  현재 형식은 **3**이다 — 서버가 아는 최신보다 높으면 파일을 거부한다(모르는 키가 결손으로 둔갑하는 것을 막는다).
- `target_audiences`는 `[{ "job_category", "years_of_experience" }]` — 직군은 `GET /job-categories` 목록, 연차는
  `0-1 | 2-3 | 4-6 | 7+`(온보딩 입력과 같은 값 집합). 최대 8세트, 중복은 하나로 접고, 목록 밖 값은 파일 거부.
- `tags`(형식 v3)는 화면 해시태그 문자열 배열 **2~4개** — 각 항목 `^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]{0,18}[가-힣A-Za-z0-9]$`
  ('#' 없는 한글·영문·숫자 2~20자, 안쪽 공백 허용·앞뒤 공백 금지 — 개정 2026-10-14 KAN-190, 종전 `{2,10}`·공백 불가의 상위 집합.
  "Stray Kids" 같은 영어 고유명사가 공백 때문에 막혔다), 대소문자 무시 중복 없음. 화면에 그대로 보이는 값이라 **고치거나 접지 않고 파일을 거부한다.** 탐색 카드(`explore-api.md`)·
  상세(`content-detail-api.md` 4.1)의 `tags`로 나간다.
- 검증: enum은 `domain.md` 5.1과 글자 일치, 벡터는 1536차원, `embedding.model`은 현재 모델
  (`text-embedding-3-small`)과 일치해야 한다. **모르는 최상위 키는 거부한다**(오타가 결손으로
  둔갑하는 것을 막는다 — 명세의 `source` 폴백 표식은 허용).
- **검증 실패는 파일만 거부하고 업로드는 진행한다** — 추천 메타는 발행 요건이 아니다.
- 응답에 처리 결과가 실린다(**파일이 있었을 때만** 존재): `enrichment_applied: boolean`,
  거부 시 `enrichment_rejected_reason: string`(콘솔이 그대로 노출하는 사유).

**`script_file` — 대본(자막) 세그먼트 + 구간 제목** (`admin.md` 3.1 `script_segments`의 계약 표현, 등재 2026-09-19 KAN-71 · 구간 제목 2026-10-06 KAN-144)

- 형식은 파이프라인 발행 패키지가 만드는 JSON **그대로**(짝 티켓 KAN-72 — `admin.md` 8장 미결 "수동 입력 vs SRT/VTT"를 **파이프라인 JSON**으로 닫는다). **두 형식을 받는다.**
  - **배열 형식**(종전) — 세그먼트만. **구간 없음**(`sections = []`)으로 적재된다. 이미 발행된 콘텐츠·파트너 콘텐츠는 이 형식 그대로 동작한다.
    ```json
    [
      { "start_sec": 0, "end_sec": 12.4, "speaker": "윤아", "text": "…" },
      { "start_sec": 12.4, "end_sec": 27.9, "speaker": "이음", "text": "…" }
    ]
    ```
  - **객체 형식**(2026-10-06, KAN-144) — 세그먼트에 **구간 제목**을 더한 것. 구간은 대본의 `### #n 제목` 구간 그대로이고 앞뒤 인트로·도입·마무리를 포함한다(KAN-137). 시작 시각은 구간 첫 턴의 세그먼트 시각이다.
    ```json
    {
      "segments": [ { "start_sec": 7.0, "end_sec": 12.4, "speaker": "윤아", "text": "…" } ],
      "sections": [
        { "start_sec": 0, "title": "인트로", "kind": "intro" },
        { "start_sec": 31.2, "title": "도입", "kind": "lead", "summary": "깨어난 뒤 멍한 이유를 묻는다" },
        { "start_sec": 74.8, "title": "깬 직후의 멍함은 잠이 모자란 신호가 아니다", "kind": "body", "summary": "수면 관성은 정상 반응이다" },
        { "start_sec": 1052.3, "title": "마무리", "kind": "outro" }
      ]
    }
    ```
- 검증 — `segments`(배열 형식의 최상위 배열과 같다): 1~2000개, 각 항목은 `start_sec ≥ 0`, `end_sec > start_sec`, `speaker` 문자열(≤50자) 또는 `null`(생략 = `null`), `text` 비어 있지 않은 문자열(≤2000자). **`start_sec` 오름차순·겹침 없음**(50ms 오차 허용). 모르는 키는 거부.
- 검증 — `sections`(객체 형식에서 선택, 생략 = `[]`): 0~30개, 각 항목은 `start_sec ≥ 0`, `title` 비어 있지 않은 문자열(≤60자). **`start_sec` 엄격한 오름차순**(같은 값 금지 — 같은 초에 두 구간이 시작하면 "현재 구간"이 둘이 된다), **마지막 `start_sec` < 오디오 길이**(파일에서 뽑은 길이 — 4.10의 대본 단독 PATCH에서는 현재 길이). 모르는 키(항목·최상위 모두)는 거부.
- 검증 — 항목의 **선택 키 둘**(2026-10-07, KAN-151 — 플레이어 구간 카드 "개요 · 본론 · 결론" + 요약 한 줄): `kind`는 `intro` | `lead` | `body` | `outro` 중 하나(그 밖의 값은 거부), `summary`는 비어 있지 않은 문자열 **≤40자**(파이프라인은 공백 포함 20자 이내로 만든다). **둘 다 생략 허용** — 종전 파일(이미 발행된 편·파트너 콘텐츠)은 그대로 통과한다. 생략하면 저장·응답에 키 자체가 없다(`kind: null`로 채우지 않는다).
- **하나라도 어긋나면 파일을 통째로 거부한다** — 틀린 자막보다 없는 편이 낫다. **구간이 어긋나도 세그먼트까지 거부한다** — 같은 배포본의 시각이라 한쪽만 믿을 근거가 없다. 거부는 파일에 한하고 **업로드는 진행한다**(대본은 발행 요건이 아니다 — 추천 메타와 같은 규칙).
- 저장: `content_scripts`에 콘텐츠당 1행 upsert(`domain.md` 5.3) — `segments`·`sections`가 **같은 행·같은 트랜잭션**에서 통째로 바뀐다. 응답에 처리 결과가 실린다(**파일이 있었을 때만**): `script_applied: boolean`, 거부 시 `script_rejected_reason: string`. 목록·단건 응답의 `has_script`(8장)가 적재 여부다. 구간은 재생 발급 응답(`player-api.md` 4.1 `sections`)으로 앱에 내려간다.
- **파이프라인은 이 변경이 배포되기 전에는 배열 형식을 보낸다** — 객체를 먼저 보내면 파일이 거부돼 자막까지 빠진다(KAN-137).

201로 `AdminContentItem`을 반환한다.

### 4.7 `POST /admin/contents/:contentId/withdraw`

```jsonc
{ "reason": "..." }   // 선택, 500자 이내
```

200으로 `AdminContentItem`을 반환한다(`status`가 `withdrawn`, `withdrawn_at` 설정됨).

- **회수 사유는 감사 로그에만 남고 사용자에게 노출되지 않는다**(`admin.md` 3.3).
- 이미 회수된 콘텐츠면 **409 `CONFLICT`**.
- 노출면 반영은 `partner-control.md` 4.3을 따른다.

### 4.8 `POST /admin/contents/:contentId/restore`

본문 없다. 200으로 `AdminContentItem`을 반환한다.

- 회수 상태가 아니면 **409 `CONFLICT`**.
- **회수된 시리즈 편**을 되돌릴 때, 그 사이 같은 번호로 다른 편이 발행됐거나 시리즈 편수가 그 번호보다 작게 줄었으면 **409 `CONFLICT`** — "같은 번호로 발행된 편이 있어 되돌릴 수 없어요" / "시리즈 편수보다 큰 번호라 되돌릴 수 없어요"(추가 2026-10-17 — KAN-134).
- **삭제된 `library_items`는 되살리지 않는다.** 복구는 콘텐츠를 다시 노출시킬 뿐 사용자 보관함의 과거 상태를 복원하지 않는다.

### 4.9 `GET /admin/system-stats`

서버 자원과 DB 부하의 읽기 전용 스냅샷 (2026-09-06 등재). 어드민 로그 콘솔 서버 상태 탭이 **열 때 1회 + [새로고침]** 으로 호출한다(자동 폴링 없음 — 사용자 결정 2026-09-06, `features/backend-monitoring.md` 3장). 종전 "15초 폴링" 서술은 2026-09-26 정정.

**Response 200**

```json
{
  "host": {
    "load_1m": 0.42, "load_5m": 0.31, "load_15m": 0.28,
    "cpu_count": 2, "cpu_used_percent": 23.5,
    "mem_total_bytes": 4294967296, "mem_available_bytes": 1717986918,
    "uptime_sec": 1036800
  },
  "db": {
    "connections": { "total": 12, "active": 2, "idle": 9, "idle_in_transaction": 1, "waiting": 0, "longest_active_sec": 0.8, "max": 100 },
    "slow_queries": [ { "pid": 4211, "state": "active", "duration_sec": 0.8, "query": "SELECT ... $1" } ],
    "cache_hit_ratio": 0.997,
    "xact_commit": 182340, "xact_rollback": 214, "deadlocks": 0, "size_bytes": 327155712
  },
  "history": [
    { "t": 1788678000000, "cpu_used_percent": 23.5, "mem_used_percent": 61.2, "db_conn_total": 12 }
  ],
  "measured_at": "2026-09-06T06:00:00.000Z"
}
```

- `host.*`는 `/proc` 기준 **호스트 전체** 값(컨테이너가 커널을 공유) — API·DB가 같은 EC2인 현 구성에서 서버 자원 그 자체다. `cpu_used_percent`는 300ms 구간 샘플이며 못 읽는 환경(비 Linux)이면 null.
- `history`는 서버가 60초마다 쌓는 자원 샘플(최대 6시간, 오래된 것부터) — **프로세스 메모리 링 버퍼라 재기동(배포) 시 비워진다.** 대시보드 시간축 그래프의 원천이다. 못 읽은 값은 null.
- `db.*`는 pg 통계 뷰(current_database 한정) 읽기 전용. `slow_queries.query`는 150자 제한이며 바인딩 파라미터(`$1`) 형태라 사용자 데이터 원문이 없다. `cache_hit_ratio`는 통계 누적 기준(집계 전이면 null).

### 4.10 `PATCH /admin/contents/:contentId` — 재발행

`admin.md` 4.3의 계약이다 (2026-09-07 등재·구현). 발행된 콘텐츠의 **오디오(또는 메타)를 같은 행에서 교체**한다.
**오디오를 바꾸면 `content_version`을 1 올린다**(KAN-236). `content_id`가 유지되므로 `library_items` · `content_stats` 참조가 끊기지 않는다(재생 위치는 아래 "재생 위치 폐기" — 서버가 지운다).
발생 경위: 파이프라인이 TTS 규격(배속·무음 등)을 바꿔 오디오를 재생성했을 때 발행본을 갈아끼우는 경로가 없었다.

`multipart/form-data`. **모든 파트가 선택**이되 최소 1개는 있어야 한다.

| 파트 | 규격 | 필수 |
|---|---|---|
| `audio` | 압축 음질 mp3 / m4a, ≤200MB — 4.6과 같다(정정 2026-10-10 — 320MB 상향은 되돌렸다) | 선택 |
| `audio_aac` · `audio_lossless` | 4.6과 같다. **오디오를 바꾸는 재발행은 3종을 한 세트로 본다** — `audio`를 보내면서 안 보낸 음질의 행은 지운다(버전이 다른 음질이 섞이지 않게, `domain.md` 5.1-1). `audio` 없이 `audio_aac`·`audio_lossless`만 보내는 것은 400(`details.field = "audio"`) | 선택 (2026-10-06) |
| `rendition_only` | 텍스트 필드. 값 `lossless` 하나 — **무손실 파일만 교체**(2026-10-23, KAN-264). `audio_lossless` 하나만 함께 보낸다. 다른 파트(`audio`·`audio_aac`·`thumbnail`·`payload`·`enrichment_file`·`script_file`)가 섞이면 400 `VALIDATION_FAILED`(`details.field = "rendition_only"`), `audio_lossless`가 없으면 400(`audio_lossless`) | 선택 |
| `thumbnail` | jpg / png / webp, ≤5MB — 4.6 과 같이 서버가 WebP 768px 로 다시 쓴다 | 선택 |
| `payload` | JSON 문자열 — 4.6 `payload`의 부분집합(`title` `description` `source_name` `topic_ids` `sources`). 넘긴 키만 바꾼다 | 선택 |
| `enrichment_file` | `enrichment.json` — 규격·검증·응답 필드는 4.6과 같다 | 선택 (등재 2026-09-08) |
| `script_file` | 대본 JSON(세그먼트 배열 또는 세그먼트 + 구간 제목 객체) — 규격·검증·응답 필드는 4.6과 같다. **통째로 교체**된다(콘텐츠당 1행, 구간 포함). **오디오를 바꾸는 재발행에서 이 파트가 없거나 검증에서 거부되면 기존 대본을 삭제한다**(2026-09-26 — 아래 "대본 삭제"). 구간의 "마지막 `start_sec` < 오디오 길이" 검증은 새 오디오가 있으면 그 길이, 없으면(대본 단독) 현재 길이로 본다(KAN-144) | 선택 (등재 2026-09-19) |

- **오디오를 교체하면 `duration_sec`을 다시 추출**한다(4.6과 동일 — 클라이언트 값을 받지 않는다). 이전 파일은 새 파일 저장·트랜잭션 성공 후 지운다.
- **`content_version`은 오디오(`audio` — 3종 한 세트)를 바꿀 때만 1 오른다**(개정 2026-10-20 — KAN-236, 종전 "파트가 무엇이든 1 증가"). 썸네일·`payload`(제목·설명·출처명·주제·출처)·`enrichment_file`·`script_file`만 보내는 전송은 버전을 올리지 않고 아래 재생 위치 폐기도 없다 — 오디오가 그대로면 같은 초가 같은 내용이다. 버전은 클라이언트에게 "오디오가 바뀌었다"는 신호이고(`player-api.md` 4.1·4.3 — 바뀌면 재생 중 세션 위치를 폐기한다), 메타만 바꾼 재발행에서 올리면 재생 중이던 사람의 위치가 0으로 돌아간다. 추천 메타·대본 단독 전송의 감사 로그 구분은 그대로다 — 대본 단독은 `content.script`, 추천 메타 단독(기존 발행분 소급 부여가 이 경로를 쓴다)은 `content.enrich`(2026-09-08 · 2026-09-19). 썸네일·메타가 섞인 전송은 `content.republish`로 남는다(이전·이후 버전이 같을 수 있다).
- **무손실만 교체(`rendition_only=lossless`)는 버전을 올리지 않고 재생 위치·대본을 그대로 둔다**(2026-10-23, KAN-264) — 같은 마스터에서 다시 만든 파일(예: SEEKTABLE 추가)이라 같은 초가 같은 내용이다. 새 파일 길이가 지금 `duration_sec`과 ±1초 안이어야 한다(아니면 400 `audio_lossless` — 다른 내용의 파일은 이 경로로 못 들어온다. 업로드 전과 행 잠금 뒤 두 번 본다). `lossless` 행만 바뀌고 `contents.audio_path`·다른 음질 행은 그대로다. 옛 무손실 파일은 트랜잭션 성공 뒤 지운다. `audit_logs`는 `content.republish`(이전·이후 버전 같음, `changed_parts: ["audio_lossless"]`, `rendition_only: "lossless"`).
- `origin` · `partner_id` · `series_id` · `episode_no` · `total_episodes` · `license_expires_at`은 **바꾸지 않는다** — 발행 단위의 정체성이라 필요하면 회수 후 새로 올린다.
- `status`가 `published`가 아니면 **409 `CONFLICT`** (회수·만료 상태에서는 재발행하지 않는다 — `admin.md` 4.6 "만료 상태에서는 재발행을 막는다").
- `topic_ids`를 넘기면 전체 교체다(빈 배열 불가 — 최소 1개, 4.6과 동일). **대상 콘텐츠의 시장과 같은 시장의 주제만 받는다** — 아니면 400 `VALIDATION_FAILED`(`details.field = "topic_ids"`). **시장(`market`·`language`)은 재발행이 바꾸지 않는다** — 바꾸려면 회수 후 새로 올린다(추가 2026-10-14 — KAN-190).
- **`sources`도 전체 교체이고, 비울 수 있는지는 `origin`이 정한다** — 4.6과 같은 공시 규칙이다(`admin.md` 3.1).
  `ai_generated`면 최소 1개(빈 배열은 400 `VALIDATION_FAILED`, `details.field = "sources"`),
  `partner`면 넣지 않는다(넣으면 같은 400). **`origin`은 재발행이 바꾸지 못하므로 기존 행의 값으로 판정한다.**
  이 조건이 없으면 업로드로는 만들 수 없는 행이 재발행으로만 생긴다.
- `audit_logs`에 `republish` 행위로 기록한다 — 행위자·이전/이후 `content_version`·바뀐 파트 목록.

200으로 갱신된 `AdminContentItem`(오디오를 바꿨으면 증가한 `content_version`)을 반환한다.

**흐름** — 4.6과 같은 순서: 검증 → 새 파일 저장(트랜잭션 밖) → 트랜잭션(행 갱신 + **오디오 교체 시** `content_version + 1` · 재생 위치 삭제 + 주제·출처 교체) → 성공 시 이전 파일 삭제 / 실패 시 새 파일 삭제.

**재생 위치 폐기** (확정·구현 2026-09-07 — `republish-stale-playback-position.md` 안 A): **오디오를 바꾸는** 재발행
트랜잭션에서 그 콘텐츠의 `playback_progresses`를 **전부 삭제한다.** 다음 진입의
`player-api.md` 4.1 응답이 `progress: null`이 되어 0부터 재생된다 — 콜드오픈 폐지처럼 같은
초가 다른 내용을 가리키게 되는 재발행에서 낡은 위치가 내려가는 것을 막는다.
라이브러리(`library_items`)·재생 기록(`play_records`)은 유지된다. **폐기 주체는 서버다** —
앱은 위치를 로컬에 보관하지 않으므로 클라이언트 측 폐기 동작은 없다(`player.md` 7).

- **오디오를 바꾸지 않는 재발행(썸네일·메타만)은 지우지 않는다**(개정 2026-10-20 — KAN-236). 같은 초가 같은 내용이라 낡은 위치가 생기지 않는다 — 시리즈 썸네일 교체가 수십 편의 이어 듣기를 0으로 돌리던 문제.

**대본 삭제** (2026-09-26 — 백엔드 전수 감사): **오디오를 바꾸는 재발행에서 `script_file`이 없거나 검증에서 거부되면 기존 대본(`content_scripts` 행 — 세그먼트와 구간 제목 모두)을 같은 트랜잭션에서 삭제한다.** 응답의 `has_script`가 `false`로 내려가고(발급 응답의 `sections`도 `[]`) 감사 로그 `republish`의 `after.script_dropped = true`가 남는다. 옛 세그먼트의 시각은 새 오디오와 어긋나므로 **틀린 자막보다 없는 편이 낫다**(`domain.md` 5.3). 종전에는 대본이 오면 교체하고 안 오면 그대로 두어, 파이프라인의 기본 재발행 경로(오디오+썸네일)에서 옛 세그먼트가 새 오디오와 어긋난 채 플레이어에 내려갔다.

- **오디오를 바꾸지 않는 재발행(메타만·파일만)은 대본을 건드리지 않는다.**
- **다시 채우는 절차**: 오디오 재발행 뒤 자막은 발행 목록의 **[자막 뽑기]**(워커가 새 오디오와 대본을 강제 정렬) → **[반영]**(`script_file` 단독 PATCH — 버전 무변경)으로 다시 채운다. 재발행 요청에 유효한 `script_file`을 함께 실어도 된다 — 그때는 삭제 없이 교체된다.

### 4.11 `DELETE /admin/contents/:contentId/storage` — 저장소 파일 회수

`admin.md` 4.4의 회수 **다음 단계**다(등재 2026-09-09). 회수(`withdrawn`)된 콘텐츠의 오디오·썸네일을 저장소에서 지워 **보관 비용을 끊는다.** 본문 없다. 204를 반환한다.

- **`status`가 `withdrawn`이 아니면 409 `CONFLICT`.** 노출 중인 콘텐츠의 파일을 지우면 재생이 그 자리에서 깨진다 — 회수가 먼저다.
- **되돌릴 수 없다.** 복구(4.8)로 상태를 되돌려도 **파일이 없어 재생이 실패한다.** 다시 쓰려면 재발행(4.10)으로 오디오를 올려야 한다.
- **`contents` 행은 지우지 않는다**(결정 2026-09-09). 행을 지우면 그것을 참조하는 `play_records`가 함께 사라져야 하는데, 그 값이 **파트너 정산의 원본 근거**다(FR-34 — `total_listen_sec`). 집계(`content_stats`)만 남기고 원본을 없애면 정산 수치를 되짚을 수 없다.
- 사용자에게 보이는 차이는 없다 — 노출은 회수가 이미 막고 있다.
- `audit_logs`에 `content.purge_storage`로 기록한다. **파일이 사라진 뒤 그 콘텐츠가 왜 재생되지 않는지를 이 기록으로만 설명할 수 있다.**

### 4.12 `GET /admin/notices` — 공지 목록

신설 2026-09-17(`changes/archive/notice-screen-spec.md` C, KAN-67). 쿼리는 `settings-api.md` 4.4와 같다(`cursor` · `limit` 기본 20·최대 50). 여기에 `market`(`kr` \| `global`, 선택 — 없으면 전 시장, 모르는 값 400)을 더한다(2026-10-15 — KAN-211).

```jsonc
{ "items": [
  { "id": "...", "title": "...", "body": "...", "is_pinned": false,
    "published_at": null, "market": "kr", "created_at": "...", "updated_at": "..." }   // published_at null = 초안
], "next_cursor": null }
```

- **초안·예약을 포함하고 삭제분은 뺀다.** 정렬은 작성 최신순(`created_at DESC, id DESC`). 사용자 목록과 정렬이 달라 **커서를 서로 바꿔 넣으면 400 `NOTICE_CURSOR_INVALID`**.
- 사용자 목록과 달리 **본문을 싣는다** — 콘솔이 수정 화면을 바로 연다.

### 4.13 `POST /admin/notices` — 공지 작성

```jsonc
{ "title": "9월 업데이트 안내", "body": "줄바꿈은\n그대로", "is_pinned": false, "published_at": "2026-09-17T09:00:00Z", "market": "kr" }  // is_pinned·published_at·market 선택
```

201로 4.12의 항목 한 건을 반환한다.

- 검증(위반은 400 `VALIDATION_FAILED`):
  - `title` 1~100자 · `body` 1~5000자 — **공백만은 불가**, 글자 수는 **코드 포인트**로 센다(DB `varchar`와 같은 단위 — 조합 이모지는 2자 이상)
  - `published_at` — **날짜·시각·오프셋(`Z` 또는 `±hh:mm`)이 모두 있는 ISO 8601**, 2000~2100년. 오프셋 없는 시각은 서버 시간대에 따라 해석이 달라져 받지 않는다
  - `market` — `kr` \| `global`, 없으면 `kr`(2026-10-15 — KAN-211). 그 시장 사용자에게만 보인다(`global-api.md` 4.8). **생성 뒤 바꾸지 않는다**
- **`published_at`을 빼면 초안**이다. 미래 시각이면 예약 발행 — 그 시각부터 사용자 목록에 보인다(조회 시점의 서버 시각으로 판정).
- `audit_logs`에 `notice.create`로 기록한다 — `notices`에 작성자 컬럼이 없어 누가 게시했는지는 이 기록만 안다. 본문 원문은 남기지 않고 길이만 남긴다.

### 4.14 `PATCH /admin/notices/:noticeId` — 공지 수정

```jsonc
{ "title": "...", "body": "...", "is_pinned": true, "published_at": null }  // 전부 선택
```

200으로 갱신된 항목을 반환한다.

- **담긴 키만 바꾼다.** `published_at: null`은 **발행 취소**(초안으로 되돌림), 키를 빼면 그대로다. `title`·`body`·`is_pinned`에 `null`은 400이다. **`market`은 받지 않는다**(생성 뒤 시장 불변 — 모르는 필드라 400).
- 바꿀 키가 하나도 없으면 400 `VALIDATION_FAILED`. 검증은 4.13과 같다.
- 수정·삭제는 행을 잠그고 한다 — 감사 로그 `before`가 동시 수정으로 낡지 않는다.
- 없거나 삭제된 공지는 404 `NOTICE_NOT_FOUND`. `audit_logs`에 `notice.update`(before/after).

### 4.15 `DELETE /admin/notices/:noticeId` — 공지 삭제

- 204. **soft delete**(`deleted_at`) — 사용자 목록·상세에서 즉시 사라진다(상세는 404).
- 없거나 이미 삭제된 공지는 404 `NOTICE_NOT_FOUND`. `audit_logs`에 `notice.delete`.

### 4.16 `GET /admin/drip/preview` — 편성 미리보기 (읽기 전용)

> 추가: 2026-09-18 (admin 콘솔 "추천 검증" 탭). 근거: `drip-scheduling.md` 4.1~4.8 · 5장 운영 콘솔 "편성 품질".

"지금 데이터로 편성 배치를 돌리면 이 사용자에게 어떤 정규 N편·탐험 M편이 가는가"를 **계산만 하고 돌려준다.**
배치와 같은 계산기(`DripBatchOrchestrator.planForUser`)를 쓰되 취향 캐시 저장·라이브러리 적립·제외 기록·알림·배치 기록을
전부 하지 않는다. 사용자 상태는 바뀌지 않는다. 유일한 쓰기는 열람 1회마다 남기는 **감사 로그 `drip.preview_view`**(actor = 관리자 `user_id`, target = `user:<user_id>`, before/after 없음)다. 감사 로그를 남기지 못하면 계산하지 않고 실패한다. 404·400 은 남기지 않는다(개정 2026-10-22 — `drip-preview-user-id.md`). 응답은 `Cache-Control: no-store`이며 매 요청 다시 계산한다.

**요청**

| 쿼리 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | string(uuid) | ✓ | 대상 사용자 `users.id`. 역할 무관. 없거나 탈퇴(`status ≠ active`)면 404. **`email` 쿼리는 받지 않는다**(2026-10-22 폐기 — 보내면 400) |

**응답 200**

| 필드 | 설명 |
|---|---|
| `computed_at` · `service_date` | 계산 시각(ISO), 서비스 날짜(05시 경계 — 개정 2026-10-07 — 2026-10-12 05:00 KST 적용, KAN-149) |
| `user` | `id` `tier` `market` `job_category` `years_of_experience` `onboarding_completed`(개정 2026-10-22 — 종전 `email` `nickname` 제거, `market` 추가) |
| `skip_reason` | `no_interests` \| `already_placed` \| `unfinished_inventory` \| `plan_disabled` \| null — 배치라면 스킵될 사유. 미리보기는 사유를 적은 채 끝까지 계산한다. **`already_placed`**(추가 2026-09-26 — `drip-scheduling.md` 4.6-5)는 오늘 서비스 날짜에 이미 편성분(`library_items.source in drip,discovery`)이 있다는 뜻이다. **삭제분도 센다** — 오늘 받았다가 지운 사용자도 이 사유가 난다(아래 `today_placed[]`도 삭제분을 포함한다). 사유가 여럿 겹치면 배치가 판정하는 순서(이 표기 순서)에서 먼저 난 것 하나만 싣는다 |
| `unfinished_count` · `unfinished_limit` | 미청취 재고와 스킵 기준(5) |
| `drip_count` · `discovery_count` | 티어 편수(`plans`) |
| `interests[]` | `topic_id` `name` `source` — 활성 관심 주제 |
| `removed_topics[]` | 사용자가 직접 해제한 주제(탐험 제외) |
| `auto_expand` | 자동 확장 판정(`drip-scheduling.md` 4.5 — 추가 2026-09-30). `action`: `none` \| `add` \| `replace` \| `expire` · `reason`: `no_candidate` \| `slot_free` \| `slot_kept` \| `stronger_candidate` \| `slot_expired` \| `disabled`(사용자 토글 OFF) \| `feature_off`(서버 스위치 OFF) · `add_topic` · `remove_topic`(`{topic_id,name}` \| null) · `candidates[]`(`{topic_id,name,completes,weight}` — 트리거를 넘긴 관심 밖 주제, 강한 순). **미리보기는 저장하지 않으므로 `interests[]`에는 반영돼 있지 않고, 아래 `regular`·`discovery` 계산은 반영됐다고 가정한 결과다.** 관심 주제 0 스킵이면 null |
| `preference` | `is_cold_start` `complete_signal_count` `cold_start_threshold` `signal_count` `has_taste_embedding` `duration_pref` `topic_weights[]` `author_weights[]` `keyword_weights[]` `format_weights[]`(절대값 상위 15, `{key,name,weight}`) `difficulty_affinity` — **저장하지 않은** 계산값 |
| `signals[]` | `content_id` `title` `action` `created_at` — 취향 계산 입력(90일·최대 500건). `action`에는 `user_signals` enum 외에 **파생 신호 `ignore`**(`drip-scheduling.md` 4.3 — 7일 미청취 편성분, 저장되지 않음)가 섞인다. 90일·500건 상한은 저장 신호에만 적용된다(명시 2026-09-26) |
| `weights` | 스코어링 상수: `axes` `signal_items` `meta_items` `meta_items_cold_start` `discovery_items` |
| `regular` | `pool_size` `gated_out[]`(시리즈 순서 게이트 제외, `reason: episode_order`) `recent_drip_topics[]` `candidates[]` — null이면 정규 편수 0 |
| | **`candidates[].breakdown.meta_items.exposure_fatigue`는 정규 편에서 항상 `null`이다**(2026-09-25 — 노출 피로 항목 폐기, `drip-scheduling.md` 4.2 ③). 탐험 편은 종전대로 저노출 가점 값. **`recent_drip_topics[]`는 정보 표시**일 뿐 스코어링 입력이 아니다. 응답 형태는 어드민 웹 호환을 위해 그대로 둔다 |
| `discovery` | `pool_size` `quality_floor` `typical_complete_rate` `excluded[]`(`user_removed_topic` \| `below_quality_floor`) `candidates[]` — null이면 탐험 편수 0 |
| `discovery_error` | 탐험 계산이 던졌으면 메시지, 아니면 null(정규는 영향 없음 — 4.8) |
| `today_placed[]` | 오늘 서비스 날짜에 실제 배치가 적립한 편(`library_items.source in drip,discovery`, 삭제분 포함) |

`candidates[]` 항목: 콘텐츠 메타(`content_id` `title` `author_name` `source_name` `duration_sec` `published_at` `difficulty` `format`
`is_evergreen` `series_id` `episode_no` `topics[]`) + 스코어링 입력(`play_count` `complete_count` `has_embedding`) + `score` `is_series_continuation`
`breakdown`(`embedding` `signal` `signal_items{}` `meta` `meta_items{}` — null은 입력 없어 축·항목에서 빠짐) + `pick_order`(최종 편성분이면 1부터, 아니면 null)
+ 탐험만 `exposure_count` `is_outside_interests`. 정렬은 점수 내림차순. **`audio_path`는 싣지 않는다**(7장).

**개인정보** — 이메일·닉네임·제공자 ID·프로필 사진·직함은 서버가 **조회하지도(SELECT) 싣지도 않는다**(2026-10-22). 콘솔은 `user_id` 앞 8자리로 보인다. 처리 근거는 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"이다.

**오류**

| 상태 | `error_code` | 조건 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `user_id` 누락·uuid 형식 오류, 또는 폐기된 `email` 쿼리 |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | 2장 공통 규약 |
| 404 | `NOT_FOUND` | 그 `user_id`의 사용자 없음 · 탈퇴 |

### 4.17 `/admin/recommend-test/*` — 추천 테스트 (개발계 전용 · 쓰기 있음)

> 추가: 2026-09-29 (admin 콘솔 "추천 검증 > 추천 테스트" 탭 — `tickets/backend/archive/recommend-test-console.md`). 근거: `admin.md` 4.7.

추천에 영향을 주는 행동을 **테스트 계정 한 명**에 대신 수행하고, 직후 편성 미리보기(4.16)와 탐색 피드의 변화를 본다. 4.16과 달리 **쓰기가 있다** — 행동이 실제 `user_signals`·`library_items`·`play_records`·`content_stats`를 쓴다.

- **대상 계정은 서버 env `RECOMMEND_TEST_EMAIL` 하나로 고정이다. 요청이 사용자를 고르지 않는다** — 이메일을 받으면 관리자가 임의 사용자의 라이브러리를 조작하는 도구가 된다.
- **개발 환경에서만 켜진다.** 환경(`SENTRY_ENVIRONMENT`, 비어 있으면 `NODE_ENV`)이 `development`가 아니면 이메일이 설정돼 있어도 전 경로가 409 `ADMIN_RECOMMEND_TEST_DISABLED`다(실패 시 닫힘 — 2026-10-13. 종전 "`production`이면 꺼짐"은 운영 env 가 비거나 오타면 열렸다). 개발계는 `SENTRY_ENVIRONMENT=development`, 로컬은 비워 두면 `NODE_ENV=development`로 켜진다.
- 인증은 다른 `/admin/*`와 같다(2장). 조회 응답(`account`·`feed`)은 `Cache-Control: no-store`.
- **추천 결과(편성분·점수·신호·취향)는 새 엔드포인트가 아니라 4.16 `GET /admin/drip/preview?user_id=<테스트 계정 id>`(계정 id 는 `/admin/recommend-test/account`의 `user.id`)를 개발계에 그대로 부른다.** 이 절의 경로는 행동·계정 상태·피드·초기화만 소유한다.

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/admin/recommend-test/account` | 없음 | 200 — 테스트 계정 상태(아래) |
| GET | `/admin/recommend-test/feed` | 없음 | 200 — 테스트 계정의 탐색 피드. `explore-api.md` 4.1과 같은 본문 |
| POST | `/admin/recommend-test/actions` | `{ action, content_id }` | 200 — `{ action, content_id, performed_at, effects[], preference_rebuilt }` |
| PUT | `/admin/recommend-test/interests` | `{ topic_ids[] }` — `interest-management-api`의 전체 교체와 같은 본문 | 204 |
| PUT | `/admin/recommend-test/career` | `{ job_category, job_title, years_of_experience }` — `career-api`와 같은 본문 | 204 |
| POST | `/admin/recommend-test/reset` | 없음 | 204 — 소비 이력 전부 삭제 |
| POST | `/admin/recommend-test/first-drip` | 없음 | 200 — `{ status, item_count, completed_at }` (추가 2026-10-13) |

**`GET /admin/recommend-test/account` 응답 200**

| 필드 | 설명 |
|---|---|
| `environment` | 서버의 환경 이름(`SENTRY_ENVIRONMENT`, 비어 있으면 `NODE_ENV`) — 콘솔이 "개발계" 배지를 그리는 근거 |
| `user` | `id` `email` `nickname` `tier` `onboarding_completed` `job_category` `job_title` `years_of_experience` |
| `interests[]` | `topic_id` `name` `source` — 활성 관심 주제 |
| `library[]` | `item_id` `content_id` `title` `source` `status` `added_at` `completed_at` — 담은 최신순, 삭제분 제외(앱 라이브러리가 보는 것과 같다) |

**`POST /admin/recommend-test/actions`**

```jsonc
{ "action": "play" | "complete" | "save" | "unsave" | "delete" | "replay", "content_id": "uuid" }
// 200
{ "action": "complete", "content_id": "...", "performed_at": "2026-09-29T02:10:00.000Z",
  "effects": ["재생 시작 (play 신호 · 드립 영구 제외 · 오늘 한도 1 차감)", "끝까지 들음 → 완청 (complete 신호)"],
  "preference_rebuilt": true }
```

- 각 행동은 **앱이 부르는 것과 같은 서비스 경로**를 탄다(`admin.md` 4.7). 신호를 직접 적재하는 지름길이 없다.
  - `play` — 라이브러리에 없으면 탐색 재생과 같이 `auto_play` 자동 적립 후 재생 시작. **오늘 재생 한도가 차감된다**(테스트 계정 티어 기준).
  - `complete` — `play` 후 위치를 길이 끝까지 저장 → 완청 판정(90%) → `complete` 신호. 길이 0 콘텐츠는 수동 완료 경로(`library-api.md` 4.5)라 `complete` 신호가 없다.
  - `save` / `unsave` — 탐색 담기·담기 해제. `delete` — 라이브러리 삭제(대상이 라이브러리에 없으면 404).
  - `replay` — 완료 상태가 아니면 앱과 같이 무시된다(신호 없음, 200).
- `effects[]`는 실제로 일어난 부수 효과를 사람이 읽는 문장으로 적은 것이다 — 콘솔이 행동 로그에 그대로 적는다. 기계 판독용 계약이 아니다.
- **행동 직후 신호 파생 상태를 다시 계산해 저장한다**(`preference_rebuilt: true`) — 취향 캐시와 자동 확장 슬롯(`drip-scheduling.md` 4.3 예외 · 4.5-1). 자동 확장이 일어나면 `effects[]`에 `자동 확장 add (slot_free) — …` 같은 줄이 실린다. 그래서 직후의 `feed`·4.16 재조회가 바뀐 결과를 보인다.

**`POST /admin/recommend-test/first-drip`**(추가 2026-10-13) — 온보딩 완료 직후의 **첫 드립**(`drip-scheduling.md` 4.4 콜드스타트 스코어링 + 4.2-3 다양성 선정)을 테스트 계정으로 다시 실행한다. 테스트 계정은 이미 온보딩을 마쳐 앱 경로로는 첫 드립을 다시 받을 수 없어서다. 이전 첫 드립 작업 행을 지우고 새로 만든 뒤 앱과 같은 편성 경로를 부른다 — 편성분은 계정 라이브러리에 `source = drip`으로 적립된다. 이미 본 콘텐츠 제외는 그대로이므로 **가입 직후와 같은 결과를 보려면 `reset` 뒤에 부른다**. `status`는 `completed` 또는 `no_candidates`(관심 주제·전체에서 후보 0편)다.

**`POST /admin/recommend-test/reset`** — 신호·재생 기록(오늘 한도도 함께 풀린다)·재생 위치·오디오 발급 로그·원문 클릭·라이브러리(삭제분 포함)·취향 캐시·드립 영구 제외·첫 드립 작업·편성 별점(`drip_feedbacks`)·**자동 확장으로 붙은 관심 주제**(`source = auto_expand`)를 지운다. **직접 고른 관심 주제·커리어·계정은 남긴다.**

**오류**

| 상태 | `error_code` | 조건 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `action`이 6값 밖 · `content_id`가 uuid가 아님 · `interests`/`career` 본문 형식 오류 |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | 2장 공통 규약 |
| 404 | `NOT_FOUND` | 테스트 계정이 이 서버에 가입돼 있지 않음 / `delete` 대상이 테스트 계정의 라이브러리에 없음 |
| 409 | `ADMIN_RECOMMEND_TEST_DISABLED` | 운영 환경이거나 `RECOMMEND_TEST_EMAIL` 미설정 |
| — | 행동 자체의 에러 | `PLAY_LIMIT_EXCEEDED` `CONTENT_WITHDRAWN` 등 **앱과 같은 코드가 그대로** 나온다. `interests`·`career`도 각 화면 api의 에러를 그대로 낸다 |

### 4.18 `GET /admin/recommend-eval/snapshot` — 추천 평가 스냅샷 (읽기 전용)

> 추가: 2026-09-30 (KAN-108 — `backend/recommendation-evaluation.md` 3.1). 오프라인 평가기(`npm run eval:recommend`)의 입력 파일이다.

발행 콘텐츠(메타·주제·전체 집계·현재 모델 임베딩)와 사용자(관심 주제·신호·라이브러리·영구 제외·자동 확장 토글)를 한 JSON으로 내려준다. **계산도 쓰기도 없다** — 조회만 한다. 응답은 `Cache-Control: no-store`.

**요청**

| 쿼리 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `max_users` | int | | 사용자 상한(기본 300, 최대 1000). 온보딩을 마친 미탈퇴 사용자를 가입 순으로 |
| `signal_days` | int | | 신호·라이브러리 조회 범위(일, 기본 365) |

**응답 200** — `schema_version`(1) · `exported_at` · `environment` · `embedding_model` · `plans[]`(`tier` `daily_drip_count` `daily_discovery_count`) · `topics[]`(`id` `name` `is_visible`) · `contents[]`(콘텐츠 메타 + `topic_ids[]` `play_count` `complete_count` `embedding`(number[] \| null)) · `users[]`.

`users[]` 항목: **`key`(`u001`… 익명 키)** `tier` `job_category` `years_of_experience` `auto_expand_enabled` · `interests[]`(`topic_id` `source` `is_active` `is_user_removed` `updated_at`) · `signals[]`(`content_id` `action` `created_at`) · `library[]`(`content_id` `source` `status` `added_at` `completed_at` `deleted_at`) · `excluded[]`(`content_id` `created_at`).

- **이메일·닉네임·`users.id`를 싣지 않는다.** 키는 가입 순 일련번호라 응답 안에서만 사용자를 구분한다. 그래도 행동 이력이므로 받은 파일은 저장소에 커밋하지 않는다(`backend/eval/` gitignore).
- 크기: 임베딩(1536차원) 때문에 콘텐츠 200편 기준 수 MB. 자주 부르는 엔드포인트가 아니다.

### 4.19 `GET /admin/drip-feedback/versions` — 알고리즘 버전별 별점 (읽기 전용)

> 추가: 2026-09-30 (KAN-116 — `drip-feedback.md` 4.5). 추천 검증 콘솔이 버전 순으로 보인다.

**Response 200**

```json
{ "items": [ { "algorithm_version": "2026-09-30.1", "placements": 240, "placed_users": 31, "first_placed_at": "…", "last_placed_at": "…", "ratings": 18, "rated_users": 9, "average_stars": 3.72, "distribution": { "1": 1, "2": 2, "3": 4, "4": 6, "5": 5 } } ] }
```

- `placements`·`placed_users`는 `library_items`(드립·탐험, 삭제분 포함)에서, 나머지는 `drip_feedbacks`에서 센다. 응답률 = `ratings / placements`는 화면이 계산한다.
- 버전 문자열(`YYYY-MM-DD.n`) 역순. `algorithm_version: null`(버전 도입 전 편성분과 온보딩 직후의 첫 드립 — 첫 드립은 별점을 묻지 않아 `ratings`가 쌓이지 않는다)은 맨 뒤.
- `average_stars`는 평가 0건이면 null. 표본 20건 미만은 화면이 "참고" 표시(`drip-feedback.md` 4.5).

### 4.20 ~~`POST /admin/reports/daily-metrics` — 일일 지표 보고 수동 트리거~~ (삭제 2026-10-02)

> 삭제: 2026-10-02. 추가는 2026-09-29(KAN-107 2단계)였다. 일일 지표 보고는 **크론(매일 17:00 KST)으로만** 나간다(`backend-monitoring.md` 3-3). 수동 발송은 쓸 일이 드문 데 비해 값이 비쌌다 — 요청을 받은 워커가 GA4 SDK를 올려(+54MB) 재기동까지 들고 있었고, 누를 때마다 같은 보고가 채널에 중복 게시됐다. 번호는 뒤 절(4.21)의 참조를 지키려고 비워 둔다. 에러 코드 `ADMIN_REPORT_NOT_CONFIGURED`도 함께 없앴다.

### 4.21 `GET /admin/search-query-logs/summary` — 검색 질의 로그 요약 (읽기 전용)

> 추가: 2026-10-01 (`domain.md` 5.7 · `explore.md` 4.5-5). 로그 콘솔 "검색 로그" 탭(`backend-monitoring.md` 4장)이 읽는다 — 매칭 방식(`pg_trgm` 부분 일치)을 재검토할지 판단하는 근거.

**Query**

- `days` (선택, 정수 1~90, 기본 14): 집계 창. `now - days` 이후의 행만 센다.
- `market` (선택, `kr` | `global`): **검색한 사용자의 시장**(`users.market`)으로 거른다. 생략하면 전 시장(종전과 같음), 그 밖의 값은 400 `VALIDATION_FAILED`(추가 2026-10-15 — KAN-188). 미스율로 한국어 매칭 방식(`pg_trgm`)을 판단할 때는 `market=kr`로 본다 — 한국어·영어 질의가 한 순위와 미스율에 섞이기 때문이다.

**Response 200**

```json
{
  "days": 14,
  "since": "2026-09-17T09:00:10.000Z",
  "totals": { "searches": 120, "misses": 30, "miss_rate": 0.25, "clicked": 54, "users": 18, "short_queries": 12, "filtered_searches": 5, "corrected": 9, "correction_rejected": 1, "keyword_misses": 41, "rescued": 11, "semantic_unavailable": 2 },
  "daily": [ { "date": "2026-09-30", "searches": 14, "misses": 3, "clicked": 6 } ],
  "missed": [ { "query": "면접", "searches": 6, "misses": 6, "clicked": 0, "result_count": 0, "has_more": false, "query_used": "면접", "keyword_count": 0, "last_searched_at": "…" } ],
  "top": [ { "query": "커리오", "searches": 20, "misses": 0, "clicked": 12, "result_count": 20, "has_more": true, "query_used": "커리어", "keyword_count": 20, "last_searched_at": "…" } ]
}
```

- 한 건은 `search_query_logs` 한 행 = **타이핑 묶음 하나**다(`domain.md` 5.7 — 디바운스 중간 입력은 서버가 접는다). `misses`는 그중 첫 페이지 0건.
- `miss_rate` = `misses / searches`. 검색 0건이면 `null`. 표본이 작을 때의 "참고" 표시는 화면 몫이다.
- `clicked`는 **반응한 검색** — 타이핑 묶음의 시작부터 마지막 질의 뒤 10분까지 결과 중 하나를 재생·담은 것(서버가 역산, `domain.md` 5.7). **무반응 비율은 내리지 않는다** — 반응이 없는 이유(재생 한도에 막힘 / 보고 나감)를 알 수 없어 비율로 읽으면 오판한다. 질의별 `clicked`로 "눌린 적 있나"만 본다.
- `result_count`·`has_more`는 **그 질의의 가장 최근 검색**이 돌려준 콘텐츠 수와 다음 페이지 유무다(추가 2026-10-02). **첫 페이지 건수라 페이지 크기(20)에서 멈춘다** — 총 건수는 검색마다 COUNT 쿼리가 하나 더 붙어 세지 않는다(`domain.md` 5.7). `has_more`가 true면 화면은 "20건 이상"으로 읽는다. 여러 번 검색된 질의도 평균을 내지 않는다 — 콘텐츠가 늘면 값이 달라지고, 보려는 것은 "지금 치면 몇 건 나오는가"다.
- `short_queries`는 2자 질의 수(트라이그램 인덱스를 못 타는 길이 — `explore.md` 4.5-5), `filtered_searches`는 주제 필터가 걸린 검색 수.
- `daily.date`는 **KST 달력일**이다(05시 서비스 날짜 경계를 쓰지 않는다 — 정책 판정이 아니라 운영자가 읽는 단위). 검색이 없던 날은 빠진다.
- `missed`는 0건이 한 번이라도 있던 질의를 0건 수 내림차순으로, `top`은 검색 수 내림차순으로 각 최대 50개. `last_searched_at`은 그 질의의 마지막 요청 시각(`updated_at`).
- **교정·하이브리드 집계**(추가 2026-10-22 — KAN-238, `domain.md` 5.7 · `explore.md` 4.5-5). 2026-10-22 전 옛 행(새 컬럼 NULL)은 다섯 값 어디에도 세지 않는다.
  - `totals.corrected` — 교정된 검색(`query_used <> query`).
  - `totals.correction_rejected` — 교정 거절: 원문 그대로 검색한 행(`query_used = query`)이고, 같은 사용자의 **바로 앞 행**이 같은 입력의 교정 행이며 그 행의 마지막 요청 뒤 10분 안이다(`exact=true` 재검색은 새 행으로 남는다).
  - `totals.keyword_misses` — 키워드 엔진 0건(`keyword_count = 0`). `totals.rescued` — 그중 결과가 있던 검색(`keyword_count = 0`이고 `result_count > 0` — 의미 엔진이 살린 것).
  - `totals.semantic_unavailable` — 의미 엔진 없이 응답한 검색(`engines`에 `semantic` 없음 — AI 서버 결손·미설정). 태그 전용 검색(`#`)은 의미 엔진을 돌리지 않는 경로라 세지 않는다.
  - `missed[]`·`top[]`의 `query_used`·`keyword_count`는 그 질의의 **가장 최근 검색** 값이다(`result_count`와 같은 원칙). 옛 행이면 `null`.
  - **`misses`·`miss_rate` 정의는 불변**이다 — 하이브리드 첫 페이지 0건(사용자가 본 결과가 없었다).
- 인증은 다른 `/admin/*`와 같다(2장). 400 `VALIDATION_FAILED` — `days` 범위 밖, `market` 값 밖.

### 4.22 `GET /admin/insights/summary` — 서비스 지표 요약 (읽기 전용)

> 추가: 2026-10-08. 로그 콘솔 "서비스 지표" 탭(`backend-monitoring.md` 4장)이 읽는다 — 가입·탈퇴·청취를 수치로 보고 인사이트를 얻기 위한 화면. 다른 운영 지표 화면(일일 지표 Slack 보고 — GA4)과 달리 **전부 제품 DB 집계**다. **열 때 1회 + [새로고침]**만 호출하고 자동 폴링하지 않는다(3장) — 서버도 질의를 순차로 돌려 운영 DB 연결을 한 번에 하나만 쓴다.

**Query** — `days` (선택, 정수 1~90, 기본 14): 추이(`daily`·`weekday`·`hourly`)와 창 집계(`listening.window`)의 일수. `now - days` 이후의 행만 센다. 누적 카드·순위·구조 표는 창과 무관하게 **전 기간**이다(최근 24시간 순위 `recent_top_contents`와 코호트 리텐션 `retention_cohorts`도 창과 무관하다 — 아래).

**Query** — `market` (선택, `kr` · `global`, 추가 2026-10-25): 사용자의 **지금 시장**(`users.market`)으로 모든 집계를 좁힌다 — 시장을 옮긴 사람의 지난 기록도 새 시장으로 센다. 없으면 통합(종전과 같은 결과). 그 밖의 값은 400 `VALIDATION_FAILED`. **`by_market`은 이 값과 무관하게 늘 두 시장이다**(통합 화면의 비교표 원천).

**Response 200** (값은 예시 — `daily[].active_users`·`weekday`·`active_users_since`·`recent_*`·`retention_cohorts`는 2026-10-18 실측 기준 예시라 `since`·`generated_at`과 날짜가 맞지 않는다)

```json
{
  "days": 14, "market": null, "since": "2026-09-24T03:00:00.000Z", "generated_at": "2026-10-08T03:00:00.000Z",
  "users": {
    "total_signups": 259, "current": 225, "withdrawals": 34, "withdrawal_rate": 0.131,
    "onboarding_completed": 208, "onboarding_rate": 0.924, "trial_active": 139,
    "tiers": { "light": 225, "daily": 0, "pro": 0 }, "tier_events": { "daily": 0, "pro": 0 }, "paid_active": 0, "paid_rate": 0,
    "activated": 149, "activation_rate": 0.662,
    "active_1d": 63, "active_7d": 190, "active_30d": 220, "stickiness": 0.286,
    "listeners_1d": 52, "listeners_7d": 130, "listeners_30d": 149,
    "listener_rate_1d": 0.825, "listener_rate_7d": 0.684, "listener_rate_30d": 0.677,
    "by_provider": [ { "provider": "kakao", "count": 180 } ]
  },
  "listening": {
    "all_time": { "listen_sec": 122642, "plays": 373, "completes": 54, "complete_rate": 0.145, "listeners": 149, "saves": 119, "avg_listen_sec_per_play": 328.8, "avg_listen_sec_per_listener": 823.1 },
    "window":   { "listen_sec": 70844, "plays": 233, "completes": 40, "complete_rate": 0.172, "listeners": 130, "saves": 61, "avg_listen_sec_per_play": 304.1, "avg_listen_sec_per_listener": 545.0 }
  },
  "daily":  [
    { "date": "2026-09-18", "signups": 0, "withdrawals": 0, "plays": 9, "listeners": 7, "listen_sec": 2100, "completes": 1, "active_users": null },
    { "date": "2026-10-08", "signups": 28, "withdrawals": 1, "plays": 88, "listeners": 52, "listen_sec": 25100, "completes": 9, "active_users": 63 }
  ],
  "weekday": [
    { "weekday": 1, "label": "월", "days": 4, "active_days": 4, "avg_active_users": 12.25, "avg_listeners": 8 },
    { "weekday": 2, "label": "화", "days": 4, "active_days": 4, "avg_active_users": 11.75, "avg_listeners": 7 },
    { "weekday": 3, "label": "수", "days": 4, "active_days": 4, "avg_active_users": 13, "avg_listeners": 8.75 },
    { "weekday": 4, "label": "목", "days": 4, "active_days": 4, "avg_active_users": 12.25, "avg_listeners": 8 },
    { "weekday": 5, "label": "금", "days": 4, "active_days": 4, "avg_active_users": 8.5, "avg_listeners": 5.5 },
    { "weekday": 6, "label": "토", "days": 5, "active_days": 5, "avg_active_users": 8.4, "avg_listeners": 5.4 },
    { "weekday": 7, "label": "일", "days": 4, "active_days": 4, "avg_active_users": 9.5, "avg_listeners": 6 }
  ],
  "active_users_since": "2026-09-19",
  "hourly": [ { "hour": 0, "plays": 3, "listen_sec": 900 } ],
  "top_users":    [ { "user_id": "…", "listen_sec": 14953, "plays": 25, "completes": 6, "tier": "light", "signed_up_at": "…", "last_played_at": "…" } ],
  "top_contents": [ { "content_id": "…", "title": "…", "duration_sec": 812, "listen_sec": 9000, "plays": 40, "listeners": 31, "completes": 8, "complete_rate": 0.2, "saves": 5 } ],
  "recent_since": "2026-10-17T03:00:00.000Z",
  "recent_top_contents": [ { "content_id": "…", "title": "…", "duration_sec": 612, "listen_sec": 4380, "plays": 11, "listeners": 9, "completes": 4, "complete_rate": 0.364, "saves": 2 } ],
  "withdrawal_reasons": [ { "reason_code": "low_usage", "count": 9 }, { "reason_code": null, "count": 3 } ],
  "retention": [ { "day": 1, "cohort_size": 200, "returned": 50, "rate": 0.25 }, { "day": 7, "cohort_size": 150, "returned": 30, "rate": 0.2 }, { "day": 30, "cohort_size": 0, "returned": 0, "rate": null } ],
  "retention_cohorts": {
    "daily": {
      "span": 1, "offsets": [1, 7], "reliable_since": "2026-09-19",
      "rows": [
        { "start": "2026-10-17", "users": 6, "cells": [null, null] },
        { "start": "2026-10-10", "users": 9, "cells": [ { "returned": 4, "rate": 0.444, "partial": false }, { "returned": 2, "rate": 0.222, "partial": false } ] }
      ]
    },
    "weekly": {
      "span": 7, "offsets": [1, 2, 3, 4], "reliable_since": "2026-09-19",
      "rows": [
        { "start": "2026-09-07", "users": 8, "cells": [
          { "returned": 6, "rate": 0.75, "partial": true },
          { "returned": 7, "rate": 0.875, "partial": false },
          { "returned": 7, "rate": 0.875, "partial": false },
          { "returned": 2, "rate": 0.25, "partial": false }
        ] }
      ]
    }
  },
  "topic_supply": [ { "topic_id": "uuid", "name": "인문·교양", "is_visible": true, "published": 1, "published_in_window": 0, "interested_users": 101, "median_remaining": 0, "exhausted_users": 70, "low_users": 101 } ],
  "by_market": [
    { "market": "kr", "users": 225, "signups_in_window": 28, "onboarding_completed": 208, "active_7d": 190, "listeners_7d": 130, "listen_sec": 70844, "plays": 233, "paid_active": 0 },
    { "market": "global", "users": 0, "signups_in_window": 0, "onboarding_completed": 0, "active_7d": 0, "listeners_7d": 0, "listen_sec": 0, "plays": 0, "paid_active": 0 }
  ]
}
```

- `market`(추가 2026-10-25)은 요청한 시장(`kr` · `global`), 통합이면 `null`이다. 시장을 고르면:
  - 사용자 축(가입·활성·청취·일별·시간대·순위·리텐션·코호트·주제 수요)은 **지금 시장의 현재 계정**만 센다.
  - **탈퇴**(합계·일별·사유)는 `withdrawal_logs.market`(**탈퇴 당시 시장** — 계정이 지워져 지금 시장이 없다)으로 가른다.
  - **`listening.all_time`의 `listen_sec`·`plays`·`completes`**는 `play_daily_totals`(줄지 않는 누적)에 시장 열이 없어 재생 행(`play_records`, 현재 계정 기준)으로 센다 — 탈퇴자 몫이 빠져 통합보다 작게 나올 수 있다.
  - **`daily[].active_users`의 저장 표 몫**은 그날의 시장 행(`daily_active_users.market`)이다 — 그날 시장 기준이라 지금 시장 기준과 전환자만큼 다를 수 있다.
  - `topic_supply`는 그 시장 주제만이다.
- **개인 식별 정보는 어떤 필드에도 없다** — 사용자 순위는 `user_id`·티어·가입일·마지막 재생뿐이다(루트 CLAUDE.md 개인정보 원칙). 화면도 `user_id` 앞 8자만 적는다.
- `total_signups` = `current`(`users` 행 수 — 탈퇴 행은 지워져 없으므로 `status` 필터를 두지 않는다) + `withdrawals`(`withdrawal_logs` 행 수). 탈퇴는 `users` 행을 지우므로(`domain.md` 12.3) 둘을 더해야 "가입한 적 있는 사람"이다. `withdrawal_rate` = `withdrawals / total_signups`.
- `tiers`는 `users.tier` 캐시 기준이라 **초대 코드 이벤트로 받은 요금제도 들어 있다**(`domain.md` 8.6). `tier_events`는 그중 이벤트로 그 티어인 계정 수다 — 지금 지급 중인 요금제가 그 티어이고 같은 티어 이상의 살아 있는 구독이 없는 계정(결제와 겹치면 결제로 센다, 2026-10-10). 콘솔은 "Pro 30명 (이벤트 11명)"으로 그린다. `paid_active`는 결제만 세므로 이벤트 계정이 들어가지 않는다.
- `paid_active`는 `subscriptions`의 `status in (active, grace, cancelled)`(해지 예약은 만료일까지 유효 — `domain.md` 8.2) · `environment = production` · 미만료인 **사용자 수**(distinct)다. 샌드박스 결제는 세지 않는다. `trial_active`는 `users.trial_ends_at > now`.
- `active_1d/7d/30d`는 **앱 사용 기준 DAU·WAU·MAU** — 그 창 안에 `sessions.issued_at`이 있는 사용자 수(distinct). 액세스 토큰이 30분(`ACCESS_TOKEN_TTL_SEC`)이라 앱을 열면 거의 매번 리프레시 회전으로 세션 행이 새로 생기므로, 서버가 가진 신호 중 "앱 실행"에 가장 가깝다(30분 안의 재실행은 안 잡히고, 세션 행 보존 30일이 창의 상한). `stickiness` = `active_1d / active_30d`.
- `activated`는 `play_records`에 행이 하나라도 있는 사용자 수, `listeners_1d/7d/30d`는 그 창 안에 `played_at`이 있는 사용자 수(**재생** 기준). `listener_rate_*` = `listeners_* / active_*` — 활성 사용자 중 청취까지 간 비율(켜고 안 듣는 사람을 가른다).
- **`listening.all_time`의 `listen_sec`·`plays`·`completes`는 `play_daily_totals` 합계다**(2026-10-17 — `domain.md` 6.3-1). **탈퇴·보존 삭제로 줄지 않는 누적**이다. `all_time.listeners`·`saves`와 `window.*`는 종전대로 원천 기준이다(현재 계정 — 탈퇴하면 빠진다).
- 청취의 원천은 그 밖에는 **`play_records`**(`listened_sec` 합·행 수·distinct 사용자)다. `content_stats`는 경계 직후(05:30) 배치 집계라 하루 뒤처지고 탈퇴자 몫이 남아 두 숫자는 다를 수 있다 — 이 응답은 전자다. `completes`는 `user_signals.action = complete` 수, `saves`는 **직접 담기 수 — `user_signals.action = save`**(개정 2026-10-23 — 종전 `library_items.source = save`는 탐색 재생 자동 적립 행도 같은 출처라 섞였고, 자동 적립을 뺀 앱이 나가면 그만큼 급락해 추이가 끊긴다. 신호는 직접 담기에만 남는다 — `explore-api.md` 4.3. 신호는 180일 보존이라 전 기간 값도 그 안이다). 평균 두 개는 분모 0이면 `null`.
- 모든 비율(`*_rate`·`stickiness`)은 **분모 0이면 `null`**(0%와 "셀 수 없음"을 구분). 표본이 작을 때의 "참고" 표시는 화면 몫이다.
- `daily`는 `since`의 KST 날짜부터 오늘(KST)까지 **하루도 빠지지 않고**(기록 없는 날은 0), `hourly`는 0~23시 전부다. `daily.signups`는 `users.created_at`이라 그날 가입했다가 탈퇴한 사람은 빠진다(`withdrawal_logs`에는 가입일이 없다 — 생존 편향). 날짜는 **KST 달력일**이다(검색 로그 요약과 같은 기준 — 04/05시 서비스 날짜 경계를 쓰지 않는다. 정책 판정이 아니라 운영자가 읽는 단위).
- `daily[].active_users`(추가 2026-10-18 — `domain.md` 3.3-1)는 그날(KST 달력일) **접속자**, 즉 `sessions.issued_at`이 있는 사용자 수다. `active_1d`와 같은 신호를 하루 단위로 센다.
  - 지난날은 `daily_active_users`(시장 합)를 읽는다. 지난날 값은 탈퇴로 줄지 않는다.
  - **오늘은 세션에서 바로 센다.** 아직 저장되지 않았고, 그래프는 지금 값이어야 한다.
  - 표에 없는 날도 최근 29일(오늘 - 29일 ~ 어제, 세션이 온전히 남은 범위 — `INSIGHTS_LIVE_ACTIVE_DAYS`) 안이면 바로 센다. 오늘·바로 센 날은 현재 계정 기준이다.
  - 그 밖은 원천이 없어 **`null`**이다. 0명과 구분한다.
  - 시장은 나누지 않는다. 한 사용자는 한 시장이라 시장 합이 전체 distinct와 같다.
- `weekday[]`(추가 2026-10-18)는 요일별 평균이다. 월(1)~일(7) **7칸 고정**이다 — 창 안에 없는 요일도 0일 · `null`로 싣는다.
  - 창 안의 **온전한 KST 달력일만** 센다. 첫날(`since`가 걸친 날)은 청취가 그 시각 뒤만 잡혀 있고 오늘은 끝나지 않아 둘 다 뺀다. `since`가 KST 자정이면 첫날도 센다. 14일 창이면 13일이다.
  - `days`는 그 요일의 날 수다. `avg_listeners`는 `days`로 나눈 평균 청취자다.
  - `active_days`는 그중 `active_users`가 `null`이 아닌 날 수다. `avg_active_users`는 `active_days`로 나눈다.
  - 0일이면 평균은 `null`이다.
- `active_users_since`(추가 2026-10-18)는 접속자를 믿을 수 있는 첫 날(KST `YYYY-MM-DD`)이다. `min(daily_active_users.active_date)`와 "오늘 - 29일" 중 이른 쪽이다. 화면 각주가 "M월 D일부터 집계"로 쓴다.
- `top_users`·`top_contents`는 전 기간 청취 시간 내림차순 각 최대 15. `top_contents.saves`는 그 콘텐츠를 직접 담은 수.
- `recent_top_contents`(추가 2026-10-18 — FE 요청 "최근 하루 어떤 콘텐츠가 인기 있었는지")는 **최근 24시간** 인기 콘텐츠다. `recent_since`가 창 시작 시각(ISO)으로, **지금 - 24시간**이다(`INSIGHTS_RECENT_CONTENT_HOURS`). 굴러가는 창이라 KST 달력일과 다르다 — 자정 직후에 열어도 비지 않고, 언제 열든 같은 길이로 본다. `days` 창과 무관하다.
  - 항목 모양은 `top_contents`와 같다.
  - 세는 범위: 재생·청취 시간·청취자는 `recent_since` 이후 **시작된** 재생(`play_records.played_at`), 완청은 그 뒤에 생긴 완청 신호(`user_signals.created_at`), 담기는 그 뒤에 생긴 담기(`library_items.added_at`, `source = 'save'`)다.
  - **정렬은 청취자(서로 다른 사람) 수 순**이다. 같으면 청취 시간, 그다음 재생 수 순이다. 전 기간 순위(청취 시간 순)와 다른 이유는 한 사람이 오래 들은 편이 "인기"로 올라오지 않게 하기 위해서다.
  - 최대 15편이다(`top_contents`와 같은 길이). 창 안에 재생이 없으면 빈 배열이다.
  - 현재 계정 기준이다. 탈퇴자의 재생은 빠진다(`top_contents`와 같다). 담기는 나중에 지운 것(`deleted_at`)도 센다(전 기간 순위와 같은 관례).
  - **`complete_rate`는 드물게 높게 나올 수 있다.** 재생은 `play_records`(사용자·콘텐츠·서비스 날짜당 1행)의 첫 시작 시각으로, 완청은 신호 시각으로 창에 넣기 때문이다. 서비스 날짜 경계(05:00)를 걸쳐 들은 편은 재생은 창 밖이고 완청만 창 안일 수 있다.
- `retention`은 D1·D7·D30 — `cohort_size`는 가입한 지 `day`일이 지난 **현재 계정** 수, `returned`는 그중 가입 `day`일 뒤 이후 아무 때나 **앱을 쓴** 사람(토큰 갱신 `sessions.issued_at` 또는 재생 `play_records` — 세션 행은 30일만 보존되므로 영구 보존되는 재생을 합친다. 언바운디드). 탈퇴자는 분모에 없어 실제보다 높게 나온다(생존 편향). 하루만 보는(bounded) 방식은 수백 명 규모에서 표본이 너무 작아 쓰지 않는다.
- `retention_cohorts`(추가 2026-10-18 — 멘토 조언 "D1·D7, W1~4를 절대수치와 비율로 같이", `domain.md` 3.3-2)는 가입일·가입 주로 묶은 **바운디드** 코호트 리텐션이다. `daily`(D1·D7)와 `weekly`(W1~W4) 두 표이고, 각 표는 `span`(1 = 일별 · 7 = 주별)·`offsets`·`reliable_since`·`rows`다. 기존 언바운디드 `retention`은 그대로 두고 화면에 함께 보인다.
  - **묶음**: 현재 계정을 가입한 KST 달력일로 묶는다. `daily`는 최근 14일(어제부터, 오늘 제외), `weekly`는 최근 8주(이번 주 포함, ISO 주 월요일 시작 — `start`는 그 주 월요일)다. 최근 묶음이 먼저 온다. 가입 0명인 묶음도 행을 둔다. **창(`days`)과 무관하다.**
  - **구간**: **사람마다 자기 가입일 기준**이다. `offset`번째 구간은 가입일 + `offset × span`일부터 `span`일이다 — D1 = 가입 다음 날 하루, D7 = 가입 7일 뒤 하루(가입일 + 7), W1 = 7~13일, W2 = 14~20일, W3 = 21~27일, W4 = 28~34일 뒤.
  - **돌아옴**: 그 구간에 `user_active_dates` · 아직 남은 `sessions` · `play_records`(무기한) 중 하나라도 있으면 돌아온 것으로 센다(`returned`, distinct 사용자). 기존 `retention`과 같은 "앱을 썼다" 정의다(접속 또는 재생).
  - **칸 `null`**: 묶음의 **마지막 가입자 기준으로 구간이 아직 안 끝났다**(그 구간의 마지막 날이 오늘이거나 그 뒤). 일부만 끝난 묶음을 숫자로 내면 최근 묶음이 낮아 보여 섞지 않는다.
  - `rate`는 `returned / users`다. 가입 0명이면 `null`이다.
  - **`partial`**: 구간 시작일이 표의 `reliable_since`보다 이르다. 그 앞은 세션이 지워져 **재생만** 잡혀 실제보다 낮다.
  - `reliable_since`(KST `YYYY-MM-DD`)는 `user_active_dates`가 백필된 날(KST, `min(created_at)`) - 29일이다 — 그때 세션이 온전히 남아 있던 범위다. 표가 비었으면 오늘 - 29일이다(질의가 남은 세션도 함께 읽는다). 두 값 중 이른 쪽을 쓴다(오늘 - 29일보다 늦지 않다). 일별 접속자의 `active_users_since`를 빌리지 않는다 — 두 마이그레이션(`1790800000000`·`1790900000000`)이 다른 날 돌면(개발계) 어긋나기 때문이다. 두 표의 `reliable_since`는 같은 값이다.
  - **생존 편향**: 탈퇴자는 분모·분자 모두에서 빠진다. 기존 `retention`과 같다.
- `topic_supply`(추가 2026-10-13 — 추천 검증)는 주제별 수요·공급이다. `published`는 노출 중(발행·라이선스 유효) 콘텐츠 수, `published_in_window`는 그중 창 안에 발행된 수, `interested_users`는 그 주제를 활성 관심 주제로 둔 **온보딩 완료** 사용자 수다. `median_remaining`은 관심 사용자마다 "아직 드립으로 받을 수 있는 편수"(드립 후보 필터와 같은 기준 — 라이브러리에 한 번이라도 들어온 것·`drip_excluded_contents`를 뺀다, 시리즈 순서 게이트는 반영하지 않는 근사)의 중앙값, `exhausted_users`는 그 값이 0인 사람, `low_users`는 2 이하인 사람이다. 노출 중인 주제와, 숨김이어도 관심 사용자가 남은 주제를 싣고 `interested_users` 내림차순(같으면 `published`가 적은 쪽 먼저)으로 정렬한다 — 수요가 큰 주제부터 공급 상태를 본다. 콘솔은 상위 10개를 먼저 보이고 나머지는 [더보기]로 펼친다.
- `by_market`(추가 2026-10-14 — KAN-190, `global-api.md` 4.10)은 시장별 가입·활성·청취·결제다. **시장마다 한 칸**이다(계정이 없는 시장도 0으로 싣는다). 각 값은 `users`·`listening.window`의 같은 이름 지표를 시장으로 나눈 것이다 — `users`는 현재 계정 수, `signups_in_window`는 창 안 가입, `onboarding_completed`·`active_7d`·`listeners_7d`·`paid_active`는 `users`의 같은 지표, `listen_sec`·`plays`는 창 안 청취(`listening.window`). 시장은 **현재 계정**의 `users.market`으로 나눈다 — 탈퇴자는 어느 칸에도 없다(`withdrawal_logs.market`은 2026-10-17에 생겼지만 이 블록은 읽지 않는다).
- 인증은 다른 `/admin/*`와 같다(2장). 400 `VALIDATION_FAILED` — `days` 범위 밖. 응답은 `Cache-Control: no-store`.

### 4.22-1 `/admin/insights/recommendations/*` — 추천 검증 (읽기 전용 · 2026-10-22)

> 추가: 2026-10-22. 콘솔 **추천 검증 › 사용자별 추천**(`/drip-check/users`, 실배포)이 읽는다 — 처음엔 서비스 지표 화면 아래 보기로 열었다가 같은 날 편성 미리보기(4.16)·추천 테스트(4.17)와 같은 추천 검증 콘솔로 옮겼다(옛 `/backend-logs/insights/recommendations`는 그리로 돌려보낸다). 편성 미리보기 화면도 대상 사용자를 고르는 후보 목록으로 아래 목록 엔드포인트를 쓴다. 경로는 서비스 지표 아래(`/admin/insights/*`) 그대로이고, 인증·인가는 4.22와 같다(`JwtAuthGuard` + `AdminRoleGuard` — 401/403). 응답은 `Cache-Control: no-store`. 열 때 1회 + [새로고침]만 호출한다.

**개인정보** — 사용자는 `user_id`로만 가리킨다. **이메일·닉네임·제공자 ID·프로필 사진·직함은 서버가 조회하지도 싣지도 않는다.** 콘솔은 `user_id` 앞 8자리로만 보인다. 처리 근거는 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"이다. 탈퇴 사용자(행 없음 · `status ≠ active`)는 목록에 없고 상세는 404 다.

**읽기 전용** — 사용자 상태(`user_interests`·`user_preference_vectors`·`library_items`·`drip_*`·`user_settings` …)를 바꾸지 않는다. 계산은 4.16 과 같은 저장 없는 경로다(`DripPreviewService.explain` → `DripBatchOrchestrator.planForUser`, `READ_ONLY_PLAN_OPTIONS`). 유일한 쓰기는 상세 열람 1회마다 남기는 **감사 로그 `insights.recommendation_view`**(actor = 관리자 `user_id`, target = `user:<user_id>`, before/after 없음)다 — 감사 로그 액션 목록은 문서에 따로 없어 여기 적는다. 감사 로그를 남기지 못하면 데이터를 돌려주지 않는다. 404 는 남기지 않는다. 목록은 감사 로그를 남기지 않는다.

**`GET /admin/insights/recommendations/users?sort=listen|recent&limit=`**

| 쿼리 | 설명 |
|---|---|
| `sort` | `listen`(기본) — 최근 30일 청취 시간 순, 그 30일에 재생이 있는 사용자만 · `recent` — 마지막 재생(없으면 가입) 최신 순 |
| `limit` | 1~50, 기본 20. 범위 밖·`sort` 값 밖은 400 `VALIDATION_FAILED` |

```json
{ "sort": "listen", "since": "…(now-30일)", "generated_at": "…",
  "users": [ { "user_id": "uuid", "tier": "light", "signed_up_at": "…", "market": "kr",
               "interest_count": 3, "plays_30d": 12, "listen_sec_30d": 5400, "completes_30d": 4, "last_played_at": "…" | null } ] }
```

**`GET /admin/insights/recommendations/users/:userId`** — 400 `VALIDATION_FAILED`(uuid 아님) · 404 `NOT_FOUND`(없음·탈퇴)

| 필드 | 설명 |
|---|---|
| `user_id` · `generated_at` | |
| `profile` | `tier` `market` `signed_up_at` `onboarding_completed` `onboarding_step` `onboarding_completed_at` `job_category` `years_of_experience` `career_used`(커리어 적합도를 편성이 쓰는가 — KR 만) `is_auto_expand_enabled`(설정 행 없으면 true) |
| `interests[]` | `topic_id` `name` `source`(`onboarding`·`manual`·`auto_expand`) `is_active` `is_user_removed` `is_topic_visible` `added_at`(자동 슬롯 활성 행은 `updated_at`, 그 밖은 `created_at` — `domain.md` 4.2) `deactivated_at`. 비활성·해제 행 포함 |
| `listening` | `since`(now-30일) · `items[]`(최근 활동 순 최대 50): `content_id` `title` `topics[]` `duration_sec` `first_played_at` `last_played_at` `play_days`(들은 서비스 날짜 수) `listen_sec` `complete_count` `last_completed_at` `saved_at` `max_reached_sec` `listened_ratio`(도달 위치/길이, 0~1 · 진행 행 없으면 null) |
| `deliveries` | `since`(오늘 포함 최근 14 서비스 날짜의 시작) · `items[]`(최신 적립 순 최대 100, `library_items.source in drip,discovery` 삭제분 포함): `service_date` `added_at` `content_id` `title` `topics[]` `source` `algorithm_version` `status` `deleted` `played_after`(적립 뒤 재생 행) `completed_after`(완청 상태 또는 적립 뒤 완청 신호) `feedback_stars`(`drip_feedbacks`, 없으면 null) |
| `explanation` | **현재 시점 재계산** — `notice`("현재 시점 재계산 — 실제 과거 편성 당시 점수와 다를 수 있다") `computed_at` `service_date` `skip_reason` `unfinished_count` `unfinished_limit` `drip_count` `discovery_count` · `weights`(4.16 과 같음) · `preference`(4.16 의 값 + `signal_total` `signal_actions{행동:건수}` `signal_counts_by_topic[]{topic_id,name,counts,total}` — 취향 입력 신호를 주제 × 행동으로 센 것) · `auto_expand`(4.16 과 같음 — `feature_off` 등) · `exclusion_sources{library_contents, permanently_excluded}`(후보 SQL 이 빼는 사용자 이력의 원천 행 수) · `regular`·`discovery`(아래) · `discovery_error` · `today_placed[]` |

`regular` / `discovery`(편수 0 이면 null): `pool_size` `sql_filters[]`(후보 SQL 조건 설명 문구) `excluded_counts{사유:건수}`(정규 `episode_order` · 탐험 `user_removed_topic`·`below_quality_floor`) `candidate_count` `top[]`(점수 순 상위 20 — 4.16 `candidates[]` 항목 + `rank` `would_place`) `picks[]`(최종 선정 전부 — `pick_order` `content_id` `title` `score` `rank` `is_series_continuation` `is_outside_interests`; 다양성 선정이라 상위 20 밖에서 뽑힐 수 있다). 정규만 `series{gated_out[], continuation_count}`, 탐험만 `quality_floor` `typical_complete_rate`.

점수는 저장되지 않는다(`domain.md` 6.1·7장) — 배치가 뽑은 편의 점수는 구조화 로그 `drip pick scored`(CloudWatch, 보존 기간 한정)에만 있다.

### 4.23 `/admin/invite-codes` — 초대 코드 관리 (2026-10-10)

PoC·제휴 캠페인마다 코드를 만들고, 켜고 끄고, 사용 현황을 본다. 규칙의 원본은 `subscription.md` 4.9, 저장은 `domain.md` 8.5·8.6, 사용자 입력은 `subscription-api.md` 4.8-1이다. 콘솔 화면은 아직 없다(파이프라인 웹 몫 — 화면이 생기기 전에는 API로 직접 만든다). **삭제는 없다** — 끄면 새 입력만 막히고 지급 기록은 남는다.

**`POST /admin/invite-codes`** → 201 항목

```json
{
  "code": "SANGUN-POC",
  "name": "산군 PoC",
  "tier": "pro",
  "grant_days": 30,
  "max_redemptions": 50,
  "redeemable_until": "2026-12-01T00:00:00+09:00"
}
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `code` | 선택 | 영문·숫자·하이픈 4~32자. 대문자로 맞춰 저장한다. **비우면 서버가 8자로 만든다**(헷갈리는 0·O·1·I·L 제외). 같은 값이 있으면 409 `INVITE_CODE_DUPLICATE` |
| `name` | 필수 | 캠페인 이름(100자). 사용자 응답 `plan.grant.name`으로도 나간다 |
| `tier` | 필수 | `daily` \| `pro` |
| `grant_days` · `grant_until_date` | **정확히 하나** | 입력한 날부터 N일(1~366, 입력한 서비스 날짜가 1일째) 또는 마지막 서비스 날짜(`YYYY-MM-DD`, 그날까지). 둘 다·둘 다 없음·이미 지난 마지막 날은 400 |
| `max_redemptions` | 선택 | 사용 한도(계정 수, 1~1,000,000). 없으면 제한 없음 |
| `redeemable_from` · `redeemable_until` | 선택 | 입력을 받는 기간(ISO 8601, **시간대 필수** — `Z` 또는 `+09:00`. 없으면 서버 시간대로 해석돼 어긋나므로 400). 뒤집혀 있으면 400 |

**`GET /admin/invite-codes`** → 200 `{ "items": [항목] }` — 최근에 만든 순. `Cache-Control: no-store`.

**`PATCH /admin/invite-codes/:inviteCodeId`** → 200 항목. 받는 필드: `name` · `is_active` · `max_redemptions` · `redeemable_from` · `redeemable_until`(한도·기간은 `null`로 풀 수 있다. `name`·`is_active`의 `null`은 400). **코드 값·지급 요금제·지급 기간은 받지 않는다**(400) — 이미 받은 사람과 앞으로 받을 사람의 조건이 갈린다. 바꾸려면 새 코드를 만든다. 없는 id는 404 `INVITE_CODE_NOT_FOUND`.

**항목**

```json
{
  "id": "uuid", "code": "SANGUN-POC", "name": "산군 PoC", "tier": "pro",
  "grant_days": 30, "grant_until_date": null, "max_redemptions": 50,
  "redeemed_count": 12, "active_count": 11,
  "redeemable_from": null, "redeemable_until": "2026-11-30T15:00:00.000Z",
  "is_active": true, "created_at": "…", "updated_at": "…"
}
```

- `redeemed_count` — 지금까지 사용한 계정 수(탈퇴해도 줄지 않는다). `active_count` — 지금 지급 중인 계정 수(목록에서만, 만들기·고치기 응답은 `null`).
- **사용자 식별 정보는 싣지 않는다** — 누가 썼는지는 집계만 본다(CLAUDE.md 개인정보 원칙). PoC 사용 데이터 분석이 계정 단위로 필요해지면 그때 `user_id` 목록 API를 따로 정한다.
- 같은 코드를 동시에 만들어도 409다(유니크 인덱스). 만들기·고치기는 `audit_logs`에 `invite_code.create` · `invite_code.update`로 남는다(전후 값 — 코드 테이블에 작성자 컬럼이 없다).

### 4.24 `/admin/series` — 시리즈 관리 (2026-10-17 — KAN-134)

시리즈 행(`domain.md` 5.9)을 만들고 고친다. 인증·인가는 다른 관리자 API와 같다(`JwtAuthGuard` + `AdminRoleGuard` — 일반 계정 403). 쓰기는 감사 로그와 한 트랜잭션이다(`series.create` · `series.update` · `series.cover`, target `series:<id>`, 소개는 길이만 남긴다. `series.cover`는 before/after 에 `cover_url`, after 에 변환 뒤 `width`·`height` — 추가 2026-10-21 KAN-234). **삭제는 없다.**

**항목(`AdminSeriesItem`) — 네 엔드포인트 응답이 같은 모양**

```jsonc
{
  "id": "uuid",
  "title": "키워드로 빠르게 배우는 CS 지식",
  "description": "…",
  "total_episodes": 16,
  "status": "ongoing" | "completed",
  "episode_counts": { "published": 16, "withdrawn": 0, "expired": 0 },  // 이 시리즈의 편 수(상태별). published 는 상태 기준(라이선스 만료 전 포함)
  "max_published_episode_no": 16,   // 발행 중인 가장 큰 편 번호. 없으면 null — total_episodes 를 줄일 수 있는 하한
  "cover_url": "https://…/thumb/….webp" | null,   // 올린 표지(없으면 null — 빈 문자열도 null 로 낸다). null 이어도 앱에는 가장 앞 편 썸네일이 표지로 나간다 (추가 2026-10-21 — KAN-234)
  "publisher_name": "키워드",       // 발행 이름 — 앱 시리즈 화면 제목 아래 줄. 없으면 null (추가 2026-10-22)
  "created_at": "2026-10-17T08:00:00.000Z",
  "updated_at": "2026-10-17T08:00:00.000Z"
}
```

**`GET /admin/series`** → 200 `{ "items": AdminSeriesItem[] }` — 만든 최신순, 페이지 없음(수십 단위). `Cache-Control: no-store`.

**`POST /admin/series`** → 201 `AdminSeriesItem`

```jsonc
{
  "title": "…",            // 필수, 공백만은 안 됨, ≤255자 (앞뒤 공백은 서버가 자른다)
  "description": "…",      // 필수 키, 빈 문자열 허용, ≤2000자
  "total_episodes": 3,     // 필수, 정수 ≥1 (상한 없음 — int 범위 밖만 400)
  "status": "ongoing",     // 선택, 없으면 ongoing
  "publisher_name": "키워드" // 선택, ≤50자. 앞뒤 공백은 자르고 빈 문자열·null 은 없음 (추가 2026-10-22)
}
```

- 파이프라인 [시리즈 발행]은 이것을 먼저 부르고 받은 `id`를 업로드(4.6)의 `series_id`로 보낸다(`ai/spec/11-series.md` 7장). 시장을 받지 않는다 — 첫 편이 정한다.

**`PATCH /admin/series/:seriesId`** → 200 `AdminSeriesItem`

```jsonc
{ "title": "…", "description": "…", "total_episodes": 20, "status": "completed", "publisher_name": "키워드" }   // 전부 선택, 담긴 키만 바꾼다. publisher_name 만 null(또는 빈 문자열)로 지울 수 있다
```

- `total_episodes`는 **`max_published_episode_no`보다 작게 줄일 수 없다** → 400 `VALIDATION_FAILED`(`details.field = "total_episodes"`, "이미 N화까지 발행돼 그보다 작게 줄일 수 없어요"). 같게 줄이거나 늘리는 것은 된다. 회수된 편 번호는 하한에 들지 않는다.
- 편들의 `contents.total_episodes` 사본은 고치지 않는다(사용자 응답은 시리즈 표 값을 쓴다). 편수를 늘린 뒤 올리는 편은 새 편수로 보낸다.
- 바꿀 키가 없으면 400 `VALIDATION_FAILED`("바꿀 항목이 없어요"). `null`·모르는 필드·모르는 `status` 값은 400. 없는 시리즈 404 `NOT_FOUND`. uuid가 아니면 400.

**`PUT /admin/series/:seriesId/cover`** → 200 `AdminSeriesItem` (추가 2026-10-21 — KAN-234) — multipart/form-data, 파일 필드 `cover` 하나(다른 파일 필드는 400). 형식·크기·저장 규격은 4.6 `thumbnail` 과 같다 — jpg/jpeg/png/webp, ≤5MB, 서버가 WebP 긴 변 768px 로 다시 쓰고 `thumb/` 접두사로 올린다(값의 종류는 `contents.thumbnail_url`과 같다). 다시 올리면 교체되고 옛 표지 객체는 커밋 뒤 지운다(4.10 썸네일 재발행과 같다 — 지우지 못해도 교체는 성공). 표지만 따로 지우는 API 는 없다. **`POST`·`PATCH`와 경로를 나눈 이유** — 둘은 JSON 이고 배포된 파이프라인이 JSON 으로 부른다(multipart 로 바꾸면 깨진다).

- 400 `VALIDATION_FAILED`(`details.field = "cover"`) — 파일 없음("표지 이미지가 필요해요") · 허용되지 않는 형식 · 5MB 초과 · 읽을 수 없는 이미지. 20MB 를 넘는 본문은 수신 단계에서 413(서버 보호 상한, 필드 표기 없음).
- 404 `NOT_FOUND` 없는 시리즈(저장소에 올리기 전에 판정) · 400 uuid 가 아님 · 403 일반 계정 · 502 `ADMIN_STORAGE_FAILED`(retryable) 저장소 실패.
- 표지는 파이프라인 콘솔 [시리즈] 화면의 제품 시리즈 표지 칸에서 파일을 골라 올린다(KAN-136). [시리즈 발행](`POST /admin/series` → 업로드)은 표지를 자동으로 올리지 않는다(코드 대조 2026-10-23).

**에러 코드**: 새 코드 없음 — `VALIDATION_FAILED`(400) · `NOT_FOUND`(404) · `CONFLICT`(409, 4.8 복구) · `ADMIN_STORAGE_FAILED`(502, 표지) · `UNAUTHORIZED`/`FORBIDDEN`.

## 5. 에러 코드 표

| error_code | HTTP | retryable | 발생 지점 |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | false | 필수값 누락·형식 위반. `details.field` 포함 |
| `ADMIN_AUDIO_UNREADABLE` | 400 | false | 4.6·4.10 — 오디오 길이 추출 실패·0초 |
| `ADMIN_TOPIC_NOT_FOUND` | 400 | false | 4.6 — 존재하지 않는 `topic_ids`. **숨김 주제는 허용된다** |
| `ADMIN_LICENSE_EXPIRED` | 400 | false | 4.6 — 만료된 파트너 라이선스 |
| `FORBIDDEN` | 403 | false | 전 라우트 — `role != admin` |
| `ADMIN_TOPIC_HAS_CONTENTS` | 409 | false | 4.4 — `details.content_count` |
| `ADMIN_TOPIC_HAS_NO_CONTENTS` | 409 | false | 4.3 — 노출 가능 콘텐츠 0건인 주제의 노출 켜기. `details.content_count = 0` |
| `CONFLICT` | 409 | false | 4.7 — 이미 회수됨 / 4.8 — 회수 상태가 아님 · 시리즈 편 복구 시 같은 번호가 발행 중이거나 편수 밖(2026-10-17) / 4.10 · 4.11 — `withdrawn`이 아님 |
| `VALIDATION_FAILED` | 400 | false | 4.10 — 파트가 하나도 없음(`details.field = "audio"`) / `sources` 교체가 `origin`의 공시 규칙에 어긋남(`details.field = "sources"`) / 4.24 표지(`cover`) — 파일 없음·형식·5MB 초과·읽을 수 없는 이미지(`details.field = "cover"`, 2026-10-21) |
| `ADMIN_STORAGE_FAILED` | 502 | **true** | 4.6·4.10·4.24 표지 — 저장소 실패 |
| `NOTICE_CURSOR_INVALID` | 400 | false | 4.12 — 커서 형식 오류, 사용자 목록 커서를 넣음 |
| `NOTICE_NOT_FOUND` | 404 | false | 4.14·4.15 — 없거나 삭제된 공지 |
| `NOT_FOUND` | 404 | false | 4.16 — 그 `user_id`의 사용자 없음·탈퇴(개정 2026-10-22) / 4.17 — 테스트 계정이 이 서버에 가입돼 있지 않음 · `delete` 대상이 라이브러리에 없음 / 4.22-1 — 없거나 탈퇴한 사용자(2026-10-22) / 4.24 — 없는 시리즈(2026-10-17) · 4.24 표지(`cover`)의 없는 시리즈(2026-10-21) |
| `ADMIN_RECOMMEND_TEST_DISABLED` | 409 | false | 4.17 — 환경이 `development`가 아니거나(`SENTRY_ENVIRONMENT`, 비면 `NODE_ENV`) `RECOMMEND_TEST_EMAIL` 미설정 |
| `INVITE_CODE_DUPLICATE` | 409 | false | 4.23 — 같은 값의 초대 코드가 이미 있다 |
| `INVITE_CODE_NOT_FOUND` | 404 | false | 4.23 — 고치려는 초대 코드가 없다 |

전체 목록·클라이언트 동작은 `common-error-handling.md` 9.10이 기준이다.

## 6. 흐름 — 업로드(4.6)

```
[검증]  필수값 · 파일 형식 · 라이선스 기간 · 주제 유효성
   ↓
[저장]  오디오·썸네일을 저장소에 업로드 → audio_path 확보   ← 트랜잭션 밖
   ↓
[트랜잭션]  contents(status=published, published_at=now)
            + content_topics + content_sources(ai_generated)
   ↓ 실패 시
[정리]  올린 파일을 지운다
```

- **저장소 먼저, DB 나중이다**(`admin.md` 4.2). 반대로 하면 수백 MB 전송 동안 트랜잭션이 열려 있게 된다.
- **썸네일은 올리기 전에 저장 규격으로 다시 쓴다**(개정 2026-09-19 — `tickets/backend/archive/thumbnail-resize-on-upload.md`). 입력은 jpg/png/webp ≤5MB 그대로 받되, 서버가 EXIF 회전을 굽고 **긴 변 768px(비율 유지·확대 없음) WebP(품질 82)** 로 변환해 `thumb/<random>.webp` 로 올린다. 파이프라인의 1024px PNG(장당 1.5MB)를 그대로 내보내면 앱 목록 첫 화면이 30MB 를 받고, iOS 는 PNG 하드웨어 디코드가 없어 타일이 순서대로 뜨는 것이 보였다. 저장 시점에 줄이면 출처(파이프라인·파트너)와 무관하게 전부 잡히고 앱은 바꿀 것이 없다. 이미지로 읽지 못하는 파일은 `VALIDATION_FAILED`(`field: thumbnail`)다. 규격 도입 이전 파일은 `npm run thumbnails:reprocess` 가 새 키로 다시 써서 URL 을 바꾼다(버전은 올리지 않는다 · 감사 로그 `content.thumbnail_reprocess`).
- **`draft`가 없다. 업로드 = 발행이다**(`domain.md` 5.1). 별도 발행 버튼이 없다.
- **재생 경로 등록 단계가 없다.** `audio_path`를 직접 서명하므로 매핑 계층이 없고, 따라서 발행 직후 전파 지연도 없다(`backend/architecture.md` 9.4 — 개정 2026-08-31).

## 7. 보안·검증 규칙

- **`audio_path`를 응답에 싣지 않는다**(`domain.md` 5.1). `AdminContentItem`에도 없다 — 관리자라고 예외를 두지 않는다.
- 썸네일은 `thumbnail_url`(무서명 공개 경로)로 내려간다. 오디오와 취급이 다르다(`architecture.md` 9.4).
- 파일 크기·MIME 검증은 서버에서 한다. 콘솔의 `accept` 속성은 편의일 뿐 판정이 아니다.

## 8. 데이터 모델 — `AdminContentItem`

```
id, title, description, origin, status,
author_name, source_name, source_url, partner_id,
series_id, episode_no, total_episodes,
duration_sec, thumbnail_url, content_version,
market, language                                 // 시장(kr | global)·콘텐츠 언어(ko | en) (2026-10-14 KAN-190)
license_expires_at, published_at, withdrawn_at,
topics[{ topic_id, name }],
enrichment_schema_version, enriched_at          // 마지막 적용 메타 파일의 형식 버전·시각. null = 받은 적 없음 (2026-09-11)
has_current_embedding                            // 추천 스코어링에 쓰이는 임베딩이 있는가 (2026-10-13)
```

- `enrichment_schema_version`이 현재 형식(목록 응답 최상위 `current_enrichment_schema_version` — 4.5, 지금 3 — 2026-10-08 KAN-162)보다 낮거나 null이면 **구형 메타**다. 콘솔이 그 콘텐츠를 골라 메타를 다시 뽑아 4.10의 `enrichment_file` 단독 전송으로 갱신한다(콘솔 기능은 `tickets/ai/pending` 참조).
- `has_current_embedding`(추가 2026-10-13)은 현재 임베딩 모델이고 `content_embeddings.content_version`이 콘텐츠의 `content_version`과 일치하는 행이 있는가다(`drip-scheduling.md` 6장 — 스코어링이 읽는 조건과 같다). **메타 형식 버전과 별개다** — 오디오를 바꾸는 재발행은 대본이 바뀌었을 수 있어 임베딩을 미갱신으로 남기므로, 형식이 최신이어도 false가 된다(2026-10-13 운영 발행 56편 전부가 이 상태였다). false인 콘텐츠도 메타를 다시 뽑아 4.10의 `enrichment_file` 단독 전송으로 갱신할 대상이다. 오디오를 바꾸지 않는 재발행(썸네일·제목 등)은 버전이 오르지 않아 true가 유지된다(개정 2026-10-20 — KAN-236, 종전 승계 갱신은 지웠다).

**`audio_path`는 싣지 않는다**(7장).

- `series_id`·`episode_no`·`total_episodes`는 종전 그대로 편의 값이다(`total_episodes`는 업로드 때의 사본 — `domain.md` 5.1). 시리즈 제목·현황은 `GET /admin/series`(4.24)로 본다(2026-10-17).
- `has_script`(boolean, 2026-09-19 KAN-71) — `content_scripts` 행 존재 여부. 콘솔이 목록에 "자막" 표시를 그린다. `script_applied` · `script_rejected_reason`은 요청에 `script_file`이 있었을 때만 실린다(4.6).

## 9. 미결 사항

- **`partner_id` 존재 검증** — `partners` 테이블이 없어 형식만 본다. 테이블 도입 시 FK와 함께 검증을 넣는다
- **업로드 파일 규격** — 비트레이트·샘플레이트 상한 미정(`admin.md` 미결과 공유). 현재는 용량·MIME만 본다. 음질 3종의 코덱·비트레이트·채널·샘플레이트·크기는 서버가 파일에서 읽어 `content_audio_renditions`에 적는다(검증이 아니라 기록 — 2026-10-06)
- **중복 업로드 방지 키** — 현재는 운영 책임(`admin.md` 미결). `(partner_id, source_url)` 유니크 도입 여부 미정
- **파일 규격 상한은 서버 보호용 임시값이다** — `admin.constant.ts`가 그렇게 명시한다. `admin.md` 미결 "업로드 대상 파일 규격"이 확정되면 상수만 바꾼다

> 에러 코드 5종은 **이미 `error-code.enum.ts`에 등재돼 있다**(코드 대조 2026-09-03). `common-error-handling.md` 9.11의 enum 동기화 대기 목록에 넣지 않는다.
