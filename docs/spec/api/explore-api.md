# 탐색 · 검색 API 명세서

> 기준 문서: [`docs/features/explore.md`](../../features/explore.md)
> 판정 소유: [`docs/features/paywall.md`](../../features/paywall.md) 4.1~4.3 (재생 한도·차감·확인 팝업)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 5장 · 6장 · 7장

## 1. 범위

`explore.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 다섯이다.

- 추천 피드 조회 — 서버가 구성한 섹션형 피드 + **잔여 재생 표시값**(라이브러리와 같은 세 필드)
- 주제 필터 목록 조회 — 필터를 걸었을 때의 **단일 목록**(커서 페이지네이션)
- 담기 / 담기 해제 — `library_items(source = save)` 생성과 소프트 삭제 + 드립 영구 제외 적재
- 키워드 검색 (FR-22, **P1**)
- 탐색 재생 시 **라이브러리 자동 적립**의 호출 순서 (재생 자체는 `library-api.md` 4.4 소유)

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `explore.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 재생 시작·한도 판정·카운트 적재 | `library-api.md` 4.4 (`POST /contents/:content_id/play`) | **엔드포인트를 다시 정의하지 않는다.** `entry_point = explore`로 같은 것을 호출한다 |
| 재생 확인 팝업·[오늘은 그만 보기] 억제 | `paywall.md` 4.2 | 억제 플래그는 로컬 전용 — 요청·응답 어디에도 싣지 않는다 |
| 페이월 바텀시트·결제 | `paywall.md` 4.5 · `subscription.md` | 참조만 한다 |
| 잔여 재생 표시값 세 필드의 규약 | `library-api.md` 2장 | **같은 이름·같은 규약**으로 피드 응답에 얹는다. 재정의하지 않는다 |
| 공유 (FR-27) | `explore.md` 4.6 | **MVP 제외**(합의 2026-08-06) — 더보기 시트에 공유 항목을 노출하지 않고 P1에 활성화한다. **엔드포인트는 P1에도 없다.** OS 공유 시트는 클라이언트 조작이고(링크는 스토어 링크로 대체 — PRD 4.2), 시트 오픈은 신호로 기록하지 않는다(`user_signals`에 `share`가 없다 — `domain.md` 6.4) |
| 최근 검색어 | `explore.md` 4.5 | **엔드포인트가 없다.** `SearchHistory`는 클라이언트 로컬 전용이다(`domain.md` 13.1) |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 이 문서의 **모든 엔드포인트가 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** |
| 서비스 날짜 | `YYYY-MM-DD` — 04:00 KST 경계 날짜 라벨(`domain.md` 1.2) |
| 페이지네이션 | **커서 기반**. `{ items, next_cursor, has_next }` (`convention.md` 5.3) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **없다.** 담기·해제는 경로가 대상을 특정하고 결과가 수렴한다(3장 설계 메모) |

**잔여 재생 표시값 — `library-api.md` 2장의 세 필드를 그대로 쓴다**

- `daily_play_limit` · `daily_play_count` · `service_date`를 **같은 이름으로** 피드 조회(4.1)·그리드 조회(4.2) 응답에 얹는다.
  - 라이브러리와 다른 이름·다른 계산을 쓰면 같은 사용자에게 두 화면이 다른 숫자를 보여준다(`explore.md` 3장). 조립 함수도 라이브러리와 **같은 것을 호출한다.**
- **잔여 횟수 전용 엔드포인트를 만들지 않는다.** 피드를 여는 시점이 곧 이 값을 갱신하는 시점이다(`explore.md` 3장).
- 소진(0/M) 표시를 탭하면 클라이언트가 서버 호출 없이 페이월 바텀시트를 연다 — **최상위 티어는 페이월 대신 한도 안내다**(`paywall.md` 4.1, 합의 2026-08-06). 표시값은 힌트일 뿐이고, 실제 허용 여부는 재생 시작 시점에 서버가 다시 판정한다.
- **검색(4.5) 응답에는 싣지 않는다.** 검색 화면에서는 잔여 표시를 숨기므로(`explore.md` 4.4-1) 내려줄 이유가 없고, 검색 결과 재생 시 판정은 어차피 재생 시작이 한다.

**서버가 받지 않는 값**

- **[오늘은 그만 보기] 억제 상태를 요청에 싣지 않는다**(`paywall.md` 4.2). 라이브러리와 같은 로컬 키를 공유하는 클라이언트 상태다(`explore.md` 6장).
- **클라이언트가 보낸 `user_id` · `tier` · 잔여 횟수를 신뢰하지 않는다.** 전부 토큰과 서버 조회로 도출한다(`architecture.md` 9.2).

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/explore/feed` | 섹션형 추천 피드 + 잔여 재생 표시값 | 필요 | |
| 2 | GET | `/explore/contents` | 주제 필터 단일 목록(커서) + 잔여 재생 표시값 | 필요 | |
| 3 | POST | `/contents/:content_id/save` | 담기 — `library_items(source = save)` 생성 | 필요 | |
| 4 | DELETE | `/contents/:content_id/save` | 담기 해제 — 소프트 삭제 + 드립 영구 제외(`unsave`) | 필요 | |
| 5 | GET | `/explore/search` | 키워드 검색 **(P1)** | 필요 | |

**설계 메모**

- **피드(1)와 필터 목록(2)을 한 엔드포인트로 합치지 않는다.** 두 모드는 응답의 모양 자체가 다르다 — 피드는 섹션 배열이고 필터 목록은 커서 페이지네이션 목록이다. 쿼리 파라미터로 모양이 바뀌는 응답은 클라이언트 타입이 유니언이 되고, 커서 규칙(발급 조건과 같아야 함)도 섹션 모드와 섞여 흐려진다. **두 모드의 행 레이아웃은 같다**(`explore-uiux.md` 4.1) — 다른 것은 응답 구조이지 화면 밀도가 아니다.
- **담기를 `/users/me/library-items`가 아니라 `/contents/:content_id/save`에 둔다.**
  - 탐색 카드가 아는 것은 `content_id`뿐이다. 라이브러리 항목 id를 요구하면 담기 전의 콘텐츠를 지목할 수 없다.
  - 재생(`/contents/:content_id/play`)과 같은 계층이다 — 탐색이 콘텐츠에 하는 행위는 콘텐츠 경로에 모인다(`library-api.md` 3장 설계 메모와 같은 논리).
- **담기와 해제를 한 엔드포인트의 토글로 만들지 않는다.** 오프라인 큐에서 순서가 뒤바뀌면 토글은 최종 상태를 예측할 수 없다. 두 방향을 각각 멱등하게 두면 마지막 요청이 그대로 최종 상태다(`library-api.md`의 삭제/복구와 같은 구조).
- **`Idempotency-Key`를 쓰지 않는다.** 담기는 `uq_library_items_user_id_content_id`가 중복을 DB로 막고(`domain.md` 6.1), 해제는 이미 해제된 항목에도 200이다. 연타 순서 문제는 멱등키가 아니라 `client_seq`(4.3)가 담당한다 — 멱등키는 "같은 요청의 중복"을 막고, `client_seq`는 "다른 요청의 순서"를 판별한다.
- **검색(5)은 P1 확정이다**(합의 2026-08-06 — `explore.md` 4.5). MVP에서는 이 엔드포인트를 배포하지 않고, **검색창은 비활성 상태로 노출한다** — 탭해도 검색 화면으로 전환하지 않으므로 MVP 클라이언트가 이 엔드포인트를 호출할 일이 없다.

---

## 4. 엔드포인트 상세

### 4.1 `GET /explore/feed`

탐색 탭 진입·당겨서 새로고침·포그라운드 복귀·플레이어에서 복귀가 모두 이 하나를 호출한다.

**Request** — 파라미터 없음

- **주제 필터가 없을 때만 쓰는 조회다.** 필터가 걸리면 4.2로 전환한다(`explore.md` 4.2 — 섹션 구조를 버리고 단일 그리드).

**Response 200**

```json
{
  "sections": [
    {
      "key": "interest",
      "title": "관심사에 맞는 추천",
      "topic": null,
      "items": [
        {
          "content": {
            "id": "uuid",
            "title": "번아웃 없이 오래 일하는 법",
            "author_name": "김서연",
            "source_name": "폴인",
            "duration_sec": 620,
            "thumbnail_url": "https://...",
            "content_version": 1,
            "topic_ids": ["uuid"]
          },
          "library": null,
          "is_counted_today": false
        }
      ]
    },
    {
      "key": "topic_group",
      "title": "커리어",
      "topic": { "id": "uuid", "name": "커리어" },
      "items": []
    }
  ],
  "daily_play_limit": 2,
  "daily_play_count": 1,
  "service_date": "2026-08-06"
}
```

| 필드 | 의미 |
|---|---|
| `sections[].key` | `interest` / `new` / `popular` / `topic_group` — **분석·로깅용.** 화면 분기에 쓰지 않는다 |
| `sections[].title` | **화면에 그대로 그리는 문자열.** 섹션 구성·순서·제목은 서버 제어다(`explore.md` 4.1) — 클라이언트가 `key`로 제목을 하드코딩하면 서버가 섹션을 바꿀 수 없다 |
| `sections[].topic` | `topic_group` 섹션만 값이 있다. 탭 시 그 주제로 4.2를 호출하는 데 쓴다 |
| `library` | 이 콘텐츠의 라이브러리 상태. **없으면 `null`** — 라이브러리에 담기지 않은 상태다 |
| `library.item_id` / `source` / `status` | `library_items` 원값. **행의 "담김" 표시와 더보기 시트의 담기/제거 분기**에 쓴다(`explore-uiux.md` 4.1) |
| `is_counted_today` | 오늘의 서비스 날짜에 `play_records` 행이 있는가 — 재생 확인 팝업을 **탭 즉시** 띄우기 위한 힌트(`library-api.md` 4.1과 같은 필드, 같은 이유) |

- **담김 여부는 노출에 어떤 영향도 주지 않는다.** 이미 라이브러리에 있는 콘텐츠도 전부 내려준다(`explore.md` 4.1 — 초기 콘텐츠 풀이 작아 제외하면 피드가 빈다). 서버는 `library`를 채워 내려주고, 화면은 그 행에 "담김" 표시만 붙인다 — 필터링·정렬 어디에도 담김 여부를 쓰지 않는다.
- **회수 콘텐츠(`contents.status != 'published'`)는 서버 단계에서 제외한다.** 파트너 회수(FR-32)는 피드에 나타나지 않는다.
- **소비 신호가 부족한 신규 사용자는 서버가 인기·신규 섹션 비중을 높인다**(콜드스타트 — FR-17). 클라이언트는 내려온 순서대로 그릴 뿐이다.
- **인기 섹션은 직전 확정 구간(`is_final = true`)이 없는 배포 첫 주에도 숨기지 않는다**(합의 2026-08-06 — `explore.md` 4.1). 표본 크기와 무관하게 같은 선정 기준으로 정렬한 상위를 내려준다 — 모든 콘텐츠의 값이 같아도 정렬상 앞서는 콘텐츠가 존재하므로, 응답 모양·섹션 구성은 첫 주에도 변하지 않는다.
- **관심 주제 0개 상태는 생기지 않는다.** 관심사 관리가 최소 1개 선택을 강제한다(합의 2026-08-06 — `interest-management.md` 4.2 · `profile.md` 4.4). `interest` · `topic_group` 섹션의 입력이 비는 경우를 별도로 설계하지 않는다.
- 섹션이 하나도 없으면 `sections: []`다. **404가 아니다** — 클라이언트는 빈 피드 화면("준비된 콘텐츠가 곧 늘어나요")을 그린다.
- 섹션 내 `items`의 개수·페이지네이션은 없다. 가로 스크롤 카드의 개수는 서버가 정해 내려준다(권장 6~10건). 섹션 안에서 더 보기가 필요하면 `topic` 값으로 4.2를 호출한다.

**에러** — 공통 규칙(`common-error-handling.md` 4.1~4.2) 외 이 엔드포인트 고유 에러는 없다. 네트워크 실패·오프라인 시 **캐시 피드를 노출하지 않는다**(합의 2026-08-06 — 오프라인 캐시 피드 폐기, `explore.md` 7장). 에러 화면 + [다시 시도]만 그리고, 잔여 재생 표시도 노출하지 않는다(값 없음 — 0으로 가정하지 않는다).

---

### 4.2 `GET /explore/contents`

주제 필터를 걸었을 때의 단일 목록. 필터 선택·해제·추가 로딩이 이것을 호출한다.

**Request** — 쿼리 파라미터

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| topic_ids | string (uuid 콤마 구분) | 필수(1개 이상) | 다중 선택은 **OR 조합**(`explore.md` 4.2) |
| cursor | string(opaque) | 선택 | 직전 응답의 `next_cursor` |
| limit | int | 선택(기본 `20`, 최대 `50`) | 상한을 서버가 강제한다(`architecture.md` 9.3) |

- **주제끼리 OR인 이유** — 다중 선택의 의도는 "이 중 아무거나"다. AND면 두 개만 골라도 대부분 빈 목록이 된다(`library-api.md` 4.1과 같은 규칙).
- `topic_ids`가 비면 400이다. 필터가 없는 상태는 4.1(피드)이 담당한다.

**Response 200**

```json
{
  "items": [
    { "content": { "...": "4.1과 같은 모양" }, "library": null, "is_counted_today": false }
  ],
  "next_cursor": "eyJw...",
  "has_next": true,
  "daily_play_limit": 2,
  "daily_play_count": 1,
  "service_date": "2026-08-06"
}
```

- 행 모양은 4.1의 `items[]`와 **완전히 같다.** 두 모드가 다른 행 타입을 쓰면 담기·재생 처리가 두 벌이 된다.
- 정렬은 **추천 랭킹 순**(서버 계산)이다. 정렬 파라미터를 두지 않는다 — 탐색 목록은 발견 화면이지 관리 화면이 아니다.
- 잔여 표시값을 함께 싣는 이유: 필터 전환 후에도 표시는 유지되므로(`explore.md` 4.4-1) 이 응답이 최신값 갱신 시점이 된다.
- 커서는 `topic_ids`가 발급 시점과 다르면 `EXPLORE_CURSOR_INVALID`로 거절한다. 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 된다. 클라이언트는 첫 페이지부터 다시 조회한다.
- 결과가 없으면 `items: []`다. 클라이언트는 "이 주제의 콘텐츠는 아직 없어요" + [필터 해제]를 그린다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `EXPLORE_CURSOR_INVALID` | 400 | 커서 형식 오류, 또는 발급 시점과 다른 `topic_ids` |
| `VALIDATION_FAILED` | 400 | `topic_ids` 누락·형식 오류 |

---

### 4.3 `POST /contents/:content_id/save`

담기. `LibraryItem(source = save)`를 만든다. **횟수 제한이 없고 페이월을 노출하지 않는다**(PRD 5.4).

**Request**

```json
{ "client_seq": 3, "reason": "user_save" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| client_seq | int | 필수 | 이 콘텐츠에 대한 담기·해제 조작의 클라이언트 단조 증가 순번. **서버는 저장·판정하지 않고 응답에 그대로 되돌린다** |
| reason | enum `user_save` / `auto_play` | 선택(기본 `user_save`) | `auto_play`는 탐색 재생 자동 적립(4.6 흐름). **`user_signals` 적재 여부만 가른다** |

- **`client_seq`는 순서 뒤바뀜 방어다**(`explore.md` 7장). 담기→해제 연타 시 서버 응답이 역순으로 도착할 수 있다. 클라이언트는 자신이 마지막으로 보낸 순번보다 작은 `client_seq`가 담긴 응답을 무시하고, 화면 상태는 마지막 조작을 유지한다.
  - **서버가 순서를 판정하지 않는 이유**: 서버에서 순번을 비교해 오래된 요청을 거절하려면 콘텐츠×사용자별 최종 순번을 저장해야 한다 — 표시 순서 문제를 풀자고 컬럼을 만드는 것이다(`domain.md` 1.4와 같은 종류). 담기·해제는 각각 멱등이라 어느 순서로 실행돼도 서버 상태는 마지막 도착 요청으로 수렴하고, 화면 표시만 맞추면 된다.
- **`reason = auto_play`는 신호를 남기지 않는다.** 자동 적립은 사용자의 "담기" 의사가 아니므로 `user_signals`에 `save`를 적재하면 추천 입력이 왜곡된다. `play` 신호는 재생 시작이 이미 적재했다(`library-api.md` 4.4). 라이브러리 행 생성은 두 값이 동일하다.

**Response 201 — 새로 담김 / 200 — 이미 담겨 있음**

```json
{
  "library_item": { "id": "uuid", "source": "save", "status": "unplayed", "added_at": "2026-08-06T01:20:00Z" },
  "client_seq": 3,
  "daily_play_limit": 2,
  "daily_play_count": 1,
  "service_date": "2026-08-06"
}
```

**서버 처리** — 하나의 트랜잭션에서 수행한다.

1. 콘텐츠 조회 → `status != 'published'`면 `CONTENT_WITHDRAWN`(403)
2. `library_items` upsert — `uq_library_items_user_id_content_id`가 중복 적립을 막는다(`domain.md` 6.1)
   - **행이 없으면**: `source = save`, `status = unplayed`, `added_at = now()`로 생성 → 201
   - **살아 있는 행이 있으면**: **아무것도 바꾸지 않고** 현재 상태를 반환 → 200. `added_at`을 갱신하지 않는다 — 이미 담긴 것을 다시 담아도 목록 순서가 바뀌면 안 된다
   - **삭제된 행(`deleted_at IS NOT NULL`)이 있으면**: `deleted_at = null`, `added_at = now()`, `source = save`로 재활성 → 200. 재담기는 새 담기 조작이므로 적립 시각을 새로 찍는다(삭제 실행 취소의 복구와 다르다 — 그쪽은 `added_at` 유지, `library-api.md` 4.7)
3. `reason = user_save`면 `user_signals`에 `action = 'save'` 적재(`explore.md` 4.3 확정 — FR-15, `domain.md` 6.4)

- **재담기가 `drip_excluded_contents` 행을 지우지 않는다.** 드립 후보 필터는 `library_items` 행 존재만으로 이미 제외하므로 실질 차이가 없고, `reason`은 최초 사유를 유지한다(`domain.md` 7.1 — `library-api.md` 4.7의 복구와 같은 논리).
- **`status`·`playback_progresses`는 건드리지 않는다.** 지웠다 다시 담아도 듣던 위치가 살아 있어야 한다(`library.md` 4.5).
- 성공 시 토스트("라이브러리에 담았어요" + [보러가기])는 클라이언트 표시 규칙이다(`explore-uiux.md`).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `CONTENT_WITHDRAWN` | 403 | 파트너 회수 → "제공이 종료된 콘텐츠예요" 안내 후 카드 제거 |
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

### 4.4 `DELETE /contents/:content_id/save`

담기 해제. **라이브러리 삭제와 동일한 결과**를 만든다 — 소프트 삭제 + 드립 영구 제외(`explore.md` 4.3 · FR-16).

**Request** — 쿼리 파라미터 `?client_seq=4` (의미는 4.3과 같다)

**Response 200**

```json
{ "client_seq": 4 }
```

**서버 처리** — 하나의 트랜잭션에서 수행한다.

1. `library_items.deleted_at`을 찍는다. 행을 지우지 않는다(`domain.md` 6.1)
2. `drip_excluded_contents`에 `reason = 'unsave'` upsert. 이미 행이 있으면 최초 사유를 유지한다(`domain.md` 7.1)
3. `user_signals`에 `action = 'unsave'` 적재(`domain.md` 6.4)

- **라이브러리 삭제(`library-api.md` 4.6)와 별개 엔드포인트인 이유**: 탐색은 `content_id`만 알고, `drip_excluded_contents.reason`이 다르다(`unsave` vs `library_delete`). `reason`은 판정에 쓰이지 않는 운영값이지만(`domain.md` 7.1), 같은 엔드포인트로 합치면 이 구분 자체가 사라진다.
- **해제 대상이 없어도(담긴 적 없음 · 이미 해제됨) 200이다.** 오프라인 큐 재전송이 같은 해제를 다시 보낼 수 있다(`common-error-handling.md` 4.5). 이때 2·3번은 수행하지 않는다 — 없던 담기의 해제로 제외·신호가 쌓이면 안 된다.
- **`playback_progresses`를 지우지 않는다.** 다시 담으면 듣던 위치가 살아 있어야 한다.
- **영구 제외 사실을 응답으로 알리지 않는다.** 라이브러리 삭제와 같은 이유다(`library.md` 4.5 — 가벼운 조작에 무거운 고지를 붙이지 않는다).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

### 4.5 `GET /explore/search` **(P1)**

키워드 검색. 2자 이상 입력에 300ms 디바운스로 호출된다(`explore.md` 4.5).

**Request** — 쿼리 파라미터

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| query | string | 필수(**2자 이상**) | 제목·설명·저자·주제명 대상 |
| topic_ids | string (uuid 콤마 구분) | 선택 | 검색 결과에 주제 필터를 겹칠 때 |
| cursor | string(opaque) | 선택 | |
| limit | int | 선택(기본 `20`, 최대 `50`) | |

- 2자 미만·특수문자만인 쿼리는 **클라이언트가 요청 자체를 보내지 않는다**("검색어를 입력해주세요" 유지 — `explore.md` 7장). 서버도 방어적으로 `VALIDATION_FAILED`(400)를 반환한다.

**Response 200 — 결과 있음**

```json
{
  "items": [ { "content": { "...": "4.1과 같은 모양" }, "library": null, "is_counted_today": false } ],
  "next_cursor": "eyJw...",
  "has_next": false,
  "fallback": null
}
```

**Response 200 — 결과 없음**

```json
{
  "items": [],
  "next_cursor": null,
  "has_next": false,
  "fallback": {
    "related_topics": [ { "id": "uuid", "name": "커리어" } ],
    "popular_items": [ { "content": { "...": "동일" }, "library": null, "is_counted_today": false } ]
  }
}
```

- **빈 결과에 `fallback`을 같은 응답으로 내려준다**(`explore.md` 4.5 — 초기 콘텐츠 풀이 작아 빈 결과 UX가 중요하다). 대체 콘텐츠를 별도 호출로 나누면 빈 화면이 한 박자 늦게 채워진다.
  - `related_topics`: 쿼리와 유사한 주제(칩으로 노출, 탭 시 4.2 호출). `popular_items`: 인기 콘텐츠(직전 확정 구간 기준 — `domain.md` 5.4).
- `items`가 있으면 `fallback: null`이다.
- **잔여 재생 표시값을 싣지 않는다**(2장). 검색 화면은 표시를 숨긴다 — 다만 결과를 탭한 재생은 판정·팝업을 동일하게 거친다(`explore.md` 7장).
- 검색 결과 카드도 담기(4.3)·재생이 피드와 동일하게 동작한다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `EXPLORE_CURSOR_INVALID` | 400 | 커서 형식 오류, 또는 발급 시점과 다른 `query`·`topic_ids` |
| `VALIDATION_FAILED` | 400 | `query` 2자 미만 등 |

---

### 4.6 탐색 재생 — 자동 적립의 호출 순서

재생 엔드포인트는 이 문서 소유가 아니다. 탐색 고유의 것은 **재생이 실제로 시작된 뒤의 자동 적립**뿐이다(`explore.md` 4.4).

```
카드 탭
   ↓ (클라이언트) is_counted_today · daily_play_limit · 로컬 억제 플래그로 팝업 여부만 결정
   ↓ [재생하기] 또는 즉시
POST /contents/:content_id/play  (entry_point = "explore" — library-api 4.4)
   ├─ 403 → 페이월(**최상위 티어는 페이월 대신 한도 안내** — paywall.md 4.1)·회수 안내. 적립하지 않는다
   └─ 200 → 오디오 재생 개시
        └─ 응답의 library_item == null 이면
           POST /contents/:content_id/save  { reason: "auto_play" }   ← 이 문서 4.3
```

- **적립 시점은 재생이 실제로 시작된 뒤다.** 팝업에서 [취소]했거나 페이월로 막힌 경우 `save`를 호출하지 않는다(`explore.md` 7장).
- **재생 시작(play)이 라이브러리 행을 만들지 않는 것은 `library-api.md` 4.4의 규칙이다.** 탐색은 그 응답의 `library_item == null`을 보고 자동 적립을 별도 호출로 수행한다 — 이렇게 하면 진입점과 무관해야 하는 재생 엔드포인트에 탐색 전용 부작용이 생기지 않는다.
- `save(auto_play)` 호출이 실패하면 **조용히 오프라인 큐에 적재해 재전송한다**(`common-error-handling.md` 4.3 — 사용자가 시작하지 않은 실패는 알리지 않는다). 재생은 계속된다.

---

## 5. 에러 코드 표

**추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 `common-error-handling.md` 6장 표를 함께 갱신한다.**

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `EXPLORE_CURSOR_INVALID` | 400 | false | 커서를 버리고 첫 페이지부터 재조회. 사용자에게 노출하지 않는다 |
| `VALIDATION_FAILED` | 400 | false | 요청을 수정해야 한다. 사용자에게는 일반 오류로 표시 |
| `CONTENT_WITHDRAWN` | 403 | false | "제공이 종료된 콘텐츠예요" + 카드를 목록에서 제거 |
| `CONTENT_NOT_FOUND` | 404 | false | 카드를 목록에서 제거 |
| `PLAY_LIMIT_EXCEEDED` 등 재생 계열 | — | — | `library-api.md` 5장을 따른다. 이 문서가 재정의하지 않는다 |

- 401·429·5xx 처리는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다.

## 6. 흐름

**탐색 탭 진입 · 새로고침**

```
GET /explore/feed                       → 섹션형 피드 + daily_play_limit/count + service_date
  ├─ (주제 칩 선택)  GET /explore/contents?topic_ids=...   → 단일 목록 전환 (잔여 표시 유지)
  ├─ (칩 전부 해제)  GET /explore/feed                     → 섹션형 복귀
  └─ (하단 도달)     GET /explore/contents?cursor=...      → 추가 로딩
```

**담기 · 제거 — 더보기 시트에서** (`explore-uiux.md` 4.4)

```
행의 더보기 → 시트 [라이브러리에 담기] (seq=1) → 행에 "담김" 표시 (낙관적) → POST .../save {client_seq:1}
행의 더보기 → 시트 [라이브러리에서 제거] (seq=2) → 표시 제거              → DELETE .../save?client_seq=2
  ← save 응답(seq=1) 도착: seq < 2 이므로 무시
  ← delete 응답(seq=2) 도착: 최종 상태 확정
```

**재생** — 4.6 참조. 판정·팝업·페이월은 라이브러리와 한 갈래다.

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **모든 조회·변경은 토큰의 `user_id`로 스코프한다.** `library` 필드 조립도 요청자의 라이브러리만 조인한다.
- **담기 횟수 제한이 없다는 것과 레이트 리밋이 없다는 것은 다르다.** 비정상 연타·스크립트 호출은 공통 레이트 리밋(429)이 막는다.
- **재생 한도 판정에 이 문서의 어떤 값도 쓰이지 않는다.** `is_counted_today`·잔여 표시값은 힌트이며, 판정은 재생 시작 시점에 서버가 한다(`paywall.md` 4.1).
- **회수 여부는 피드 제외와 담기·재생 시점에 각각 확인한다.** 피드에서 걸러도 이미 화면에 떠 있는 카드가 탭될 수 있다.
- 목록 조회는 `limit` 상한(50)을 서버가 강제한다(`architecture.md` 9.3).
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `contents` · `content_topics` — 피드·그리드·검색의 원천, 주제 필터 조인 | 5.1 · 5.2 |
| `content_stats` — 인기 섹션·검색 fallback (**직전 확정 구간**, `is_final = true`) | 5.4 |
| `library_items` — 담기·해제. `(user_id, content_id)` 유니크가 중복 방어선 | 6.1 |
| `play_records` — `daily_play_count` · `is_counted_today` 집계 | 6.3 |
| `user_signals` — `save` · `unsave` 적재(자동 적립은 제외) | 6.4 |
| `user_interests` — 관심사 기반 섹션·칩 정렬 입력 | 4.2 |
| `drip_excluded_contents` — 담기 해제 시 `unsave` 적재 | 7.1 |
| `plans` — `daily_play_limit` | 8.1 |

- `ExploreFeed`는 응답 DTO이고 `SearchHistory`는 클라이언트 로컬 전용이다(`domain.md` 13.1 · 13.2). **테이블을 만들지 않는다.**
- **피드 섹션 구성은 테이블이 아니라 서버 코드·배포 설정이다**(`explore.md` 미결). 전용 테이블 도입은 운영 변경 빈도를 보고 재검토한다.
- 잔여 횟수·`is_counted_today`는 컬럼이 아니라 `play_records` 집계다(`domain.md` 1.4).

## 9. 미결 사항

- ~~담기 UI의 features 개정 필요~~ → **해소(2026-08-06): `explore.md` 4.3 개정 완료.** 담기/제거는 더보기 시트가 소유하고 행에는 담기 버튼이 없다("담김" 표시만) — 이 문서 4.3·4.4·6장이 그 확정과 정합한다.
    - 제거는 `library`가 있는 모든 행에 **출처 무관**(`drip | save | onboarding` 전부 — `domain.md` 6.1) 허용으로 확정. 드립 적립분을 탐색에서 제거하면 `reason = unsave`로, 라이브러리에서 삭제하면 `library_delete`로 적재된다 — `reason`은 운영값이라 실질 차이는 없다(`domain.md` 7.1).
- ~~"상세" 화면 처리~~ → **확정(합의 2026-08-06): 상세 화면을 두지 않는다**(`explore.md` 3장). 추후 명세를 추가한 뒤 개발하며, 그 전까지 더보기 시트에 상세 항목이 없고 **이 문서에도 상세 조회 엔드포인트를 두지 않는다.**
- ~~검색창 처리~~ → **확정(합의 2026-08-06): 검색은 P1 유지, MVP에서는 검색창을 비활성 노출한다**(3장 설계 메모 · `explore.md` 4.5). 4.5 엔드포인트는 P1 착수 시 배포한다.
- ~~인기 섹션의 표본 부족~~ → **확정(합의 2026-08-06): 배포 첫 주에도 섹션을 숨기지 않는다**(4.1 · `explore.md` 4.1). 직전 확정 구간이 없으면 표본 크기와 무관하게 같은 선정 기준으로 정렬한 상위를 그대로 내려준다. 진행 중 구간 임시 대체는 하지 않는다.
- ~~공유(FR-27)의 MVP 포함 여부~~ → **확정(합의 2026-08-06): MVP 제외**(1장 경계 표 · `explore.md` 4.6). 더보기 시트에 공유 항목을 노출하지 않고 P1에 활성화한다. P1 활성화 시에도 서버 엔드포인트는 필요 없다 — 공유 텍스트·스토어 링크 조립은 클라이언트 몫이다.
- **탐색 재생 자동 적립의 문서 간 표현 정리** — `explore.md` 4.4가 "재생이 실제로 시작된 뒤 적립 · 이미 라이브러리에 있으면 재적립 없음"으로 확정되어(합의 2026-08-06) 이 문서 4.6의 호출 순서(재생 개시 후 `save(reason=auto_play)`)와 정합한다. 남은 것은 `library-api.md` 4.4 설계 메모("재생이 담기를 유발하지 않는다")의 인용 문구 정리뿐이다.
- **자동 적립의 `source` 값** — `save`로 적립하면 라이브러리 카드 배지가 "담기"로 붙는다. 사용자가 직접 담은 것과 재생으로 적립된 것을 배지로 구분할지는 `library.md` 소관이다. 현재는 구분하지 않는다.
- **재담기 시 `source` 덮어쓰기(4.3 서버 처리 2)** — 드립으로 받았다 지운 콘텐츠를 탐색에서 다시 담으면 `source`가 `save`가 되어 [이어 PICK] 탭에서 빠진다. 사용자의 명시적 담기이므로 타당하다고 봤으나 `library.md` 4.1-1의 탭 정의와 교차 확인이 필요하다.
- **섹션 `key` enum의 확장** — 시리즈·출처별 섹션(PRD 4.2 확장 필터)이 들어오면 `key`가 늘어난다. 클라이언트가 `key`를 화면 분기에 쓰지 않는 규약을 지켜야 무배포 확장이 가능하다.
- **검색 인덱스** — 제목·설명·저자·주제명 검색을 지원할 인덱스(pg_trgm 또는 tsvector)가 `domain.md`에 없다. P1 착수 시점에 `domain.md` 보강이 필요하다.
