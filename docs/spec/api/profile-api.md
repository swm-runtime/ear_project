# 프로필 API 명세서

> 기준 문서: [`docs/pages/profile.md`](../../pages/profile.md)
> 커리어 편집 화면: [`docs/pages/career.md`](../../pages/career.md) (합의 2026-08-06 — 관심사 관리에서 분리)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/pages/common-error-handling.md`](../../pages/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3장 · 4장 · 5장 · 6장 · 8장

## 1. 범위

`profile.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 둘이다.

- 프로필 요약 조회 — 헤더(닉네임·제공자) + **4개 카드(현재 플랜 · 이메일 · 관심 주제 관리 · 커리어 정보)** + **청취 통계 3영역(요약 3지표 · 이번 주 주간 그래프 · 주제 분포)** 을 **한 번의 요청**으로 받는다(합의 2026-08-06 — 4카드 구성·청취 통계 도입, `profile.md` 4.1·4.5~4.7)
- **이전 주차 주간 그래프 조회** — [◀ 이전 주] 화살표 시점에 주 단위로 추가 조회한다(`profile.md` 4.6)
- 카드·통계 영역별 **부분 실패**의 표현

**프로필에서 직접 서버에 쓰는 값은 하나도 없다**(`profile.md` 1장). 따라서 이 문서에 변경(POST/PUT/PATCH/DELETE) 엔드포인트가 없다. 각 카드의 편집은 소유 화면의 API가 담당한다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 이메일 등록·인증·변경 | `auth-api.md` 4.8~4.11 | 현재 값(`email` · `is_email_verified`) **표시용 조회만** |
| 관심 주제 편집 | `interest-management.md` (API 명세 미작성) | 주제 요약 표시용 조회만. 저장 규칙(최소 1개·최대 3개, 확인 팝업)에 관여하지 않는다 |
| 커리어 편집 | `career.md` (API 명세 미작성 — spec 산출물 미작성) | 커리어 요약(직군·직무·연차) **표시용 조회만.** 저장은 커리어 정보 화면이 한다 |
| 구독 변경·해지·복원·영수증 검증 | `subscription.md` (API 명세 미작성) | 현재 플랜 **표시용 조회만.** 프로필에 해지 버튼이 없다(`profile.md` 4.2) |
| 완청 판정·청취 시간 적재 | `player.md` · `library-api.md` | 통계는 이미 적재된 원천(`play_records` · `library_items`)의 **집계 결과만** 내려준다. 완청 판정 값·`listened_sec` 적재 규칙을 재정의하지 않는다 |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — **인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** |
| 서비스 날짜 | 04:00 KST 경계(`domain.md` 1.2). 연속 청취 일수 판정에 쓰인다 |
| 주 경계 | **월요일 04:00 (Asia/Seoul)** — `content_stats` 주간 집계와 같은 경계(`domain.md` 5.4 · `profile.md` 4.6). `week_start`는 그 주 월요일의 `YYYY-MM-DD` 라벨 |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | 조회뿐이므로 **없다** |

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/users/me/profile` | 프로필 요약 — 헤더 + 4개 카드 + 통계(이번 주 포함)를 한 번에 | 필요 | |
| 2 | GET | `/users/me/profile/weekly-listening` | 이전 주차 주간 그래프 — 주 단위 조회 | 필요 | |

**설계 메모**

- **카드별로 API를 나누지 않는다**(`profile.md` 3장). 항목마다 따로 호출하면 카드가 제각각 늦게 채워져 화면이 계속 흔들리고, 값의 조회 시점이 어긋난다. **통계도 같은 요청에 포함한다** — 요약 3지표·**이번 주** 그래프·주제 분포까지. **이전 주차 그래프만** 별도 엔드포인트(2)다: 화살표를 눌렀을 때만 필요한 데이터로 첫 진입 응답을 무겁게 만들 이유가 없다.
- **통계는 전부 서버가 계산한 파생값이다**(`profile.md` 1장·4.5~4.7). 연속 일수(04시 경계)·주 경계(월 04:00) 판정이 필요해 기기에서 계산하면 공통 원칙(클라이언트 판정 금지)에 어긋난다. 원천 컬럼·집계 테이블을 만들지 않으며(`domain.md` 1.5), 집계 캐시(구체화 뷰) 신설 여부는 `domain.md` 15.1 #9(실측 후 백엔드 판단)다 — **캐시 여부와 무관하게 이 계약은 동일하다.**
- **캐시를 두지 않는다.** 편집 화면에서 저장하고 돌아올 때마다 재조회한다(`profile.md` 4.4). 이전 주차 그래프만 예외로, 한 번 받은 주는 화면을 벗어나기 전까지 클라이언트가 다시 조회하지 않는다(`profile.md` 4.6).
- **`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다.** 티어의 진실의 원천은 `subscriptions`다(`domain.md` 8.2). 조회 시점에 두 값이 어긋나 있으면 `subscriptions` 기준으로 응답하고, 캐시 갱신은 `SubscriptionService`가 수행한다(`domain.md` 3.1 — 갱신 경로 한 곳).

---

## 4. 엔드포인트 상세

### 4.1 `GET /users/me/profile`

프로필 탭 진입·편집 후 복귀·당겨서 새로고침이 모두 이 하나를 호출한다.

**Request** — 파라미터 없음

**Response 200**

```json
{
  "user": {
    "nickname": "수현",
    "provider": "kakao",
    "email": "user@example.com",
    "is_email_verified": false
  },
  "plan": {
    "status": "subscribed",
    "tier": "pro",
    "plan_name": "프로",
    "daily_play_limit": null,
    "renews_at": "2026-09-01T00:00:00Z",
    "expires_at": null,
    "has_payment_issue": false
  },
  "interest_summary": {
    "count": 3,
    "top_topics": [
      { "id": "uuid", "name": "커리어" },
      { "id": "uuid", "name": "자기계발" },
      { "id": "uuid", "name": "경제" }
    ]
  },
  "career": {
    "job_category": "기획",
    "job_title": "서비스 기획",
    "years_of_experience": "4-6"
  },
  "stats_summary": {
    "completed_content_count": 12,
    "total_listened_sec": 45120,
    "streak_days": 5
  },
  "weekly_listening": {
    "week_start": "2026-08-03",
    "daily_listened_sec": [1220, 0, 845, 0, 0, 0, 0],
    "previous_week_start": "2026-07-27",
    "next_week_start": null
  },
  "topic_distribution": {
    "topics": [
      { "topic_id": "uuid", "name": "커리어", "ratio": 41 },
      { "topic_id": "uuid", "name": "자기계발", "ratio": 27 },
      { "topic_id": "uuid", "name": "경제", "ratio": 26 }
    ],
    "others_ratio": 6
  },
  "failed_sections": []
}
```

**`user` — 표시 전용**

- `nickname` · `provider`는 헤더에 그대로 그린다. **편집 진입점이 없다** — 닉네임 편집·제공자 변경은 MVP 비범위다(`profile.md` 미결).
- `email`이 `null`이면 "등록되지 않음" 상태다. `email`이 있고 `is_email_verified = false`면 **"인증되지 않음" 배지** 상태다(`profile.md` 4.3). **두 값을 항상 함께 내려준다** — 한쪽만으로는 세 상태를 구분할 수 없다.

**`plan` — 화면 분기용으로 정규화한 값**

| `status` | 판정(서버) | 화면(`profile.md` 4.2) |
|---|---|---|
| `free` | 유효한 `subscriptions` 행 없음(행 자체가 없거나 `expired` · `refunded`뿐) | "무료 이용 중 · 하루 N편" + [구독 알아보기] |
| `subscribed` | `status = 'active'` 이고 `is_auto_renew = true` | 플랜명 + "다음 결제일 N월 N일"(`renews_at`) |
| `cancel_scheduled` | 해지 예약 — `is_auto_renew = false`이고 만료 전 | 플랜명 + "N월 N일까지 이용 가능"(`expires_at`) |
| `grace` | `status = 'grace'`(결제 실패 유예) | 플랜명 + "결제에 문제가 있어요" 경고 → `has_payment_issue = true` |

- **`subscriptions`의 raw `status` enum을 그대로 내려주지 않는다.** 화면이 필요한 것은 위 4분기뿐이고, raw 값을 내려주면 해지 예약 판정(`is_auto_renew` 조합)이 클라이언트마다 재작성된다 — 판정은 서버가 한다.
- `renews_at`과 `expires_at`은 **같은 `subscriptions.expires_at`에서 온 값이지만 의미가 달라 필드를 나눈다.** 자동 갱신이면 그 시각이 다음 결제일이고, 해지 예약이면 이용 종료일이다. 한 필드로 내려주면 화면이 `status`를 보고 라벨을 갈아 끼워야 한다.
- `status = free`일 때 `tier = "light"` · `plan_name` · `daily_play_limit`(무료 한도)을 채워 내려준다. **"하루 N편"의 N은 `plans.daily_play_limit` 서버 값이다 — 2를 하드코딩하지 않는다**(`profile.md` 4.2 · `paywall.md` 5장과 같은 규칙).
- `daily_play_limit`는 무료 카드의 문구 조립용이다. `null`은 무제한 티어(문구에 한도를 적지 않는다).

**`interest_summary`**

- `count`는 `user_interests`의 `is_active = true` 개수다. **관리자가 숨긴 주제(`topics.is_visible = false`)도 개수에 포함한다** — 편집 화면과 같은 기준을 써야 개수가 어긋나지 않는다(`profile.md` 7장 · `interest-management.md` 7장).
- **`count`는 항상 1 이상이다.** 편집 화면이 최소 1개 선택을 강제하므로(합의 2026-08-06 — `interest-management.md` 4.2) 관심 주제 0개인 요약 상태는 생기지 않는다(`profile.md` 4.4).
- `top_topics`는 **최대 3개 — 별도 선정 기준 없이 서버 응답 순서의 앞 3개다**(확정 2026-08-06, `profile.md` 4.4). 관심사 관리 목록과 같은 정렬(현행 `topics.display_order`)을 그대로 쓰며, "대표"를 위한 추가 규칙을 두지 않는다.
- 나머지는 화면이 `+N`으로 접는다(`N = count - top_topics.length`). 상한이 3개이므로 **`+N`은 상한 도입 이전 초과 보유자에게만 나타난다**(`interest-management.md` 7장).

**`career` — 커리어 카드 요약** (합의 2026-08-06 — 카드 복원)

- 원천은 `users`의 커리어 3필드다(`domain.md` 3.1 — `UserCareer` 테이블 없음). 세 값 모두 선택 입력이라 **미입력이면 `null`이다.** 세 값 전부 `null`이면 카드가 "입력하면 추천이 정확해져요" + [입력하기] 상태다(`profile.md` 4.4·5장).
- `years_of_experience`는 온보딩·커리어 화면과 같은 **구간 enum 라벨**(`"0-1" | "2-3" | "4-6" | "7+"`)이다(`career.md` 3장). DB 저장 타입(int)과의 매핑은 `domain.md` 15.1 #4 미결이며, **이 계약은 라벨을 확정값으로 쓴다**(9장).
- 카드 탭의 목적지는 **커리어 정보 화면(`career.md`)이다 — 관심사 관리 화면이 아니다**(`profile.md` 4.4). 요약만 내려주고 편집 규칙에 관여하지 않는다.

**`stats_summary` — 누적 3지표** (`profile.md` 4.5)

| 필드 | 정의 | 원천 |
|---|---|---|
| `completed_content_count` | **완청한 고유 콘텐츠 수.** 같은 콘텐츠를 여러 번 완청해도 1편. 완청 판정 값은 `player.md` 소유 | `library_items.status = completed` 고유 `content_id` COUNT — `deleted_at` 무관(`domain.md` 6.1) |
| `total_listened_sec` | 누적 청취 시간(초). 배속·반복과 무관한 **실제 들은 시간** | `play_records.listened_sec` 총합(`domain.md` 6.3) |
| `streak_days` | 연속 청취 일수. 서비스 날짜(04시 경계) 기준, 그날 `play_records` 1건 이상이면 "들은 날"(최소 청취 시간 조건 없음 — 확정 2026-08-06) | `play_records.play_date` 연속 구간 |

- **`streak_days`는 오늘 아직 듣지 않았어도 어제까지 이어진 값을 그대로 내려준다**(`profile.md` 4.5). 오늘 들으면 +1, 어제도 오늘도 안 들었으면 0 — 이 판정을 클라이언트가 기기 시각으로 다시 하지 않는다.
- 단위 변환·반올림 등 표기 형식은 `spec/uiux/profile-uiux.md`가 정한다. 서버는 초 단위 정수까지만 책임진다.
- 청취 기록이 없는 신규 사용자는 세 값 모두 `0`이다 — **정상 응답이며 섹션 실패가 아니다**(`failed_sections`에 담지 않는다).

**`weekly_listening` — 이번 주 주간 그래프** (`profile.md` 4.6)

- `daily_listened_sec`는 **월~일 7개 고정 배열**이다(각 요일의 `listened_sec` 합, 초 단위). 진행 중인 주라 아직 오지 않은 요일은 `0`이다. 기록 없는 요일도 `0`으로 자리를 유지한다 — 값 생략이 없다.
- `week_start`는 이번 주 월요일 라벨이다. 주 경계는 **월요일 04:00** — 클라이언트가 기기 시각으로 주를 나누지 않는다(2장).
- `previous_week_start`: 이전 주의 `week_start`. **`null`이면 이전 주가 없다(가입 주)** → [◀] 비활성. 값이 있으면 **그대로 4.2의 요청 파라미터로 쓴다** — 클라이언트가 날짜 연산을 하지 않는다.
- `next_week_start`: `null`이면 이번 주 → [다음 주 ▶] 비활성. **이 응답에서는 항상 `null`이다**(기본 표시가 이번 주이므로).
- 한 주 전체가 0이면 빈 상태 문구는 클라이언트 표시 규칙이다 — 서버는 0 배열을 내려줄 뿐 "빈 주"를 따로 표현하지 않는다.

**`topic_distribution` — 주제 분포** (`profile.md` 4.7)

- **집계 기간은 가입 후 전체이며, 비율만 내려준다 — 절대값(시간)을 싣지 않는다**(합의 2026-08-06).
- `topics`는 **상위 5개**(청취 시간 비율 내림차순), `others_ratio`는 6위 이하를 묶은 비율이다. 상위가 5개 미만이면 있는 만큼만 내려주고 `others_ratio = 0`이다.
- 집계 규칙(서버): 원천은 `play_records.listened_sec` × `content_topics`. 여러 주제에 속한 콘텐츠는 **각 주제에 청취 시간을 그대로 더한 뒤** 전체 합 대비 정규화한다(분할 배분하지 않는다 — `profile.md` 4.7). **합이 정확히 100이 되도록 반올림 조정까지 서버가 한다** — 클라이언트는 재정규화하지 않고 그대로 그린다. 소수 자릿수 등 표기는 uiux 문서가 정한다.
- "기타" 라벨 문자열은 내려주지 않는다 — `others_ratio > 0`일 때 클라이언트가 카피를 그린다(카피는 uiux 소유).
- 숨겨진 주제(`topics.is_visible = false`)도 청취 기록이 있으면 집계에 포함한다(`profile.md` 4.7 — 관심 주제 요약과 같은 기준).
- 청취 기록이 없으면 `topics: []` · `others_ratio: 0` → 클라이언트는 빈 상태 문구를 그린다.

**`failed_sections` — 부분 실패의 표현**

```json
{
  "user": { "...": "정상" },
  "plan": null,
  "interest_summary": { "...": "정상" },
  "career": { "...": "정상" },
  "stats_summary": null,
  "weekly_listening": null,
  "topic_distribution": null,
  "failed_sections": ["plan", "stats"]
}
```

- **한 섹션의 조회 실패가 응답 전체를 5xx로 만들지 않는다.** `profile.md` 4.8·7장 — "구독 조회만 실패하면 플랜 카드만 에러로 두고 나머지는 정상 노출한다."
- 대상 키는 **`plan` / `interest_summary` / `stats`** 셋이다. **`stats` 하나가 통계 3영역을 묶는다** — `profile.md` 4.8이 통계를 한 영역으로 실패 처리하므로, 실패 시 `stats_summary` · `weekly_listening` · `topic_distribution` 세 필드가 모두 `null`이고 `failed_sections`에 `"stats"`가 담긴다.
- **`user`·`career`는 대상이 아니다.** 둘 다 같은 `users` 행에서 오므로 함께 성공·실패하고, 자기 계정 행 조회가 실패하는 상황은 사실상 인증 실패다 — 이때는 요청 전체가 실패한다(401·5xx).
- **`null`과 "값이 없음"을 혼동하지 않도록 `failed_sections`가 반드시 함께 온다.** `user.email`이 `null`인 것(정상 — 미등록), `career`의 세 필드가 `null`인 것(정상 — 미입력), 통계가 전부 0인 것(정상 — 기록 없음)과 섹션 조회 실패(필드 `null` + `failed_sections`에 키 존재)는 다른 상태다.
- [다시 시도]는 **전체 재조회**다. 섹션별 부분 조회 파라미터를 두지 않는다 — 실패는 드문 경로이고, 부분 조회를 두면 조회 시점이 섹션마다 갈라진다.

**에러** — 공통 규칙(401·429·5xx — `common-error-handling.md`) 외 고유 에러 없음. 화면 진입 조회이므로 실패 시 각 영역 에러 + 내비게이션 유지가 클라이언트 규칙이다(`profile.md` 4.8 — 화면 자체는 연다).

---

### 4.2 `GET /users/me/profile/weekly-listening`

주간 그래프의 **[◀ 이전 주] 탐색 시점에만** 호출한다(`profile.md` 4.6). 이번 주는 4.1 응답에 이미 있다.

**Request** — 쿼리 파라미터

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| week_start | string (`YYYY-MM-DD`) | 필수 | 조회할 주의 월요일 라벨. **직전 응답의 `previous_week_start`(또는 `next_week_start`)를 그대로 쓴다** — 클라이언트가 계산하지 않는다 |

**Response 200**

```json
{
  "week_start": "2026-07-27",
  "daily_listened_sec": [0, 3600, 0, 1800, 0, 0, 900],
  "previous_week_start": "2026-07-20",
  "next_week_start": "2026-08-03"
}
```

- 4.1의 `weekly_listening` 오브젝트와 **같은 모양**이다. 두 응답이 다른 행 타입을 쓰면 그래프 렌더가 두 벌이 된다.
- **가입 주면 `previous_week_start = null`** → [◀] 비활성(`profile.md` 4.6 — 가입 주까지 거슬러 갈 수 있다). "가입 주" 판정은 서버가 한다 — 클라이언트는 `null` 여부만 본다.
- `next_week_start`는 한 주 뒤의 라벨이다(이번 주를 벗어나지 않는다). 이번 주 라벨을 이 엔드포인트로 다시 조회하는 것도 허용한다 — 다만 첫 진입 표시는 4.1이 담당한다.
- 한 번 받은 주는 화면을 벗어나기 전까지 재조회하지 않는다(클라이언트 캐시 — `profile.md` 4.6).

**설계 메모**

- **주 단위 개별 조회로 둔다.** 범위 조회(여러 주 일괄)를 두지 않는다 — 화살표 탐색은 한 번에 한 주씩이고, 오래된 주까지 미리 받으면 첫 탐색이 무거워진다.
- **`week_start`를 "몇 주 전" offset이 아니라 라벨로 받는다.** offset이면 "지금으로부터 N주 전"의 경계 계산(월 04:00)이 서버·클라이언트 양쪽에 생긴다. 라벨 방식은 응답의 `previous_week_start`를 그대로 되돌려 보내는 것으로 끝나 **클라이언트 날짜 연산이 0이 된다.**

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `week_start` 누락 · 형식 오류 · 월요일 라벨이 아님 |
| `STATS_WEEK_OUT_OF_RANGE` | 400 | 가입 주 이전 또는 미래 주 |

- 정상 UI에서는 화살표 비활성(`null` 라벨)으로 두 에러에 도달하지 않는다 — 방어적 거절이다. 클라이언트는 사용자에게 노출하지 않고 현재 표시 주를 유지한다.

---

## 5. 에러 코드 표

**추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 `common-error-handling.md` 6장 표를 함께 갱신한다.**

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | false | 요청을 수정해야 한다. 사용자에게는 일반 오류로 표시 |
| `STATS_WEEK_OUT_OF_RANGE` | 400 | false | 사용자에게 노출하지 않고 현재 표시 주 유지. 화살표 활성 상태를 직전 정상 응답 기준으로 되돌린다 |

- 401(세션 만료 → 갱신 후 재시도, 실패 시 시작 화면)·429·5xx는 `common-error-handling.md` 4.1~4.2를 따른다.

## 6. 흐름

```
프로필 탭 진입 ──> GET /users/me/profile ──> 헤더 + 4개 카드 + 통계 3영역 렌더
   ├─ [⚙ 설정]            → 설정 화면 (settings-api.md)
   ├─ 플랜 카드            → 구독 관리 (subscription.md)
   ├─ 이메일 카드          → 이메일 인증 화면 (auth-api.md 4.8~4.11)
   ├─ 관심 주제 관리 카드   → 관심사 관리 (interest-management.md)
   ├─ 커리어 정보 카드      → 커리어 정보 화면 (career.md)
   └─ 주간 그래프 [◀ 이전 주] → GET /users/me/profile/weekly-listening?week_start=<previous_week_start>
        └─ [다음 주 ▶] → 받아둔 주 데이터 재사용 (재조회 없음), 이번 주는 4.1 값

편집 화면에서 저장 후 복귀 ──> GET /users/me/profile 재조회 (전체 스켈레톤 없이 카드만 갱신)
편집 화면에서 [취소]로 복귀 ──> 재조회하지 않는다 (profile.md 7장)
```

- **이메일 인증에 성공하면 프로필로 복귀하며 재조회한다.** 검증 성공 전에는 서버 값이 바뀌지 않으므로(`auth.md` 4.4) 인증 중 이탈 시에는 재조회해도 기존 값이 그대로다.
- **다른 기기에서 구독을 바꾼 경우**도 진입 시 재조회로 흡수된다. 이 API는 항상 `subscriptions` 기준으로 조립하므로(3장 설계 메모) 별도 동기화 호출이 필요 없다.
- 04시·주 경계 부근 진입 시에도 서버가 내려준 값을 그대로 쓴다. 기기 시각과 어긋나 보여도 클라이언트가 보정하지 않는다(`profile.md` 7장).

## 7. 보안·검증 규칙

- **토큰의 `user_id`로만 조회한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR 방지 — `architecture.md` 9.2). 통계 집계도 요청자의 행만 스코프한다.
- **이메일 주소를 마스킹하지 않고 내려준다.** 본인 인증된 세션의 자기 정보이며, 마스킹하면 사용자가 어떤 주소가 등록돼 있는지 확인할 수 없어 변경 판단을 못 한다.
- 응답에 `provider_user_id` · 결제 영수증 · 토큰 등 내부 식별자를 담지 않는다. **통계도 집계 결과만 내려준다** — 개별 `play_records` 행(어떤 콘텐츠를 언제 들었는지의 원자료)을 나열하지 않는다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `users` — 닉네임·제공자·`email` · `is_email_verified` · `tier`(캐시) · **커리어 3필드** | 3.1 |
| `subscriptions` — 플랜 상태 판정의 진실의 원천 | 8.2 |
| `plans` — 플랜명·`daily_play_limit` | 8.1 |
| `user_interests` — `is_active = true` 요약 | 4.2 |
| `topics` — 주제명·정렬·`is_visible` | 4.1 |
| `library_items` — 완청 고유 콘텐츠 수 원천(`status = completed`, `deleted_at` 무관) | 6.1 |
| `play_records` — 청취 시간·연속 일수·주간 그래프·주제 분포의 원천(`listened_sec` · `play_date`) | 6.3 |
| `content_topics` — 주제 분포 집계 조인 | 5.2 |

- **프로필 전용 테이블·컬럼을 만들지 않는다**(`profile.md` 6장). 통계는 전부 파생값이다(`domain.md` 1.5). 집계 캐시 신설 여부는 `domain.md` 15.1 #9 — 도입돼도 진실의 원천은 `play_records`이고 이 계약은 변하지 않는다.
- `content_stats`는 **콘텐츠 축** 집계라 사용자 통계에 쓰지 않는다(`profile.md` 6장). 재사용하는 것은 주 경계 규칙뿐이다.
- `ProfileSummary`는 응답 DTO다. 저장하지 않는다(`domain.md` 13.2).

## 9. 미결 사항

- **`plan.status` 정규화 enum의 소유** — 이 4분기(`free` / `subscribed` / `cancel_scheduled` / `grace`)는 설정 화면의 구독 요약(`settings-api.md`)과 구독 관리 화면도 그대로 쓰게 된다. `subscription.md`의 API 명세가 작성될 때 그쪽으로 소유를 옮기고 이 문서는 참조로 바꾼다.
- **`renews_at`의 정확성** — 다음 결제일을 `subscriptions.expires_at`으로 표현했다. 스토어 유예 기간·플랜 변경 예약이 겹치면 실제 결제일과 어긋날 수 있어, 구독 API 설계 시 스토어 S2S 값과 대조가 필요하다.
- ~~`top_topics` 정렬 기준~~ → **확정(합의 2026-08-06): 별도 선정 기준 없이 서버 응답 순서의 앞 3개**(4.1 · `profile.md` 4.4). 현행 정렬(`topics.display_order`)을 그대로 쓴다.
- ~~프로필 카드 구성(커리어 카드 제거 · `profile.md` 개정 필요)~~ → **확정(합의 2026-08-06): 4카드로 복원.** 커리어는 별도 카드·별도 화면(`career.md`)이다. `profile.md` 4.1·4.4 개정 완료 — 이 문서의 이전 판(커리어 미포함·3카드)은 폐기됐고, 응답에 `career` 요약이 복원됐다(4.1).
- ~~[관심 주제 관리] 카드의 커리어 요약 표시 여부~~ → **해소(합의 2026-08-06): 커리어가 별도 카드로 분리**되면서 질문 자체가 소멸했다. 관심 주제 카드에는 주제 요약만 둔다.
- **`years_of_experience`의 전송 표현** — 이 계약은 구간 라벨(`"0-1" | "2-3" | "4-6" | "7+"`)을 쓴다(`career.md` 3장). `domain.md` 3.1은 `int`라 저장 매핑이 미결이다(`domain.md` 15.1 #4). 매핑이 확정돼도 이 응답은 라벨을 유지한다 — 저장 표현은 백엔드 소관.
- **통계 수치 표기 형식** — 시간 단위 변환·반올림·`ratio` 소수 자릿수는 `spec/uiux/profile-uiux.md` 확정 대기. 서버는 초 단위 정수와 "합 100 조정"까지만 책임진다(4.1).
- **집계 캐시** — 연속 일수·주제 분포의 매 조회 집계 비용 실측 후 캐시 테이블(구체화 뷰) 도입 여부를 백엔드가 판단한다(`domain.md` 15.1 #9). 도입돼도 이 계약·필드는 변하지 않는다.
- **커리어 편집 API(`career-api`)** — 커리어 정보 화면의 편집 API는 `career.md` 기준으로 별도 문서로 작성한다(`career.md` 미결 — spec 산출물 미작성).
