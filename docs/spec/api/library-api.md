# 라이브러리 API 명세서

> 기준 문서: [`docs/features/library.md`](../../features/library.md)
> 판정 소유: [`docs/features/paywall.md`](../../features/paywall.md) 4.1~4.3 (재생 한도·차감·확인 팝업)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 6장

## 1. 범위

`library.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 여섯이다.

- 라이브러리 목록 조회 — 상태 탭 3개(전체·미청취·완료) + 출처·주제 필터 + 커서 페이지네이션
- 목록 응답에 실어 보내는 **잔여 재생 표시값**(`daily_play_limit` · `daily_play_count` · `service_date`)
- 앱 실행 시 **미니플레이어 복원 대상** 조회
- 재생 시작 — 카운트 적재와 상태 전이(`unplayed` → `in_progress`)
- 완청 처리(`in_progress` → `completed`)
- 삭제(소프트 삭제 + 실행 취소)와 드립 영구 제외 적재

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `library.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 재생 한도 판정(`ALLOW` / `BLOCKED` / `LIMIT_REACHED`), 차감 단위, 확인 팝업 조건 | `paywall.md` 4.1~4.3 | **참조만 한다.** 판정 결과를 어떤 응답·에러 코드로 표현할지만 정의한다 |
| 오디오 서명 URL 발급, 재생 위치 저장, `complete`·`replay` 신호 (`skip`은 제거 확정 2026-08-10 — `player.md` 4.4), **원문 유입 클릭 기록**(L4 [원문 보기] — 세 화면 공용 계약은 `player-api.md` 소유) | `player.md` · `player-api.md` · `architecture.md` 9.4 | 재생 시작 응답에 **서명 URL을 담지 않는다** |
| 담기(`source = save`) 생성·해제 | `explore.md` 4.3 | 담기 엔드포인트를 정의하지 않는다 |
| 결제·페이월 시트·티어 변경 | `paywall.md` 4.5 · `subscription.md` | 티어 변경 후 값이 달라지는 것은 목록 재조회로 반영된다 |
| 회수 콘텐츠 동기화(`GET /contents/withdrawn?since=`) | `partner-control.md` · `domain.md` 5.1 | 라이브러리 응답에서 회수분을 **제외**하는 규칙만 정의한다 |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 이 문서의 **모든 엔드포인트가 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 서비스 날짜 | `YYYY-MM-DD` — 04:00 KST 경계로 계산한 **날짜 라벨**(`domain.md` 1.2) |
| 페이지네이션 | **커서 기반**. `{ items, next_cursor, has_next }` (`convention.md` 5.3) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **이 문서에는 `Idempotency-Key`가 필요한 엔드포인트가 없다**(3장 설계 메모) |

- 성공 응답에 `success: true` 같은 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.**
- 에러 응답은 `architecture.md` 7.4 규격을 따른다.

```json
{
  "error_code": "PLAY_LIMIT_EXCEEDED",
  "message": "오늘 들을 수 있는 콘텐츠를 모두 들었어요",
  "retryable": false,
  "retry_after_sec": null,
  "trace_id": "01H8X..."
}
```

- `message`는 **사용자 노출용**이다. 클라이언트가 분기해야 하는 상황은 반드시 `error_code`로 구분한다(403 하나로 페이월과 회수를 함께 처리하게 만들지 않는다 — `convention.md` 5.4).

**`service_date`를 시각이 아니라 날짜 문자열로 내려주는 이유**

- **`service_date`는 UTC 타임스탬프가 아니다.** 04:00 KST 경계로 잘라 만든 날짜 라벨이며, `play_records.play_date`에 저장되는 값과 같은 값이다(`domain.md` 1.2 · 6.3).
  - UTC 시각으로 환산해 내려주면 클라이언트가 자기 시간대로 되돌리면서 경계가 한 번 더 이동하고, 03:59와 04:01이 같은 날로 뭉개진다.
- 클라이언트는 이 값을 **확인 팝업 억제의 유효 기간 판정에만** 쓴다(`library.md` 4.3). 저장한 억제 날짜와 다르면 억제가 풀린 것으로 본다.

**잔여 재생 표시값 — 세 필드 규약**

| 필드 | 타입 | 의미 |
|---|---|---|
| `daily_play_limit` | int \| null | `plans.daily_play_limit`. **`null`이면 무제한** |
| `daily_play_count` | int \| null | 서버가 `play_records`를 집계한 **파생값**. `daily_play_limit == null`이면 `null` |
| `service_date` | string(`YYYY-MM-DD`) | 오늘의 서비스 날짜 |

- **잔여 횟수 전용 엔드포인트를 만들지 않는다.** 목록 조회(4.1)·복원 조회(4.3)·재생 시작(4.4) 응답에 같은 이름으로 얹는다.
  - 화면 한 번 그리는 데 왕복이 두 번이면 목록과 잔여 표시의 시점이 어긋난다. "3회 남음"을 보면서 탭했는데 페이월이 뜨는 상황이 그렇게 만들어진다(`library.md` 3장).
- **남은 횟수(N)를 서버가 내려주지 않는다.** 한도와 사용량만 내려주고 `N = max(0, limit - count)`는 화면이 계산한다.
  - 같은 값을 두 이름으로 내려주면 어느 쪽이 맞는지 판단해야 하는 순간이 생긴다. 계산식은 한 줄이고 분모(`M`)는 어차피 함께 필요하다.
- **`daily_play_limit == null`일 때 `daily_play_count`를 0으로 채우지 않는다.** `null`로 내려준다.
  - 무제한 티어에 0을 내려주면 화면이 "무제한인데 0회 쓴 것"으로 읽고, 카운터를 그릴 근거가 생긴다. 무제한 티어는 아무것도 표시하지 않는 것이 규칙이다(`library.md` 4.1-2).
- **이 값은 판정이 아니라 힌트다.** 허용 여부는 재생 시작 시점에 서버가 다시 판정한다(`paywall.md` 4.1). 표시된 숫자를 근거로 재생을 통과시키지 않는다.

**서버가 받지 않는 값**

- **`[오늘은 그만 보기]` 억제 상태를 요청에 싣지 않는다.** 요청 필드도 응답 필드도 아니며, 서버는 이 값을 저장하지 않는다(`library.md` 4.3 · `paywall.md` 4.2).
  - 억제한 것은 **고지이지 판정이 아니다.** 서버에 두는 순간 파생값도 아닌 새 컬럼이 하나 생기고, 그 컬럼과 실제 판정이 어긋날 여지가 다시 생긴다(`domain.md` 1.4와 같은 종류의 문제다).
  - 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`)가 DTO에 없는 필드를 잘라내므로, 클라이언트가 실어 보내도 서버에 도달하지 않는다.
- **클라이언트가 보낸 `user_id` · `tier` · 잔여 횟수를 신뢰하지 않는다.** 전부 토큰과 서버 조회로 도출한다(`architecture.md` 9.2).

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/users/me/library-items` | 목록 조회(상태 탭·출처 필터·주제 필터·정렬·커서) + 잔여 재생 표시값 | 필요 |  |
| 2 | GET | `/users/me/library-items/topics` | 주제 필터 팝업용 — **라이브러리에 실제로 담긴** 주제 목록 | 필요 |  |
| 3 | GET | `/users/me/library-items/resume` | 미니플레이어 복원 대상 1건 | 필요 |  |
| 4 | POST | `/contents/:content_id/play` | 재생 시작 — 한도 판정 + 카운트 적재 + 상태 전이 | 필요 |  |
| 5 | POST | `/users/me/library-items/:id/complete` | 완청 처리(서버 재검증) | 필요 |  |
| 6 | DELETE | `/users/me/library-items/:id` | 소프트 삭제 + 드립 영구 제외 적재 | 필요 |  |
| 7 | POST | `/users/me/library-items/:id/restore` | 삭제 실행 취소 | 필요 |  |

**설계 메모**

- **잔여 재생 표시값에 전용 엔드포인트를 두지 않는다.** 목록 응답에 얹는다(`library.md` 3장).
  - 별도 호출로 나누면 목록과 숫자의 시점이 어긋나고, 두 응답 중 어느 쪽이 최신인지 클라이언트가 판단하게 된다.
  - **카운터 컬럼도 만들지 않는다.** `daily_play_count`는 `play_records` 집계이며(`domain.md` 1.4 · 6.3), `users.daily_play_count`는 폐기된 개체다(`domain.md` 14장).
- **재생 시작만 `/contents/:content_id/play`로, 나머지는 `/users/me/library-items`로 둔다.**
  - 탐색에서 담지 않은 콘텐츠도 재생할 수 있어(`explore.md` 4.3) **라이브러리 항목 id로는 대상을 지목할 수 없다.** 라이브러리 경로에 두면 담기 없이는 재생할 수 없게 되거나, 재생이 담기를 유발하는 부작용이 생긴다.
  - 라이브러리·탐색·미니플레이어·푸시가 **같은 엔드포인트를 쓴다.** 진입점마다 경로를 나누면 한도가 경로별로 새는 구멍이 된다(`paywall.md` 4.2 — "진입점에 따라 규칙이 달라지지 않는다").
- **변경 엔드포인트도 `/users/me/` 아래에 둔다.** `convention.md` 5.2의 예시(`POST /library-items/:id/complete`)와 다르지만, 소유권 스코프가 경로에 드러나야 목록과 단건이 서로 다른 계층에 놓이지 않는다(IDOR 방지 — `architecture.md` 9.2). 대상은 언제나 요청자의 항목이다.
- **`Idempotency-Key`를 쓰지 않는다.** 이 문서의 상태 변경은 전부 **경로가 대상을 특정하고 결과가 수렴하는** 요청이다.
  - 삭제는 이미 삭제된 항목에도 204, 복구는 이미 살아 있는 항목에도 200, 완청은 이미 완료된 항목에도 200이다.
  - 재생 시작은 `uq_play_records_user_id_content_id_play_date`가 **하루 단위 멱등을 DB로 보장한다**(`domain.md` 6.3). 같은 날 같은 콘텐츠를 두 번 눌러도 행이 늘지 않는다.
  - 오프라인 큐가 "마지막 상태만 유지"로 동작할 수 있는 것도 이 성질 때문이다(`common-error-handling.md` 4.5).
- **완료 처리를 클라이언트의 선언으로 받지 않는다.** 5번은 트리거일 뿐이고, 서버가 `playback_progresses.max_reached_sec`으로 완청 기준을 **다시 판정**한다(4.5).
  - 그대로 받으면 `library.md` 4.4가 삭제한 **수동 완료 표시가 API로 되살아난다.** 상태는 실제 재생 결과로만 바뀌어야 신호의 의미가 유지된다.
- **삭제와 복구를 한 엔드포인트의 토글로 만들지 않는다.** 오프라인 큐에서 순서가 뒤바뀌면 토글은 최종 상태를 예측할 수 없다. 두 방향을 각각 멱등하게 두면 마지막 요청이 그대로 최종 상태가 된다.

---

## 4. 엔드포인트 상세

### 4.1 `GET /users/me/library-items`

라이브러리 화면 진입·당겨서 새로고침·포그라운드 복귀·추가 로딩이 모두 이 하나를 호출한다.

**Request** — 쿼리 파라미터

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| filter | enum `all` / `unplayed` / `completed` | 선택(기본 `all`) | 상단 탭(**상태 전용**). 서로 배타적이며 한 번에 하나만 |
| source_filter | enum `drip` / `save` | 선택 | 필터 시트의 출처 섹션. 단일 선택이며 미선택은 출처를 가리지 않음 |
| topic_filter | string (uuid 콤마 구분) | 선택 | 주제 필터 팝업의 다중 선택 결과 |
| sort | enum `added_desc` / `added_asc` | 선택(기본 `added_desc`) | `library_items.added_at` 기준 |
| cursor | string(opaque) | 선택 | 직전 응답의 `next_cursor`. 클라이언트가 해석하지 않는다 |
| limit | int | 선택(기본 `20`, 최대 `50`) | 상한을 서버가 강제한다(`architecture.md` 9.3) |

- **`filter`는 상태만, `source_filter`는 출처만 가린다**(`library.md` 4.1-1). 상단 탭이 상태 3개로 좁혀지고 출처가 필터 시트로 옮겨간 개편(2026-08-07)의 결과다.
  - 개편 전에는 `filter=drip`이 있었다. **제거했다** — 같은 조회를 `filter`와 `source_filter` 두 가지로 표현할 수 있게 되면 커서 발급 조건에 두 축이 모두 들어가고, 어느 쪽이 맞는지 판단해야 하는 순간이 생긴다. 배포된 클라이언트가 없어 하위 호환을 지킬 이유도 없다.
- **`source_filter`의 화면 라벨은 [이어 PICK] · [내가 담은 콘텐츠]이지만 전송 값은 `drip` · `save`다.** 라벨은 화면 문구이고 값은 `library_items.source` 계열 값이다(`domain.md` 6.1). 라벨은 앞으로도 바뀔 수 있지만 `source` enum은 스키마다.
- **`filter` · `source_filter` · `topic_filter`는 전부 AND, 선택한 주제끼리만 OR다**(`library.md` 4.1-1).
  - 주제 사이를 AND로 걸면 선택한 주제를 **모두** 가진 콘텐츠만 남아 두 개만 골라도 대부분 빈 목록이 된다. 다중 선택의 의도는 "이 중 아무거나"다.
- **`filter`별 조건**

| filter | 조건 |
|---|---|
| `all` | 삭제되지 않은 전체 |
| `unplayed` | `status IN ('unplayed', 'in_progress')` — 듣다 만 것도 아직 안 들은 것이다 |
| `completed` | `status = 'completed'` |

- **`source_filter`별 조건**

| source_filter | 조건 |
|---|---|
| *(미선택)* | 출처를 가리지 않는다 |
| `drip` | `source = 'drip'` |
| `save` | `source IN ('save', 'onboarding')` — **온보딩 적립분을 포함한다** |

- **`save`가 `onboarding`을 포함하는 이유**: 온보딩의 [담기]는 사용자가 직접 고른 것이다. `source`를 `onboarding`으로 따로 기록하는 것은 유입 경로 분석을 위해서지, 사용자에게 제3의 출처를 보여주기 위해서가 아니다. 화면의 출처는 "이어가 보내준 것"과 "내가 담은 것" 둘뿐이다(9장의 `source = 'onboarding'` 취급 미결이 이 방향으로 닫혔다).

**Response 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "source": "drip",
      "status": "in_progress",
      "added_at": "2026-08-03T21:10:00Z",
      "last_played_at": "2026-08-04T00:12:30Z",
      "completed_at": null,
      "is_counted_today": true,
      "content": {
        "id": "uuid",
        "title": "번아웃 없이 오래 일하는 법",
        "author_name": "김서연",
        "source_name": "폴인",
        "duration_sec": 620,
        "thumbnail_url": "https://...",
        "content_version": 1,
        "topic_ids": ["uuid", "uuid"]
      },
      "progress": {
        "position_sec": 372,
        "max_reached_sec": 372
      }
    }
  ],
  "next_cursor": "eyJhZGRlZF9hdCI6...",
  "has_next": true,
  "daily_play_limit": 2,
  "daily_play_count": 1,
  "service_date": "2026-08-04"
}
```

| 필드 | 의미 |
|---|---|
| `source` | `drip` / `save` / `onboarding` — `library_items.source` 원값. 배지 매핑은 화면이 한다 |
| `status` | `unplayed` / `in_progress` / `completed` |
| `is_counted_today` | 이 콘텐츠가 **재청취 창 안**에 있는가 — 최근 15일(당일 포함) 내 차감 행(`play_records.is_counted = true`)이 있어, 재생해도 차감이 없는 상태(개정 2026-08-10 — `paywall.md` 4.3-1. 필드명은 유지하고 의미를 "오늘 카운트됨"에서 "창 안"으로 확장했다) |
| `progress` | `playback_progresses` 조인 결과. **행이 없으면 `null`**(0으로 채우지 않는다) |
| `content.content_version` | 재발행 판정용. 올라갔으면 클라이언트가 저장한 위치·오프라인 파일을 폐기한다(`domain.md` 5.1) |

- **재생 위치를 `library_items`가 아니라 조인으로 가져온다.** 위치의 단독 소유자는 `playback_progresses`다(`domain.md` 6.2 — `resume_position_sec`은 폐기된 컬럼).
  - 별도 호출로 나누면 목록 20건에 위치 조회가 20번 붙는다. `library.md` 4.3이 "재생 위치는 목록 조회 시 조인해 가져온다"고 규정한 이유다.
- **`is_counted_today`를 목록에 함께 내려준다.**
  - 재생 확인 팝업은 **탭한 직후 즉시** 떠야 하는데, 팝업 조건 중 하나가 "재청취 창 밖의 콘텐츠"다(`paywall.md` 4.2 — 개정 2026-08-10). 이 값이 없으면 클라이언트는 팝업을 띄우기 위해 서버에 한 번 더 물어야 하고, 잔여 표시를 목록에 얹은 이유(왕복 2회로 시점이 어긋난다)가 그대로 재현된다.
  - **컬럼이 아니라 `play_records` 조회 결과다**(`domain.md` 1.4 · 6.3 — 최근 15일 내 `is_counted = true` 행 존재 여부). 저장하지 않는다.
  - **이것도 힌트이지 판정이 아니다.** 차감 여부의 최종 판단은 재생 시작(4.4)이 하며, 이 값이 `true`여도 서버가 다시 판정한다(창 만료는 서비스 날짜 경계에서만 일어나고 차감 행은 지워지지 않으므로, 실제로는 안전한 방향으로만 틀린다).
- **회수된 콘텐츠는 응답에서 제외한다** — `contents.status = 'published'`인 것만 내려준다(`domain.md` 5.1 · `library.md` 4.7).
  - `library_items` 행은 남긴다. 회수가 해제되면 다시 보여야 하고, 사용자의 삭제와 파트너의 회수는 다른 사건이다.
- **삭제된 항목(`deleted_at IS NOT NULL`)은 제외한다.** 복구는 클라이언트가 들고 있는 id로 4.7을 호출해 수행하므로 목록에 남길 이유가 없다.

**커서**

- `next_cursor`는 `(added_at, id)`를 인코딩한 **불투명 문자열**이다. 클라이언트는 저장·재전송만 하고 해석하지 않는다.
- **offset이 아니라 keyset을 쓴다.** 드립이 적립되면 목록 앞쪽이 계속 밀리므로 offset은 중복·누락을 만든다(`convention.md` 5.3).
- **`id`를 함께 넣는 이유**: 같은 배치로 적립된 드립은 `added_at`이 동일할 수 있다. 정렬 키가 유일하지 않으면 경계에서 항목이 반복되거나 사라진다.
- **`filter` · `source_filter` · `sort` · `topic_filter`가 커서를 발급할 때와 다르면 `LIBRARY_CURSOR_INVALID`로 거절한다.** 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 만들어진다. 클라이언트는 첫 페이지부터 다시 조회한다.
- `has_next`는 다음 페이지 존재 여부이며, `false`일 때 `next_cursor`는 `null`이다.

**새 콘텐츠 도착 배너**(`library.md` 4.6)

- **"새 콘텐츠 N개 도착"을 서버가 계산해 내려주지 않는다.** 클라이언트가 직전 조회에서 본 것을 로컬에 보관하고, 재조회 결과와 비교해 배너를 띄운다.
  - "본 것"의 기준은 **화면에 노출됐는지**이고 서버는 그것을 알 수 없다. 서버가 판정하려면 읽음 시각 컬럼이 새로 필요한데, 그 컬럼과 실제 노출은 반드시 어긋난다.
  - 필터가 걸린 상태에서도 배너만 뜨고 필터는 유지된다 — 클라이언트 비교이므로 조회 조건이 그대로다(`library.md` 7).
- **비교 대상은 `source = 'drip'`인 항목뿐이다**(`library.md` 4.6 — 배너가 알리는 사건은 드립 도착이다). 판정 재료는 이 응답의 `source`이며 **새 필드를 두지 않는다.**

| 항목 | 규칙 |
|---|---|
| 기준값 | 직전에 노출한 목록에서 `source = 'drip'`인 항목의 **최대 `added_at`** |
| 배너 수 | 재조회 결과 중 `source = 'drip'`이면서 `added_at`이 기준값보다 큰 항목 수 |
| 기준값이 없을 때 | 배너를 띄우지 않고 기준값만 기록한다(첫 조회, 또는 드립이 한 건도 없던 상태) |

- **최상단 한 건이 아니라 드립의 최대 `added_at`과 비교한다.** 목록 정렬이 `added_at` 내림차순이 아닐 수 있고(`sort`), 사용자가 방금 담은 항목이 맨 위에 오면 최상단은 드립이 아니다.
- **드립이 보이지 않는 조회에서는 기준값을 갱신하지 않는다** — `source_filter = save`이거나 주제 필터로 드립이 전부 걸러진 경우다. 보지 못한 것을 본 것으로 기록하면 필터를 푸는 순간 도착을 놓친다.
- **사용자가 만든 항목은 배너를 띄우지 않는다.** 담기(`save`)·온보딩 적립(`onboarding`)·탐색 재생의 자동 적립(`explore-api.md` 4.3의 `reason = auto_play`)은 전부 사용자의 조작 결과이고, 그 결과는 조작 시점에 이미 토스트나 화면 전환으로 알려졌다. 다시 "도착했어요"라고 알리면 사용자는 자기가 하지 않은 일이 일어났다고 읽는다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `LIBRARY_CURSOR_INVALID` | 400 | 커서 형식 오류, 또는 발급 시점과 다른 `filter`·`source_filter`·`sort`·`topic_filter` |

- 네트워크 실패 시의 캐시 목록 노출은 클라이언트 규칙이다(`common-error-handling.md` 4.1). 이때 **잔여 재생 표시는 노출하지 않는다** — 캐시된 숫자는 이미 낡았을 수 있다(`library.md` 7).

---

### 4.2 `GET /users/me/library-items/topics`

주제 필터 팝업(바텀시트)이 무엇을 보여줄지 서버에서 받아온다.

**Response 200**

```json
{
  "topics": [
    { "id": "uuid", "name": "커리어", "item_count": 7 },
    { "id": "uuid", "name": "생산성", "item_count": 3 }
  ]
}
```

- **사용자의 관심 주제가 아니라 라이브러리에 실제로 담긴 콘텐츠의 주제를 내려준다**(`library.md` 4.1-1).
  - 담긴 게 없는 주제를 보여주면 고를 수는 있는데 결과가 항상 비어 있다. 필터는 목록을 좁히는 도구이므로 좁혀지지 않는 선택지를 두지 않는다.
  - 반대로 관심 주제로만 채우면, 탐색에서 담은 관심 밖 콘텐츠를 걸러낼 방법이 사라진다.
- **집계 대상은 삭제되지 않은 항목 + 회수되지 않은 콘텐츠**이며, 4.1의 목록 조건과 같다.
- **탭 선택과 무관하게 라이브러리 전체를 기준으로 센다.**
  - 탭을 옮길 때마다 팝업의 주제 구성과 배지 숫자가 흔들리면 두 필터를 조합할 수 없다. 사용자는 "커리어를 걸어 둔 채 탭을 옮기는" 조작을 한다.
- 담긴 항목이 하나도 없으면 `topics: []`다. **404가 아니다** — 빈 라이브러리는 정상 상태다.

---

### 4.3 `GET /users/me/library-items/resume`

앱 실행 시 미니플레이어에 무엇을 띄울지 조회한다. `library.md` 4.2에 대응한다.

**Response 200 — 대상 있음**

```json
{
  "resume_target": {
    "id": "uuid",
    "status": "in_progress",
    "last_played_at": "2026-08-04T00:12:30Z",
    "is_counted_today": true,
    "content": {
      "id": "uuid",
      "title": "번아웃 없이 오래 일하는 법",
      "duration_sec": 620,
      "thumbnail_url": "https://...",
      "content_version": 1
    },
    "progress": { "position_sec": 372, "max_reached_sec": 372 }
  },
  "daily_play_limit": 2,
  "daily_play_count": 1,
  "service_date": "2026-08-04"
}
```

**Response 200 — 대상 없음**

```json
{ "resume_target": null, "daily_play_limit": 2, "daily_play_count": 1, "service_date": "2026-08-04" }
```

**선정 규칙** — 아래를 모두 만족하는 것 중 `last_played_at`이 가장 최근인 **1건**

| 조건 | 근거 |
|---|---|
| `deleted_at IS NULL` | 삭제한 것을 이어들 자리는 없다 |
| `status != 'completed'` | 이미 끝난 것을 이어들 자리는 없다(`library.md` 4.2) |
| `contents.status = 'published'` | 회수된 콘텐츠는 미니플레이어에도 띄우지 않는다(`library.md` 7) |
| `position_sec > 0` | 위치가 0이면 처음부터 듣는 것과 같다(`library.md` 7) |

- **대상 없음을 404로 응답하지 않는다.** 신규 사용자와 완청만 있는 사용자에게는 대상이 없는 것이 정상이며, 클라이언트는 같은 응답에서 잔여 재생 표시값까지 함께 받아야 한다.
- **`position_sec > 0` 판정을 서버가 한다.** 클라이언트에 맡기면 규칙이 두 곳에 생기고, 조건이 바뀔 때 앱 배포 없이는 고칠 수 없다.
- **자동 재생 여부는 응답에 담지 않는다.** 미니플레이어는 언제나 일시정지 상태로 뜬다(`library.md` 4.2). 서버가 "자동 재생하라"고 지시할 수 있는 필드를 두면 그 규칙이 서버에서 뒤집힐 수 있게 된다.
- 이 응답은 **표시 대상 조회일 뿐 재생 허가가 아니다.** 미니플레이어에서 재생을 시작할 때도 4.4를 거치며, 한도 판정과 확인 팝업이 카드 탭과 동일하게 적용된다.

---

### 4.4 `POST /contents/:content_id/play`

재생 시작. **한도 판정과 카운트 적재가 여기서 일어난다.**

> **판정 규칙은 이 문서가 소유하지 않는다.** `ALLOW` / `BLOCKED` / `LIMIT_REACHED`의 기준, 차감 단위, 04시 경계는 전부 `paywall.md` 4.1~4.4가 정한다. 이 절은 그 결과를 어떤 상태 코드와 필드로 표현하는지만 정의한다.

**Request**

```json
{ "entry_point": "library" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| entry_point | enum `library` / `explore` / `miniplayer` / `push` / `player` | 필수 | 전환 분석용(`paywall.md` 3장). `player`는 완료 후 ▶ 재청취(개정 2026-08-10 — `paywall.md` 4.2 예외). **판정에 쓰지 않는다** |

- **`entry_point`가 판정을 바꾸지 않는다.** 어디서 시작하든 같은 규칙이다(`paywall.md` 4.2). 판정에 쓰이면 진입점을 위조해 한도를 우회할 수 있다.
- **잔여 횟수·억제 여부·티어를 요청에 싣지 않는다.** 전부 서버가 조회한다(2장).

**Response 200 — 허용**

```json
{
  "counted": true,
  "library_item": {
    "id": "uuid",
    "status": "in_progress",
    "last_played_at": "2026-08-04T00:20:11Z"
  },
  "progress": { "position_sec": 372, "max_reached_sec": 372 },
  "daily_play_limit": 2,
  "daily_play_count": 2,
  "service_date": "2026-08-04"
}
```

| 필드 | 의미 |
|---|---|
| `counted` | 이 요청으로 **차감이 발생했는가**(`is_counted = true` 행 신규 — 개정 2026-08-10). 재청취 창 내 재생이면 `false`다 — 청취 시간 적산용 행(`is_counted = false`)은 생길 수 있다(`domain.md` 6.3) |
| `library_item` | 라이브러리에 없는 콘텐츠를 재생하면 **`null`** |
| `progress` | 재생 시작 위치. 행이 없으면 `null`이며 클라이언트는 0부터 재생한다 |
| `daily_play_count` | **적재 이후의 값**. 클라이언트는 이 값으로 표시를 덮어쓴다 |

**서버 처리** — 하나의 트랜잭션에서 수행한다(`architecture.md` 8.1).

1. 콘텐츠 조회 → `status != 'published'`면 `CONTENT_WITHDRAWN`(403)
2. `paywall.md` 4.1 판정 → `BLOCKED` / `LIMIT_REACHED`면 403으로 종료. **재청취 창(4.3-1) 내 콘텐츠는 한도 검사보다 먼저 허용된다**(개정 2026-08-10)
3. `play_records`에 `(user_id, content_id, play_date)` upsert — 유니크 제약이 하루 단위 중복을 막는다(`domain.md` 6.3). **차감 재생이면 `is_counted = true`, 재청취 창 내 재생이면 `is_counted = false`**(청취 시간 적산용 행 — 개정 2026-08-10)
4. 라이브러리 항목이 있고 `status = 'unplayed'`면 `in_progress`로 전환 + `last_played_at` 갱신
5. `drip_excluded_contents`에 `reason = 'played'` upsert — 이미 행이 있으면 최초 사유를 유지한다(`domain.md` 7.1)
6. `user_signals`에 `action = 'play'` 적재(`domain.md` 6.4)

- **`daily_play_count`를 어디에도 저장하지 않는다.** 3번에서 행을 넣고 같은 트랜잭션에서 다시 세어 내려준다(`domain.md` 1.4).
- **라이브러리에 없는 콘텐츠를 재생해도 `library_items` 행을 만들지 않는다.** 담기는 사용자의 명시적 조작이다(`explore.md` 4.3).
  - 재생이 담기를 유발하면 "한 번 들어본 것"과 "담아둔 것"이 구분되지 않고, 라이브러리가 청취 이력으로 변한다. 드립 재적립 방지는 5번의 `played` 행이 이미 담당한다.
- **`completed` 상태는 되돌리지 않는다.** 완청한 콘텐츠를 다시 재생해도 `in_progress`로 내리지 않는다(`library.md` 7).
- **오디오 서명 URL은 이 응답에 담지 않는다.** 발급은 `player-api` 소관이며, 발급 시점에 구독·한도·회수를 다시 검증한다(`architecture.md` 9.4). 이때는 이미 오늘 카운트된 콘텐츠이므로 추가 차감이 일어나지 않는다.
- **자동 재시도 대상이 아니다.** 사용자가 시작한 액션이고 403은 재시도로 풀리지 않는다(`common-error-handling.md` 4.2).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `PLAY_LIMIT_EXCEEDED` | 403 | 무료(`light`) 티어 한도 소진 → 클라이언트는 **페이월 바텀시트**를 연다 |
| `PLAY_LIMIT_REACHED` | 403 | 한도 있는 **유료** 티어의 한도 소진 → 페이월이 아니라 한도 안내(`paywall.md` 2장) |
| `CONTENT_WITHDRAWN` | 403 | 파트너 회수 → "제공이 종료된 콘텐츠예요" 안내 후 목록에서 제거 |
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

- **두 한도 에러를 하나로 합치지 않는다.** 무료는 페이월(결제 유도), 유료는 안내다. 클라이언트가 다르게 동작해야 하므로 코드를 나눈다(`architecture.md` 7.5).
- **회수를 404가 아니라 403으로 응답한다.** 클라이언트가 "찾을 수 없음"이 아니라 "제공 종료"로 안내하고 목록에서 제거해야 한다(`convention.md` 5.5).
- **확인 팝업이 떠 있는 사이 한도가 소진되면 여기서 403이 난다.** 팝업에 표시된 숫자를 믿고 통과시키지 않기 때문이다(`paywall.md` 4.2). 클라이언트는 팝업을 닫고 페이월로 전환한다.

---

### 4.5 `POST /users/me/library-items/:id/complete`

완청 처리. `library.md` 4.4의 `in_progress` → `completed` 전이에 대응한다.

**Request** — 본문 없음

**Response 200**

```json
{ "id": "uuid", "status": "completed", "completed_at": "2026-08-04T00:30:42Z" }
```

- **클라이언트의 선언을 그대로 받지 않는다.** 서버가 `playback_progresses.max_reached_sec`과 `contents.duration_sec`으로 **완청 기준을 다시 판정한다.**
  - 그대로 받으면 `library.md` 4.4가 제거한 **수동 완료 표시가 API 형태로 되살아난다.** 상태가 실제 재생 결과로만 바뀌어야 완청률 지표와 추천 신호의 의미가 유지된다.
  - **`position_sec`이 아니라 `max_reached_sec`으로 판정한다.** 시크로 끝까지 점프한 것은 완청이 아니다(`domain.md` 6.2).
- 기준은 **도달 위치가 길이의 90% 이상**이다(`library.md` 4.4). 기준값 자체는 `library.md`가 소유하며 여기서 바꾸지 않는다.
- **`duration_sec`이 없거나 0이면 판정할 수 없다.** 이때는 재생 종료 이벤트만으로 `completed` 처리한다(`library.md` 7) — 즉 이 호출을 그대로 수용한다.
- **이미 `completed`면 200을 그대로 반환한다.** `completed_at`은 최초 값을 유지한다. 90% 이후 되감아 다시 들어도 상태를 되돌리지 않는다(`library.md` 7).
- `user_signals`의 `complete` 신호 적재는 재생 이벤트를 소유한 `player.md` 소관이다. 이 엔드포인트는 `library_items.status`만 바꾼다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `LIBRARY_COMPLETION_NOT_REACHED` | 409 | 도달 위치가 기준에 못 미침. **상태를 바꾸지 않는다** |
| `LIBRARY_ITEM_NOT_FOUND` | 404 | `:id`가 없거나 요청자의 항목이 아님 |

- **기준 미달을 400이 아니라 409로 응답한다.** 요청 형식이 틀린 것이 아니라 **현재 상태가 전이 조건을 만족하지 않는 것**이다(`convention.md` 5.4). 클라이언트는 사용자에게 오류를 노출하지 않고 조용히 무시한다 — 사용자가 시작한 액션이 아니다(`common-error-handling.md` 4.3).

---

### 4.6 `DELETE /users/me/library-items/:id`

라이브러리에서 삭제. **소프트 삭제이며 재생 이력은 남긴다.**

**Response 204**

**서버 처리** — 하나의 트랜잭션에서 수행한다.

1. `library_items.deleted_at`을 찍는다. **행을 지우지 않는다**(`domain.md` 6.1)
2. `drip_excluded_contents`에 `reason = 'library_delete'` upsert. 이미 행이 있으면 최초 사유를 유지한다(`domain.md` 7.1)
3. `user_signals`에 `action = 'delete'` 적재(`domain.md` 6.4)

- **`playback_progresses`를 지우지 않는다**(`domain.md` 6.2 · `library.md` 4.5). 탐색에서 다시 담으면 듣던 위치가 살아 있어야 한다.
- **삭제 경로를 응답에 구분해 담지 않는다.** 라이브러리 삭제든 탐색 담기 해제든 결과는 같은 영구 제외다. `deleted_reason`은 폐기된 컬럼이다(`domain.md` 14장).
- **영구 제외 사실을 응답으로 알리지 않는다.** 안내 문구용 필드를 두지 않으며, 204에는 본문이 없다.
  - 삭제는 목록 정리에 가까운 가벼운 조작인데, 영구적이라는 고지가 붙는 순간 결정처럼 무거워진다(`library.md` 4.5). 지우기를 망설이면 라이브러리가 정리되지 않는다.
- **이미 삭제된 항목에도 204를 반환한다.** 오프라인 큐가 같은 삭제를 다시 보낼 수 있고(`common-error-handling.md` 4.5), 실패시킬 이유가 없다.
- **클라이언트는 [실행 취소] 스낵바가 사라진 뒤에 이 요청을 보낸다**(`common-error-handling.md` 4.4). 5초 안에 취소하면 서버 호출 자체가 발생하지 않는다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `LIBRARY_ITEM_NOT_FOUND` | 404 | `:id`가 없거나 요청자의 항목이 아님 |

---

### 4.7 `POST /users/me/library-items/:id/restore`

삭제 실행 취소. `library.md` 7의 "이미 서버 삭제가 완료된 경우"에 대응한다.

**Response 200**

```json
{
  "id": "uuid",
  "status": "in_progress",
  "added_at": "2026-08-03T21:10:00Z",
  "deleted_at": null
}
```

- **`added_at`을 유지한다.** 복구를 새 적립으로 처리하면 항목이 목록 맨 위로 올라와 순서가 바뀐다(`library.md` 7). 사용자가 되돌린 것은 삭제이지 적립 시각이 아니다.
- **`status`도 유지한다.** 듣던 진행률이 그대로 살아 있어야 하며, `playback_progresses`는 애초에 지우지 않았다.
- **`drip_excluded_contents` 행을 삭제하지 않는다.**
  - 그 행은 삭제 이전부터 `played`·`dripped` 사유로 존재했을 수 있고, `reason`은 최초 값을 유지하므로(`domain.md` 7.1) 어느 쪽이었는지 구분할 수 없다. 지우면 **이미 들은 콘텐츠가 드립으로 다시 오게 된다.**
  - 실질적인 차이도 없다. 드립 후보 필터는 `library_items` 행이 존재하기만 하면 제외하므로(`domain.md` 7.1), 복구된 항목은 그 조건으로 이미 제외된다.
- **서버는 실행 취소 창(5초)을 강제하지 않는다.** 삭제된 항목이면 언제든 복구한다.
  - 5초는 스낵바의 표시 시간이지 서버가 검증할 수 있는 값이 아니다. 오프라인 큐가 지연되면 서버 시각으로는 이미 5초를 넘긴다(`common-error-handling.md` 4.5). 시간으로 막으면 사용자가 정상적으로 누른 [실행 취소]가 실패한다.
  - 되돌릴 수단은 어차피 탐색에서 다시 담는 경로로 남아 있다(`library.md` 4.5). 서버가 창을 강제해도 막을 수 있는 것이 없다.
- **삭제되지 않은 항목에 호출하면 200과 현재 상태를 반환한다.** 큐 재전송으로 같은 복구가 두 번 도착할 수 있다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `LIBRARY_ITEM_NOT_FOUND` | 404 | `:id`가 없거나 요청자의 항목이 아님 |
| `CONTENT_WITHDRAWN` | 403 | 삭제해 둔 사이 파트너가 회수함. 복구해도 목록에 나타나지 않으므로 복구하지 않는다 |

---

## 5. 에러 코드 표

**이 표는 `common-error-handling.md` 9장 중앙 표의 라이브러리·재생 발췌(9.5)에 공용 콘텐츠 코드(9.2)를 더한 것이다** — 두 곳이 어긋나면 9장이 기준이다. 추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 **9장 표를 먼저 갱신한 뒤** 이 표를 맞춘다. 이미 배포된 코드의 의미를 바꾸지 않는다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `LIBRARY_CURSOR_INVALID` | 400 | false | 커서를 버리고 첫 페이지부터 재조회. 사용자에게 노출하지 않는다 |
| `LIBRARY_ITEM_NOT_FOUND` | 404 | false | 목록에서 해당 항목 제거 |
| `LIBRARY_COMPLETION_NOT_REACHED` | 409 | false | 조용히 무시. 상태를 바꾸지 않는다 |
| `PLAY_LIMIT_EXCEEDED` | 403 | false | **페이월 바텀시트**(`paywall.md` 4.5) |
| `PLAY_LIMIT_REACHED` | 403 | false | "오늘 청취 한도를 모두 사용했어요" 안내. 페이월 아님 |
| `CONTENT_WITHDRAWN` | 403 | false | "제공이 종료된 콘텐츠예요" + 목록에서 제거, 미니플레이어면 내림 |
| `CONTENT_NOT_FOUND` | 404 | false | 목록에서 제거 |

- 401(토큰 만료)·429·5xx의 처리는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다. 이 문서가 따로 정의하지 않는다.
- **403 하나로 페이월·한도 안내·회수를 구분하게 만들지 않는다.** 세 상황의 화면이 전부 다르다(`convention.md` 5.4).

## 6. 흐름

**화면 진입 · 새로고침**

```
GET /users/me/library-items/resume     → 미니플레이어(일시정지 상태로 표시만)
GET /users/me/library-items            → 목록 + daily_play_limit/count + service_date
  ├─ (필터 아이콘) GET /users/me/library-items/topics → 주제 팝업
  └─ (추가 로딩)   GET /users/me/library-items?cursor=...
```

- 두 조회는 병렬로 호출해도 된다. 둘 다 잔여 재생 표시값을 싣고 있으며 **같은 요청 시점에 계산되므로 값이 어긋나지 않는다.**

**재생**

```
아이템 탭
   ↓ (클라이언트) is_counted_today · daily_play_limit · 로컬 억제 플래그로 팝업 여부만 결정
   ↓ [재생하기] 또는 [오늘은 그만 보기]
POST /contents/:content_id/play
   ├─ 200 counted=true/false → 플레이어 (position_sec부터)
   ├─ 403 PLAY_LIMIT_EXCEEDED → 페이월 바텀시트
   ├─ 403 PLAY_LIMIT_REACHED  → 한도 안내
   └─ 403 CONTENT_WITHDRAWN   → 제공 종료 안내 + 목록에서 제거
        ↓ (완청 도달)
POST /users/me/library-items/:id/complete
```

- **팝업을 띄울지는 클라이언트가 정하고, 재생을 허용할지는 서버가 정한다.** 팝업은 고지 UI이고 판정은 `paywall.md` 4.1이 소유한다.
- **[오늘은 그만 보기]는 위 호출을 바꾸지 않는다.** 팝업만 건너뛰고 같은 요청을 보내며, 차감은 그대로 일어난다.

**삭제 · 실행 취소**

```
스와이프 삭제 → 로컬에서 제거 + 스낵바 5초
  ├─ [실행 취소]      → 로컬 복구. 서버 호출 없음
  └─ 스낵바 소멸       → DELETE /users/me/library-items/:id
        └─ (이미 전송된 뒤 취소) POST /users/me/library-items/:id/restore
```

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR 방지 — `architecture.md` 9.2).
- **다른 사용자의 항목은 403이 아니라 404로 응답한다.** 403은 "그 항목이 존재한다"는 사실을 알려주므로, id를 넣어보는 것만으로 남의 라이브러리 구성을 탐지할 수 있다.
- **소유권 검증은 Guard가 아니라 Service에서 한다.** "이 항목이 이 사용자의 것인가"는 도메인 판정이다(`architecture.md` 9.2).
- **커서에 `user_id`를 담지 않는다.** 담으면 남의 커서를 넣어 조회를 시도할 여지가 생긴다. 스코프는 언제나 토큰이 정한다.
- **재생 한도는 서버에서만 판정한다.** 클라이언트가 보낸 잔여 횟수·티어·`entry_point`는 판정에 쓰지 않는다(`paywall.md` 4.1).
- **회수 여부는 목록과 재생 양쪽에서 각각 확인한다.** 목록에서 걸러도 이미 화면에 떠 있는 항목이 탭될 수 있다(`library.md` 4.7).
- **목록 조회는 `limit` 상한(50)을 서버가 강제한다**(`architecture.md` 9.3).
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다. 억제 플래그 같은 클라이언트 로컬 값이 실려 와도 서버에 도달하지 않는다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `library_items` — 소프트 삭제, `(user_id, content_id)` 유니크가 중복 적립 방어선 | 6.1 |
| `playback_progresses` — **재생 위치의 단독 소유자**. 목록 조회 시 조인한다 | 6.2 |
| `play_records` — **잔여 재생 횟수의 유일한 근거**. 집계로 구한다 | 6.3 |
| `user_signals` — `play` · `delete` 신호 적재 | 6.4 |
| `contents` — 제목·길이·`status` · `content_version` | 5.1 |
| `content_topics` — 주제 필터(4.1)와 주제 목록(4.2)의 조인 대상 | 5.2 |
| `drip_excluded_contents` — 삭제·재생 시 적재 | 7.1 |
| `plans` — `daily_play_limit`(null = 무제한) | 8.1 |
| 서비스 날짜 경계(04:00 KST) | 1.2 |
| 파생값을 컬럼으로 두지 않는다 | 1.4 |

- **잔여 재생 횟수를 저장하는 컬럼을 만들지 않는다.** `daily_play_count`는 판정 시점의 `play_records` 집계이며(`domain.md` 1.4 · 6.3), `users.daily_play_count` · `count_reset_at`은 **폐기된 개체다**(`domain.md` 14장). 이 API는 계산한 값을 응답에 실어 보낼 뿐이다.
- **`is_counted_today`도 컬럼이 아니다.** `play_records`에 최근 15일 내 차감 행(`is_counted = true`)이 있는지를 조회한 결과다(재청취 창 — `paywall.md` 4.3-1).
- **재생 위치 컬럼을 `library_items`에 두지 않는다.** `resume_position_sec`은 폐기된 컬럼이다(`domain.md` 14장) — 라이브러리에서 삭제해도 재생 이력이 남아야 하기 때문이다.
- **삭제 사유 컬럼을 두지 않는다.** `deleted_reason`은 폐기됐고(`domain.md` 14장), 경로 구분 없이 `drip_excluded_contents`가 영구 제외를 담당한다.
- **`plans`는 `subscription` 모듈 소유다**(`domain.md` 2장). 한도 값은 그 모듈이 노출한 Service로 조회하고 Repository를 직접 주입받지 않는다(`architecture.md` 4.3).
- `play_records` · `user_signals` · `playback_progresses`는 `playback` 모듈 소유이며, `library` 모듈은 `content` · `user`에만 의존한다(`domain.md` 2장). **재생 시작(4.4)은 `playback` 모듈의 엔드포인트이고, 라이브러리 상태 전이는 `library` Service를 호출해 수행한다.**

## 9. 미결 사항

- ~~**`source = 'onboarding'`의 취급**~~ — **해소(2026-08-07).** 카드·필터 개편으로 출처가 탭에서 필터로 옮겨가면서 `source_filter=save`가 `source IN ('save', 'onboarding')`으로 정의됐다(4.1). 온보딩 적립분은 [내가 담은 콘텐츠]에 포함된다. 출처 배지 자체가 사라졌으므로 배지 귀속 문제도 함께 없어졌다.
- **`PLAY_LIMIT_EXCEEDED` / `PLAY_LIMIT_REACHED` 명칭** — 두 코드의 이름이 지나치게 비슷해 구현에서 뒤바뀔 여지가 있다. `PLAY_LIMIT_EXCEEDED`는 `architecture.md` 7.2·7.4에 이미 예시로 등장하므로 그대로 두고 유료 한도 쪽만 새 이름을 붙였다. 유료 티어 한도 값이 정해질 때(`plans` 미결) 다시 본다.
- **잔여 표시 힌트 조건의 문서 간 불일치** — `paywall.md` 5장 표는 소진(`count == 2`) 행만 따로 규정하고, 상시 표시는 같은 장 아래 문단에서 정한다. `library.md` 미결 사항이 지적한 어긋남이다.
    
    → 이 문서는 **한도가 있는 티어면 소진 여부와 무관하게 세 필드를 항상 내려주는** 쪽으로 구현했다. 표시 여부는 화면이 정하며, 서버가 조건부로 필드를 빼면 "값이 없음"과 "무제한"이 구분되지 않는다.
    
- **완청 판정 90% 확정** — `library.md` 4.4의 기준값이 PRD 10의 완청률 지표 정의와 아직 맞춰지지 않았다. 4.5의 서버 재검증식은 그 값을 상수로 참조할 뿐이므로 확정 시 API 변경은 없다.
- **주제 목록(4.2)의 `item_count` 노출 여부** — 응답에는 담았으나 팝업이 개수를 표시할지는 화면 명세가 정한다. 표시하지 않기로 하면 필드를 뺀다.
- **주제 필터·복원 조회의 인덱스** — 아래 세 조회가 현재 인덱스로는 지원되지 않는다. **컬럼 추가가 아니라 인덱스 문제이므로 `domain.md`에 인덱스를 보강해야 한다.**
    - 주제 필터: `library_items ⨝ content_topics`에 주제 축 인덱스가 없다
    - **출처 필터: `source` 축이 없다**(2026-08-07 개편으로 추가된 조건). `idx_library_items_user_id_deleted_at_added_at`에 `source`가 없어 `source_filter`가 걸리면 필터링 후 정렬이 된다
    - 회수 제외: `contents.status` 조인이 매 페이지에 붙는다
    - 복원 조회(4.3): 정렬 키가 `last_played_at DESC`인데 `idx_library_items_user_id_deleted_at_added_at`은 `added_at` 기준이다
    - 커서 tie-break: 같은 인덱스에 `id`가 포함되지 않아 `added_at`이 같은 행에서 추가 스캔이 생긴다
- **커서 서명 여부** — 지금은 불투명 인코딩만 하고 서명하지 않는다. 위조해도 자기 데이터만 조회되므로(스코프는 토큰이 정한다) 유출 위험은 없지만, 위조된 커서가 만드는 오류 응답의 양은 관측 대상이다.
- **삭제 → 복구의 반복 어뷰징** — 복구에 시간 제한을 두지 않기로 했으므로, 삭제·복구를 반복해 `user_signals`에 `delete` 신호를 대량 적재할 수 있다. 추천 스코어링에 왜곡이 생기는지 확인이 필요하다.
