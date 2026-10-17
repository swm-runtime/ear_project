# 시리즈 1단계 — `series` 테이블 · 관리 API · 업로드 검증 · 응답의 `series` 객체 · `GET /series/:id` · 드립 다음 편 판정 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 5.1(`contents.series_id` FK·부분 유니크) · 신설 5.9 `series` · 2장 모듈 소유 표(`content`) · `backend/architecture.md` 4.5 의존 표(신설 `SeriesDetail`) · `backend/recommendation-evaluation.md`(불변식 `series-order` 문구) · `spec/api/admin-api.md` 4.6(업로드 시리즈 검증) · 4.8(복구 409) · 신설 4.24 `/admin/series` · 8장 · `spec/api/explore-api.md` 4.1·4.2·4.2-1·4.5 항목의 `content.series` · 신설 4.7 `GET /series/:series_id` · `spec/api/library-api.md` 4.1·4.3 `content.series` · `spec/api/player-api.md` 4.1 `content.series` · `spec/api/content-detail-api.md` 4.1 `content.series` |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-17 |
| 관련 | [KAN-134](https://runtime364.atlassian.net/browse/KAN-134) (`tickets/backend/pending/series-backend.md` "확정 설계" 1·2·3·5·7번) · FE [KAN-225](https://runtime364.atlassian.net/browse/KAN-225)가 이 계약을 읽는다 · AI KAN-136(파이프라인 [시리즈 발행]이 `POST /admin/series`를 부른다) · 브랜치 `feat(be)/series-backend` · 마이그레이션 `1790700000000-AddSeries` · `1790700100000-SeedCsKeywordSeries` |

## 배경

KAN-134 확정 설계(2026-10-17, 박수헌)를 **설치된 앱(1.2.1)을 깨지 않는 부분부터** 구현했다(1단계). 응답은 전부 **필드 추가만** 했다 — 기존 필드의 이름·모양·의미를 바꾸지 않는다. 탐색의 시리즈 카드 묶음(확정 설계 4번 — `type: "content" | "series"`가 섞인 목록)은 **이번 범위 밖**이다. 옛 앱이 모르는 항목 종류를 받으면 목록이 깨지므로, FE(KAN-225)가 새 종류를 그릴 수 있게 된 뒤 2단계로 한다.

기준은 코드다 — 아래 계약은 브랜치의 구현과 e2e(`test/series.e2e-spec.ts`)로 확인한 값이다.

## 수정 내용

### 1. `backend/domain.md`

- **5.9 `series` (신설)** — 시리즈의 주인. `contents.series_id`의 FK 대상.

  ```
  series
    id              uuid          PK
    title           varchar(255)  NOT NULL
    description     text          NOT NULL   빈 문자열 허용(소개 없음)
    total_episodes  int           NOT NULL   CHECK >= 1 — 계획 편수. 총 편수의 기준. 상한 없음
    status          varchar(20)   NOT NULL   CHECK IN ('ongoing','completed')
    created_at · updated_at
  ```

  - **표지 칸이 없다** — 표지는 노출 중인 가장 앞 편(보통 1화)의 썸네일이다(결정 2026-10-09).
  - **시장 칸이 없다** — 시리즈는 편(`contents.market`)의 시장을 따른다. 한 시리즈에 시장이 섞이지 않게 업로드가 막는다(admin-api 4.6).
  - `status`는 표시용 구분이다 — 업로드·노출을 막지 않는다. `ongoing`이면 편수를 늘려 편을 더한다.
  - 삭제 API가 없다. 편이 FK로 가리킨다(`ON DELETE RESTRICT`).
  - 담기·재생 위치·완청·통계·페이월 차감은 편 단위 그대로다 — 그 테이블들은 `series`를 참조하지 않는다.
- **5.1 `contents`**
  - `series_id` → `series.id` FK(`fk_contents_series`, `ON DELETE RESTRICT`).
  - 부분 유니크 `uq_contents_series_id_episode_no_published (series_id, episode_no) WHERE status = 'published' AND series_id IS NOT NULL` — 같은 시리즈에 같은 번호가 둘 발행되지 않는다. 회수·만료 편은 빠지므로 "회수 후 같은 번호로 다시 올리기"는 된다. (`series_id IS NOT NULL`은 단일 콘텐츠를 인덱스에서 빼는 것뿐 — 판정은 같다.)
  - `total_episodes`는 **업로드 계약 호환으로 남은 사본**이다. 업로드 때 `series.total_episodes`와 같아야 하고, 응답의 총 편수는 `series.total_episodes`에서 읽는다. 시리즈 편수를 고쳐도(`PATCH /admin/series/:id`) 편의 사본은 고치지 않는다.
  - 마이그레이션의 기존 데이터 처리: 고아 `series_id`(가리키는 시리즈가 없는 값 — 로컬·개발계 시드)는 **자리표시 시리즈 행**으로 메운 뒤 FK를 검증된 상태로 걸었다(제목 = 그 시리즈 가장 앞 편의 제목, 소개 `''`, 총 편수 = `max(total_episodes, episode_no, 1)`, `ongoing`). 운영은 시리즈 편이 0건이라 만들 행이 없다. 이미 발행 번호 중복이 있으면 마이그레이션이 이유를 밝히고 멈춘다(어느 편을 남길지는 사람이 정한다).
- **2장 모듈 소유 표** — `content`에 `series`를 더한다(`SeriesService`가 export).
- **CS 키워드 시리즈(데이터)** — 마이그레이션 `1790700100000`이 시리즈 행 하나(id **`7de91e6e-2e96-4aea-9ddb-80fe99179c2e`** 고정, "키워드로 빠르게 배우는 CS 지식", 16편, `completed`)를 만들고 티켓 표의 16개 콘텐츠에 `series_id`·`episode_no`(1~16)·`total_episodes`(16)를 채웠다. `content_id`·`content_version`·제목·오디오는 그대로다. id를 고정한 이유는 운영 → 개발계 콘텐츠 동기화가 행을 id로 맞추기 때문이다(아래 "배포 메모").

### 2. `backend/architecture.md` 4.5 의존 표

- **SeriesDetail (신설)** — 의존: Content, Library, Playback. **Entity를 소유하지 않는 유스케이스 모듈**(ContentDetail과 같은 형태). `GET /series/:series_id`. 어떤 모듈도 의존하지 않는다.
- Admin·Explore·LibraryScreen·ContentDetail·Playback·DripBatch는 새 의존 방향이 없다(모두 이미 Content를 의존한다 — `SeriesService`·`ContentService`만 더 부른다).

### 3. `backend/recommendation-evaluation.md` — 불변식 `series-order`

- 문구: "시리즈는 직전 편을 완청한 다음 편만 정규로 가고…" → **"시리즈는 규칙 ②′가 고른 편(마지막 완청 뒤 받지 않은 가장 앞 편 · 없으면 빈 편, 미완청 앞 편이 있으면 기다림) 하나만 정규로 가고, 탐험은 1편(또는 단편)만 간다"**. 판정: 정규 편성분의 시리즈 편이 `pickSeriesEpisode`(아래 "범위 밖"의 규칙 ②′)가 고른 편과 다르거나, 같은 시리즈 편이 한 날 둘 가면 위반(입력은 편성 계산이 쓴 `RegularPlan.seriesEpisodesBySeries`).

### 4. `spec/api/admin-api.md`

#### 4.6 `POST /admin/contents` — 시리즈 필드 검증 추가

`payload`의 `series_id`가 있으면(종전대로 `episode_no`·`total_episodes`도 필수) 다음을 본다. 전부 **400 `VALIDATION_FAILED`** 이고 `details.field`로 칸을 알린다(이 문서의 다른 필드 오류와 같은 표기 — 응답 본문에서는 `details`가 펼쳐져 최상위 `"field": "series_id"`로 온다). **저장소에 파일을 올리기 전에** 거절하고, 발행 트랜잭션 안에서 시리즈 행을 잠그고 한 번 더 본다.

| 조건 | `details.field` | 메시지(예) |
|---|---|---|
| `series_id`인 시리즈가 없다 | `series_id` | 존재하지 않는 시리즈예요 |
| `total_episodes` ≠ `series.total_episodes` | `total_episodes` | 총 편수가 시리즈의 편수(3편)와 달라요 |
| `episode_no`가 1..`series.total_episodes` 밖 | `episode_no` | 편 번호는 1~3 사이여야 해요 |
| 같은 `(series_id, episode_no)`로 발행 중인 편이 있다 | `episode_no` | 이 시리즈에 같은 번호로 발행된 편이 이미 있어요 |
| 시리즈에 이미 올라간 편(상태 무관)과 `market`이 다르다 | `series_id` | 다른 시장의 편이 있는 시리즈예요 |

- 종전 검사(시리즈인데 편 번호·총 편수가 없음 / 편 번호 > 총 편수 → `episode_no`)는 그대로다.
- 동시 업로드가 같은 번호로 경합해 부분 유니크에 걸려도 500이 아니라 같은 400(`episode_no`)이다.
- **시리즈는 먼저 `POST /admin/series`로 만들고 그 `id`를 보낸다.** 기존 콘텐츠를 시리즈로 지정하는 API는 없다 — 4.10(업로드 뒤 시리즈 필드는 바꾸지 않는다)은 그대로다.

#### 4.8 `POST /admin/contents/:contentId/restore` — 409 사유 추가

- 회수된 시리즈 편을 되돌릴 때, 그 사이 **같은 번호로 다른 편이 발행됐거나** 시리즈 편수가 그 번호보다 작게 줄었으면 **409 `CONFLICT`** — "같은 번호로 발행된 편이 있어 되돌릴 수 없어요" / "시리즈 편수보다 큰 번호라 되돌릴 수 없어요". (종전 409: 회수 상태가 아님.)

#### 4.24 `/admin/series` — 시리즈 관리 (신설)

인증·인가는 다른 관리자 API와 같다(`JwtAuthGuard` + `AdminRoleGuard` — 일반 계정 403). 쓰기는 감사 로그와 한 트랜잭션이다(`series.create` · `series.update`, target `series:<id>`, 소개는 길이만 남긴다). 삭제는 없다.

**항목(`AdminSeriesItem`) — 세 엔드포인트 응답이 같은 모양**

```jsonc
{
  "id": "uuid",
  "title": "키워드로 빠르게 배우는 CS 지식",
  "description": "…",
  "total_episodes": 16,
  "status": "ongoing" | "completed",
  "episode_counts": { "published": 16, "withdrawn": 0, "expired": 0 },  // 이 시리즈의 편 수(상태별). published 는 상태 기준(라이선스 만료 전 포함)
  "max_published_episode_no": 16,   // 발행 중인 가장 큰 편 번호. 없으면 null — total_episodes 를 줄일 수 있는 하한
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
  "status": "ongoing"      // 선택, 없으면 ongoing
}
```

- 파이프라인 [시리즈 발행]은 이것을 먼저 부르고 받은 `id`를 업로드의 `series_id`로 보낸다(`ai/spec/11-series.md` 7장). 시장을 받지 않는다 — 첫 편이 정한다.

**`PATCH /admin/series/:seriesId`** → 200 `AdminSeriesItem`

```jsonc
{ "title": "…", "description": "…", "total_episodes": 20, "status": "completed" }   // 전부 선택, 담긴 키만 바꾼다
```

- `total_episodes`는 **`max_published_episode_no`보다 작게 줄일 수 없다** → 400 `VALIDATION_FAILED`(`details.field = "total_episodes"`, "이미 N화까지 발행돼 그보다 작게 줄일 수 없어요"). 같게 줄이거나 늘리는 것은 된다. 회수된 편 번호는 하한에 들지 않는다.
- 편들의 `contents.total_episodes` 사본은 고치지 않는다(응답은 시리즈 표 값을 쓴다). 편수를 늘린 뒤 올리는 편은 새 편수로 보낸다.
- 바꿀 키가 없으면 400 `VALIDATION_FAILED`("바꿀 항목이 없어요"). `null`·모르는 필드·모르는 `status` 값은 400. 없는 시리즈 404 `NOT_FOUND`. uuid가 아니면 400.

**에러 코드(5장에 더함)**: 새 코드 없음 — `VALIDATION_FAILED`(400) · `NOT_FOUND`(404) · `CONFLICT`(409, 복구) · `UNAUTHORIZED`/`FORBIDDEN`.

#### 8장 데이터 모델

- `AdminContentItem`의 `series_id`·`episode_no`·`total_episodes`는 종전 그대로(편의 값). 시리즈 제목·현황은 `GET /admin/series`로 본다.

### 5. 사용자 응답의 `content.series` — 탐색·라이브러리·플레이어·상세 (전부 추가 필드)

모든 화면이 **같은 모양의 객체 하나**를 `content.series`에 싣는다. 단일 콘텐츠는 `null`이다. `total_episodes`는 시리즈 표(`series.total_episodes`)의 값이다.

```jsonc
"series": {
  "id": "7de91e6e-2e96-4aea-9ddb-80fe99179c2e",
  "title": "키워드로 빠르게 배우는 CS 지식",
  "episode_no": 3,
  "total_episodes": 16
}
// 단일 콘텐츠: "series": null
```

| 문서 | 자리 |
|---|---|
| `explore-api.md` 4.1 피드 · 4.2 주제별 · 4.2-1 인기 · 4.5 검색 | 각 항목의 `content.series` (`ExploreItem`) |
| `library-api.md` 4.1 목록 · 4.3 복원(`resume_target.content.series`) | `items[].content.series` |
| `player-api.md` 4.1 `POST /contents/:id/audio-urls` | `content.series` |
| `content-detail-api.md` 4.1 | `content.series` — **종전 `series_id`를 남긴 채** `id`·`title`이 붙는다: `{ "series_id", "id", "title", "episode_no", "total_episodes" }`. `series_id`는 `id`와 같은 값이고 설치된 앱(1.2.1) 호환으로만 남긴다(새 화면은 `id`를 쓴다). `total_episodes`는 이제 시리즈 표의 값이다 |

- 목록은 시리즈 행을 한 번에 읽는다(항목 수만큼 조회하지 않는다).
- 탐색 목록은 **여전히 편마다 한 줄**이다(묶음 카드는 2단계).

### 6. `explore-api.md` 4.7 `GET /series/:series_id` — 시리즈 화면 (신설)

탐색에서 시리즈를 눌렀을 때의 화면 데이터(확정 설계 3번). 인증 필요(`JwtAuthGuard`, access token의 `market` 클레임으로 시장을 정한다 — 없으면 KR).

**요청**: `GET /api/v1/series/7de91e6e-2e96-4aea-9ddb-80fe99179c2e` (본문·쿼리 없음)

**응답 200**

```jsonc
{
  "series": {
    "id": "7de91e6e-2e96-4aea-9ddb-80fe99179c2e",
    "title": "키워드로 빠르게 배우는 CS 지식",
    "description": "소프트웨어 개발부터 …",
    "total_episodes": 16,            // 계획 편수. episodes 는 노출 중인 편만이라 이보다 적을 수 있다
    "status": "completed",           // ongoing | completed — 표시용
    "thumbnail_url": "https://…/1화.webp"   // 표지 = 노출 중인 가장 앞 편(보통 1화)의 썸네일
  },
  "episodes": [                      // 노출 중인 편만(published·라이선스 유효·사용자 시장), episode_no 오름차순
    {
      "episode_no": 1,
      "content": {                   // 탐색 카드의 content 와 같은 모양 — 같은 행 컴포넌트로 그린다
        "id": "82a54da2-a7f7-4586-b647-5930c197a1e7",
        "title": "키워드로 빠르게 배우는 CS 지식 1 - 소프트웨어를 만드는 방법",
        "author_name": null,
        "source_name": "참고한 자료: …",
        "source_url": null,
        "duration_sec": 1260,
        "thumbnail_url": "https://…/1화.webp",
        "language": "ko",
        "content_version": 1,
        "topic_ids": ["uuid"],
        "tags": ["CS", "개발"],
        "series": { "id": "7de9…", "title": "키워드로 빠르게 배우는 CS 지식", "episode_no": 1, "total_episodes": 16 }
      },
      "library": { "item_id": "uuid", "source": "save", "status": "completed" },  // 담지 않았으면 null. 완청 = status "completed"
      "progress": { "position_sec": 372, "max_reached_sec": 372 },             // 재생 위치 행이 없으면 null(0으로 채우지 않는다)
      "is_counted_today": false                                                // 재생 확인 팝업 힌트 — 판정이 아니다
    }
  ]
}
```

- **에러**: uuid가 아님 → 400 `VALIDATION_FAILED` · **없는 시리즈 / 다른 시장의 시리즈 / 노출 중인 편이 하나도 없는 시리즈(전 편 회수) → 404 `NOT_FOUND`**("시리즈를 찾을 수 없어요" — 다른 시장 시리즈의 존재를 드러내지 않는다) · 401 `UNAUTHORIZED`.
- 회수된 편은 목록에서 빠진다 — 1화가 회수돼 있으면 표지도 그다음 노출 편이다.
- `library`·`progress`·`is_counted_today`는 탐색·라이브러리와 같은 원천이다(편 단위). 시리즈 단위 진행 상태는 두지 않는다.
- **두지 않는 것**: `next_episode`(다음 화 듣기 보류) · 시리즈 구독 · 페이지(편 수가 수십 단위).
- 액션(재생·담기·삭제)은 전부 기존 편 단위 계약을 그대로 쓴다(`POST /contents/:id/play` · `POST /contents/:id/save` 등).

## 범위 밖

- **탐색 시리즈 카드 묶음**(확정 설계 4번 — 피드·주제별·인기·검색에서 같은 시리즈 편을 카드 하나로, `type: "content" | "series"`, 순위 = 편 점수 최댓값, 검색은 시리즈 제목 일치 포함). 옛 앱이 모르는 항목 종류에서 깨지므로 **앱 1.3.0과 함께 2단계로 내고, 그때 최소 지원 버전(`MIN_SUPPORTED_APP_VERSION_IOS`/`_ANDROID`)을 1.3.0으로 올린다**(2026-10-17 결정 — 호환 헤더 분기는 두지 않는다: 버전별로 시리즈 지원·미지원 응답을 함께 유지하는 구현이 복잡하다. 순서는 아래 "켜는 순서"). `explore-api.md`의 항목 종류 계약도 그때 정한다.
- **`features/drip-scheduling.md` 4.2-3·7의 문구 개정은 소유 파트(PM·FE) 몫이다.** 구현은 이미 바뀌었다 — **규칙 ②′**(2026-10-17 결정). 설계 규칙("마지막 완청보다 큰 노출 중 가장 앞 편")만으로는 운영 사용자에게 CS 16편이 무작위 순서로 이미 나가 있어 일부가 영영 멈춘다(16화 완청 → 없음 · 1~3화 완청 + 4화 삭제 → 없음 · 5화 완청 + 6화 제외 → 없음). 그래서 이미 받은 편·제외 편을 건너뛰고 앞쪽 빈 편을 메운다.

  **용어** — 노출 중인 편: published·라이선스 유효·사용자 시장. 받은 편: 라이브러리에 한 번이라도 들어온 편(소프트 삭제분 포함 — 후보 필터와 같은 원천). 미완청 편: 지금 라이브러리에 있고(삭제 안 됨) 완청 전인 편(`unplayed`·`in_progress`). 줄 수 있는 편: 노출 중이고, 받지 않았고, 드립 제외(`drip_excluded_contents`)도 아닌 편. `L` = 마지막 완청 번호(삭제분 포함, 없으면 0).

  1. **앞으로** — `L`보다 큰 편 중 줄 수 있는 가장 앞 편 N. 단 `L` < 번호 < N 인 **미완청 편이 있으면 기다린다**(그날 그 시리즈는 주지 않는다).
  2. **빈 편 메우기** — 1에서 줄 수 있는 편이 **하나도 없을 때만**(L 뒤를 다 받았거나 제외) 줄 수 있는 가장 앞 편. 그 편보다 앞의 미완청 편이 **하나라도** 있으면 기다린다.
  3. 둘 다 없으면 그 시리즈는 편성하지 않는다. 한 날 한 시리즈에서 한 편만 간다(중복 없음).

  **결정(규칙 4의 세부)**: ① 앞으로 가는 길(1)은 **`L`과 N 사이의 미완청 편만** 막는다. `L` 이하의 미완청 편(예: 2화 미완청 + 5화 완청)은 이미 그 뒤를 완청했으므로 막지 않는다(→ 6화). ② 빈 편 메우기(2)는 **그 편보다 앞의 미완청 편 전부**가 막는다. ③ 1에서 줄 편이 있는데 미완청 편에 막히면 **2로 넘어가지 않고 기다린다** — 그래야 "2화 완청 + 3~5화 미완청 → 기다림"이 성립한다(넘어가면 1화를 준다). 이 결정 때문에 "3·7화 완청 + 8화 미완청"은 시리즈 길이에 따라 갈린다: **8편 시리즈면 1화**(8 뒤에 줄 편이 없어 빈 편 메우기로 가고, 8화는 1화보다 뒤라 막지 않는다), **16편 시리즈면 기다림**(9화가 줄 수 있는 편인데 8화 미완청이 막는다).

  | 상태 | 결과 |
  |---|---|
  | 이력 없음 | 1화 |
  | 7화 완청 | 8화 |
  | 3·7화 완청 + 8화 미완청 (8편 시리즈 / 16편 시리즈) | 1화 / 기다림 |
  | 1~3화 완청 + 4화 삭제 | 5화 |
  | 1화 미완청 | 기다림 |
  | 16화 완청 | 1화 (빈 편 메우기) |
  | 5화 완청 + 6화 제외 | 7화 |
  | 2화 완청 + 3~5화 미완청 | 기다림 |
  | 1화 완청 + 2화 회수 (설계 조건) | 3화 |
  | 탐색에서 3화 완청 (설계 조건) | 4화 |

  새 시리즈(받은 편 없음)에서는 설계 규칙과 정확히 같다. 상태는 후보 풀이 아니라 카탈로그 전체에서 묻는다(`ContentService.findSeriesEpisodeStates` — 풀은 상한으로 잘리고 이미 본 편을 뺀다). **시리즈 연속 편(우선 선정·가점)은 1의 편만**이다 — 빈 편 메우기(예: 16화 완청 뒤 1화)와 아무 편도 완청하지 않은 시리즈의 첫 편은 연속 편이 아니다. **탐험 편·첫 드립·온보딩의 "시리즈 첫 편만"(`episode_no IS NULL OR = 1`)은 바꾸지 않았다** — 1화가 회수된 시리즈는 그 경로들에서 빠진다(2화를 대신 주지 않는다).
- `features/content-detail.md` 4.3-1("N부작 중 M화")·`features/explore.md` 4.4(시리즈 카드 탭 예외)의 개정은 화면 쪽 몫이다(티켓 "확정한 세부").

## 배포 메모 (runbook 참고용)

- **콘텐츠 동기화에 `series`를 더했다**(`backend/deploy/sync-content-export.sh`·`sync-content-import.sh` — 표 목록과 upsert 순서, `contents`보다 먼저). 개발계 들여오기 스크립트가 운영 내보내기보다 **먼저** 바뀌어야 한다 — 운영 덤프에 `series` INSERT가 실렸는데 개발계 스테이지에 그 표가 없으면 들여오기가 실패한다. 흐름(`dev` 배포 → `main` 배포)대로면 이 순서가 된다. **운영 내보내기 스크립트는 운영 마이그레이션(`1790700000000`)과 함께만 운영에 들어가야 한다** — 새 `sync-content-export.sh`를 그보다 먼저 운영에 복사하면 지문 조회가 `relation "public.series" does not exist`로 멈춰 내보내기가 실패한다(검증 실측). 손으로 복사하지 말고 main 배포(push.sh)로만 반영한다.
- **운영 반영 전까지 개발계 CS 16편의 시리즈 연결은 동기화마다 풀린다** — 운영 행의 `series_id`가 NULL이라 contents upsert가 덮는다(시리즈 행은 편 0개로 남고 오류는 없다). 개발계에서 시리즈를 확인하려면 개발계 배포 직후~다음 운영 발행 전에 보거나, 마이그레이션을 다시 돌린다(멱등).
- CS 마이그레이션은 바뀐 편만 `updated_at`을 올려 운영 내보내기 지문이 바뀐다 → 개발계에 시리즈 행과 16편의 시리즈 필드가 함께 간다. 개발계도 자기 마이그레이션으로 같은 id의 행을 만들므로 충돌하지 않는다.
- 개발계에서만 만든 콘텐츠가 운영 시리즈와 같은 `(series_id, episode_no)`로 발행돼 있으면 들여오기가 부분 유니크에 걸린다(개발계에서 운영 시리즈에 편을 올리지 않는다).

## 켜는 순서 (2단계 시리즈 카드 — 1단계는 스위치와 무관하게 배포된다)

1. **`dev → main` 배포 — 스위치 `SERIES_EXPLORE_CARDS_ENABLED`는 꺼진 채**(빈 값). 1단계 응답(추가 필드뿐)이라 1.2.1이 안전하다.
2. **스토어 1.3.0 빌드·심사·공개** — main 머지와 독립이다. **FE는 1.3.0의 `runtimeVersion`을 36으로 올린다** — main 머지가 운영 OTA를 자동으로 내보내므로, 올리지 않으면 1.3.0 번들이 1.2.x 바이너리에 OTA로 실린다.
3. **최소 지원 버전(`MIN_SUPPORTED_APP_VERSION_IOS`/`_ANDROID`)을 1.3.0으로** — 2가 끝나기 전에는 절대 올리지 않는다(올리면 받을 업데이트가 없는 사용자가 막힌다).
4. **스위치를 켠다** — Secrets에 `SERIES_EXPLORE_CARDS_ENABLED=true` → API 재기동.

## 완료 조건

- Given `domain.md` / When 5.1·5.9를 읽는다 / Then `series` 표(칸·CHECK·표지·시장 없음)·`fk_contents_series`·부분 유니크·`contents.total_episodes`가 사본이라는 규칙이 코드(`Series` 엔티티·마이그레이션 `1790700000000`)와 같다
- Given `admin-api.md` / When 4.6·4.8·4.24를 읽는다 / Then 업로드 검증 5가지(필드별)·복구 409·`/admin/series` 세 엔드포인트의 요청·응답·편수 하한이 적혀 있다
- Given `explore-api.md`·`library-api.md`·`player-api.md`·`content-detail-api.md` / When 항목의 `content`를 읽는다 / Then `series: { id, title, episode_no, total_episodes } | null`(상세는 `series_id` 유지)이 적혀 있다
- Given `explore-api.md` / When 4.7을 읽는다 / Then `GET /series/:series_id`의 응답 JSON·404 세 경우·표지 규칙이 적혀 있다
- Given `recommendation-evaluation.md` / When 불변식 `series-order`를 읽는다 / Then 규칙 ②′ 문구다
- Given `architecture.md` 4.5 / When 의존 표를 읽는다 / Then `SeriesDetail`(Content, Library, Playback) 행이 있다

## 처리 기록

- 2026-10-17 발행. 로컬 검증: 마이그레이션 run·revert·run 왕복, CS 마이그레이션 멱등(두 번 돌려도 행·`updated_at` 그대로, 없는 id 건너뜀), 단위·e2e(`test/series.e2e-spec.ts`) 통과.
