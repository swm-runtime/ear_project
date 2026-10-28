# 콘텐츠 후기 · 후기 참여 프로모션 API 명세서

> 기준 문서: [`docs/features/content-review.md`](../../features/content-review.md) (FR-49)
> 관련 규칙: [`docs/features/subscription.md`](../../features/subscription.md) 4.9(지급 경로) · [`docs/spec/api/subscription-api.md`](subscription-api.md) 4.2 · 4.8(구독 조회 본문 · `plan.grant`) · [`docs/features/drip-feedback.md`](../../features/drip-feedback.md)(먼저 묻기 · 오프라인 재전송 선례)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7 · 9장
> 오류 · 재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3.5 · 6.8 · 8.5 · 8.6 · 8.7 · 12.3

작성: 2026-10-28 (KAN-279 — 박준현). 구현은 이 계약을 따른다(서버 구현 전 — FE KAN-280 · 콘솔 KAN-284가 이 문서로 붙는다).

## 1. 범위

| 묶음 | 호출 |
|---|---|
| 후기 | 시트 열기(쓸 수 있는지 · 내 후기 · 발급까지의 진행) · 저장(덮어쓰기) |
| 먼저 묻기 | 판정 · 닫기 · 이번 주 그만 보기 |
| 프로모션 | S12 [프로모션] 화면 조회 · 사용 |
| 운영 | 관리자 편별 집계 · 글 목록 |

**판정은 전부 서버다** — 쓸 수 있는 편 · 완청 여부 · 먼저 묻기 · 발급 · 사용 가능 여부 · 소멸 · 끝나는 날짜. 앱은 기기 시각으로 날짜를 계산하지 않는다(CLAUDE.md 공통 원칙).

**다루지 않는 것**

| 대상 | 소유 | 이 문서에서 하는 일 |
|---|---|---|
| 초대 코드 입력 | `subscription-api.md` 4.8-1 | 그대로 둔다. S12의 코드 입력 칸은 그 엔드포인트를 부른다 |
| `plan.grant` 모양 | `subscription-api.md` 4.8 | 같은 모양을 재사용한다. 이름 값 규칙만 4.7에 더한다 |
| 화면 문구 · 배치 | `spec/uiux/`(KAN-280) | 응답 값만 정한다 |
| 일일 Slack 보고 | `features/backend-monitoring.md` | 건수 · 평균 한 줄(원문 없음) — 계약이 아니다 |

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 | `Authorization: Bearer <access_token>` — 전부 필요. 관리자 API(4.8 · 4.9)는 `role = admin`(`AdminRoleGuard`) |
| 필드 | snake_case · 시각 ISO 8601 UTC · 서비스 날짜는 `YYYY-MM-DD` 라벨(05:00 KST 경계 — `domain.md` 1.2) |
| 캐시 | 전부 `Cache-Control: no-store` |
| 멱등키 | **없다.** 후기는 `(user_id, content_id)` upsert라 재전송이 같은 상태로 수렴하고, 닫기 · 그만 보기는 절대값 저장이다. 프로모션 사용은 프로모션 행 잠금으로 한 번만 지급된다(4.7) |
| 시장 | access token의 `market`으로 정한다. 다른 시장 콘텐츠는 없는 것과 같다(404 `CONTENT_NOT_FOUND` — `global-api.md` 4.7) |

### 2.1 서버 스위치와 앱 노출 — `enabled`

| 스위치(env) | 기본 | 켜짐 조건 | 끄면 |
|---|---|---|---|
| `CONTENT_REVIEW_ENABLED` | **꺼짐** | 값이 정확히 `true` | 저장 거부(409 `CONTENT_REVIEW_DISABLED`) · 먼저 묻기 `show=false` · 모든 응답의 `enabled=false`. 받은 후기 · 프로모션은 그대로다. **개인정보 처리방침 시행일 이후에 켠다**(KAN-285) |
| `CONTENT_REVIEW_REWARD_ENABLED` | **꺼짐**(빈 값) — 운영은 `true`로 상시 켠다 | 값이 정확히 `true` | 새 발급만 멈춘다 · `reward_progress=null`. 가진 프로모션은 기한까지 쓸 수 있다 |

- 두 스위치 모두 **다른 선택 스위치와 같은 꼴**(`SERIES_EXPLORE_CARDS_ENABLED` · `GLOBAL_SIGNUP_ENABLED` — `true`일 때만 켜짐)이다. 발급 스위치를 "빈 값 = 켜짐"으로 두지 않은 이유: 서버에 키가 빠진 채 배포됐을 때 보상이 조용히 나가는 쪽보다 멈추는 쪽이 되돌리기 쉽다. 운영 · 개발계 Secrets에 `CONTENT_REVIEW_REWARD_ENABLED=true`를 넣어 둔다.
- **앱이 켜짐 여부를 받는 곳은 먼저 묻기 판정(4.3)의 `enabled`다.** 라이브러리 진입마다 부르는 호출이라 별도 설정 호출이 필요 없다. 앱은 마지막으로 받은 `enabled`를 세션 동안 들고 더보기 시트의 [후기] · 콘텐츠 상세의 "내 후기"를 그릴지 정한다. **받은 적이 없거나 호출이 실패했으면 그리지 않는다**(안전한 기본값 `false`). 후기 시트 열기(4.1)와 프로모션 화면(4.6)도 같은 값을 싣는다 — 세션 중 스위치가 꺼지면 다음 호출에서 따라간다.

### 2.2 공용 객체

**`review`** — 내 후기

```json
{ "stars": 4, "text": "비유가 쉬워서 출근길에 듣기 좋았어요", "is_completed": true, "content_version": 2, "created_at": "2026-10-28T23:10:00Z", "updated_at": "2026-10-29T00:02:00Z" }
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `stars` | int 1~5 | |
| `text` | string \| null | 앞뒤 공백을 뺀 글. 글이 없으면 `null`(빈 문자열은 오지 않는다) |
| `is_completed` | boolean | 이 후기를 쓴(고친) 시점에 끝까지 들었는가 — 서버 판정(`domain.md` 6.8) |
| `content_version` | int | 쓴(고친) 시점의 편 버전 |
| `created_at` · `updated_at` | string | 처음 쓴 시각 · 마지막으로 고친 시각 |

**`reward_progress`** — 발급까지의 진행

```json
{ "current": 1, "required": 3 }
```

- `current` = 보상으로 치는 후기 수(끝까지 들은 편 · 공백 뺀 글 10자 이상 · 서로 다른 편), **`required`를 넘지 않게 잘라서** 준다. `required` = `CONTENT_REVIEW_REWARD_REQUIRED`(지금 3) — 앱은 3을 하드코딩하지 않는다.
- **`null`이면 보상 줄을 그리지 않는다** — 이미 받은 계정(사용 · 소멸 포함) · 발급 스위치 꺼짐 · 후기 스위치 꺼짐. 앱은 다른 조건을 따지지 않는다.

**`promotion`** — 사용 가능한 프로모션 한 장(4.6 목록 · 4.2 발급 응답)

```json
{
  "id": "uuid",
  "kind": "review_reward",
  "name": "후기 참여",
  "tier": "pro",
  "plan_name": "Pro",
  "grant_days": 7,
  "issued_at": "2026-10-28T03:00:00Z",
  "expires_at": "2027-01-27T20:00:00Z",
  "last_usable_date": "2027-01-27",
  "redeemable": true,
  "reason": null,
  "overlaps_trial": false,
  "redeem_preview": { "ends_at": "2026-11-03T20:00:00Z", "last_date": "2026-11-03" }
}
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `id` | uuid | 사용(4.7) 경로의 `:id` |
| `kind` | enum `review_reward` | 지금은 한 값. 모르는 값이 오면 카드를 그리지 않는다 |
| `name` | string | 표시 이름 — KR **"후기 참여"**, GLOBAL **"Review"**(사용자 시장의 언어). 카드 문구 "{name} 프로모션 · {plan_name} {grant_days}일"의 재료 |
| `tier` · `plan_name` | string | 지급 요금제와 그 이름(사용자 시장의 언어 — `subscription-api.md` 4.2 규칙) |
| `grant_days` | int | 지급 일수(쓴 서비스 날짜가 1일째) |
| `issued_at` | string | 발급 시각 |
| `expires_at` | string | 소멸 시각(배타 경계 — 발급 서비스 날짜 3개월 뒤 같은 날짜 05:00 KST, 없으면 그 달 말일) |
| `last_usable_date` | string | **쓸 수 있는 마지막 서비스 날짜** — "{N월 N일}까지 사용"은 이 값. 앱이 05시 보정을 하지 않는다 |
| `redeemable` | boolean | 지금 쓸 수 있는가. `false`면 [사용하기]를 흐리게 그린다 |
| `reason` | enum \| null | `redeemable=false`의 사유 — `pro_subscribed`(Pro 구독 중 — 해지 예약 · 결제 유예 · 다운그레이드 예약 포함) · `grant_active`(다른 지급 이용 중). 둘 다 해당하면 `pro_subscribed`. `redeemable=true`면 `null` |
| `overlaps_trial` | boolean | 지금 가입 체험 중인가 — 확인 팝업에 "체험 중엔 재생 한도가 이미 풀려 있어요…" 줄을 더할지 |
| `redeem_preview` | object | **지금 쓰면** 지급이 끝나는 시각(`ends_at`, 배타 경계)과 마지막 서비스 날짜(`last_date`) — 확인 팝업의 "오늘부터 Pro 7일 · {N월 N일}까지". 응답을 만든 순간 기준이라 05:00을 넘겨 확인하면 하루 밀릴 수 있다 — 실제 값은 사용 응답의 `plan.grant.last_date`가 기준이다 |

- 목록에는 **쓰지 않았고 소멸하지 않은** 프로모션만 나온다. 쓴 것 · 소멸한 것은 나오지 않는다(쓴 것의 지급은 `grant`에 보인다).

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 1 | GET | `/contents/:contentId/review` | 후기 시트 열기 (4.1) |
| 2 | PUT | `/contents/:contentId/review` | 후기 저장 — 덮어쓰기 (4.2) |
| 3 | GET | `/users/me/content-review/prompt` | 먼저 묻기 판정 + 켜짐 여부 (4.3) |
| 4 | POST | `/users/me/content-review/prompt/dismiss` | 먼저 묻는 시트를 닫음 — "물었다" 기록 (4.4) |
| 5 | POST | `/users/me/content-review/prompt/mute` | 이번 주 그만 보기 (4.5) |
| 6 | GET | `/users/me/promotions` | S12 [프로모션] 화면 (4.6) |
| 7 | POST | `/users/me/promotions/:promotionId/redeem` | 프로모션 사용 — 응답은 구독 조회 본문 (4.7) |
| 8 | GET | `/admin/content-reviews/summary` | 관리자 — 편별 집계 · 프로모션 건수 (4.8) |
| 9 | GET | `/admin/content-reviews` | 관리자 — 글 목록(최신순) (4.9) |

## 4. 엔드포인트 상세

### 4.1 `GET /contents/:contentId/review`

더보기 시트 [후기] · 콘텐츠 상세 "내 후기"를 눌렀을 때. `contentId`가 uuid가 아니면 400 `VALIDATION_FAILED`.

**Response 200**

```json
{
  "enabled": true,
  "reviewable": true,
  "reason": null,
  "review": null,
  "reward_progress": { "current": 1, "required": 3 }
}
```

| 필드 | 의미 |
|---|---|
| `enabled` | 후기 기능 스위치(2.1) |
| `reviewable` | 지금 저장할 수 있는 편인가. `false`면 시트 대신 `reason`에 맞는 안내를 띄운다 |
| `reason` | `reviewable=false`의 사유 — `disabled`(스위치 꺼짐) · `withdrawn`(회수 · 라이선스 만료) · `not_played`(재생을 시작한 적 없음 — "들어 본 편에만 후기를 남길 수 있어요"). 판정 순서도 이 순서다(4.2 에러 순서와 같다). `reviewable=true`면 `null` |
| `review` | 내 후기(2.2) — 없으면 `null`. **`reviewable=false`여도 이미 쓴 후기는 싣는다**(회수된 편의 내 후기는 남아 있다) |
| `reward_progress` | 2.2 — `null`이면 보상 줄 없음 |

- **"재생을 시작한 적 있음"** = 그 편의 재생 위치(`playback_progresses`) 또는 재생 기록(`play_records`)이 있다. 라이브러리에 담기만 한 편은 아니다. 라이브러리에서 지운 편도 들은 적 있으면 쓸 수 있다.
- 콘텐츠가 없거나 다른 시장이면 404 `CONTENT_NOT_FOUND`.

### 4.2 `PUT /contents/:contentId/review`

**Request**

```json
{ "stars": 4, "text": "비유가 쉬워서 출근길에 듣기 좋았어요" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `stars` | int 1~5 | 필수 | |
| `text` | string \| null | 선택 | 서버가 앞뒤 공백을 뺀다. 뺀 뒤 0~500자(코드 포인트). 빈 값 · `null` · 생략 = **글 없음**(있던 글을 지운다). 뺀 뒤 500자를 넘으면 400 — 잘라 저장하지 않는다 |

- **덮어쓰기다.** 같은 편의 재전송 · 수정은 마지막 값이 이긴다. `is_completed` · `content_version`은 서버가 **이 저장 시점의 값으로** 다시 적는다(2.2).

**Response 200**

```json
{
  "review": { "stars": 4, "text": "비유가 쉬워서 출근길에 듣기 좋았어요", "is_completed": true, "content_version": 2, "created_at": "2026-10-28T23:10:00Z", "updated_at": "2026-10-28T23:10:00Z" },
  "reward_progress": null,
  "issued_promotion": {
    "id": "uuid", "kind": "review_reward", "name": "후기 참여", "tier": "pro", "plan_name": "Pro", "grant_days": 7,
    "issued_at": "2026-10-28T23:10:00Z", "expires_at": "2027-01-28T20:00:00Z", "last_usable_date": "2027-01-28",
    "redeemable": true, "reason": null, "overlaps_trial": false,
    "redeem_preview": { "ends_at": "2026-11-04T20:00:00Z", "last_date": "2026-11-04" }
  }
}
```

| 필드 | 의미 |
|---|---|
| `review` | 저장된 내 후기 |
| `reward_progress` | 저장 뒤의 진행(2.2). 이번에 발급됐으면 `null` |
| `issued_promotion` | **이번 저장으로 발급된** 프로모션(2.2 `promotion`) — 있으면 발급 안내 시트("후기 참여 프로모션을 받았어요" · [지금 쓰기] → S12 · [나중에])를 띄운다. 없으면 `null`. 두 기기가 동시에 3번째 후기를 보내도 **한쪽만** 채워진다. 응답이 유실된 뒤의 재전송은 `null`이다(프로모션은 S12에 있다) |

**에러** — 판정 순서(앞이 우선)

| 코드 | HTTP | 조건 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `stars` 범위 · 정수 아님 · `text` 500자 초과 · `contentId` 형식 |
| `CONTENT_REVIEW_DISABLED` | 409 | 후기 기능 스위치 꺼짐 (**신설**) |
| `CONTENT_NOT_FOUND` | 404 | 없는 편 · 다른 시장 편 |
| `CONTENT_WITHDRAWN` | 403 | 회수 · 라이선스 만료된 편 — 새 후기 · 수정 거부(이미 있는 후기는 남는다) |
| `CONTENT_REVIEW_NOT_PLAYED` | 409 | 재생을 시작한 적 없는 편 (**신설**) |

### 4.3 `GET /users/me/content-review/prompt`

라이브러리 진입 시 호출(추천 별점 `GET /users/me/drip-feedback/prompt`와 나란히). **켜짐 여부의 노출 위치이기도 하다**(2.1).

**Response 200**

```json
{
  "enabled": true,
  "show": true,
  "item": {
    "content_id": "uuid",
    "title": "관세는 외국이 내는 세금이 아니다",
    "thumbnail_url": "https://…",
    "language": "ko",
    "completed_date": "2026-10-27"
  },
  "reward_progress": { "current": 2, "required": 3 },
  "muted_until": null
}
```

| 필드 | 의미 |
|---|---|
| `enabled` | 후기 기능 스위치(2.1). 앱은 이 값으로 [후기] · "내 후기"를 그릴지 정한다 |
| `show` | 먼저 묻는 시트를 띄울지. **앱은 이 값만 본다.** 단 같은 세션에 추천 별점 팝업(L16)이 떴으면 `true`여도 띄우지 않는다 — 한 세션에 하나는 앱의 표시 규칙이다(추천 별점 우선) |
| `item` | 묻는 편 하나 — `show=false`면 `null`. 시트의 썸네일 · 제목 · 저장(4.2) 대상. `completed_date`는 끝까지 들은 서비스 날짜(표시 보조, 판정 아님) |
| `reward_progress` | 2.2 — 시트의 보상 줄. 이미 받은 계정도 묻고 이 값만 `null`이다 |
| `muted_until` | 그만 보기 중이면 종료 서비스 날짜(다음 주 월요일 라벨), 아니면 `null` |

**판정**(`content-review.md` 4.3 — 앞에서 걸리면 `show=false`)

1. 스위치 꺼짐 → `enabled=false` · `show=false` · `item=null` · `reward_progress=null`.
2. 그만 보기 중(오늘 서비스 날짜 < `muted_until`).
3. 마지막으로 물은 날 + **5 서비스 날짜**가 아직 안 됨(오늘 < 물은 날 + 5). 물은 날이 10-28이면 11-02부터 다시 묻는다 — 11-01(4일째)은 묻지 않는다. 상수 `CONTENT_REVIEW_PROMPT_INTERVAL_DAYS = 5`.
4. **최근 14 서비스 날짜 안(오늘 포함)에 끝까지 들었고 아직 후기가 없는 편**이 없음. 있으면 그중 가장 최근에 끝까지 들은 편 하나다. 현재 시장 · 노출 조건(회수 · 만료 제외) · 재생 시작을 만족하는 편만 본다. 상수 `CONTENT_REVIEW_PROMPT_RECENT_DAYS = 14`. "끝까지 들은 시각"은 라이브러리 행의 완청 시각, 없으면 완청 신호(`user_signals.action = complete`)의 시각이다.

- 이 조회는 **상태를 바꾸지 않는다**("물었다"는 4.4 · 4.5가 적는다). 앱이 `show=true`를 받고도 띄우지 않았으면(추천 별점 우선) 아무것도 보내지 않는다 — 다음 진입에 다시 묻는다.

### 4.4 `POST /users/me/content-review/prompt/dismiss`

본문 없음. **Response 204.**

- 먼저 묻는 시트가 **닫힐 때 한 번** 부른다 — [닫기]든, [보내기]로 저장(4.2)한 뒤 닫혔든 같다("닫든 보내든 물었다로 친다" — 4.3-3). 저장은 이 호출을 대신하지 않는다(상시 진입점의 저장과 구분할 수 없어서다).
- 오늘 서비스 날짜를 "마지막으로 물은 날"로 적는다. 뒤로 가지 않고, 같은 날 재전송은 무해하다.

### 4.5 `POST /users/me/content-review/prompt/mute`

본문 없음. **Response 200** `{ "muted_until": "2026-11-02" }` — 다음 서비스 주 월요일 라벨(주 경계 월 05:00 KST). 그 서비스 날짜부터 다시 4.3 판정을 한다. **이 호출도 "물었다"를 함께 적으므로 dismiss를 따로 부르지 않는다.**

### 4.6 `GET /users/me/promotions`

설정 › [프로모션](S12)을 열 때 · 설정 화면의 [프로모션] 행 점 배지를 정할 때. 후기 스위치가 꺼져 있어도 열려 있다(가진 프로모션은 쓸 수 있다 — `content-review.md` 7장).

**Response 200**

```json
{
  "enabled": true,
  "grant": null,
  "promotions": [
    {
      "id": "uuid", "kind": "review_reward", "name": "후기 참여", "tier": "pro", "plan_name": "Pro", "grant_days": 7,
      "issued_at": "2026-10-28T03:00:00Z", "expires_at": "2027-01-27T20:00:00Z", "last_usable_date": "2027-01-27",
      "redeemable": false, "reason": "pro_subscribed", "overlaps_trial": false,
      "redeem_preview": { "ends_at": "2026-11-03T20:00:00Z", "last_date": "2026-11-03" }
    }
  ],
  "has_unused": true,
  "reward_progress": null
}
```

| 필드 | 의미 |
|---|---|
| `enabled` | 후기 기능 스위치(2.1) |
| `grant` | **이용 중** 섹션 — `subscription-api.md` 4.8 `plan.grant`와 같은 모양 · 같은 값(초대 코드 지급이든 후기 참여든). 없으면 `null` |
| `promotions[]` | 사용 가능한 프로모션(2.2) — 쓰지 않았고 소멸 전인 것만, 발급 최신순. 없으면 빈 배열 |
| `has_unused` | `promotions`가 하나라도 있는가 — 설정 [프로모션] 행의 점 배지. `redeemable=false`여도 `true`다(가진 것이 있다는 표시) |
| `reward_progress` | **아직 받지 않았을 때** 섹션("끝까지 들은 편 3개에 후기를 남기면 … · 지금 N/3") — 2.2. 두 스위치가 모두 켜져 있고 받은 적이 없을 때만 채워진다 |

### 4.7 `POST /users/me/promotions/:promotionId/redeem`

확인 팝업의 [쓰기]. 본문 없음. 레이트 리밋 사용자 단위 분당 10회(초대 코드 입력과 같다).

**Response 200** — `GET /users/me/subscription`(`subscription-api.md` 4.2)과 **같은 본문**이다. 초대 코드 입력(4.8-1)과 같은 조립 함수라 앱이 구독 조회를 다시 부르지 않는다.

```json
{
  "plan": {
    "status": "free", "tier": "pro", "plan_name": "Pro", "daily_play_limit": null,
    "renews_at": null, "expires_at": null, "has_payment_issue": false, "trial": null,
    "grant": { "name": "후기 참여", "tier": "pro", "plan_name": "Pro", "ends_at": "2026-11-03T20:00:00Z", "last_date": "2026-11-03" }
  },
  "entitlements": { "daily_play_limit": null, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": false, "max_audio_quality": "lossless" },
  "store": null,
  "pending_plan": null
}
```

- **지급은 초대 코드 기간 지급과 같은 경로다**(`subscription.md` 4.9 · `domain.md` 8.6) — 내부 캠페인 행 `REVIEW-REWARD`의 지급 행을 만들고 같은 트랜잭션에서 `users.tier` 캐시를 맞춘다. 쓴 서비스 날짜를 1일째로 **7 서비스 날짜**, 05:00 경계에 끝난다(새벽 04:50에 쓰면 첫날이 짧다). 끝나면 기존 지급 만료 배치(10분 간격)가 캐시를 되돌린다.
- **`plan.grant.name`** — KR **"후기 참여"**, GLOBAL **"Review"**. 세 곳(설정 · 프로필 · 요금제 관리)의 "{name} 프로모션 이용 중 · {plan_name} · {N월 N일}까지"에 그대로 들어간다. 이 규칙은 `subscription-api.md` 4.8 `plan.grant.name`에 함께 적용된다(그 조립 함수 하나 — 프로필 · 설정 · 구독 조회 모두). 초대 코드 지급의 `name`은 종전대로 코드 행의 이름이다.
- 쓸 때 구독이 없던 계정이 지급 중 결제하면 지급이 끝난다(`subscription-api.md` 4.8 "프로모션 중 결제" 그대로). 데일리 구독 중에 쓴 지급은 그 구독의 갱신 · 변경으로 끝나지 않고, 끝나면 데일리로 돌아간다.

**판정 순서와 에러**(앞이 우선)

| 순서 | 상태 | 코드 | HTTP |
|---|---|---|---|
| 1 | 없는 프로모션 · 내 것이 아님 | `PROMOTION_NOT_FOUND` (**신설**) | 404 |
| 2 | 이미 사용함 — 두 기기 동시 요청의 늦은 쪽 포함 | `PROMOTION_ALREADY_USED` (**신설**) | 409 |
| 3 | 사용 기한 지남(`now ≥ expires_at`) | `PROMOTION_EXPIRED` (**신설**) | 409 |
| 4 | Pro 구독 중(해지 예약 · 결제 유예 · 다운그레이드 예약 포함) — `reason: pro_subscribed` | `PROMOTION_PRO_SUBSCRIBED` (**신설**) | 409 |
| 5 | 다른 지급 이용 중(초대 코드 등) — `reason: grant_active` | `INVITE_GRANT_ALREADY_ACTIVE` (기존 — 계정당 지급은 동시에 하나, 같은 판정) | 409 |

- 무료 · 가입 체험 중 · 데일리 구독 중은 쓸 수 있다(`content-review.md` 4.5).
- 사용자 행 → 프로모션 행 순으로 잠그고 판정한다 — 두 기기가 동시에 [쓰기]를 눌러도 지급은 하나이고 늦은 쪽은 `PROMOTION_ALREADY_USED`다. **응답이 유실된 뒤의 재전송도 이 409**다 — 앱은 이 코드를 받으면 오류 문구 대신 S12 · 구독 조회를 다시 받아 `grant`가 있으면 사용 성공으로 그린다.
- 4 · 5의 사유는 4.6 목록의 `reason`과 같은 판정이다 — 정상 앱은 흐린 버튼으로 먼저 막으므로 드물다(그사이 결제 · 코드 입력이 있었을 때).

### 4.8 `GET /admin/content-reviews/summary` — 편별 집계 (읽기 전용)

`JwtAuthGuard` + `AdminRoleGuard`. 파이프라인 콘솔 발행 상세(KAN-284)가 편별로 부른다.

**Query** — `content_id`(uuid, 선택 — 한 편만) · `market`(`kr` \| `global`, 선택 — 편의 시장). 모르는 값은 400 `VALIDATION_FAILED`.

**Response 200**

```json
{
  "totals": { "reviews": 42, "average_stars": 4.1, "text_reviews": 17, "reviewed_contents": 15 },
  "promotions": { "issued": 6, "redeemed": 3, "expired": 0, "unused": 3 },
  "items": [
    {
      "content_id": "uuid",
      "title": "관세는 외국이 내는 세금이 아니다",
      "market": "kr",
      "status": "published",
      "content_version": 2,
      "reviews": 5,
      "average_stars": 3.8,
      "distribution": { "1": 0, "2": 1, "3": 1, "4": 1, "5": 2 },
      "text_reviews": 3,
      "completed_reviews": 4,
      "last_reviewed_at": "2026-10-28T23:10:00Z",
      "by_version": [
        { "content_version": 2, "reviews": 3, "average_stars": 4.3 },
        { "content_version": 1, "reviews": 2, "average_stars": 3.0 }
      ]
    }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `totals` | 필터 범위의 전체 — 후기 수 · 평균(없으면 `null`) · 글 있는 후기 수 · 후기가 있는 편 수 |
| `promotions` | 후기 참여 프로모션 건수(필터와 무관 — 전체). `issued` = 발급 · `redeemed` = 사용 · `expired` = 쓰지 않고 소멸 · `unused` = 쓰지 않았고 기한 안. 탈퇴로 파기된 행은 세지 않는다 |
| `items[]` | 후기가 1건 이상인 편, `last_reviewed_at` 최신순. 페이지 없음(편 수가 적다 — 수천 편이 되면 커서를 더한다) |
| `items[].status` | 편의 현재 상태(`published` \| `withdrawn` \| `expired`) — 회수 편의 후기는 남고 이 값으로 표시한다 |
| `items[].content_version` | 편의 현재 버전 |
| `items[].text_reviews` · `completed_reviews` | 글 있는 후기 수 · 쓸 때 끝까지 들은 후기 수 |
| `items[].by_version[]` | 후기를 쓴(고친) 시점의 버전별 수 · 평균, 버전 역순 — 재합성 효과 비교 |

- **사용자 식별값(`user_id` · 닉네임 · 이메일)은 싣지 않는다.**

### 4.9 `GET /admin/content-reviews` — 글 목록 (읽기 전용)

`JwtAuthGuard` + `AdminRoleGuard`.

**Query**

| 이름 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `content_id` | uuid | 선택 | 한 편만(편별 목록) |
| `market` | `kr` \| `global` | 선택 | 후기를 쓴 때의 사용자 시장 |
| `has_text` | `true` \| `false` | 선택 | `true`면 글 있는 후기만 |
| `cursor` | string | 선택 | 직전 응답의 `next_cursor` 그대로(같은 필터로 이어 받는다). 해석할 수 없는 값이면 400 `VALIDATION_FAILED` |
| `limit` | int 1~100 | 선택 | 기본 20 |

**Response 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "content_id": "uuid",
      "content_title": "관세는 외국이 내는 세금이 아니다",
      "content_status": "published",
      "stars": 2,
      "text": "중간에 같은 설명이 반복돼요",
      "is_completed": true,
      "content_version": 1,
      "market": "kr",
      "created_date": "2026-10-27",
      "updated_date": "2026-10-28"
    }
  ],
  "next_cursor": "opaque-string"
}
```

| 필드 | 의미 |
|---|---|
| `id` | 후기 행 id(목록 키). 사용자를 가리키지 않는다 |
| `content_status` | 편의 현재 상태 — 회수 표시용 |
| `market` | 후기를 쓴(고친) 때의 사용자 시장 |
| `created_date` · `updated_date` | 처음 쓴 · 마지막으로 고친 **서비스 날짜**. 시각은 싣지 않는다(작성자를 좁힐 단서를 줄인다) |
| `next_cursor` | 다음 페이지, 끝이면 `null` |

- 정렬: 마지막으로 고친 순 최신순(`updated_at DESC, id DESC`).
- **작성자 계정(`user_id`) · 닉네임 · 이메일은 싣지 않는다**(`content-review.md` 4.7). 원문은 이 응답으로만 읽는다 — Slack · Jira · 문서 · 커밋 · 파이프라인 Supabase에 옮기지 않는다.

## 5. 에러 코드 표

**신설 코드** — `common-error-handling.md`(FE 소유) 등재는 `changes/pending/content-review-contract.md`로 요청한다. enum 반영은 서버 구현 PR에서 한다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `CONTENT_REVIEW_DISABLED` | 409 | false | 후기 기능이 꺼졌다 — [후기]를 숨기고, 오프라인 큐의 후기는 **버린다** |
| `CONTENT_REVIEW_NOT_PLAYED` | 409 | false | "들어 본 편에만 후기를 남길 수 있어요". 큐의 후기는 버린다 |
| `PROMOTION_NOT_FOUND` | 404 | false | S12를 다시 받는다 |
| `PROMOTION_ALREADY_USED` | 409 | false | S12 · 구독 조회를 다시 받는다 — `grant`가 있으면 사용 성공으로 그린다(4.7) |
| `PROMOTION_EXPIRED` | 409 | false | "사용 기한이 지난 프로모션이에요" + S12 재조회(목록에서 사라진다) |
| `PROMOTION_PRO_SUBSCRIBED` | 409 | false | "Pro 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요" + S12 재조회 |

**재사용 코드**

| error_code | HTTP | 이 문서에서의 쓰임 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | 없는 편 · 다른 시장 편(4.1 · 4.2) |
| `CONTENT_WITHDRAWN` | 403 | 회수 · 만료 편의 저장(4.2) — 큐의 후기는 버린다 |
| `INVITE_GRANT_ALREADY_ACTIVE` | 409 | 다른 지급 이용 중의 프로모션 사용(4.7) — 문구는 이 화면 것("이용 중인 프로모션이 끝난 뒤 쓸 수 있어요")을 쓴다 |
| `VALIDATION_FAILED` | 400 | 형식 위반 |

- 401 · 429 · 5xx는 `common-error-handling.md` 4.1~4.2 공통 규칙.

## 6. 클라이언트 처리 메모

- **[후기] · "내 후기" · 먼저 묻기는 4.3의 `enabled`로만 그린다.** 받은 적 없거나 실패했으면 그리지 않는다.
- **먼저 묻는 시트를 띄웠으면 닫힐 때 `dismiss`나 `mute` 중 하나를 반드시 보낸다**(4.4 · 4.5). 보내지 않으면 다음 진입에 같은 편을 또 묻는다.
- 후기 저장 · 닫기 · 그만 보기는 오프라인 큐 대상으로 둘 수 있다(`common-error-handling.md` 4.5 — 추천 별점과 같다). 망 단절 · 타임아웃이면 다음 진입 · 포그라운드 복귀에 다시 보내고, `CONTENT_REVIEW_DISABLED` · `CONTENT_REVIEW_NOT_PLAYED` · `CONTENT_WITHDRAWN` · `CONTENT_NOT_FOUND`는 **조용히 버린다.** 5xx는 인라인 에러 + [다시 시도].
- 프로모션 **사용은 큐에 넣지 않는다** — 지급 시작일이 보낸 날로 정해지므로 늦게 도착하면 사용자가 본 날짜와 달라진다.
- 날짜 문구("{N월 N일}까지 사용" · "{N월 N일}까지")는 `last_usable_date` · `redeem_preview.last_date` · `plan.grant.last_date`를 그대로 쓴다. 기기 시각 · 05시 보정을 하지 않는다.
- 별 개수 · 글 길이(500)의 입력 제한은 화면이 걸되, 판정은 서버가 다시 한다. 보상 문턱(3편 · 10자)은 화면이 계산하지 않는다 — `reward_progress`만 그린다.

## 7. 데이터 모델

| 응답 | 원천(`domain.md`) |
|---|---|
| `review` · 관리자 집계 · 글 목록 | 6.8 `content_reviews` |
| `promotion` · `reward_progress` · 프로모션 건수 | 8.7 `promotions` (+ 6.8로 진행 계산) |
| `grant` · 사용 응답 | 8.5 내부 캠페인 행 `REVIEW-REWARD` · 8.6 `invite_code_redemptions` |
| 먼저 묻기 상태 | 3.5 `user_settings.content_review_last_prompted_date` · `content_review_muted_until` |
| 재생 시작 · 완청 | 6.1 `library_items` · 6.2 `playback_progresses` · 6.3 `play_records` · 6.4 `user_signals`(완청 신호) |

## 8. 미결 사항

- **PM 검토**(KAN-278) — 이 계약은 `content-review.md` 2026-10-28 확정본 기준이다. 규칙이 바뀌면 이 문서를 함께 고친다.
- 소멸 임박 안내(알림)는 두지 않았다 — `content-review.md` 미결.
- `name`(KR "후기 참여" / GLOBAL "Review")은 서버 상수다. 초대 코드 캠페인에도 언어별 이름이 필요해지면 `invite_codes`에 칸을 더하는 쪽으로 옮긴다(`domain.md` 8.6).
