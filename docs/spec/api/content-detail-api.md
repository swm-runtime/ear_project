# 콘텐츠 상세 API 명세서

> 기준 문서: [`docs/features/content-detail.md`](../../features/content-detail.md)
> 판정 소유: [`docs/features/paywall.md`](../../features/paywall.md) 4.1~4.2 (재생 한도·확인 팝업 — 이 문서는 재사용만 한다)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 5.1 · 5.2 · 6.1
> 연관: [`library-api.md`](library-api.md) 4.4·4.6 · [`explore-api.md`](explore-api.md) 4.3·4.6 · [`player-api.md`](player-api.md) 4.5 (액션 계약 재사용)
> 백엔드 티켓: [`tickets/backend/archive/content-sources-structured-list.md`](../../tickets/backend/archive/content-sources-structured-list.md) — `ai_generated` 소스 목록(**확정 2026-08-24** — `content_sources` 테이블, `domain.md` 5.5)

작성: 2026-08-23

## 1. 범위

`content-detail.md`(FR-40, 합의 2026-08-23)가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 하나다.

- **콘텐츠 단건 상세 조회** — 진입 시점의 최신 `status` 확인 + 상세 화면이 그리는 전 항목(헤더·소개·메타·출처) + 담김 여부([담기]/[삭제] 분기 근거)

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `content-detail.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

**다루지 않는 것** — 경계를 먼저 못 박는다. **상세 화면의 액션([재생]·[담기]/[삭제])은 전부 기존 계약의 재사용이다**(`content-detail.md` 4.4 — "규칙은 소유 문서의 것을 그대로 재사용하고, 이 화면은 진입점 하나가 늘어난 것뿐이다"). 이 문서는 액션 엔드포인트를 하나도 새로 만들지 않는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| [재생] — 재생 시작·한도 판정·카운트 적재 | `library-api.md` 4.4 (`POST /contents/:content_id/play`) | **재정의하지 않는다.** 4.2에서 호출 흐름만 서술한다 |
| [재생] 후 미담김 콘텐츠의 라이브러리 자동 적립 | `explore-api.md` 4.6 (호출 순서) · 4.3 (`reason = auto_play`) | **동일한 흐름을 그대로 쓴다**(`content-detail.md` 4.4 — explore 4.4와 동일) |
| [담기] | `explore-api.md` 4.3 (`POST /contents/:content_id/save`) | 재정의하지 않는다. 성공 시 버튼 전환 재료만 서술한다(4.2) |
| [삭제] | `library-api.md` 4.6 (`DELETE /users/me/library-items/:id`) | 재정의하지 않는다. `:id`는 이 문서 4.1 응답의 `library_item.id`다 |
| [원문 보기] 클릭 기록 (`partner`) | `player-api.md` 4.5 (`POST /contents/:content_id/source-link-clicks`) | **세 화면 공용 계약을 그대로 호출한다.** 상세 화면이 네 번째 진입점이 될 뿐이다 |
| 재생 확인 팝업·페이월·[오늘은 그만 보기] 억제 | `paywall.md` 4.1~4.2·4.5 | 참조만 한다. 억제 플래그는 로컬 전용이다 |
| 화면 ID·레이아웃·카피·접근성 | `spec/uiux/` | 정의하지 않는다 |
| `ai_generated` 소스 목록의 **저장 구조** | 백엔드(`domain.md` 5.5 — `content_sources` 테이블, 확정 2026-08-24) | 응답의 **모양만** 표현한다(4.1 — 가정 계약이 그대로 확정됐다) |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 이 문서의 **모든 엔드포인트가 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **없다.** 조회 전용 문서다 |

- 성공 응답에 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.** 에러 응답은 `architecture.md` 7.4 규격이다.
- **잔여 재생 표시값(`daily_play_limit` · `daily_play_count` · `service_date`)을 싣지 않는다.** 상세 화면에는 잔여 표시가 없고(`content-detail.md` 4.2), [재생]의 허용 여부는 어차피 재생 시작 시점에 서버가 판정한다 — 검색 응답이 같은 이유로 세 필드를 뺀 것과 같은 논리다(`explore-api.md` 4.5).

**서버가 받지 않는 값**

- **클라이언트가 보낸 `user_id` · 티어 · 잔여 횟수를 신뢰하지 않는다.** 전부 토큰과 서버 조회로 도출한다(`architecture.md` 9.2).
- **진입 경로(라이브러리·탐색·플레이어)를 받지 않는다.** 세 진입 경로가 같은 화면·같은 조회를 쓰고(`content-detail.md` 2장), 응답이 진입 경로에 따라 달라질 것이 없다.

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/contents/:content_id` | 콘텐츠 단건 상세 조회 | 필요 | |

**설계 메모**

- **경로를 `/contents/:content_id`에 둔다.** 콘텐츠에 대한 행위·조회는 이미 `/contents/:content_id/*` 계층에 모여 있다(`play` · `save` · `audio-urls` · `replay` · `source-link-clicks`). 단건 상세는 그 컬렉션의 표준 단건 GET이며, 하위 세그먼트(`/detail` 등)를 붙이면 "행위 없는 조회"에 이름을 지어내는 꼴이 된다.
- **GET인 이유** — 발급(`audio-urls`)이 POST인 근거(호출마다 기록이 남는 생성 + 서명 URL의 캐시 유출 위험 — `player-api.md` 3장)가 여기에는 하나도 없다. 이 조회는 기록을 남기지 않고, 응답에 서명 URL·원본 경로가 실리지 않는다.
- **`GET /contents/withdrawn`(회수 동기화 — `partner-control.md` 소유)과 경로가 겹친다.** `:content_id`는 uuid 형식을 서버가 검증해 구분하며, uuid가 아닌 세그먼트는 이 엔드포인트에 도달하면 `VALIDATION_FAILED`(400)다.
- **목록 응답을 재사용하지 않고 단건을 재조회한다**(`content-detail.md` 4.1). 회수(FR-32)는 전 노출면 즉시 반영이 원칙이고 상세 화면도 노출면이다 — 진입 시점의 최신 `status`를 서버가 확인해야 한다. 목록 행에는 상세가 요구하는 `description` · `published_at` · 시리즈 · 주제명 · 소스 목록도 없다.
- **발급(`audio-urls`) 응답의 메타로 대신하지 않는다.** 발급은 한도 판정 + `audio_access_logs` 적재가 붙는 무거운 호출이고(`player-api.md` 4.1), 상세 열람은 재생 의사가 아니다 — 상세를 열 때마다 발급 이력이 쌓이면 이상 탐지(`architecture.md` 9.6)의 근거가 오염된다.
- **액션 엔드포인트를 만들지 않는다**(1장 경계 표). 상세 화면의 모든 액션은 기존 계약을 그대로 호출한다 — 4.2.

---

## 4. 엔드포인트 상세

### 4.1 `GET /contents/:content_id`

상세 화면 진입 시 호출한다. 더보기 시트의 [상세 정보] 탭이 유일한 진입점이며(`content-detail.md` 2장), 목록·플레이어가 들고 있던 데이터를 재사용하지 않고 이 응답으로 화면 전체를 그린다.

**Request** — 경로 파라미터 `content_id`(uuid) 외에 없음

**Response 200 — `origin = partner`**

```json
{
  "content": {
    "id": "uuid",
    "title": "출근길 30분, 협상의 심리학",
    "description": "연봉 협상 테이블에서 먼저 숫자를 말해야 할까? 앵커링의 심리학으로 풀어봅니다.",
    "duration_sec": 872,
    "published_at": "2026-08-20T05:00:00Z",
    "thumbnail_url": "https://...",
    "content_version": 1,
    "topics": [
      { "id": "uuid", "name": "커리어" },
      { "id": "uuid", "name": "심리학" }
    ],
    "series": { "series_id": "uuid", "episode_no": 2, "total_episodes": 5 },
    "origin": "partner",
    "author_name": "김서연",
    "source_name": "폴인",
    "source_url": "https://...",
    "sources": null
  },
  "library_item": { "id": "uuid", "source": "save", "status": "in_progress" },
  "is_counted_today": false
}
```

**Response 200 — `origin = ai_generated` (단일 콘텐츠·미담김)**

```json
{
  "content": {
    "id": "uuid",
    "title": "몰입을 부르는 환경 설계",
    "description": "딥 워크의 핵심 조건을 오디오로 정리했습니다.",
    "duration_sec": 861,
    "published_at": "2026-08-21T05:00:00Z",
    "thumbnail_url": "https://...",
    "content_version": 1,
    "topics": [ { "id": "uuid", "name": "생산성" } ],
    "series": null,
    "origin": "ai_generated",
    "author_name": null,
    "source_name": "『딥 워크』(칼 뉴포트) 외 1건",
    "source_url": null,
    "sources": [
      { "title": "딥 워크", "author": "칼 뉴포트", "url": null },
      { "title": "몰입을 부르는 환경 설계", "author": null, "url": "https://blog.example.com/deep-focus" }
    ]
  },
  "library_item": null,
  "is_counted_today": false
}
```

| 필드 | 의미 |
|---|---|
| `content.description` | 소개 영역(`content-detail.md` 4.2). 항상 표시 |
| `content.duration_sec` | 오디오 길이 원값(초). **"14분 21초" 초 단위 표기는 화면 포맷팅이다** — 포맷된 문자열 필드를 두지 않는다 |
| `content.published_at` | 발행일. 표기 형식은 uiux 소관 |
| `content.content_version` | 재발행 판정용 — 목록 행·발급 응답과 같은 재료(`library-api.md` 4.1 · `player-api.md` 4.1). 클라이언트 보관값보다 크면 저장 위치·오프라인 파일을 폐기한다 |
| `content.topics[]` | `content_topics` 조인 결과 — 헤더의 주제 태그. **배열 순서대로 그린다**(재배열 금지 — 기존 원칙) |
| `content.series` | **단일 콘텐츠는 `null`이다**(`domain.md` 5.1 — `series_id` · `episode_no` · `total_episodes` 셋 다 `null`). 값이 있으면 "N부작 중 M화" 줄을 그리고, `null`이면 줄을 통째로 생략한다 — **클라이언트가 별도 조건을 계산하지 않는다**(`content-detail.md` 4.3-1). 세 필드를 한 객체로 묶어 null 판정이 하나가 되게 한다 |
| `content.origin` | `partner` / `ai_generated` — 출처 영역 분기(`content-detail.md` 4.3) |
| `content.author_name` · `source_name` · `source_url` | `partner`는 셋 다 항상 값이 있다(`chk_contents_partner_disclosure` — `domain.md` 5.1). 저자·제공·[원문 보기]를 그린다. `ai_generated`는 `author_name` · `source_url`이 `null`일 수 있고, `source_name`은 고지 문구용 표기 문자열이라 **상세의 출처 영역에는 쓰지 않는다**(소스 나열은 `sources`가 담당) |
| `content.sources[]` | **확정 (2026-08-24 — `domain.md` 5.5 `content_sources`).** `ai_generated`의 참고 소스 **전수** — 소스마다 `title`(필수) · `author`(선택 — 없으면 `null`) · `url`(선택 — 없으면 `null`). 서버가 정한 순서(`content_sources.position`)대로 나열하고 "외 N건" 생략이 없다 — 클라이언트는 재배열하지 않는다. URL 문자열은 화면에 노출하지 않으며, `url`이 있는 항목만 탭 대상이다(`content-detail.md` 4.3). 소스 항목에 식별자(`id`)를 싣지 않는다 — 소스별 클릭 기록을 하지 않기 때문이다(4.2). **`partner`는 `null`이다** (확정 2026-08-24) |
| `library_item` | 요청자의 라이브러리 상태. **`null`이면 미담김**(살아 있는 행 없음 — 소프트 삭제된 행 포함)이라 버튼이 [담기], 값이 있으면 [삭제]다(`content-detail.md` 4.4). **별도 `is_saved` 불리언을 두지 않는다** — null 판정 하나로 분기한다(4.3-1과 같은 원칙). `id`는 [삭제](`library-api.md` 4.6) 호출에 쓴다. `source` · `status`는 `library_items` 원값(`player-api.md` 4.1과 같은 모양) |
| `is_counted_today` | 이 콘텐츠가 **재청취 창 안**에 있는가 — 목록 행과 같은 필드·같은 정의(`library-api.md` 4.1 · `explore-api.md` 4.1 · `paywall.md` 4.3-1). [재생] 탭 시 확인 팝업을 **탭 즉시** 띄우기 위한 힌트이며, 판정이 아니다 |

> **`sources`는 확정 계약이다** (확정 2026-08-24 — 티켓 `tickets/backend/archive/content-sources-structured-list.md` 처리 완료). 저장 구조는 `content_sources` 테이블 승격으로 결정됐고(`domain.md` 5.5), 가정 계약의 모양(`[{title, author|null, url|null}]`)이 **그대로 확정됐다** — FE mock에서 바꿀 필드가 없다.

- **[재생] 판정 재료를 이 응답에 더 싣지 않는다.** 확인 팝업/페이월/즉시 재생의 분기는 행 탭과 동일하게 `is_counted_today` + 클라이언트가 보관한 잔여 표시값 + 로컬 억제 플래그로 팝업 여부만 정하고, 실제 허용은 재생 시작(`library-api.md` 4.4)이 판정한다(`paywall.md` 4.1~4.2).
- **나의 청취 상태(진행률·완청 마킹)를 화면에 그리지 않는 것은 화면 규칙이다**(`content-detail.md` 4.2 — 제외 확정 2026-08-23). `library_item.status`는 그리기 위한 값이 아니라 버튼 분기·완료 상태 파악용 원값이다.
- **`audio_path` · 서명 URL은 실리지 않는다.** 재생 URL은 발급(`player-api.md` 4.1)의 소관이다.

**서버 처리**

1. 콘텐츠 조회 → 없으면 `CONTENT_NOT_FOUND`(404)
2. `status != 'published'`(회수·만료)면 `CONTENT_WITHDRAWN`(403)으로 종료 — 상세를 내려주지 않는다(`content-detail.md` 4.1 · 7장). 회수(`withdrawn`)와 라이선스 만료(`expired`)를 코드로 구분하지 않는다 — 노출 조건은 어디서나 `status = published` 단 하나다(`domain.md` 5.1)
3. `content_topics ⨝ topics` 조인 → `topics[]`
4. 요청자의 `library_items` 조회(토큰 `user_id` 스코프, `deleted_at IS NULL`) → `library_item` (없으면 `null`)
5. `play_records` 조회 → `is_counted_today` (컬럼이 아니라 집계다 — `domain.md` 1.4)
6. `origin = ai_generated`면 소스 목록 조립 → `sources[]` (원천은 `content_sources` — `position` 순, `domain.md` 5.5)

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `CONTENT_WITHDRAWN` | 403 | 회수·만료(`status != 'published'`) → "제공이 종료된 콘텐츠예요" 안내 후 **상세를 그리지 않고 원 화면 복귀.** 라이브러리에서 진입했다면 목록도 갱신한다(`library.md` 회수 동기화) |
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 → 같은 안내·같은 복귀 흐름 |
| `VALIDATION_FAILED` | 400 | `content_id`가 uuid 형식이 아님 |

- 5xx·타임아웃·오프라인은 **전면 에러 + [다시 시도]다**(`content-detail.md` 5장 · `common-error-handling.md` 4.1~4.3 — 화면 진입 차단형 조회). 캐시·목록 데이터로 대체해 그리지 않는다.

---

### 4.2 액션 — 기존 계약 재사용 (신규 계약 없음)

**이 절은 엔드포인트를 정의하지 않는다.** 상세 화면의 액션이 어느 기존 계약을 어떤 재료로 호출하는지만 잇는다. 요청·응답·서버 처리·에러 코드는 전부 소유 문서가 확정본이다.

| 액션 | 재사용하는 계약 | 상세 화면에서의 재료·결과 |
|---|---|---|
| **[재생]** | `POST /contents/:content_id/play` — `library-api.md` 4.4 | 행 탭과 동일한 판정 경로(`paywall.md` 4.1~4.2). 403 `PLAY_LIMIT_EXCEEDED`/`PLAY_LIMIT_REACHED`/`CONTENT_WITHDRAWN`의 클라이언트 동작도 동일하다 |
| [재생] 후 자동 적립 | `POST /contents/:content_id/save` `{ reason: "auto_play" }` — `explore-api.md` 4.3 · 호출 순서 4.6 | 재생이 실제로 시작됐고 play 응답의 `library_item == null`일 때만. 팝업 [취소]·페이월 차단 시 호출하지 않는다 |
| **[담기]** (미담김) | `POST /contents/:content_id/save` `{ client_seq, reason: "user_save" }` — `explore-api.md` 4.3 | 성공 시 응답의 `library_item`으로 버튼을 [삭제]로 전환하고 그 `id`를 보관한다 |
| **[삭제]** (담김) | `DELETE /users/me/library-items/:id` — `library-api.md` 4.6 | `:id`는 4.1 응답(또는 직전 담기 응답)의 `library_item.id`. 성공 시 버튼을 [담기]로 전환한다. `user_signals(delete)` · `reason = library_delete` 적재는 그 계약의 서버 처리 그대로다(`content-detail.md` 4.4 — library.md 4.5와 동일한 결과) |
| **[원문 보기]** (`partner`) | `POST /contents/:content_id/source-link-clicks` — `player-api.md` 4.5 | 세 화면 공용 계약의 네 번째 진입점. 호출 + 인앱 브라우저 열기, 응답을 기다리지 않는다 |
| 소스 항목 탭 (`ai_generated`, `url` 있음) | 인앱 브라우저 열기 (클라이언트 조작) | **클릭을 기록하지 않는다** (확정 2026-08-24 — `domain.md` 5.5·6.6, MVP). 기록 호출 없이 브라우저만 연다. 소스별 분석 요구가 생기면 P1에서 `source_link_clicks.source_id` 추가와 함께 재검토한다 |

- **[재생]의 `entry_point`는 상세 화면을 연 원 화면의 값을 그대로 보낸다**(제안 — 9장). 라이브러리 진입이면 `library`, 탐색 진입이면 `explore`다. 플레이어에서 진입한 상세는 현재 재생 중인 콘텐츠이므로 [재생]이 새 재생 없이 플레이어로 복귀한다(`content-detail.md` 4.4) — play 호출 자체가 없다. **공유 링크 수신으로 진입한 상세만 예외로 `share`를 보낸다**(신설 2026-08-25 — 원 화면이 없다. `library-api.md` 4.4 · `share.md` 4.3).
- **[삭제]에 상세 화면용 실행 취소 스낵바를 새로 정의하지 않는다.** 스낵바 유예·즉시 호출 여부는 uiux가 정하되, 서버 계약은 어느 쪽이든 `library-api.md` 4.6 그대로다(이미 삭제된 항목에도 204 — 멱등).
- **담기·삭제 처리 중 버튼 비활성화는 화면 규칙이고, 서버 멱등은 소유 계약의 것이다**(`content-detail.md` 4.4 — 유니크 제약·no-op 200/204).
- **담기·삭제 성공 후 상세를 재조회하지 않는다.** 액션 응답이 버튼 전환 재료를 이미 담고 있고, 그 밖의 표시 항목은 액션으로 변하지 않는다.

---

## 5. 에러 코드 표

**이 표는 `common-error-handling.md` 9장 중앙 표의 발췌다**(공용 콘텐츠 9.2 + 기반 9.1) — 두 곳이 어긋나면 9장이 기준이다. **상세 화면 고유의 신규 코드는 없다** — 이 화면의 모든 분기가 기존 코드로 표현되며, 9장에 새로 등재할 것이 없다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `CONTENT_WITHDRAWN` | 403 | false | "제공이 종료된 콘텐츠예요" 안내 후 원 화면 복귀. 라이브러리 진입이면 목록 갱신 |
| `CONTENT_NOT_FOUND` | 404 | false | 안내 후 원 화면 복귀 |
| `VALIDATION_FAILED` | 400 | false | 일반 오류 표시 + 로그 수집 |
| `PLAY_LIMIT_*` 등 재생 계열 | — | — | `library-api.md` 5장을 따른다. 이 문서가 재정의하지 않는다 |

- 401(토큰 갱신)·429·5xx는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다.

## 6. 흐름

**진입 → 표시**

```
더보기 시트 [상세 정보] 탭 (라이브러리 L · 탐색 E · 플레이어 PL — 시트 닫힘)
GET /contents/:content_id
   ├─ 200 → 헤더(썸네일·제목·태그·[재생]·[담기]/[삭제]) / 소개 / 메타 / 출처 렌더
   │         └─ 버튼 분기: library_item == null → [담기], 값 있음 → [삭제]
   ├─ 403 CONTENT_WITHDRAWN → 안내 토스트 후 원 화면 복귀 (라이브러리면 목록 갱신)
   ├─ 404 CONTENT_NOT_FOUND → 안내 후 원 화면 복귀
   └─ 5xx·오프라인 → 전면 에러 + [다시 시도]
```

**[재생]** — 행 탭과 한 갈래 (`explore-api.md` 4.6과 같은 구조)

```
[재생] 탭
   ↓ (플레이어에서 진입 + 현재 재생 중 콘텐츠면) 새 재생 없이 플레이어 복귀 — 서버 호출 없음
   ↓ (클라이언트) is_counted_today · 보관한 잔여값 · 로컬 억제 플래그로 팝업 여부만 결정
   ↓ [재생하기] 또는 즉시
POST /contents/:content_id/play  (entry_point = 원 화면 값 — library-api 4.4)
   ├─ 403 → 페이월(최상위 티어는 한도 안내) · 회수 안내. 적립 없음
   └─ 200 → 재생 개시 → library_item == null 이면 POST .../save { reason: "auto_play" }
```

**[담기] / [삭제]**

```
[담기] 탭 (library_item == null)
POST /contents/:content_id/save { client_seq, reason: "user_save" }   ← explore-api 4.3
   └─ 200/201 → 토스트 "라이브러리에 담았어요" + 버튼 [삭제] 전환 (응답 library_item.id 보관)

[삭제] 탭 (library_item 있음)
DELETE /users/me/library-items/:library_item.id                        ← library-api 4.6
   └─ 204 → 버튼 [담기] 전환 (고지 없음 — 재생 중이어도 재생 유지)
```

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **모든 조회는 토큰의 `user_id`로 스코프한다.** `library_item` · `is_counted_today` 조립은 요청자의 데이터만 조인한다(`architecture.md` 9.2).
- **콘텐츠 메타는 사용자별로 다르지 않다.** 개인화 필드는 `library_item` · `is_counted_today` 둘뿐이며, 다른 사용자의 정보가 섞일 자리가 없다.
- **`audio_path` · 서명 URL을 이 응답에 싣지 않는다**(`architecture.md` 9.4). 상세 열람은 오디오 접근이 아니다.
- **이 응답의 어떤 값도 재생 한도 판정에 쓰이지 않는다.** `is_counted_today`는 팝업 힌트일 뿐, 판정은 재생 시작 시점에 서버가 한다(`paywall.md` 4.1).
- **회수 여부는 조회 시점에 확인한다**(서버 처리 2). 더보기 시트를 연 뒤 회수된 콘텐츠는 여기서 걸린다(`content-detail.md` 7장).
- `:content_id`의 uuid 형식을 서버가 검증한다(3장 설계 메모 — `/contents/withdrawn` 경로 구분).
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `contents` — 제목·소개·길이·발행일·썸네일·시리즈 3필드·`origin` 분기·출처 필드·`status`·`content_version` | 5.1 |
| `content_topics` ⨝ `topics` — 주제 태그 | 5.2 · 4.1 |
| `library_items` — `library_item` 조립([담기]/[삭제] 분기·삭제 호출 재료) | 6.1 |
| `play_records` — `is_counted_today` 집계 | 6.3 |
| `content_sources` — `sources[]` 조립(`position` 순) | 5.5 |

- **`sources`의 저장 구조는 `content_sources` 테이블이다** (확정 2026-08-24 — `domain.md` 5.5). 스키마는 domain.md가 유일한 기준이므로 이 문서는 컬럼을 중복 기재하지 않는다.
- 담기·삭제·재생·원문 클릭이 만지는 테이블(`user_signals` · `drip_excluded_contents` · `source_link_clicks` 등)은 **소유 계약의 데이터 모델 절을 따른다** — 이 문서는 조회 전용이라 쓰기가 없다.

## 9. 미결 사항

- ~~**`ai_generated` 소스 목록의 계약·스키마**~~ → **확정 (2026-08-24)**: 저장 구조는 `content_sources` 테이블 승격(`domain.md` 5.5), 계약은 4.1의 가정 계약 모양(`[{title, author|null, url|null}]`) 그대로다 — 소스 항목에 `id`가 없는 것도 확정(클릭 미기록이므로). 티켓 `tickets/backend/archive/content-sources-structured-list.md` 처리 완료. FE mock에서 바꿀 필드가 없다.
- ~~**`partner` 응답의 `sources` 표현**~~ → **확정 (2026-08-24)**: **`null`이다** — 이 문서의 제안(조건부 블록의 null 생략 원칙과 정합 — `content-detail.md` 4.3-1)이 그대로 채택됐다. `partner`는 `content_sources`에 행을 만들지 않는다(`domain.md` 5.5).
- ~~**백엔드 미구현**~~ → **구현 완료 (2026-08-24)**: `GET /contents/:content_id`가 서버에 있다(`content-detail` 모듈 — `architecture.md` 4.5). 계약 변경점 없음 — 이 문서 4.1이 그대로 구현 결과다. FE는 mock 플래그를 해제하고 실서버 연동으로 전환할 수 있다.
- **[재생]의 `entry_point` 값** — **부분 확정 (2026-08-25)**: 공유 링크 수신 진입의 `share`가 enum에 신설됐다(`library-api.md` 4.4 — `changes/archive/play-entry-point-share-value(fe).md`). 일반 경로의 상세는 **원 화면 값 유지 전달**(4.2)이 그대로다. **`content_detail` 값 신설(상세 경유를 별도 분석 축으로 구분)은 계속 미결** — 협의(2026-08-25)에서 분석 요구가 생길 때 추가하기로 하고 보류했다. enum 소유는 `library-api.md`(백엔드)다.
- ~~**`ai_generated` 소스 항목 탭의 클릭 기록**~~ → **확정 (2026-08-24)**: **MVP는 기록하지 않는다**(`domain.md` 5.5·6.6). 소스 항목 탭은 기록 호출 없이 인앱 브라우저만 열고(4.2), `partner`의 [원문 보기]는 기존 계약대로 기록한다. `source_link_clicks`의 존재 이유(파트너 정산·리포팅)가 `ai_generated` 소스에는 없기 때문이다 — 소스별 분석 요구가 생기면 P1에서 `source_link_clicks.source_id` 추가와 함께 재검토한다.
- **`topics[]`의 형태** — 이 문서는 이름 문자열 배열이 아니라 **`{id, name}` 객체 배열을 제안한다**(`explore-api.md` 4.2-2와 같은 모양). 화면 요구는 이름 표시뿐이지만(`content-detail.md` 4.2), 주제 객체를 문자열로 납작하게 보내는 계약이 이 문서 하나만 생기는 것을 피했고, 태그 탭 → 탐색 필터 연결 같은 확장에 `id`가 필요하다. 이름만으로 확정하려면 개정한다.
