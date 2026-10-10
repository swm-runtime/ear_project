# 구독 · 인앱 결제 API 명세서

> 기준 문서: [`docs/features/subscription.md`](../../features/subscription.md)
> 관련 규칙: [`docs/features/paywall.md`](../../features/paywall.md) 4.5(페이월 → 결제 → 복귀) · [`docs/features/auth.md`](../../features/auth.md) 4.4(결제 전 이메일 인증)·4.3(탈퇴·재가입 복원)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 1.3 · 3.1 · 8.1~8.4 · 11.5

작성: 2026-10-02 (KAN-106 · KAN-40)

## 1. 범위

`subscription.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 이 문서가 소유하는 것은 다섯 가지다.

- **요금제 목록** — 3티어 비교 카드의 재료. 스토어 상품 ID와 `entitlements`를 함께 내려준다
- **현재 구독 상태** — 앱 실행·포그라운드 복귀 시의 동기화 대상(`subscription.md` 4.3)
- **결제 의도 생성** — 결제 시트를 열기 전의 서버 관문(이메일 인증·요금제 유효성). 스토어 거래를 계정에 묶는 토큰을 발급한다
- **영수증 제출·검증 / 구매 복원** — 스토어가 서명한 거래를 서버가 검증해 티어를 반영한다
- **스토어 서버 알림(S2S) 수신** — 갱신·해지·환불·유예를 반영하는 **진실의 원천**

**다루지 않는 것**

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 재생 한도 판정·차감·페이월을 여는 시점 | `paywall.md` · `library-api.md` | `entitlements`를 내려줄 뿐 판정하지 않는다 |
| 프로필·설정의 구독 요약(`plan`) | `profile-api.md` 4.1 · `settings-api.md` 4.1 | **같은 조립 함수**를 쓴다(4.2). 두 화면의 계약은 그대로다 |
| 이메일 등록·인증 | `auth-api.md` 4.8~4.11 | 미인증이면 결제 의도 생성을 거부한다(4.3) |
| 구독 **해지** | 스토어 구독 관리 화면(`subscription.md` 4.5) | **엔드포인트가 없다.** 앱은 스토어로 딥링크하고, 결과는 S2S로 들어온다 |
| 탈퇴 시 구독 안내·아카이브 | `auth-api.md` 4.6~4.7 | 재가입 복원 규칙만 소유한다(4.5) |
| 가격 표기 | 스토어 SDK(현지 통화) | `price_krw`는 참고값이다 — 화면은 SDK가 준 현지 가격을 그린다 |

**플랫폼 범위** — 계약은 iOS(App Store)·Android(Google Play)를 함께 정하고, **서버는 둘 다 구현돼 있다**(iOS 2026-10-02, Android 2026-10-03). 다만 스토어별로 **검증 구성과 상품 ID가 있어야 켜진다**(7장) — 없는 플랫폼의 요청은 `SUBSCRIPTION_PLAN_UNAVAILABLE`로 거부된다(4.3). Android는 Play Console에 구독 상품을 만들고 `plans.store_product_id_android`를 채우기 전까지 꺼져 있다.

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 3장 표의 1~5번. **6·7번(웹훅)은 사용자 인증이 없다** — 스토어 서명으로 검증한다(7장) |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **`Idempotency-Key` 헤더를 쓰지 않는다.** 영수증 제출·복원은 스토어 거래 ID(`original_transaction_id`)가 자연 키라 같은 거래의 재전송이 같은 상태로 수렴한다. 결제 의도는 중복 생성돼도 무해하다(3장 설계 메모) |

**`entitlements` — 기능 분기의 유일한 근거** (`subscription.md` 4.1)

```json
{ "daily_play_limit": 5, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": false, "max_audio_quality": "aac" }
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `daily_play_limit` | int \| null | `plans.daily_play_limit`. **`null` = 무제한** |
| `daily_drip_count` | int | 하루 정규 편성 편수 |
| `drip_enabled` | boolean | |
| `ads_enabled` | boolean | |
| `max_audio_quality` | enum `compressed` / `aac` / `lossless` | `plans.max_audio_quality` — 이 티어가 들을 수 있는 가장 높은 음질(`player.md` 4.9 · `domain.md` 1.3-1, KAN-141). 가입 체험은 반영하지 않는다(저장된 티어를 따른다). 등재 2026-10-10 — 구현 2026-10-06 `726e94ca` |

- `plans`에서 **매번 조립**한다. 저장하는 컬럼이 아니다. 클라이언트는 티어명으로 분기하지 않고 이 객체로 분기한다(CLAUDE.md 공통 원칙).

**구독 요약 `plan`** — `profile-api.md` 4.1의 `plan`과 **같은 모양·같은 조립 함수**다(`status` 4분기 `free` / `subscribed` / `cancel_scheduled` / `grace`, `tier`, `plan_name`, `daily_play_limit`, `renews_at`, `expires_at`, `has_payment_issue`, `trial`). 이 문서는 그 정의를 다시 적지 않는다.

**가입 체험**(`subscription.md` 4.8, 2026-10-03) — 체험 중이면 `plan.trial`이 채워지고(`profile-api.md` 4.1), **`entitlements.daily_play_limit`도 체험 한도가 반영된 값**이다(구독 티어 한도와 체험 한도 중 넉넉한 쪽). 나머지 `entitlements` 필드는 저장된 티어를 따른다. `GET /plans`에는 체험 행이 나오지 않는다(판매 요금제가 아니다).

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|---|
| 1 | GET | `/plans` | 요금제 목록 — 3티어 + 플랫폼 상품 ID + `entitlements` (4.1) | 필요 |
| 2 | GET | `/users/me/subscription` | 현재 구독 상태 + `entitlements` — 실행·포그라운드 복귀 시 동기화 (4.2) | 필요 |
| 3 | POST | `/users/me/subscription/purchase-intents` | 결제 의도 생성 — 이메일 인증·요금제 관문, 계정 결속 토큰 발급 (4.3) | 필요 |
| 4 | POST | `/users/me/subscription/purchases` | 영수증 제출·검증 → 티어 반영 (4.4) | 필요 |
| 5 | POST | `/users/me/subscription/restore` | 구매 복원 (4.5) | 필요 |
| 6 | POST | `/webhooks/app-store` | App Store Server Notifications V2 수신 (4.6) | **스토어 서명** |
| 7 | POST | `/webhooks/play-store` | Google Play RTDN(Pub/Sub push) 수신 (4.7) | **스토어 서명** |
| 8 | POST | `/users/me/subscription/invite-codes` | 초대 코드 입력 → 요금제 지급 (4.8, 2026-10-10) | 필요 |

**설계 메모**

- **경로는 `/users/me/subscription`이다.** `subscription.md` 4.3은 `GET /subscription`이라고 적었으나, 사용자 종속 자원은 전부 `/users/me/*` 아래에 둔다는 다른 계약들(`settings`·`interests`·`drip-feedback`)과 맞춘다(기능 문서 4.3을 함께 고쳤다).
- **구매와 복원을 한 엔드포인트로 합치지 않는다.** 서버가 하는 검증은 같지만 **결과 없음의 뜻이 다르다** — 구매 제출에서 유효한 거래가 없으면 오류(위조·만료된 영수증)이고, 복원에서 없으면 정상 응답("복원할 구독이 없어요")이다. 한 엔드포인트가 두 뜻을 가지면 화면이 요청 맥락을 기억해 갈라야 한다.
- **결제 의도는 멱등키가 아니라 "계정 결속 토큰"이다.** `domain.md` 8.3은 "결제 버튼 연타 방지 멱등키"라고 적었지만, 연타로 인한 이중 결제는 스토어 결제 시트가 스스로 막는다. 의도 행의 실질적 쓸모는 ① 결제 전 서버 관문(이메일 인증 — FR-39) ② **스토어 거래를 이 계정에 묶는 것**이다 — 의도 `id`(UUID)를 iOS `appAccountToken` / Android `obfuscatedAccountId`로 결제에 실어 보내면 스토어가 서명한 거래 안에 그 값이 들어온다. 남의 영수증을 주워 제출하는 것을 서명 수준에서 막는다(7장).
- **해지 엔드포인트가 없다.** 스토어 구독은 앱이 해지할 수 없다(`subscription.md` 4.5).
- **웹훅은 `/webhooks/*`에 따로 둔다.** 사용자 인증이 없고 호출자가 스토어라 레이트리밋·가드 구성이 다르다.

---

## 4. 엔드포인트 상세

### 4.1 `GET /plans`

페이월 시트·요금제 관리 화면이 3티어 비교 카드를 그릴 때 호출한다. 응답을 받은 뒤 클라이언트는 `store_product_id`로 **스토어 SDK에서 현지 가격을 조회해 병합**한다(`subscription.md` 4.2-1).

**Request** — `?platform=ios|android` (필수)

**Response 200**

```json
{
  "plans": [
    {
      "plan_id": "uuid-light", "tier": "light", "name": "Light", "description": "하루 2편까지 들을 수 있어요",
      "price_krw": 0, "store_product_id": null,
      "entitlements": { "daily_play_limit": 2, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": true },
      "action": "current"
    },
    {
      "plan_id": "uuid-daily", "tier": "daily", "name": "Daily", "description": "하루 5편까지 들을 수 있어요",
      "price_krw": 3900, "store_product_id": "com.runtime.ear.subscription.daily.monthly",
      "entitlements": { "daily_play_limit": 5, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": false },
      "action": "purchase"
    },
    {
      "plan_id": "uuid-pro", "tier": "pro", "name": "Pro", "description": "제한 없이 마음껏 들을 수 있어요",
      "price_krw": 9900, "store_product_id": "com.runtime.ear.subscription.pro.monthly",
      "entitlements": { "daily_play_limit": null, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": false },
      "action": "purchase"
    }
  ],
  "is_email_verified": false
}
```

| 필드 | 의미 |
|---|---|
| `plans[]` | `is_active = true`인 요금제, `display_order` 오름차순(낮은 티어 → 높은 티어). **무료(`light`)도 포함한다** — 비교 카드에 필요하다 |
| `store_product_id` | 요청 `platform`의 상품 ID(`plans.store_product_id_ios` / `_android`). 무료 티어·그 플랫폼에 상품이 없는 요금제는 `null` |
| `price_krw` | **참고값.** 화면에는 스토어 SDK가 반환한 현지 가격을 그린다(`subscription.md` 7). SDK 조회가 실패했을 때의 폴백으로도 쓰지 않는다 — "요금제를 불러올 수 없어요"다(5장) |
| `action` | 이 사용자가 그 요금제에 대해 할 수 있는 일 — **서버가 판정한다**. 아래 표 |
| `is_email_verified` | `email IS NOT NULL AND is_email_verified = true`. `false`면 [구독하기] 탭 시 이메일 등록·인증 화면을 먼저 연다(FR-39) — 4.3이 다시 판정한다 |

**`action`** — 클라이언트는 티어 순서를 스스로 비교하지 않는다.

| 값 | 조건 | 버튼 |
|---|---|---|
| `purchase` | 유효한 구독이 없고 유료 요금제 | [구독하기] |
| `current` | 현재 구독 중인 요금제, 또는 **유효한 구독이 없는 사용자의 무료 요금제**(2026-10-06 — KAN-147. 가입 체험 중이어도 같다 — 체험은 4.2 `plan.trial`이 따로 알린다) | "이용 중" 표시 |
| `upgrade` | 현재보다 높은 티어 | [업그레이드] — 즉시 적용(스토어 비례 정산) |
| `downgrade` | 현재보다 낮은 **유료** 티어 | [변경] — "다음 결제일부터 적용돼요" 안내 |
| `cancel` | **유료 구독자**(구독 중 · 결제 문제 유예 · **해지 예약 중**)의 무료 요금제 — 유료 → 무료는 해지다(2026-10-08 PM — KAN-159). 해지 예약 중에도 고를 수 있다 — 스토어 구독 관리에서 종료일을 확인하는 경로다(2026-10-08 팀 결정: 막아 두면 "언제 무료가 되는지"를 알 길이 없었다) | 고를 수 있다 → [{이름}로 변경] = **스토어 구독 관리로 이동**(해지 API 없음). 요금제 관리 화면에서만, 페이월에서는 고를 수 없다 |
| `none` | 다른 스토어 구독자의 모든 요금제, 또는 그 플랫폼에 상품이 없는 유료 요금제. (종전 "유료 구독자에게 무료 티어"·"해지 예약 중인 구독자의 무료 티어"는 2026-10-08 `cancel` 로 옮겼다) | 버튼 없음 |

- **다른 스토어에서 결제한 구독자**(예: Android에서 구독하고 iOS로 접속): 유료 요금제 전부 `none`이다. 한 계정에 두 스토어 구독을 겹치지 않는다. 화면은 4.2의 `store`로 "Google Play에서 구독 중이에요"를 안내한다.
- **표시 문구는 DB 값이다**(`plans.name`·`description` — `domain.md` 8.1). 2026-10-06 PM 결정으로 `Light` / `Daily` / `Pro`, 설명은 "하루 2편까지 들을 수 있어요" / "하루 5편까지 들을 수 있어요" / "제한 없이 마음껏 들을 수 있어요"(마이그레이션 `RenamePlanDisplayNames`). 화면은 이 값을 그대로 그린다 — 앱에 티어명을 두지 않는다.
- 비활성(`is_active = false`) 요금제는 목록에서 빠진다. 그 요금제의 기존 구독자는 만료까지 유지되며(`subscription.md` 7), 이때 응답에 `current`인 항목이 없을 수 있다 — 현재 구독 표시는 4.2가 한다.

**에러** — `VALIDATION_FAILED`(400): `platform` 누락·오값.

---

### 4.2 `GET /users/me/subscription`

**앱 실행 시·포그라운드 복귀 시** 호출한다(`subscription.md` 4.3). 결제 직후에는 4.4의 응답이 같은 본문을 주므로 다시 부르지 않는다. `Cache-Control: no-store`.

**Response 200**

```json
{
  "plan": {
    "status": "subscribed", "tier": "pro", "plan_name": "프로", "daily_play_limit": null,
    "renews_at": "2026-11-02T03:00:00Z", "expires_at": null, "has_payment_issue": false,
    "trial": null, "grant": null
  },
  "entitlements": { "daily_play_limit": null, "daily_drip_count": 2, "drip_enabled": true, "ads_enabled": false },
  "store": "app_store",
  "pending_plan": null
}
```

| 필드 | 의미 |
|---|---|
| `plan` | 구독 요약 — `profile-api.md` 4.1과 같은 모양(2장). 무료면 `status: "free"`, `tier: "light"`. 가입 체험 중인 무료 계정은 `tier: "trial"` + `trial` 객체(2장) |
| `entitlements` | **현재 유효한** 티어의 권한(2장). 해지 예약·유예 중에는 유료 티어의 값이다 |
| `store` | `app_store` \| `play_store` \| `null`(무료). [구독 해지]·[결제 수단 확인]을 어느 스토어로 보낼지의 근거 |
| `plan.grant` | **초대 코드 지급** 중이면 `{ "name", "tier", "plan_name", "ends_at", "last_date" }`, 아니면 `null`(4.8 — 2026-10-10). 프로필·설정의 `plan.grant`와 같다 |
| `pending_plan` | **다운그레이드 예약**이 있으면 `{ "tier", "plan_name", "effective_at" }`, 없으면 `null`. `effective_at`은 현재 결제 주기 만료 시각이다(`subscription.md` 4.4 — "언제부터 적용되는지" 표시) |

- **`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다**(`domain.md` 8.2). 프로필·설정과 같은 규칙이다.
- **만료 보정** — 알림 유실 대비(`subscription.md` 7). 조회 시점에 비종결 행(`active`·`grace`·`cancelled`)의 `expires_at`이 **1시간 넘게 지나 있으면** 서버가 스토어에 그 구독의 현재 상태를 조회해 반영한 뒤 응답한다. 스토어 조회가 실패하면 **저장된 상태 그대로 응답한다** — 섣불리 추측으로 강등하지 않는다(유예·갱신 지연을 만료로 오판하면 결제한 사용자가 막힌다). 같은 보정을 하루 1회 배치도 돌린다.
  - **상한 — 7일**(2026-10-06). 스토어에 **확인할 수 없는 채로**(조회 키 미구성 · 스토어가 그 구독을 모름 · 조회 실패 지속 · 상품을 모름) `expires_at`이 **7일 넘게** 지난 비종결 행은 `expired`로 내리고 `users.tier`를 맞춘다. 상한이 없으면 그런 행은 영영 유료로 남고, 매 배치의 앞자리를 차지해 다른 행의 보정을 민다. 7일은 App Store가 실패한 알림을 다시 보내는 기간(1·12·24·48·72시간 뒤, 합 약 6.5일)을 넘긴 값이다 — 그 뒤에는 늦은 갱신 알림이 올 가능성이 없다. 유예 기간은 이미 `expires_at`에 들어 있다(4.6).
  - 상한으로 내릴 때 **`last_notified_at`은 건드리지 않는다** — 스토어가 말한 사실이 아니라 서버의 추정이라, 뒤늦게 온 갱신 알림·거래(영수증 제출·복원)가 그대로 되살린다. 내릴 때마다 경고 로그를 남기고 **Slack 결제 알림 채널에 한 줄 올린다**(`backend-monitoring.md` 3-6 "구독 강제 만료", 2026-10-07) — 잦으면 조회 구성(키·환경)이 빠진 것이고, 결제 사용자가 내려간 것일 수 있어 사람이 봐야 한다.
  - 조회가 상태를 바꾸는 유일한 경우다. 그 밖에는 조회가 쓰기를 유발하지 않는다.
- 이 응답의 `entitlements`와 라이브러리·탐색 응답의 `daily_play_limit`(`library-api.md` 2장)은 **같은 `plans` 행에서 온다.**

**에러** — 없음(401·5xx는 공통 규칙).

---

### 4.3 `POST /users/me/subscription/purchase-intents`

[구독하기]·[업그레이드]·[변경] 탭 → **스토어 결제 시트를 열기 직전**에 호출한다.

**Request**

```json
{ "plan_id": "uuid-pro", "platform": "ios", "entry_point": "paywall" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `plan_id` | uuid | 필수 | 4.1의 `plan_id` |
| `platform` | `ios` \| `android` | 필수 | |
| `entry_point` | `paywall` \| `settings` \| `onboarding` | 선택 | 전환 분석용. **판정에 쓰지 않는다** |

**Response 201**

```json
{ "intent_id": "8f0c…-uuid", "store_product_id": "com.runtime.ear.subscription.pro.monthly", "account_token": "8f0c…-uuid" }
```

| 필드 | 의미 |
|---|---|
| `intent_id` | `purchase_intents.id`. 4.4에 되돌려 보낸다 |
| `store_product_id` | 결제 시트에 넘길 상품 ID |
| `account_token` | **결제에 반드시 실어 보낸다** — iOS StoreKit 2 `appAccountToken`(UUID), Android Billing `setObfuscatedAccountId`. 값은 `intent_id`와 같다. 스토어가 서명한 거래에 이 값이 담겨 돌아오고, 서버는 그것으로 거래의 주인을 확인한다(7장) |

**판정 순서**

1. **이메일 인증**(FR-39) — `email IS NOT NULL AND is_email_verified = true`가 아니면 `EMAIL_REQUIRED_FOR_PURCHASE`. 결제만 되고 이메일이 없는 상태를 만들지 않는다(`auth-api.md` 6장)
2. **요금제** — 존재하고 `is_active = true`이며 유료이고 요청 `platform`의 상품 ID가 있어야 한다. 아니면 `SUBSCRIPTION_PLAN_UNAVAILABLE`
3. **다른 스토어 구독 중** — 유효한 구독의 `store`가 요청 플랫폼과 다르면 `SUBSCRIPTION_STORE_MISMATCH`(두 스토어에 이중 결제 방지)
4. 통과 → `purchase_intents(status = created)` 행 생성

- 같은 요금제로 여러 번 호출해도 된다 — 매번 새 행이다. 결제 시트를 닫고 다시 여는 흐름을 막지 않는다. `created`로 남은 행은 30일 뒤 정리한다.
- **현재와 같은 요금제**(`action = current`)에 대한 요청도 2번에서 거부하지 않는다 — 만료 뒤 재구독(같은 상품 재구매)이 같은 경로이기 때문이다. 이미 유효한 구독이면 스토어가 "이미 구독 중"으로 막는다.

**에러**

| 코드 | HTTP | 조건 |
|---|---|---|
| `EMAIL_REQUIRED_FOR_PURCHASE` | 409 | 인증된 이메일 없음 |
| `SUBSCRIPTION_PLAN_UNAVAILABLE` | 400 | 없는·비활성·무료 요금제, 또는 그 플랫폼 상품 ID 없음 |
| `SUBSCRIPTION_STORE_MISMATCH` | 409 | 다른 스토어에서 구독 중 |

---

### 4.4 `POST /users/me/subscription/purchases`

스토어 결제가 성공한 직후, 그리고 **앱 실행 시 미완료(unfinished/pending) 거래가 남아 있을 때** 호출한다. 서버 검증이 성공(200)한 뒤에만 클라이언트가 거래를 `finish`(iOS) / 종료한다 — Android의 `acknowledge`는 **서버가 한다**(7장).

**Request — iOS**

```json
{ "platform": "ios", "intent_id": "8f0c…-uuid", "signed_transaction": "eyJhbGciOiJFUzI1NiIsIng1YyI6Wy4uLl19…" }
```

**Request — Android**

```json
{ "platform": "android", "intent_id": "8f0c…-uuid", "purchase_token": "kjhgf…", "product_id": "com.runtime.ear.subscription.pro.monthly" }
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `platform` | 필수 | |
| `intent_id` | 선택 | 4.3의 값. 앱 재실행 뒤 미완료 거래를 제출할 때는 모를 수 있다 — 그래도 서버는 서명된 거래 안의 계정 토큰으로 주인을 확인한다 |
| `signed_transaction` | iOS 필수 | StoreKit 2 `Transaction`의 JWS 표현(`jwsRepresentation`). **StoreKit 1 영수증(base64)은 받지 않는다** |
| `purchase_token` · `product_id` | Android 필수 | Billing Library의 `Purchase.purchaseToken` · 상품 ID |

**Response 200** — 4.2와 **같은 본문**. 클라이언트는 이 값으로 화면을 확정한다(다시 조회하지 않는다).

**서버 처리**

1. **서명 검증** — iOS: JWS의 인증서 체인을 Apple 루트까지 검증하고 `bundleId`·환경을 확인한다. Android: Google Play Developer API(`purchases.subscriptionsv2.get`)로 토큰을 조회한다. **클라이언트가 보낸 평문 필드(상품 ID 등)는 신뢰하지 않는다** — 서명된 거래·스토어 응답의 값만 쓴다
2. **상품 → 요금제** — 거래의 상품 ID를 `plans.store_product_id_*`에서 찾는다. 없으면 `SUBSCRIPTION_RECEIPT_INVALID`
3. **주인 확인**(7장) — 거래에 계정 토큰이 있고 그것이 **다른 살아 있는 사용자**의 `purchase_intents.id`면 `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT`. 그 거래의 `original_transaction_id`가 이미 다른 계정의 `subscriptions`에 있어도 같다. **예외**(2026-10-06): 그 행이 이미 끝난 구독(`expired`·`refunded`)이고 거래의 계정 토큰이 **요청자의** 결제 의도면 통과시키고, 반영할 때 행을 요청자에게 넘긴다(7장 "끝난 구독의 재결제")
4. **유효성** — 이미 만료·환불된 거래면 `SUBSCRIPTION_RECEIPT_INVALID`(구매 제출인데 유효한 구독이 아니다). **iOS — 처음 연결하는 구독은 Apple에 지금 상태를 묻는다**(2026-10-06): 그 `original_transaction_id`의 행이 없거나 끝난 행뿐이면 App Store Server API로 현재 상태를 조회해, 만료·결제 재시도·환불이면 `SUBSCRIPTION_RECEIPT_INVALID`(복원에서는 무시), 유효·유예면 **조회한 상태로** 반영한다(자동 갱신 여부·유예·변경 예약까지 맞는다). 서명된 거래는 "그때 그런 결제가 있었다"일 뿐이고, 행이 없던 동안의 환불·해지 알림은 반영할 곳이 없어 사라지기 때문이다(탈퇴 → 재가입, 영수증 제출 전에 온 알림). 조회할 수 없거나(API 키 미구성) 실패하거나 Apple이 모르면 **결제를 막지 않고** 종전대로 거래만으로 판정한다(경고 로그). Apple의 답에 실린 최신 거래가 제출된 거래보다 옛것일 때도 같다 — 그 답은 방금 한 결제를 아직 모른다
5. **반영** — `original_transaction_id` 기준 upsert로 `subscriptions`를 만들거나 갱신하고, **같은 트랜잭션에서 `users.tier`를 갱신한다.** 의도 행이 있으면 `verified`로 바꾼다
6. Android: 미확인 구매면 서버가 `acknowledge`한다(3일 안에 확인하지 않으면 Google이 자동 환불한다). **순서는 반영(커밋) → 확인이다.** 확인이 실패하면 구독은 이미 반영된 채로 `SUBSCRIPTION_STORE_UNAVAILABLE`(503)을 답한다 — 클라이언트가 거래를 끝내지 않고 다시 제출하면 그때 확인을 마친다(반영은 멱등이라 두 번 해도 같다)

**Android의 검증은 iOS와 다르다** — 구매 토큰은 서명된 사실이 아니라 열쇠다. 서버가 그 토큰으로 Google에 **현재 상태를 조회해** 그대로 반영한다(4.7). 그래서 유효성도 Google의 상태로 판정한다: `ACTIVE`·`IN_GRACE_PERIOD`·만료 전 `CANCELED`만 받고, 결제 대기(`PENDING`)·보류(`ON_HOLD`)·만료는 `SUBSCRIPTION_RECEIPT_INVALID`다(복원에서는 무시). Google이 그 토큰을 모르면(400·404·410) 위조로 본다.

- **한 계정에 살아 있는 Play 구독은 하나다**(2026-10-07, KAN-130). Apple은 구독 그룹이 "하나만"을 보장하지만 Google은 Pro·Daily가 독립 정기 결제라 둘 다 살 수 있다. 정상 경로는 요금제를 바꿀 때 앱이 **이전 구매 토큰을 넘겨 교체**하는 것이고, 그러면 Google이 새 토큰에 `linkedPurchaseToken`을 붙여 서버가 같은 구독 행에 이어 붙인다(4.7 "구독 행의 키"). 그 밖의 경우 — 요청자에게 **같은 스토어의 살아 있는 구독 행이 이미 있고 이 구매가 그 행에 이어지지 않으면**(`original_transaction_id`가 다름) — 두 번째 구독이다. 영수증 제출은 `SUBSCRIPTION_ALREADY_SUBSCRIBED`(409)로 거부하고 **구매를 확인(acknowledge)하지 않는다** — 확인되지 않은 구매는 Google이 3일 안에 자동 환불한다. Slack 결제 알림에 올린다(3-6). 복원(4.5)은 거부하지 않는다 — 이미 두 개를 산 사람의 연결을 막아도 돈이 돌아오지 않는다. iOS는 Apple이 막아 주므로 해당 없다

- **같은 거래의 재전송은 같은 결과다**(멱등). 업그레이드처럼 같은 `original_transaction_id`에 새 거래가 오면 그 행을 갱신한다.
- **업그레이드는 즉시 반영된다.** 다운그레이드는 스토어가 "다음 갱신부터"로 예약하므로, 제출된 거래의 티어는 그대로이고 `pending_plan`이 채워진다(S2S 알림으로도 들어온다 — 4.6).
- 5번이 실패(DB)하면 5xx다 — 클라이언트는 거래를 끝내지 않고 재시도한다. **결제는 됐는데 티어가 안 붙은 채 거래가 닫히는 일이 없어야 한다**(`subscription.md` 7).

**에러**

| 코드 | HTTP | retryable | 조건 |
|---|---|---|---|
| `SUBSCRIPTION_RECEIPT_INVALID` | 400 | false | 서명 불일치·번들 불일치·허용하지 않는 환경·모르는 상품·만료/환불된 거래 |
| `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT` | 409 | false | 다른 계정에 연결된 스토어 구독 |
| `SUBSCRIPTION_ALREADY_SUBSCRIBED` | 409 | false | Android — 같은 스토어에 살아 있는 구독이 있는데 교체가 아닌 두 번째 구독(위 "한 계정에 살아 있는 Play 구독은 하나다"). 구매를 확인하지 않는다 |
| `SUBSCRIPTION_STORE_UNAVAILABLE` | 503 | **true** | 스토어 API 조회 실패(주로 Android — iOS는 서명만으로 검증이 끝난다). 거래를 끝내지 않고 재시도 |

---

### 4.5 `POST /users/me/subscription/restore`

요금제 관리·페이월 맨 아래 '이용약관 · 개인정보처리방침 · 구매 복원' 줄의 [구매 복원](개정 2026-10-09 — KAN-146). 클라이언트가 스토어 SDK에서 **현재 유효한 구독 거래**를 모아 보낸다(iOS `Transaction.currentEntitlements`, Android `queryPurchasesAsync`).

**Request**

```json
{ "platform": "ios", "signed_transactions": ["eyJ…", "eyJ…"] }
```
```json
{ "platform": "android", "purchases": [ { "purchase_token": "kjhgf…", "product_id": "com.runtime.ear.subscription.pro.monthly" } ] }
```

- 배열은 **0~10건**. 스토어에 유효한 구독이 없으면 빈 배열을 보낸다(요청 자체는 한다 — 서버가 "없음"을 답한다).

**Response 200**

```json
{ "restored": true, "subscription": { "plan": { … }, "entitlements": { … }, "store": "app_store", "pending_plan": null } }
```

| 필드 | 의미 |
|---|---|
| `restored` | 이 요청으로 유효한 구독이 이 계정에 연결돼 있으면 `true`(이미 연결돼 있던 경우 포함). 유효한 구독이 하나도 없으면 `false` — 화면은 "복원할 구독이 없어요" |
| `subscription` | 4.2와 같은 본문(복원 후 상태) |

**서버 처리** — 각 거래에 4.4의 1~3번 검증을 하고, **유효한(만료·환불되지 않은) 것만** 반영한다. 여러 개면 가장 높은 티어·가장 늦은 만료가 현재 구독이 된다.

- **만료·환불된 거래는 오류가 아니라 무시한다** — 복원은 "지금 살아 있는 것을 찾아 달라"는 요청이다.
- **다른 계정에 연결된 구독이 하나라도 있으면 요청 전체가 `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT`다.** 기존 연결을 해제하지 않는다(구독 공유 어뷰징 방지 — `subscription.md` 4.6).
- **탈퇴 후 재가입 복원이 이 경로다**(`subscription.md` 7 · `auth.md` 7). 이전 계정이 파기돼 `subscriptions`에서 그 `original_transaction_id`가 풀려 있으므로 연결된다. 근거는 앱 계정이 아니라 **스토어가 서명한 거래**다 — 그 거래를 제출할 수 있는 것은 그 스토어 계정의 주인뿐이다. 그래서 **클라이언트가 적어 보낸 거래 ID만으로는 복원하지 않는다**(7장).

**에러**

| 코드 | HTTP | retryable | 조건 |
|---|---|---|---|
| `SUBSCRIPTION_RECEIPT_INVALID` | 400 | false | 서명 불일치·번들 불일치 등 **위조로 보이는** 거래가 섞임(만료·환불은 해당 없음) |
| `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT` | 409 | false | 다른 계정에 연결된 구독 |
| `SUBSCRIPTION_STORE_UNAVAILABLE` | 503 | true | 스토어 API 조회 실패 |

---

### 4.6 `POST /webhooks/app-store` — App Store Server Notifications V2

Apple이 호출한다. 본문은 `{ "signedPayload": "<JWS>" }`. App Store Connect에 **프로덕션·샌드박스 URL을 각각** 등록한다(같은 경로, 서버가 페이로드의 환경으로 가른다 — 7장).

**응답**

| 상황 | 응답 |
|---|---|
| 서명 검증 성공 + 처리 성공(또는 **이미 처리한 알림**) | `200` 빈 본문 |
| 서명 검증 실패·형식 오류 | `400` — Apple은 재시도하지만 결과는 같다. 로그에 남긴다 |
| 처리 중 일시 실패(DB 등) | `5xx` — **Apple이 재시도한다**(최대 5회, 간격이 늘어난다). 그래서 성공하기 전에는 200을 주지 않는다 |

**처리**

1. `signedPayload` 서명 검증 → `notificationUUID`로 `store_notification_logs`에 적재(처리 트랜잭션 밖 — 처리가 실패해도 받았다는 기록은 남는다). **유니크 충돌이고 그 행의 `processed_at`이 있으면 이미 처리한 알림이므로 200으로 끝낸다.** `processed_at`이 비어 있으면 받기만 하고 처리에 실패했던 알림이라 다시 처리한다(`domain.md` 8.4)
2. 페이로드의 `signedTransactionInfo` · `signedRenewalInfo`(각각 JWS)를 검증해 구독 상태를 환산한다
3. `original_transaction_id`로 `subscriptions` 행을 찾아 반영하고 `users.tier`를 갱신한다. **행이 없으면**(영수증 제출보다 알림이 먼저 도착) 거래의 계정 토큰으로 사용자를 찾아 행을 만든다. 토큰도 없으면 `processed_at`을 비워 둔 채 200으로 받고, 이후 영수증 제출·복원이 연결한다
4. 처리 완료 시 `processed_at` 기록

**알림 유형 → `subscriptions.status`** (`domain.md` 8.2의 의미로 환산한다 — 스토어 용어를 그대로 옮기지 않는다)

| `notificationType` (`subtype`) | 반영 |
|---|---|
| `SUBSCRIBED` (`INITIAL_BUY` · `RESUBSCRIBE`) | `active`, 만료일 설정 |
| `DID_RENEW` (· `BILLING_RECOVERY`) | `active`, 만료일 연장 |
| `DID_CHANGE_RENEWAL_STATUS` (`AUTO_RENEW_DISABLED`) | **`cancelled`**(해지 예약 — 만료일까지 유효), `is_auto_renew = false` |
| `DID_CHANGE_RENEWAL_STATUS` (`AUTO_RENEW_ENABLED`) | `active`, `is_auto_renew = true` |
| `DID_CHANGE_RENEWAL_PREF` (`UPGRADE`) | 티어 즉시 변경, `pending_tier` 비움 |
| `DID_CHANGE_RENEWAL_PREF` (`DOWNGRADE`) | 티어 유지, **`pending_tier`** = 다음 갱신 티어 |
| `DID_CHANGE_RENEWAL_PREF` (subtype 없음) | 예약 취소 — `pending_tier` 비움 |
| `DID_FAIL_TO_RENEW` (`GRACE_PERIOD`) | **`grace`** — 혜택 유지, `has_payment_issue` |
| `DID_FAIL_TO_RENEW` (subtype 없음 — 유예 기간 없음) | `expired` → `users.tier = light`. 재청구가 성공하면 `DID_RENEW`로 돌아온다 |
| `GRACE_PERIOD_EXPIRED` · `EXPIRED` (전 subtype) | `expired` → `users.tier = light`. **유예 중인 구독은 거래의 만료일을 저장된 종료일과 비교하지 않고 반영한다**(7장 — 유예 중에는 종료일이 유예 종료일로 밀려 있다) |
| `REFUND` · `REVOKE` | **`refunded`** → **즉시** `users.tier = light`(`subscription.md` 4.7) |
| `REFUND_REVERSED` | 만료 전이면 `active` 복구 |
| `RENEWAL_EXTENDED` | 만료일만 갱신 |
| 그 밖(`TEST` · `PRICE_INCREASE` · `CONSUMPTION_REQUEST` · `ONE_TIME_CHARGE` 등) | 적재만 하고 상태를 바꾸지 않는다 |
| 거래 본문(`data`)이 없는 알림 — `RENEWAL_EXTENSION`(`SUMMARY`) · `RESCIND_CONSENT` · `EXTERNAL_PURCHASE_TOKEN` | 적재만 하고 200으로 끝낸다(2026-10-06). 이 알림들은 환경을 `data`가 아니라 `summary` · `appData`에 싣고, 외부 구매 토큰은 식별자 접두사(`SANDBOX`)로 가린다 — **환경을 `data`에서만 읽으면 "받지 않는 환경"으로 400이 되어 Apple이 며칠간 재전송한다** |

- 만료·환불로 `users.tier`가 내려갈 때 라이브러리·드립은 건드리지 않는다(`subscription.md` 4.5).
- **알림 순서가 뒤바뀔 수 있다.** 반영 전에 페이로드의 `signedDate`가 그 행에 마지막으로 반영한 알림보다 과거면 상태를 덮지 않는다(적재는 한다).

---

### 4.7 `POST /webhooks/play-store` — Google Play Real-time Developer Notifications

Google Cloud Pub/Sub **push 구독**이 호출한다. 본문은 Pub/Sub 메시지 봉투(`message.data`가 base64 JSON)다.

- **검증** — Pub/Sub push의 OIDC 토큰(`Authorization: Bearer`)을 Google 공개키로 검증하고(서명·만료·`aud`), 발급자가 Google이고 `email`이 구성된 발신 서비스 계정이며 `email_verified`인지 본다. 본문의 `packageName`도 우리 앱과 대조한다(7장). 검증값이 구성되지 않은 서버는 어떤 알림도 받지 않는다(400)
- **본문 형식** — `message.data`(base64)와 `message.messageId`(또는 `message_id`)만 읽는다. Pub/Sub은 같은 값을 두 표기로 함께 보내고 `attributes`·`deliveryAttempt` 등을 더 싣는데, 이 엔드포인트는 모르는 필드를 거부하지 않는다. 두 값이 없으면 `VALIDATION_FAILED`(400)
- **중복** — `messageId`를 `notification_id`로 `store_notification_logs`에 적재(유니크). `processed_at`이 있으면 200으로 끝내고, 비어 있으면 다시 처리한다(4.6과 같은 규칙)
- **알림은 신호일 뿐이다.** 본문에는 `purchaseToken`과 유형 번호만 있으므로, 서버가 `purchases.subscriptionsv2.get`으로 **현재 상태를 조회해** 반영한다. 그래서 알림의 순서가 뒤바뀌어도 결과가 같다(마지막에 조회한 상태가 맞는 상태다). 조회 실패는 5xx로 답해 Pub/Sub가 재전송하게 한다
- **처리 완료 표시는 구매 확인(acknowledge)까지 끝난 뒤에 한다.** 반영만 하고 완료로 표시하면, 확인이 실패했을 때 재전송된 알림이 "이미 처리함"으로 걸러져 그 구매를 다시 확인할 기회가 없다
- **주인을 모르는 구매**(구독 행도 계정 토큰도 없음)는 반영도 확인도 하지 않고 `processed_at`을 비워 둔다 — 이후 영수증 제출·복원이 연결한다. 주인 없는 구매를 확인하면 "결제됐는데 아무 계정에도 없음"이 굳는다
- **두 번째 구독의 알림**(2026-10-07) — 주인은 찾았지만 그 사용자에게 같은 스토어의 살아 있는 구독 행이 따로 있고 이 구매가 그 행에 이어지지 않으면(4.4의 규칙과 같다) 반영도 확인도 하지 않고 `processed_at`은 기록한다(재전송돼도 같은 판정이다). 확인하지 않으므로 Google이 3일 안에 자동 환불한다. Slack 결제 알림에 올린다
- 응답: 4.6과 같다(성공·중복 200, 검증 실패 400, 일시 실패 5xx)

**`subscriptionState` → `subscriptions.status`**

| Play 상태 | 반영 |
|---|---|
| `SUBSCRIPTION_STATE_ACTIVE` | `active` (자동 갱신이 꺼져 있으면 `cancelled`) |
| `SUBSCRIPTION_STATE_CANCELED` | **`cancelled`** — Play의 "canceled"는 해지 예약이다(만료 전 유효). 만료일이 지났으면 `expired` |
| `SUBSCRIPTION_STATE_IN_GRACE_PERIOD` | `grace` — 종료일은 Google이 준 만료 시각(유예 종료) |
| `SUBSCRIPTION_STATE_ON_HOLD` · `PAUSED` · `EXPIRED` · `PENDING_PURCHASE_CANCELED` | `expired` → `users.tier = light` |
| `SUBSCRIPTION_STATE_PENDING` | 반영하지 않는다 — 결제 대기라 아직 구독이 아니다 |
| 철회 알림(`subscriptionNotification.notificationType = 12`) · 구독 환불 통지(`voidedPurchaseNotification`, `productType = 1`) | `refunded` → 즉시 `light`. **구독 상태만으로는 만료와 구분되지 않아** 알림이 알려 줄 때만 환불로 본다. **환불로 내린 구독은 같은 구매 토큰·같은 결제 주기로는 되살리지 않는다**(2026-10-06) — 아래 "환불의 고정" |
| 다운그레이드 예약(`lineItems[].deferredItemReplacement`) | 티어 유지, `pending_tier` = 다음 갱신 티어 |
| `testNotification` · 그 밖 | 적재만 하고 상태를 바꾸지 않는다 |

**환불의 고정**(2026-10-06, 개정 2026-10-07) — "마지막에 조회한 상태가 맞는 상태다"의 유일한 예외다. Google의 구독 상태에는 환불이 보이지 않아, `refunded`로 내린 뒤에도 그 토큰을 조회하면 `ACTIVE`나 `EXPIRED`로 답할 수 있다. 그대로 반영하면 뒤따르는 다른 알림·복원·재제출이 환불을 지운다. 그래서 `refunded`인 행에 **같은 구매 토큰**(`latest_receipt`)·**같은 주문 ID**(`latest_order_id` = Google `latestOrderId`)의 조회 결과가 오면 반영하지 않는다 — 영수증 제출은 `SUBSCRIPTION_RECEIPT_INVALID`, 복원은 무시(확인도 하지 않는다). 되살아나는 것은 **돈이 다시 들어왔을 때**뿐이다: ① 새 구매 토큰(재구독·요금제 변경) ② 같은 토큰이지만 주문 ID가 바뀌었다(Google은 갱신·재청구 성공마다 새 주문 ID를 발급한다). 주문 ID를 모르는 행(개정 전 기록)은 종전 규칙 — `ACTIVE`이고 만료 시각이 환불 당시보다 뒤로 간 경우 — 로 판정한다. 종전 규칙만으로는 유예 중 환불 뒤 재청구가 성공해도 새 만료 시각이 유예 종료일(환불 당시 저장값)을 넘지 못해 되살아나지 않는 경우가 있었다(유예 길이 ≈ 결제 주기). App Store에는 이 규칙이 없다 — 상태 조회가 환불을 직접 답한다.

**구독 행의 키** — Play에는 `original_transaction_id`가 없다. **그 구독의 최초 `purchaseToken`을 `original_transaction_id`로 쓰고**, 마지막으로 반영한 토큰을 `latest_receipt`에 둔다. 업·다운그레이드·재구독으로 새 토큰이 발급되면 다음 순서로 기존 행을 찾아 같은 행을 갱신한다(행이 늘지 않는다).

1. 그 토큰이 이미 어느 행의 `original_transaction_id`이거나 `latest_receipt`이면 그 행
2. 응답의 `linkedPurchaseToken`(이전 토큰)이 어느 행의 `original_transaction_id`이거나 `latest_receipt`이면 그 행 — 이전 토큰은 최초 토큰이 아니라 중간에 한 번 바뀐 토큰일 수 있어 둘 다로 찾는다
3. 어디에도 없으면 새 구독 — 그 토큰이 키가 된다

- **교체된 옛 토큰의 종결은 구독의 종결이 아니다**(2026-10-08 — 개발계 실측). 요금제 변경 직후 Google은 옛 토큰에 `SUBSCRIPTION_EXPIRED`(13)를 보내고, 그 알림은 사슬을 따라 **같은 행**으로 들어온다. 행이 이미 다른(새) 토큰으로 살아 있고 들어온 토큰이 그보다 먼저 끝나는 것이면, 그 토큰의 `EXPIRED`·결제 재시도·환불은 **무시한다**(`ignore: replaced_token`). 그대로 반영했더니 Daily→Pro 업그레이드가 3초 뒤 `expired`·light 로 떨어졌다. 지금 토큰의 종결, 더 늦게 끝나는 토큰, 이미 끝난 행은 종전 규칙대로다
- **끝난 토큰은 두 번째 구독이 아니다**(2026-10-08 — 개발계 실측). 요금제를 여러 번 바꾸면 사슬 A → B → C → D 가 생기고 행은 최초(A)·마지막(D)만 기억한다. 사슬 **중간** 토큰(C)의 늦은 만료 알림은 C 도, C 의 이전 토큰(B)도 행에 없어 위 1·2로 찾지 못하고 "새 구독"이 된다. 이때 그 사용자에게 살아 있는 행이 있어도 **들어온 구매가 이미 끝났으면(만료·환불·결제 재시도) 두 번째 구독으로 보지 않고** `ignore: replaced_token`으로 넘긴다 — 행을 만들지 않고 Slack 결제 경보도 내지 않는다. 종전에는 요금제를 두세 번 바꿀 때마다 거짓 "두 번째 구독 거부" 경보가 났다. 살아 있는(유효·유예) 두 번째 구독만 4.4대로 거부·경보한다

- **환경** — 응답에 `testPurchase`가 있으면(라이선스 테스터) `environment = sandbox`, 없으면 `production`이다. Play는 서비스 계정 하나로 둘 다 조회되므로 서버가 받는 환경을 따로 설정하지 않는다
- **만료 보정**(4.2)은 그 행의 `latest_receipt`로 같은 조회를 한다

---

### 4.8 초대 코드 지급 — 규칙과 `plan.grant` (2026-10-10)

규칙의 원본은 `subscription.md` 4.9, 저장은 `domain.md` 8.5·8.6이다.

**`plan.grant`** — 구독 조회(4.2)·프로필(`profile-api.md` 4.1)·설정(`settings-api.md` 4.1)의 `plan`에 같은 모양으로 실린다(조립 함수 하나).

```json
"grant": {
  "name": "산군 PoC",
  "tier": "pro",
  "plan_name": "Pro",
  "ends_at": "2026-11-08T19:00:00Z",
  "last_date": "2026-11-08"
}
```

| 필드 | 의미 |
|---|---|
| `name` | 코드(캠페인) 이름. 화면에 쓸지는 클라이언트가 정한다 |
| `tier` · `plan_name` | 지급 요금제 |
| `ends_at` | 지급이 끝나는 시각(배타 경계 — 서비스 날짜 경계) |
| `last_date` | 지급으로 쓸 수 있는 마지막 서비스 날짜(`YYYY-MM-DD`) — "N월 N일까지"는 이 값. 클라이언트가 04시 보정을 하지 않는다 |

- **`plan.status`는 지급과 무관하다** — 구독 상태 그대로다(지급은 구독이 아니다). 지급 요금제가 구독보다 높으면 `plan.tier` · `plan_name` · `daily_play_limit`과 `entitlements`가 지급 요금제의 값이 된다. 낮으면 구독 표시 그대로이고 `grant`만 실린다.
- 가입 체험과 겹치면 지급이 표시를 이긴다(`tier`는 지급 요금제). 한도는 둘 중 넉넉한 쪽이다.
- **이벤트 중 결제** — 코드를 입력할 때 구독이 없던 계정에 지급 기간 중 살아 있는 구독이 반영되면(4.4·4.5·스토어 알림 — 재구독 포함) 서버가 지급을 끝낸다. 결제 응답의 `plan.grant`는 `null`이 된다. 결제 전에 "이벤트가 끝나요"를 알리거나 막는 것은 클라이언트가 `plan.grant.tier`와 고른 요금제로 정한다. 입력 때 이미 구독 중이었으면 그 구독의 갱신·변경은 지급을 끝내지 않는다.
- 체험과 지급이 겹치면 `plan.trial.daily_play_limit_after`는 지급까지 반영한 한도다.
- 요금제 목록(4.1)의 `action`은 **구독만 보고** 정한다 — 지급은 반영하지 않는다(구독이 없으면 무료가 `current`). 지급 중 표시는 `plan.grant`로 한다.
- 지급이 끝나면 10분 안에 `users.tier`가 되돌아간다(`domain.md` 8.6 만료 배치). 그 사이 응답의 `plan`은 이미 지급 없이 조립된다.

#### 4.8-1 `POST /users/me/subscription/invite-codes` — 코드 입력

앱에서 코드를 입력받는 곳(화면·위치)은 클라이언트가 정한다. `Cache-Control: no-store`. 레이트 리밋 사용자 단위 **분당 10회**(`architecture.md` 9.6 — 코드 추측 대입의 앞단 방어).

**Request**

```json
{ "code": "SANGUN-POC" }
```

- 대소문자·앞뒤 공백은 서버가 정규화한다(`sangun-poc`도 같은 코드). 빈 값·64자 초과만 400(`VALIDATION_FAILED`)이고, 저장 규칙 밖의 값은 "없는 코드"(404)와 같이 처리한다.

**Response 200** — 4.2와 **같은 본문**이다. `plan.grant`에 지급 내용이 실린다(앱이 4.2를 다시 부르지 않는다).

- **멱등키를 쓰지 않는다.** 같은 계정이 같은 코드를 다시 보내면 지급 중인 한 새로 만들지 않고 같은 결과(200)다 — 응답 유실 뒤 재전송이 안전하다.
- 판정 순서(앞이 우선): 없음·꺼짐(404) → 이 계정이 쓴 코드(지급 중이면 200, 끝났으면 409 `INVITE_CODE_ALREADY_USED`) → 입력 기간 밖(409 `INVITE_CODE_EXPIRED`) → 다른 지급 진행 중(409 `INVITE_GRANT_ALREADY_ACTIVE`) → 한도 소진(409 `INVITE_CODE_EXHAUSTED`) → 지급 마지막 날 경과(409 `INVITE_CODE_EXPIRED`).
- 유료 구독 중이어도 입력할 수 있다. 지급 요금제가 구독보다 높으면 그 기간 동안 지급 요금제를 쓰고, 낮거나 같으면 표시는 구독 그대로다(`grant`만 실린다). 입력 전부터 있던 구독은 지급을 끝내지 않는다.
- 지급 행과 `users.tier`는 한 트랜잭션에서 고친다. 코드 행을 잠그고 판정해 동시 입력이 한도를 넘지 않는다.

## 5. 에러 코드 표

**아래 코드는 이 문서가 신설했고 `common-error-handling.md` 9.10-3에 등재했다.** enum 반영은 백엔드 구현 PR에서 한다(`architecture.md` 7.5).

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `EMAIL_REQUIRED_FOR_PURCHASE` | 409 | false | 이메일 등록·인증 화면(`auth.md` 4.4)으로 보내고, 인증 완료 후 결제 흐름으로 복귀. 정상 클라이언트는 4.1의 `is_email_verified`로 먼저 거르므로 드물다 |
| `SUBSCRIPTION_PLAN_UNAVAILABLE` | 400 | false | "지금은 이 요금제를 구독할 수 없어요" + 요금제 목록(4.1) 재조회 |
| `SUBSCRIPTION_STORE_MISMATCH` | 409 | false | "다른 스토어에서 구독 중이에요. 구독한 기기에서 변경해주세요" |
| `SUBSCRIPTION_RECEIPT_INVALID` | 400 | false | "구독을 확인할 수 없어요". 거래를 `finish`하지 않는다 — 재시도해도 결과가 같으므로 자동 재시도 대상은 아니다. 문의 경로 안내 |
| `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT` | 409 | false | "이미 다른 계정에서 사용 중인 구독이에요"(`subscription.md` 4.6) |
| `SUBSCRIPTION_ALREADY_SUBSCRIBED` | 409 | false | "이미 구독 중이에요. 요금제는 변경으로 바꿔주세요"(2026-10-07 — Play 두 번째 구독, 4.4). 거래를 `finish`하지 않는다 — 서버가 확인하지 않은 구매는 Google이 3일 안에 자동 환불한다. 요금제 변경 화면으로 보낸다 |
| `SUBSCRIPTION_STORE_UNAVAILABLE` | 503 | **true** | "구독을 확인하고 있어요… 잠시 후 자동으로 반영됩니다". **거래를 끝내지 않고** 재시도 큐에 넣는다(다음 실행의 미완료 거래 처리도 같은 경로) |
| `INVITE_CODE_NOT_FOUND` | 404 | false | "사용할 수 없는 코드예요" — 없는 코드·꺼진 코드·저장 규칙 밖 값(4.8-1) |
| `INVITE_CODE_EXPIRED` | 409 | false | "사용 기간이 지난 코드예요" — 입력 기간 밖이거나 지급 마지막 날이 지났다 |
| `INVITE_CODE_EXHAUSTED` | 409 | false | "선착순이 마감된 코드예요" — 사용 한도(계정 수)를 다 썼다 |
| `INVITE_CODE_ALREADY_USED` | 409 | false | "이미 사용한 코드예요" — 이 계정이 쓴 코드이고 지급이 끝났다(지급 중이면 200 재전송) |
| `INVITE_GRANT_ALREADY_ACTIVE` | 409 | false | "다른 코드의 혜택이 아직 남아 있어요" — 지급은 계정당 동시에 하나 |

- 401·429·5xx는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다.
- **결제 취소**(사용자가 시트를 닫음)는 서버 호출이 없다 — 에러 문구도 없다(`subscription.md` 5장).

---

## 6. 흐름

**구매**

```
페이월 시트 / 요금제 관리
   ↓ GET /plans?platform=ios            → plans[](store_product_id · action) + is_email_verified
   ↓ 스토어 SDK로 현지 가격 조회 → 병합 표시
[구독하기] 탭
   ├─ is_email_verified == false → 이메일 등록·인증(auth 4.4) → 복귀
   ↓ POST …/purchase-intents            → intent_id · account_token
   ↓ 스토어 결제 시트(appAccountToken = account_token)
   ├─ 취소 → 원래 화면(문구 없음)
   ↓ 결제 성공 — 거래는 아직 finish 하지 않는다
   ↓ POST …/purchases { signed_transaction }
   ├─ 200 → finish → 화면 갱신(응답 본문) → 페이월이면 blocked_content_id 자동 재생(paywall 4.5)
   ├─ 503 SUBSCRIPTION_STORE_UNAVAILABLE / 네트워크 → "반영 중" + 재시도(거래 유지)
   └─ 400·409 → 문구 표시(거래 유지 — 문의)
```

**앱 실행 · 포그라운드 복귀**

```
① 스토어 SDK의 미완료 거래가 있으면 → POST …/purchases (intent_id 없이) → 200이면 finish
② GET /users/me/subscription → plan · entitlements 갱신(서버가 필요하면 만료 보정)
```

**복원**

```
[구매 복원] → SDK에서 현재 유효 거래 수집 → POST …/restore
   ├─ restored: true  → 토스트 "구독이 복원되었어요" + 화면 갱신
   ├─ restored: false → "복원할 구독이 없어요"
   └─ 409 SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT → "이미 다른 계정에서 사용 중인 구독이에요"
```

**갱신 · 해지 · 환불 · 유예** — 전부 서버 대 서버다. 앱은 다음 실행·복귀의 4.2에서 결과를 본다.

```
스토어 ──(S2S)──▶ POST /webhooks/app-store | /webhooks/play-store
                   → store_notification_logs(중복 차단) → subscriptions.status 환산 → users.tier
```

---

## 7. 보안·검증 규칙

- **클라이언트가 보낸 값으로 티어를 바꾸지 않는다.** 티어를 바꾸는 근거는 ① 스토어가 서명한 거래(JWS)·스토어 API 응답 ② 스토어 서버 알림 둘뿐이다. 요청 본문의 평문 필드(`product_id`, `intent_id`)는 조회 열쇠·교차 확인용이다.
- **`users.tier`를 쓰는 경로는 한 곳이다**(`domain.md` 3.1 — `BillingSyncService.syncUserTier`). 영수증 제출·복원·웹훅·만료 보정이 전부 같은 반영 함수를 거치고, 구독 행과 `users.tier`를 **한 트랜잭션에서** 고친다. `subscription` 모듈이 아니라 그 위의 `billing` 모듈에 있다 — `user` 모듈이 `subscription`을 의존해(탈퇴 시 결제 이력 판정) 반대 방향으로는 의존할 수 없어서다.
- **거래의 주인 확인** — 결제에 실은 `account_token`(= `purchase_intents.id`)이 서명된 거래 안에 들어온다. 그 의도가 다른 사용자의 것이면 거부한다. 토큰이 없거나(복원·프로모션 코드·스토어 밖 구매) 의도 행이 이미 없으면(탈퇴로 파기) `original_transaction_id`의 유일성으로만 판정한다 — 살아 있는 다른 계정에 있으면 거부, 없으면 연결.
  - **한 계정에 살아 있는 Play 구독은 하나다**(2026-10-07 — 4.4). 요청자에게 같은 스토어의 살아 있는 행이 따로 있고 새 구매가 그 행에 이어지지 않으면 두 번째 구독으로 보고 제출을 거부한다(`SUBSCRIPTION_ALREADY_SUBSCRIBED`). 교체로 산 구매는 `linkedPurchaseToken`으로 같은 행에 이어지므로 걸리지 않는다
  - **끝난 구독의 재결제는 결제한 계정의 것이다**(2026-10-06). 다른 계정의 행이 이미 끝난 구독(`expired`·`refunded`)이고, 지금 온 거래의 계정 토큰이 **요청자의** 결제 의도이며, 그 반영이 구독을 되살리는 것이면 → 행의 `user_id`를 요청자로 바꾼다(영수증 제출·복원·서버 알림 모두 같은 규칙). App Store는 같은 Apple 계정이 같은 구독 그룹을 다시 결제하면 예전 `originalTransactionId`를 이어 쓸 수 있어, 이 예외가 없으면 방금 결제한 계정이 409를 받고 결제하지 않은 예전 계정이 유료가 된다. **살아 있는 구독**(`active`·`grace`·`cancelled`)은 종전대로 거부한다. 토큰이 없거나 예전 계정의 의도면 넘기지 않는다 — 그 결제는 예전 계정이 시작한 것이다. **토큰은 있는데 그 의도가 없으면(탈퇴로 파기) 끝난 행의 주인에게도 반영하지 않고 `unlinked`로 둔다**(2026-10-07) — 결제한 계정은 이미 떠났고, 예전 주인은 결제하지 않았다. 그 사람이 재가입해 영수증을 제출·복원하면 그때 연결된다.
- **거래 ID만으로 복원하지 않는다.** `archived_subscriptions`의 `original_transaction_id`는 보존 기록이지 권한이 아니다(`domain.md` 11.5). 재가입 복원은 **그 스토어 계정이 지금 제출한 서명된 거래**가 있을 때만 성립한다.
- **환경 분리** — iOS 거래·알림의 `environment`(`Production` / `Sandbox`)를 본다. **서버가 받는 환경은 설정값이다**(`APP_STORE_ENVIRONMENTS`): 개발계 서버는 `Sandbox`, 운영 서버는 `Production`, 심사·TestFlight 결제까지 받으려면 `Production,Sandbox`다(App Store 심사와 TestFlight는 운영 빌드로 샌드박스 결제를 한다). 받지 않는 환경은 서명이 맞아도 `SUBSCRIPTION_RECEIPT_INVALID`다. **운영이 샌드박스를 함께 받을 때 시험 결제는 `subscriptions.environment = sandbox`로 구분된다**(`domain.md` 8.2) — 권한은 똑같이 주되(그래야 심사·시험이 된다) 매출·구독자 집계에서 뺀다.
- **웹훅 검증** — App Store: `signedPayload`의 인증서 체인을 Apple 루트 인증서까지 검증하고 `bundleId`·`appAppleId`를 대조한다. Play: Pub/Sub OIDC 토큰의 서명·`aud`·발신 서비스 계정을 검증한다. 검증 전에는 본문을 믿지 않는다. 웹훅 경로는 사용자 레이트리밋 대상이 아니다.
- **Android `acknowledge`는 서버가 한다** — 검증·반영이 끝난 뒤에. 클라이언트가 먼저 확인하면 서버 반영이 실패했을 때 "결제됐는데 티어 없음"이 된다.
- **로그에 영수증·토큰 원문을 남기지 않는다**(`convention.md` 8.4). `original_transaction_id`·알림 UUID·유형만 남긴다. `subscriptions.latest_receipt`에는 마지막 서명 거래(JWS) 또는 구매 토큰을 저장한다(재조회 열쇠).
- **스토어 구성과 자격증명**은 Secrets Manager에 두고 env로 주입한다.
  - **검증 구성** — `APP_STORE_BUNDLE_ID`(번들 ID) · `APP_STORE_ENVIRONMENTS`(받는 환경) · `APP_STORE_APP_APPLE_ID`(앱의 Apple ID — `Production`을 받을 때 필수). **영수증·알림 검증은 서명만으로 끝나 API 키가 필요 없다.** 이 구성이 비어 있으면 iOS 결제가 꺼지고, 관련 요청은 `SUBSCRIPTION_STORE_UNAVAILABLE`이 아니라 **`SUBSCRIPTION_PLAN_UNAVAILABLE`** 로 의도 생성 단계에서 막힌다(결제부터 시키고 검증을 못 하는 상태를 만들지 않는다). 4.1의 `action`도 전부 `none`이 된다.
  - **App Store Server API 키** — `APP_STORE_ISSUER_ID` · `APP_STORE_KEY_ID` · `APP_STORE_PRIVATE_KEY_BASE64`(.p8). **만료 보정(4.2)과 처음 연결하는 구독의 상태 확인(4.4-4)에 쓴다.** 비어 있으면 둘 다 꺼진다 — 알림이 유실된 구독은 상한(만료일 + 7일)까지 유료로 남고(경고 로그), 처음 연결하는 거래는 서명과 만료일만으로 판정한다(환불 → 탈퇴 → 재가입 뒤의 옛 거래를 걸러내지 못한다). **운영에는 반드시 넣는다.**
  - **Play 검증 구성**(2026-10-03) — `GOOGLE_PLAY_PACKAGE_NAME`(앱 패키지명) · `GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64`(Play Developer API를 부르는 서비스 계정의 JSON 키. Play Console에서 그 계정에 "주문 및 구독 관리" 권한 필요). 둘 중 하나라도 비면 Android 결제가 꺼진다
  - **Play 알림 검증값** — `GOOGLE_PLAY_PUBSUB_AUDIENCE`(push 구독에 설정한 대상) · `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT`(push가 쓰는 서비스 계정 이메일). 비면 알림만 꺼진다(구매 검증·복원·보정은 동작한다)
  - **우리 자격증명이 거부된 것은 사용자 잘못이 아니다** — 서비스 계정이 틀리면 Google의 토큰 발급 주소가 400으로 답하는데, 이를 "모르는 구매 토큰"과 같이 다루지 않고 `SUBSCRIPTION_STORE_UNAVAILABLE`(재시도)로 답하며 error 로그를 남긴다
- **환불·만료 뒤의 재제출을 막는다** — 환불(`refunded`)·만료(`expired`)로 종결된 구독에, 그 통지 **이전에 시작된** 거래를 다시 내면 `SUBSCRIPTION_RECEIPT_INVALID`다(복원에서는 무시). 기기에 받아 둔 서명 거래에는 환불 표시가 없어 그 자체로는 유효해 보이기 때문이다. 종결 뒤에 새로 시작된 거래(재구독)만 되살린다(`domain.md` 8.2 `last_notified_at`).
- **지난 결제 주기에 대한 환불·만료 알림은 지금 주기를 건드리지 않는다** — 알림의 거래가 저장된 만료일보다 앞선 주기의 것이면 반영하지 않는다(지난달 결제분만 환불된 경우). **유예(`grace`) 중에는 이 비교를 하지 않는다**(2026-10-06) — 유예에 들어갈 때 `expires_at`을 유예 종료일로 밀어 두는데 Apple의 거래 만료일은 거래마다 고정이라(유예 종료일은 갱신 정보에 따로 온다), 그 구독의 어떤 알림이든 거래 만료일이 더 이르다. 비교하면 유예 종료·만료·환불 알림이 전부 버려져 유예가 끝나도 유료로 남는다. 순서가 뒤바뀐 옛 알림은 서명 시각(`last_notified_at`)으로 거른다.

---

## 8. 데이터 모델

> 스키마는 [`docs/backend/domain.md`](../../backend/domain.md)가 유일한 기준이다.

| 사용하는 것 | domain.md |
|---|---|
| `plans` — 요금제·`entitlements`의 원천, 플랫폼별 상품 ID | 8.1 |
| `subscriptions` — 티어의 진실의 원천. **`pending_tier` 추가**(다운그레이드 예약 — 이 문서와 함께 개정) | 8.2 |
| `purchase_intents` — 결제 전 관문 + 계정 결속 토큰(`id`) | 8.3 |
| `store_notification_logs` — S2S 알림 중복 차단·재처리 근거 | 8.4 |
| `users.tier` — 비정규화 캐시(갱신 경로 한 곳) · `users.email` · `is_email_verified` | 3.1 |
| `archived_subscriptions` — 보존 기록(권한 아님) | 11.5 |

---

## 9. 미결 사항

- ~~데일리·프로의 재생 한도·가격~~ — **해소(2026-10-02)**: 데일리 3,900원·하루 5편, 프로 9,900원·무제한(`domain.md` 8.1)
- **무료 체험·소개 가격** — 도입하면 4.1에 체험 자격(`is_trial_eligible`) 필드와 알림 환산(`OFFER_REDEEMED`)이 추가된다
- ~~스토어 상품 ID 확정값~~ — **해소(2026-10-02)**: iOS `com.runtime.ear.subscription.daily.monthly` · `com.runtime.ear.subscription.pro.monthly`(구독 그룹 등급: 프로 1 · 데일리 2). Android는 Play 구현 때
- **운영 서버의 샌드박스 수용 운용** — `APP_STORE_ENVIRONMENTS`에 `Sandbox`를 언제 넣고 빼는지(심사·내부 시험 기간), 그리고 서버 알림 URL(프로덕션·샌드박스)을 App Store Connect에 등록하는 절차를 `infra/runbook.md`에 적는다
- ~~Play 구현 시점~~ — **서버 구현 완료(2026-10-03)**. 남은 것은 사람 손 작업이다: ① Play Console 구독 상품 생성 → `plans.store_product_id_android` 채우기 ② 서비스 계정 + Play Console 권한 ③ Pub/Sub 주제·push 구독(대상 URL `…/webhooks/play-store`, OIDC 인증) + Play Console의 실시간 알림 연결 ④ 서버 설정값 4개. **실제 Google 응답으로는 아직 확인하지 못했다** — 상품과 서비스 계정이 있어야 가능하다
- **가족 공유·프로모션 코드** — 스토어가 유효 구독으로 돌려주면 그대로 인정한다(`subscription.md` 7). 별도 계약 없음
