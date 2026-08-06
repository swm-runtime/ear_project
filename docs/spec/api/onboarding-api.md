# 온보딩 API 명세서

> 기준 문서: [`docs/features/onboarding.md`](../../features/onboarding.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3·4·5·6·7장
> 연관: [`docs/features/drip-scheduling.md`](../../features/drip-scheduling.md) · [`docs/features/common-error-handling.md`](../../features/common-error-handling.md) 4.2

## 1. 범위

`onboarding.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 다섯이다.

- 관심 주제 목록 조회와 선택 저장(최소 1개·최대 3개)
- 커리어 정보 입력·건너뛰기
- 3단계 추천 콘텐츠 조회와 담기
- 온보딩 완료 처리와 첫 드립 편성 대기
- 알림 권한 상태의 서버 반영

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `onboarding.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 편성 알고리즘은 `drip-scheduling.md`, 스키마는 `domain.md`가 유일한 기준이다.

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 온보딩 API는 **전부 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | 부작용이 있는 POST에 `Idempotency-Key` (3장 표의 ★ 표시) |

- 성공 응답에 `success: true` 같은 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.**
- 에러 응답은 `architecture.md` 7.4 규격을 따른다.

```json
{
  "error_code": "ONBOARDING_INTEREST_LIMIT_EXCEEDED",
  "message": "관심 주제는 3개까지 선택할 수 있어요",
  "retryable": false,
  "retry_after_sec": null,
  "trace_id": "01H8X..."
}
```

- `message`는 **사용자 노출용**이다. 클라이언트가 분기해야 하는 상황은 반드시 `error_code`로 구분한다(HTTP status만으로 판단하게 만들지 않는다).
- **온보딩은 서버 저장이 필수라 오프라인 진행이 불가능하다**(`onboarding.md` 5). 조회 실패는 전체 화면 에러 + [다시 시도]로 처리하며, 캐시로 대체하지 않는다.

**대기·재시도 기준값**

| 항목 | 값 | 출처 |
|---|---|---|
| 자동 재시도 | 최대 2회(총 3회 시도), 백오프 1초 → 3초(지터 ±20%) | `common-error-handling.md` 4.2 |
| 자동 재시도 대상 | 타임아웃 · 5xx · 429 · 네트워크 일시 단절. **상태를 바꾸는 요청은 `Idempotency-Key`가 있을 때만** | `common-error-handling.md` 4.2 |
| 첫 드립 대기 상한 | **15초**(기준값) — 초과 시 대기를 걷고 완료 화면으로 진행 | `onboarding.md` 4 [완료] |
| 첫 드립 상태 폴링 간격 | **1초**(기준값). 값은 서버가 4.7 응답으로 내려준다 | 이 문서 4.7·4.8 |

- **대기 상한과 폴링 간격을 클라이언트에 하드코딩하지 않는다.** 둘 다 `onboarding.md` 미결 사항의 잠정 기준값이라 실측 후 조정될 값인데, 앱에 박아두면 조정에 스토어 심사 주기가 걸린다.

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/onboarding/state` | 재개 지점과 저장된 입력값 조회 | 필요 | |
| 2 | GET | `/onboarding/topics` | 선택 가능한 중분류 주제 목록 | 필요 | |
| 3 | PUT | `/onboarding/interests` | 1단계 관심 주제 저장(전체 교체) | 필요 | |
| 4 | PATCH | `/onboarding/career` | 2단계 커리어 저장 · 건너뛰기 | 필요 | |
| 5 | GET | `/onboarding/recommendations` | 3단계 추천 9건(2개 섹션) 조회 | 필요 | |
| 6 | POST | `/onboarding/picks` | 3단계 담기 — `library_items(source = onboarding)` | 필요 | ★ |
| 7 | POST | `/onboarding/complete` | 완료 처리 + 첫 드립 편성 트리거 | 필요 | ★ |
| 8 | GET | `/onboarding/first-drip` | 첫 드립 편성 상태 조회(0건 경로의 대기) | 필요 | |
| 9 | PUT | `/users/me/devices/:device_id` | 기기 토큰 · OS 알림 권한 상태 반영 | 필요 | |

**설계 메모**

- **경로를 `/onboarding` 아래에 모으는 이유**: 관심사 저장(3)·커리어 저장(4)은 결과적으로 `user_interests`와 `users`를 쓰지만, 온보딩에서는 **저장과 동시에 `onboarding_step`을 전진**시키는 상태 전이다. 같은 데이터를 다루는 `interest-management`·`profile`의 엔드포인트에 이 부수 효과를 붙이면, 온보딩을 끝낸 사용자가 관심사를 고칠 때마다 재개 지점이 함께 움직인다.
- **1단계 저장이 POST가 아니라 PUT인 이유**: 선택한 주제 집합 **전체를 교체**하는 요청이다(`convention.md` 5.1). 같은 본문을 두 번 보내도 결과가 같으므로 멱등키가 필요 없고, [다음] 연타나 네트워크 재시도로 관심사가 중복 저장될 여지가 없다.
- **커리어가 PATCH인 이유**: 세 필드가 전부 선택 입력이라 **보낸 필드만 반영**해야 한다. [건너뛰기]는 빈 본문으로 같은 엔드포인트를 호출한다 — 건너뛰기 전용 엔드포인트를 따로 두면 단계 전이 처리가 두 곳으로 갈라지고, 한쪽만 고치는 사고가 난다.
- **추천 조회(5)와 담기(6)를 나누는 이유**: 조회는 재진입할 때마다 반복되고 담기는 한 번만 일어난다. 한 엔드포인트로 묶으면 뒤로가기로 3단계에 다시 들어올 때마다 담기 부작용을 재평가해야 한다.
- **담기(6)를 `/library-items`로 보내지 않는 이유**: 온보딩 담기는 `source = onboarding`으로 적립되고 **부분 실패를 허용**한다(`onboarding.md` 7 — 성공한 건만 적립하고 진행을 막지 않는다). 라이브러리·탐색의 담기는 단건·전부 성공이 기본이라 응답 규격이 다르다.
- **완료(7)와 편성 상태 조회(8)를 나누는 이유**: 4.7의 설계 메모 참조. **완료 처리는 짧은 트랜잭션이고 편성은 소요 시간을 보장할 수 없는 작업**이라, 한 요청에 묶으면 편성이 늦어질 때 이미 커밋된 완료가 클라이언트에게 실패로 보인다.
- **알림 권한 반영(9)에 온보딩 전용 경로를 만들지 않는다.** 같은 값을 설정 화면과 포그라운드 복귀 동기화도 갱신하므로(`notification.md` 4.1), 경로를 나누면 권한 상태의 진실이 두 곳이 된다.

---

## 4. 엔드포인트 상세

### 4.1 `GET /onboarding/state`

앱 재실행·재로그인 시 **어느 단계부터 재개할지**와 그 단계에 이미 저장된 값을 받아온다(`onboarding.md` 2).

**Response 200**

```json
{
  "onboarding_completed": false,
  "onboarding_step": "pick",
  "selected_topic_ids": ["uuid-a", "uuid-b"],
  "career": {
    "job_category": "developer",
    "job_title": "백엔드 엔지니어",
    "years_of_experience": "2-3"
  },
  "picked_count": 0
}
```

| 필드 | 의미 |
|---|---|
| `onboarding_completed` | `true`면 온보딩 화면을 띄우지 않는다. 클라이언트는 즉시 라이브러리로 보낸다 |
| `onboarding_step` | 재개 지점. `topic \| career \| pick \| done` (`domain.md` 3.1) |
| `selected_topic_ids` | 1단계에서 **서버에 저장된** 선택. 로컬 임시 저장분과 다르면 이 값이 기준이다 |
| `career` | 미입력 필드는 `null`. 세 필드가 모두 `null`이면 건너뛴 사용자다 |
| `picked_count` | 3단계에서 담은 건수. 재진입 시 [담기]/[건너뛰기] 버튼 분기에 쓴다 |

- **재개 지점을 이 엔드포인트로 한 번 더 내려주는 이유**: 로그인 응답(`auth-api` 4.1)의 `user` 객체에도 같은 값이 있지만, 그것은 **로그인 시점의 스냅샷**이다. 다른 기기에서 온보딩을 이어간 뒤 이 기기가 앱을 재실행하면 로그인 응답 없이 화면이 다시 그려지므로, 온보딩 화면이 직접 물어볼 단일 소스가 필요하다.
- **뒤로가기로 1단계에 돌아온 사용자에게는 `selected_topic_ids`로 선택 상태를 복원한다.** 로컬 임시 저장분만 믿으면 다른 기기에서 바꾼 선택이 조용히 덮인다.
- **`onboarding_step`은 앞으로만 전진한다.** 뒤로가기로 이전 단계를 다시 저장해도 재개 지점을 되돌리지 않는다 — 되돌리면 그 시점에 앱이 죽었을 때 이미 끝낸 입력을 다시 시키게 된다.
- **온보딩이 끝난 계정도 200을 반환한다.** 404로 만들면 "완료된 상태"와 "조회 실패"를 클라이언트가 구분해야 하고, 실패를 완료로 오인하면 온보딩을 처음부터 다시 시킨다.

---

### 4.2 `GET /onboarding/topics`

1단계에 노출할 중분류 주제 목록이다.

**Response 200**

```json
{
  "items": [
    { "topic_id": "uuid-a", "name": "커리어", "parent_category": "일" },
    { "topic_id": "uuid-b", "name": "생산성", "parent_category": "일" }
  ],
  "max_selectable": 3,
  "is_fallback": false
}
```

| 필드 | 의미 |
|---|---|
| `items` | `topics.is_visible = true`만, `display_order` 오름차순 (`domain.md` 4.1) |
| `max_selectable` | 선택 상한. **클라이언트에 상수로 두지 않는다** |
| `is_fallback` | 관리자가 설정한 노출 주제가 없어 **기본 주제 세트**를 내려보낸 상태(`onboarding.md` 7) |

- **`is_visible = false`인 주제는 목록에 담지도, 저장을 허용하지도 않는다.** 노출 여부는 관리자만 바꾸며(FR-38), 콘텐츠 풀이 없는 주제는 애초에 내려가지 않는다. 그래서 온보딩에는 "고를 수는 있는데 볼 게 없는 주제"가 존재하지 않는다(`onboarding.md` 3).
- **`content_count`를 응답에 담지 않는다.** 화면이 쓰지 않는 값이고, 매 조회마다 `content_topics` 집계가 붙는다(`domain.md` 4.1).
- **상한(`max_selectable`)을 서버가 내려주는 이유**: 상한 검증은 어차피 서버가 한다(4.3). 화면 문구("3개까지 선택할 수 있어요")와 서버 검증이 서로 다른 상수를 보면, 상한을 조정할 때 한쪽만 바뀌어 **사용자가 고를 수 있는 개수를 서버가 거부**하게 된다.
- **기본 주제 세트는 서버가 내려준다.** `is_fallback = true`여도 `topic_id`는 실재하는 `topics` 행이다 — 클라이언트가 하드코딩한 주제를 그리면 그 선택을 `user_interests`(`topic_id` FK)에 저장할 수 없어 1단계가 통째로 막힌다.
- `is_fallback = true`는 **정상 상태가 아니다.** 서버는 이 응답을 만들 때 운영 알림을 발생시킨다(`onboarding.md` 7).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `INTERNAL_ERROR` | 500 | 조회 실패. `retryable: true`, 클라이언트는 전체 화면 에러 + [다시 시도] |

---

### 4.3 `PUT /onboarding/interests`

1단계 [다음] 시점에 호출한다. 선택한 주제 집합을 **전체 교체**하고 `onboarding_step`을 `career`로 전진시킨다.

**Request**

```json
{ "topic_ids": ["uuid-a", "uuid-b"] }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `topic_ids` | string[] | 필수 | **최소 1개 · 최대 3개.** 중복 값은 거부한다 |

**Response 200**

```json
{
  "selected_topic_ids": ["uuid-a", "uuid-b"],
  "onboarding_step": "career"
}
```

- **상한(3개)과 하한(1개)을 서버가 다시 검증한다.** 클라이언트의 칩 비활성화만으로는 우회된다(`onboarding.md` 3·8 — "클라이언트를 우회해 주제 4개를 서버로 보낸다 / Then 서버가 상한을 검증해 거부한다").
- **초과분을 잘라내고 성공시키지 않는다.** 4개를 보냈는데 3개가 저장되면 화면에 그려진 선택과 서버 상태가 어긋나고, 사용자는 자기가 고른 주제가 왜 빠졌는지 알 수 없다. 거부하고 에러 코드로 이유를 알린다.
- **교체 방식**: 이번 요청에 없는 기존 `source = onboarding` 행은 `is_active = false` + `deactivated_at`으로 내리고, 새 주제는 `source = onboarding`으로 upsert한다(`domain.md` 4.2). **행을 물리 삭제하지 않는다** — `uq_user_interests_user_id_topic_id` 때문에 재선택 시 같은 행을 되살려야 하고, 자동 확장 제외 플래그(`is_user_removed`)가 지워지면 안 된다.
- **`is_user_removed`를 여기서 건드리지 않는다.** 그 값은 사용자가 관심사 관리 화면에서 직접 해제했다는 뜻이며(FR-06), 온보딩의 선택 해제와 의미가 다르다.
- **`onboarding_step`은 저장 성공 트랜잭션 안에서 함께 전진시킨다.** 관심사만 저장되고 단계가 남아 있으면 재실행 시 1단계로 되돌아가 사용자가 같은 입력을 반복한다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `ONBOARDING_INTEREST_REQUIRED` | 400 | `topic_ids`가 비었음. 1단계는 건너뛸 수 없다 |
| `ONBOARDING_INTEREST_LIMIT_EXCEEDED` | 400 | 4개 이상을 보냄 |
| `ONBOARDING_TOPIC_UNAVAILABLE` | 400 | 존재하지 않거나 `is_visible = false`인 `topic_id`가 섞여 있음 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | `onboarding_completed = true`인 계정의 호출 |

- **"없는 주제"와 "숨겨진 주제"를 다른 코드로 구분하지 않는다.** 구분해 주면 임의의 UUID를 던져 비노출 주제의 존재 여부를 탐침할 수 있다. 클라이언트도 두 경우에 같은 동작(목록 재조회)을 한다.
- **완료된 계정의 관심사 변경은 `interest-management` 소관이다.** 온보딩 엔드포인트가 이를 받아주면 완료 이후에도 `onboarding_step`이 움직이는 경로가 생긴다.

---

### 4.4 `PATCH /onboarding/career`

2단계 [다음]·[건너뛰기] 모두 이 엔드포인트를 호출하고, `onboarding_step`을 `pick`으로 전진시킨다.

**Request** — [건너뛰기]는 `{}`

```json
{
  "job_category": "developer",
  "job_title": "백엔드 엔지니어",
  "years_of_experience": "2-3"
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `job_category` | string | 선택 | 길이 상한 50자 |
| `job_title` | string | 선택 | 길이 상한 100자 |
| `years_of_experience` | enum `0-1` / `2-3` / `4-6` / `7+` | 선택 | 구간값이다. 정수 연차를 받지 않는다 |

**Response 200**

```json
{
  "career": { "job_category": "developer", "job_title": "백엔드 엔지니어", "years_of_experience": "2-3" },
  "onboarding_step": "pick"
}
```

- **[건너뛰기]도 같은 엔드포인트를 호출한다.** 전용 엔드포인트를 두면 "값 없이 단계만 전진"이라는 동일한 처리가 두 벌이 되고, `onboarding.md` 4가 요구하는 "미입력이어도 편성은 정상 동작"을 두 경로에서 각각 보장해야 한다.
- **본문에 없는 필드는 변경하지 않고, `null`을 보낸 필드는 비운다.** PATCH의 기본 의미를 그대로 쓴다(`convention.md` 5.1).
- **커리어 값은 편성의 보조 신호일 뿐이다**(`drip-scheduling.md` 4.2 — 커리어 적합도 소폭 가점). 저장 실패가 편성 가능 여부를 바꾸지 않으므로, 이 요청 실패로 온보딩을 막지 않는다.
- **온보딩 이후의 커리어 입력·수정은 `profile.md` 4.4가 담당한다.** 온보딩에서 못 받은 값을 다시 요구하는 별도 엔드포인트는 만들지 않는다(`onboarding.md` 4 [2]).
- `years_of_experience`는 **구간 enum으로 주고받고, 서버가 `users.years_of_experience`(int)에 구간 하한값(`0` / `2` / `4` / `7`)으로 환산해 저장한다.** 환산이 1:1이라 되돌릴 수 있다. 컬럼 타입과 화면 입력 방식이 어긋나 있는 문제는 9장에 남긴다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 길이 상한 초과 · `years_of_experience` enum 위반 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | 완료된 계정의 호출 |

---

### 4.5 `GET /onboarding/recommendations`

3단계에 노출할 **9건을 두 섹션으로 나눠** 반환한다(`onboarding.md` 4 [3]).

**Response 200 — 정상(월간 인기)**

```json
{
  "sections": [
    {
      "section_type": "interest",
      "title": "관심 주제 추천",
      "items": [
        {
          "content_id": "uuid",
          "title": "협상의 기술",
          "author_name": "김OO",
          "source_name": "OO미디어",
          "thumbnail_url": "https://...",
          "duration_sec": 612,
          "topics": [{ "topic_id": "uuid-a", "name": "커리어" }]
        }
      ]
    },
    {
      "section_type": "monthly_popular",
      "title": "이번 달 인기",
      "items": []
    }
  ]
}
```

**Response 200 — 월간 표본 부족(랜덤 폴백)**

```json
{
  "sections": [
    { "section_type": "interest", "title": "관심 주제 추천", "items": [] },
    { "section_type": "topic_discovery", "title": "이런 주제는 어때요?", "items": [] }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `section_type` | `interest` (관심 주제 6건) · `monthly_popular` (월간 인기 3건) · `topic_discovery` (표본 부족 시 랜덤 3건) |
| `title` | 화면에 그대로 노출할 섹션 제목 |
| `items[].topics` | 콘텐츠의 주제. 클라이언트가 주제 배지를 그리는 데 쓴다 |

**구성 규칙**

| 섹션 | 건수 | 선정 기준 |
|---|---|---|
| `interest` | 6건 | 1단계에서 고른 주제(최대 3개)의 콘텐츠. 콜드스타트 규칙(FR-17) — 인기·신규 우선, 선택 주제에 고르게 배분 |
| `monthly_popular` | 3건 | **직전 확정 월**의 `content_stats`(`period_type = month`, `is_final = true`) 상위. **관심 주제 밖**에서만 뽑는다 |
| `topic_discovery` | 3건 | 직전 확정 월 재생 합계가 **기준값(30건) 미만**일 때, 같은 후보 필터로 랜덤 3건 |

- **두 번째 섹션의 모드를 `section_type`으로 알린다.** 표본 부족일 때는 제목이 "이번 달 인기"에서 바뀌는데, 클라이언트가 `title` 문자열로 모드를 판정하면 **문구를 조정하는 순간 분기가 깨진다**(문구는 아직 잠정안이다 — `onboarding.md` 미결 사항).
- **표본 부족 여부를 별도 불리언으로 내려주지 않는다.** 사용자에게 알리지 않기로 한 정보이고(`onboarding.md` 5), 클라이언트가 필요로 하는 분기는 `section_type`으로 이미 충분하다.
- **`title`을 서버가 내려주는 이유**: 랜덤 폴백 섹션의 문구가 미확정이라 확정 후 앱 배포 없이 교체할 수 있어야 한다.
- **랜덤 3건도 후보 필터를 그대로 지킨다** — 발행 상태 · 라이선스 유효 · 미회수 · **관심 주제 밖** · 앞 6건과 중복 아님. 랜덤은 "순위를 정할 근거가 없다"는 뜻이지 "아무거나 내보낸다"는 뜻이 아니다(`onboarding.md` 4 [3]).
- **재진입해도 같은 9건을 반환한다.** 뒤로 갔다 돌아왔을 때 카드가 통째로 바뀌면 방금 보던 콘텐츠를 다시 찾을 수 없다. 서버는 `user_id`에서 파생한 **결정적 시드**로 뽑기 순서를 고정한다 — 스냅샷을 저장할 자리가 아직 없기 때문이며, 이 방식의 한계는 9장에 남긴다.
- **건수가 모자라면 총 9건을 우선한다.** 관심 주제 재고가 부족하면 인기 섹션에서 끌어오고, 인기·랜덤 후보가 3건이 안 되면 그 섹션만 줄인다. **빈 카드를 만들지 않는다**(`onboarding.md` 7).
- **items가 0건인 섹션은 응답에서 제외한다.** 껍데기만 있는 섹션을 내려주면 클라이언트가 제목만 그리고 빈 영역을 남긴다.
- **오디오 서명 URL과 대본을 담지 않는다.** 3단계는 담기 화면이지 재생 화면이 아니다. 재생하지 않을 9건에 서명 URL을 발급하면 유출 창구만 9개 늘어난다(`architecture.md` 9.4).
- **총 0건 응답은 정상 상태가 아니다.** 콘텐츠 풀이 없는 주제는 애초에 선택지에 없기 때문이다(`onboarding.md` 3). 그럼에도 0건이면 **200으로 빈 `sections`를 반환하고 서버가 운영 알림을 발생시킨다.**
  - **에러로 만들지 않는 이유**: `onboarding.md` 7이 "사용자 화면에 추천 0건 상태를 두지 않는다"고 확정했다. 5xx로 내리면 클라이언트는 에러 화면을 그릴 수밖에 없다. 클라이언트는 0건을 받으면 3단계를 건너뛰고 **0건 담기 경로**(4.7)로 진행한다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `ONBOARDING_INTERESTS_NOT_SET` | 409 | 1단계를 마치지 않은 계정의 호출. 클라이언트는 1단계로 되돌린다 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | 완료된 계정의 호출 |

---

### 4.6 `POST /onboarding/picks`

**Request** — `Idempotency-Key` 필수

```json
{ "content_ids": ["uuid-1", "uuid-2", "uuid-3"] }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `content_ids` | string[] | 필수 | 1건 이상, **최대 9건**(추천 건수와 같다). 중복 값은 하나로 취급한다 |

**Response 200**

```json
{
  "saved_content_ids": ["uuid-1", "uuid-2"],
  "failed": [
    { "content_id": "uuid-3", "error_code": "CONTENT_WITHDRAWN" }
  ],
  "picked_count": 2
}
```

- **부분 실패를 200으로 표현한다.** `onboarding.md` 7이 "성공한 건만 적립하고 실패 건은 토스트로 알린 뒤 진행을 막지 않는다"로 확정했다. 전체를 실패시키면 **회수된 콘텐츠 한 건 때문에 온보딩 마지막 단계에서 이탈**한다.
  - 따라서 **201이 아니라 200이다.** 생성된 리소스 하나를 가리키는 응답이 아니라 건별 결과 요약이다.
- **`Idempotency-Key`가 필수인 이유**: [담기] 연타와 자동 재시도가 같은 요청을 두 번 보낼 수 있다. 같은 키의 재요청은 **저장된 첫 응답을 그대로 반환**한다(`architecture.md` 8.4).
  - 서버 측 최종 방어선은 `uq_library_items_user_id_content_id`다. **유니크 위반은 예외로 만들지 않고 "이미 담김"으로 흡수해 `saved_content_ids`에 포함시킨다**(`architecture.md` 8.4) — 재시도한 사용자에게 실패로 보이면 안 된다.
- `source = onboarding`, `status = unplayed`로 적립한다(`domain.md` 6.1).
- **`drip_excluded_contents`에 행을 추가하지 않는다.** 드립 후보 필터의 첫 줄(`library_items`에 행이 존재)이 이미 이 콘텐츠들을 덮으며(`domain.md` 7.1), 담기에 대응하는 `reason` 값이 없다. 9장 참조.
- **여기서의 담기는 재생이 아니므로 무료 티어 재생 카운트와 무관하다**(`onboarding.md` 4 [3]).
- **추천 목록에 없던 `content_id`도 거부하지 않는다.** 추천 스냅샷을 저장하지 않아 소속을 검증할 수 없고, 담기 자체는 탐색에서도 허용되는 동작이라 온보딩에서만 막을 실익이 없다. 발행 상태 검증은 그대로 수행한다.

**건별 실패 코드** — `failed[].error_code`

| 코드 | 상황 |
|---|---|
| `CONTENT_NOT_FOUND` | 존재하지 않는 `content_id` |
| `CONTENT_WITHDRAWN` | 회수·만료된 콘텐츠(`status != published`) |

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `content_ids`가 비었거나 9건 초과 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | 완료된 계정의 호출 |

- **배열 길이 상한을 두는 이유**: 담기는 화면에 노출된 9건 안에서만 일어난다. 상한이 없으면 한 요청으로 카탈로그 전체를 적립시킬 수 있다(`architecture.md` 9.3).

---

### 4.7 `POST /onboarding/complete`

`onboarding_completed = true` 처리와 **첫 드립 편성 트리거**를 수행한다(`drip-scheduling.md` 2·4.6).

**Request** — `Idempotency-Key` 필수. 본문 없음(`{}`).

**Response 200**

```json
{
  "onboarding_completed": true,
  "onboarding_step": "done",
  "onboarding_completed_at": "2026-08-04T09:12:00Z",
  "picked_count": 0,
  "awaits_first_drip": true,
  "first_drip": {
    "status": "pending",
    "poll_interval_sec": 1,
    "max_wait_sec": 15
  }
}
```

| 필드 | 의미 |
|---|---|
| `picked_count` | 3단계에서 적립된 건수. **서버가 `library_items`에서 센 값이다** |
| `awaits_first_drip` | `true`면 클라이언트는 완료 화면 대신 로딩 화면을 띄우고 4.8을 폴링한다 |
| `first_drip.status` | 4.8과 같은 enum. 완료 시점에 이미 끝났으면 `completed`가 담길 수 있다 |
| `first_drip.poll_interval_sec` | 폴링 간격(초) |
| `first_drip.max_wait_sec` | 대기 상한(초). 초과하면 클라이언트는 폴링을 멈추고 완료 화면으로 진행한다 |

**대기 여부 판정**

| `picked_count` | `awaits_first_drip` | 클라이언트 동작 |
|---|---|---|
| 1건 이상 | `false` | 곧바로 완료 화면. 편성 결과를 기다리지 않는다 |
| 0건 | `true` | 로딩 화면 유지 → 4.8 폴링 → 종료 상태에서 완료 화면 |

- **대기 여부를 클라이언트가 알려주지 않고 서버가 판정한다.** 클라이언트가 "나는 0건"이라고 보고하는 구조면, 값을 위조해 대기를 건너뛰거나(빈 라이브러리로 진입) 담은 사용자를 불필요하게 대기시킬 수 있다. 판정 근거는 `library_items(source = onboarding)`이므로 서버에 이미 있다.
- **1건 이상 담은 경로에서 기다리게 하지 않는 이유**: 라이브러리가 이미 비어 있지 않다. 기다리게 하는 것은 이탈 지점만 늘린다(`onboarding.md` 4 [완료]).
- **담은 수와 무관하게 첫 드립은 실행한다.** 중복 적립 방지(FR-16)로 3단계에서 담은 콘텐츠는 편성 대상에서 제외된다(`drip-scheduling.md` 4.2).
- **완료 처리를 롤백하지 않는다.** 드립 실패를 이유로 `onboarding_completed`를 되돌리면 사용자가 온보딩을 처음부터 다시 하게 되고, 원인인 편성 장애는 재시도해도 그대로다(`onboarding.md` 4 [완료]).
- **완료 처리 커밋 후에 편성을 시작한다**(`architecture.md` 8.3·8.5 — DB를 먼저 커밋하고 나머지는 재시도 가능한 작업으로 남긴다).
- **같은 `Idempotency-Key`의 재요청은 저장된 첫 응답을 반환하며, 편성을 다시 트리거하지 않는다.** 트리거 재시도는 서버가 소유한다(4.8) — 클라이언트 재시도로 편성이 중복 실행되면 하루 상한을 넘긴 적립이 생긴다.

**설계 메모 — 왜 동기 응답이 아니라 폴링인가**

- **완료 요청 안에서 편성을 기다리면, 편성이 늦어질 때 이미 커밋된 완료가 클라이언트에게 실패로 보인다.** 클라이언트 기본 타임아웃은 10초인데(`common-error-handling.md` 4.1) 대기 상한은 15초라, **동기 응답으로는 상한을 표현할 수조차 없다.** 타임아웃이 나면 클라이언트는 4.2 규칙에 따라 완료를 재시도하지만 온보딩은 이미 끝나 있다.
- **폴링은 실패 단위를 쪼갠다.** 완료(상태 전이)와 대기(진행 확인)가 분리되어 있으면, 대기 쪽이 실패해도 완료는 유지된 채 "기다리기를 그만두고 진행"이라는 규정된 동작으로 넘어갈 수 있다.
- **푸시·SSE·롱폴링을 쓰지 않는 이유**: 대기 구간이 최대 15초이고 대상은 방금 가입한 1명이다. 비동기 큐 인프라 도입 자체가 아직 미결인 상태에서(`architecture.md` 미결 사항) 실시간 채널을 온보딩 한 화면 때문에 들이지 않는다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `ONBOARDING_INTERESTS_NOT_SET` | 409 | 관심 주제 없이 완료 요청. 편성 신호가 없어 완료시키지 않는다 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | 다른 멱등키로 재호출. 클라이언트는 성공과 동일하게 다루고 완료 화면으로 진행한다 |
| `INTERNAL_ERROR` | 500 | 완료 처리 실패. `retryable: true` — 멱등키가 있으므로 4.2 규칙대로 자동 재시도 대상이다 |

- **`ONBOARDING_ALREADY_COMPLETED`를 에러로 내리면서도 클라이언트는 진행시킨다.** 완료는 롤백되지 않으므로 두 번째 요청은 "실패"가 아니라 "이미 이뤄짐"이다. 이 구분이 필요한 쪽은 서버 로그이고, 사용자에게는 아무 일도 일어나면 안 된다.

---

### 4.8 `GET /onboarding/first-drip`

0건 담기 경로에서 **완료 화면을 언제 띄울지** 판정하기 위한 조회다.

**Response 200**

```json
{
  "status": "completed",
  "library_item_count": 2,
  "completed_at": "2026-08-04T09:12:03Z"
}
```

| `status` | 의미 | 클라이언트 동작 |
|---|---|---|
| `pending` | 편성 진행 중 | 로딩 화면 유지, `poll_interval_sec` 후 재조회 |
| `completed` | 적립 완료 | 로딩 화면을 걷고 완료 화면 |
| `no_candidates` | 편성할 후보 자체가 없음 | **즉시** 완료 화면. 더 기다리지 않는다 |
| `queued` | 서버 재시도를 소진해 비동기 큐로 이관됨 | 완료 화면 + 라이브러리 "콘텐츠를 준비하고 있어요" 배너(`library.md` 5) |

- **`no_candidates`를 실패와 구분하는 이유**: 후보 고갈은 실패가 아니라 **결과가 빈 것**이라 다시 호출해도 같은 답이 나온다(`onboarding.md` 7). 실패로 뭉뚱그리면 클라이언트가 15초를 꽉 채워 기다린 뒤에야 진행한다 — 아무것도 달라지지 않을 15초다.
- **`queued`도 종료 상태다.** 서버가 자체 재시도를 끝냈다는 뜻이므로 클라이언트가 더 폴링할 이유가 없다. 대체 편성은 `drip-scheduling.md` 7에 맡긴다.
- **`pending`을 202나 404로 표현하지 않는다.** 진행 중은 정상 상태이고, 클라이언트는 네 갈래로 분기해야 한다. HTTP status로는 이 분기를 만들 수 없다(`architecture.md` 7.1-3).
- **대기 상한(15초)을 넘기면 클라이언트는 `status`와 무관하게 폴링을 멈추고 완료 화면으로 진행한다.** 사용자를 로딩 화면에 가둬 두는 것이 최악이다 — 서버에서는 이미 완료된 계정이라 앱만 앞으로 못 가는 상태가 된다(`onboarding.md` 4 [완료]).
  - 이때 편성은 **서버의 비동기 재시도 큐**가 이어받는다. 클라이언트가 진행했다는 사실이 서버 작업을 취소시키지 않는다.
  - 이 큐는 **DB 작업 테이블 + 스케줄러**로 확정됐다(`architecture.md` 미결 사항 — 비동기 작업 처리). `first_drip_jobs`가 그 작업 테이블이며, 스케줄러가 미처리 행을 `FOR UPDATE SKIP LOCKED`로 선점해 다시 시도한다. **클라이언트 계약은 이 결정과 무관하다** — `queued`는 여전히 "서버가 자체 재시도를 끝냈다"는 종료 상태다.
- **재시도 중이라는 사실을 응답에 담지 않는다.** 화면은 같은 로딩을 유지하며 재시도 여부를 노출하지 않기로 했다(`onboarding.md` 5) — 사용자가 할 수 있는 일이 없는데 실패를 알리면 불안만 만든다.
- **적립은 원자적이라 "일부만 채워진 상태"가 없다**(`drip-scheduling.md` 4.6-4). `completed`면 `library_item_count`는 편성된 전량이다.
- **폴링 요청 실패는 4.2의 자동 재시도 대상이다**(GET, 부작용 없음). 재시도까지 실패해도 대기 상한이 결국 클라이언트를 진행시킨다.
- **서버는 `queued` · `no_candidates`를 만들 때 운영 알림을 발생시킨다.** 신규 사용자의 첫 편성 실패는 편성 배치 장애의 조기 신호라, 사용자에게 조용히 넘기고 끝내면 아무도 모른다(`onboarding.md` 4 [완료]).
- **상태의 저장소는 `first_drip_jobs`다**(`domain.md` 7.4). 완료 처리(4.7)와 같은 트랜잭션에서 행을 만들고, 편성은 커밋 이후에 시작한다. 위 네 `status`가 그대로 이 테이블의 enum이며, `library_item_count`는 `item_count`다. `uq_first_drip_jobs_user_id`(사용자당 1행)가 완료 요청 재시도로 인한 중복 편성 트리거의 최종 방어선이다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `ONBOARDING_NOT_COMPLETED` | 409 | 완료 요청 전에 호출. 대기는 완료 이후에만 존재한다 |

---

### 4.9 `PUT /users/me/devices/:device_id`

알림 권한 응답과 푸시 토큰을 서버에 반영한다(`notification.md` 4.1).

**Request**

```json
{
  "push_token": "<FCM/APNs 토큰>",
  "platform": "ios",
  "is_os_permission_granted": true,
  "app_version": "1.0.0"
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `push_token` | string | 조건부 | 권한이 거부되면 `null`. 발급받지 못한 토큰을 만들어 보내지 않는다 |
| `platform` | enum `ios` / `android` | 필수 | |
| `is_os_permission_granted` | boolean | 필수 | **device 단위 값이다**(`domain.md` 3.6) |
| `app_version` | string | 필수 | |

**Response 204**

- **거부했을 때도 호출한다.** 호출하지 않으면 서버는 "거부"와 "아직 안 물어봄"을 구분할 수 없어, 발송 대상 판정과 재노출 판단의 근거가 사라진다.
- **PUT인 이유**: `device_id`는 클라이언트가 이미 아는 값이고 `uq_device_tokens_user_id_device_id`가 1행을 보장한다. 같은 값을 몇 번 보내도 결과가 같으므로 멱등키가 필요 없다.
- **권한 상태는 `user_settings`가 아니라 `device_tokens`에 저장한다.** 사용자 단위가 아니라 기기 단위 값이다(`domain.md` 3.5·3.6).
- **재고 팝업의 노출 이력은 서버에 저장하지 않는다.** "온보딩 전체에서 1회"는 온보딩 세션 안에서만 의미가 있고(`onboarding.md` 4 [알림]), 서버에 두면 이 화면 하나 때문에 계정 단위 상태가 하나 늘어난다. 클라이언트 로컬에서 관리한다.
- **알림 허용·거부는 온보딩 진행을 가르지 않는다.** 결과와 무관하게 라이브러리로 진입한다.

---

## 5. 에러 코드 표

**추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 `common-error-handling.md` 6장 표를 함께 갱신한다.** 이미 배포된 코드의 의미를 바꾸지 않는다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `ONBOARDING_INTEREST_REQUIRED` | 400 | false | [다음] 비활성 유지 + "관심 주제를 1개 이상 선택해주세요" |
| `ONBOARDING_INTEREST_LIMIT_EXCEEDED` | 400 | false | 토스트 "관심 주제는 3개까지 선택할 수 있어요" + 선택 상태 재동기화 |
| `ONBOARDING_TOPIC_UNAVAILABLE` | 400 | false | 주제 목록 재조회 후 선택 초기화 |
| `ONBOARDING_INTERESTS_NOT_SET` | 409 | false | 1단계로 되돌림 |
| `ONBOARDING_NOT_COMPLETED` | 409 | false | 폴링 중단. 완료 요청부터 다시 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | false | 온보딩 스택 제거 후 라이브러리로 진입 |
| `VALIDATION_FAILED` | 400 | false | 인라인 오류. 재시도를 권하지 않는다(`common-error-handling.md` 4.1) |
| `CONTENT_NOT_FOUND` | — | false | **건별 결과**(4.6 `failed[]`). 해당 카드를 목록에서 제거 |
| `CONTENT_WITHDRAWN` | — | false | **건별 결과**(4.6 `failed[]`). 토스트 "제공이 종료된 콘텐츠예요" |
| `INTERNAL_ERROR` | 500 | **true** | 4.2 규칙대로 자동 재시도 → 소진 시 전체 화면 에러 + [다시 시도] |

- **`CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`은 공용 코드이며 온보딩이 새로 만든 코드가 아니다**(`common-error-handling.md` 4.1). 4.6에서는 HTTP status가 아니라 `failed[]` 항목으로 전달된다 — 요청 전체가 실패한 것이 아니기 때문이다.
- **`ONBOARDING_*` 코드는 전부 `retryable: false`다.** 전부 입력·상태 문제라 같은 요청을 다시 보내도 결과가 같다. 자동 재시도가 붙는 것은 5xx·타임아웃뿐이다.

## 6. 흐름

**정상 진행 — 1건 이상 담기**

```
(재진입 시) GET  /onboarding/state              → onboarding_step으로 화면 결정
GET  /onboarding/topics                         → is_visible = true, display_order 순
PUT  /onboarding/interests                      → step = career
PATCH /onboarding/career        ([건너뛰기]는 {}) → step = pick
GET  /onboarding/recommendations                → interest 6 + monthly_popular 3
POST /onboarding/picks                          → saved_content_ids
POST /onboarding/complete                       → awaits_first_drip: false
        (완료 화면 → 알림 사전 안내)
PUT  /users/me/devices/:device_id               → 204
        (라이브러리 진입)
```

**0건 담기 — 편성 대기**

```
GET  /onboarding/recommendations
        ([건너뛰기] — picks 호출 없음)
POST /onboarding/complete            → awaits_first_drip: true, poll_interval_sec, max_wait_sec
        (로딩 화면 "첫 콘텐츠를 준비하고 있어요", 뒤로가기 차단)
  ├─ GET /onboarding/first-drip → pending        → poll_interval_sec 후 재조회
  ├─ GET /onboarding/first-drip → completed      → 완료 화면
  ├─ GET /onboarding/first-drip → no_candidates  → 완료 화면(즉시)
  ├─ GET /onboarding/first-drip → queued         → 완료 화면 + 라이브러리 준비 중 배너
  └─ max_wait_sec 초과                            → 완료 화면 + 라이브러리 준비 중 배너
```

- **어느 갈래로 나가든 완료 화면에 도달한다.** 로딩 화면이 종점이 되는 경로는 없다.
- **로딩 중 앱이 종료돼도 완료는 이미 서버에 커밋돼 있다.** 재실행 시 `onboarding_completed = true`로 판정되어 라이브러리로 직행하며(`splash.md` 4), 로딩·완료 화면은 다시 보여주지 않는다. 이 경로에서 알림 사전 안내를 건너뛰게 되는 문제는 9장에 남긴다.

**추천 0건(데이터 정합성 오류)**

```
GET  /onboarding/recommendations   → 200, sections: []   (+ 서버 운영 알림)
        (3단계를 건너뛴다 — 에러 화면을 그리지 않는다)
POST /onboarding/complete          → awaits_first_drip: true   ← 0건 담기 경로와 동일
```

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **모든 온보딩 API는 인증이 필요하다.** 계정은 약관 동의 시점에 이미 생성돼 있다(`auth.md` 4.1).
- **모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다.** 경로에 `userId`를 받지 않는다(IDOR 방지).
- **관심 주제 개수 상한(3개)은 서버가 반드시 재검증한다.** 클라이언트의 칩 비활성화는 우회된다(`onboarding.md` 3·8).
- **`topic_id`는 `is_visible = true`인 주제만 허용한다.** 목록에 없던 주제를 직접 보내 저장하는 경로를 남기지 않는다.
- **배열 필드에 길이 상한을 강제한다** — `content_ids` 9건. 상한 없는 배열은 한 요청으로 대량 쓰기를 만든다(`architecture.md` 9.3).
- **`topic_ids`의 도메인 상한(3건)은 DTO가 아니라 Service가 검증한다.** DTO 검증은 `VALIDATION_FAILED`로 뭉뚱그려지므로 `ONBOARDING_INTEREST_LIMIT_EXCEEDED`와 `ONBOARDING_INTEREST_REQUIRED`를 구분해 내려줄 수 없다(4.3·5장). DTO에는 대량 쓰기를 막는 **안전 상한**만 둔다.
- **추천 응답에 오디오 서명 URL·대본을 담지 않는다.** 재생하지 않는 화면에 발급하지 않는다(`architecture.md` 9.4).
- **완료 상태를 클라이언트가 선언하지 못한다.** `onboarding_completed` · `picked_count` · `awaits_first_drip`은 전부 서버 판정값이며 요청 본문에 대응 필드가 없다.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.
- **첫 드립 상태 폴링은 사용자 단위 레이트 리밋 대상이다.** 간격을 서버가 지정하더라도 클라이언트가 지킨다는 보장은 없다(`architecture.md` 9.6).

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `users` — `onboarding_completed` · `onboarding_step` · **커리어 3필드**(별도 테이블 아님) | 3.1 |
| `user_settings` — 알림 토글. OS 권한은 여기 두지 않는다 | 3.5 |
| `device_tokens` — `is_os_permission_granted`는 여기에만 존재 | 3.6 |
| `topics` — `is_visible` · `display_order` | 4.1 |
| `user_interests` — `source = onboarding` | 4.2 |
| `contents` — 추천·랜덤 폴백의 후보 풀(발행 상태) | 5.1 |
| `content_topics` — 주제 교집합 필터 | 5.2 |
| `content_stats` — 월간 인기 순위와 **표본 충분 여부 판정**(`period_type = month`, `is_final = true`) | 5.4 |
| `library_items` — `source = onboarding`, 0건 경로의 적립 확인 | 6.1 |
| `drip_excluded_contents` — 드립 후보 제외 판정 | 7.1 |

- **커리어는 `users`에 병합돼 있다**(`domain.md` 3.1 C-2). 별도 테이블을 만들지 않으므로 4.4는 `users`의 부분 수정이다.
- **온보딩 담기는 `drip_excluded_contents`에 행을 만들지 않는다.** 후보 필터의 첫 조건(`library_items`에 행이 존재)이 이미 덮으며, `reason` enum에 담기에 대응하는 값이 없다(`domain.md` 7.1). `onboarding.md` 6이 이 테이블을 "온보딩 담기분의 드립 중복 방지"로 적은 것과의 차이는 9장에 남긴다.
- **`library_items`의 `(user_id, content_id)` 유니크가 중복 적립의 최종 방어선이다**(`domain.md` 6.1). 담기·드립이 같은 콘텐츠를 동시에 적립해도 1건만 남는다.
- **`content_stats`는 `playback` 모듈 소유다**(`domain.md` 2장). 추천 조회는 그 모듈이 노출한 Service로 순위와 표본 수만 받아오고 Repository를 직접 주입받지 않는다(`architecture.md` 4.3).
- **편성 실행은 `drip` 모듈 소유다.** 4.7은 완료 처리 후 편성 트리거를 호출할 뿐, 후보 선정·적립 로직을 이 모듈에 복제하지 않는다.

## 9. 미결 사항

- **`years_of_experience`의 타입 불일치.** `domain.md` 3.1은 `int`인데 `onboarding.md` 3은 구간 enum(`0-1` / `2-3` / `4-6` / `7+`)이다. 지금은 구간 하한값으로 환산해 저장하기로 했으나(4.4), **구간 정의가 바뀌면 환산표와 저장된 값이 조용히 어긋난다.** 컬럼을 `varchar` enum으로 바꿀지 결정해야 한다.
- **추천 스냅샷의 고정 방식.** 재진입 시 같은 9건을 보장해야 하는데(`onboarding.md` 4 [3]) 결정적 시드만으로는 **후보 풀이 바뀌면 결과가 흔들린다.** 온보딩 진행 중 새 콘텐츠가 발행되는 빈도를 감안하면 실사용 위험은 낮지만, 엄밀히 고정하려면 스냅샷 저장소가 필요하다.
- **온보딩 담기와 `drip_excluded_contents`.** `onboarding.md` 6은 이 테이블을 온보딩 담기분의 중복 방지 근거로 적었으나 `reason` enum에는 `unsave` / `library_delete` / `played` / `dripped`만 있다(`domain.md` 7.1). 지금은 행을 만들지 않기로 했다 — enum에 값을 추가할지, 문서 기재를 정리할지 정해야 한다.
- **주제 목록이 비었을 때의 기본 세트.** `onboarding.md` 7은 "하드코딩 폴백"이라고 적었으나, 클라이언트가 만든 `topic_id`는 `user_interests`의 FK를 만족하지 못한다. 서버 시드 데이터로 두기로 했고(4.2), **그 세트의 내용과 주입 시점**(마이그레이션 vs 관리자 초기 설정)은 미정이다.
- **기준값 확정** — 전부 서버 설정으로 두고 조정한다. **바꾸더라도 "대기가 끝나면 반드시 완료 화면으로 진행한다"는 규칙은 유지한다**(`onboarding.md` 미결 사항). 현재 서버가 들고 있는 값은 다음과 같다 — **앱 배포 없이 바꿀 수 있고**, 대기 상한·폴링 간격은 4.7 응답으로 클라이언트에 내려간다.

  | 값 | 현재 | 소유 위치 |
  |---|---|---|
  | 월간 표본 문턱 | 재생 30건 | `content.constant.ts` |
  | 첫 드립 대기 상한 | 15초 | `onboarding.constant.ts` (4.7 응답 `max_wait_sec`) |
  | 폴링 간격 | 1초 | `onboarding.constant.ts` (4.7 응답 `poll_interval_sec`) |
  | 담기 상한 | 9건 | `onboarding.constant.ts` |
  | 서버 내부 재시도 | 최대 2회 · 백오프 1초 → 3초(지터 ±20%) | `drip.constant.ts` |
- **랜덤 폴백 섹션의 제목 문구.** "이런 주제는 어때요?"는 잠정안이라 4.5는 `title`을 서버가 내려주게 했다. 확정 시 문구만 교체하면 되고 계약은 바뀌지 않는다.
- **로딩 중 앱을 종료한 사용자의 알림 권한 요청 경로 — P0.** 완료가 이미 처리돼 재실행 시 라이브러리로 직행하므로 사전 안내를 영영 보지 못한다. 라이브러리 첫 진입 시 1회 노출로 이월할지 결정해야 하며(`notification.md` 미결 사항), 정해지면 그 노출 여부를 서버가 판정할지도 함께 정해야 한다.
- **4.9의 소관.** 기기 토큰·권한 동기화는 설정 화면과 포그라운드 복귀에서도 호출되므로 최종 소유는 `notification-api`가 맞다. 그 문서가 생기면 이 절은 참조로 바꾼다.
