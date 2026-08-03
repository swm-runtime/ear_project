# 인증·계정 API 명세서

> 기준 문서: [`docs/pages/auth.md`](../../pages/auth.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3장

## 1. 범위

`auth.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 넷이다.

- 소셜 로그인·가입(약관 동의 시점의 계정 생성)
- 토큰 갱신·로그아웃
- 회원 탈퇴
- 이메일 등록·코드 인증

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `auth.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | 부작용이 있는 POST에 `Idempotency-Key` (3장 표의 ★ 표시) |

- 성공 응답에 `success: true` 같은 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.**
- 에러 응답은 `architecture.md` 7.4 규격을 따른다.

```json
{
  "error_code": "EMAIL_VERIFICATION_CODE_EXPIRED",
  "message": "인증 시간이 지났어요. 코드를 다시 받아주세요",
  "retryable": false,
  "retry_after_sec": null,
  "trace_id": "01H8X..."
}
```

- `message`는 **사용자 노출용**이다. 클라이언트가 분기해야 하는 상황은 반드시 `error_code`로 구분한다(HTTP status만으로 판단하게 만들지 않는다).

**토큰 정책** (`architecture.md` 9.1)

| 토큰 | 수명(잠정) | 저장 |
|---|---|---|
| access_token | 30분 | 저장하지 않음(stateless 검증) |
| refresh_token | 30일 | **해시**해서 `sessions`에 저장. 원문 저장 금지 |

- refresh token은 사용 시 **회전**한다. 이미 쓰인 토큰이 재사용되면 해당 사용자의 **세션 전체를 무효화**한다(탈취 감지).

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | POST | `/auth/social-login` | 소셜 토큰 검증 → 기존 로그인 / 신규 동의 요구 분기 | — | |
| 2 | POST | `/auth/sign-up` | 약관 동의 → **계정 생성** + 토큰 발급 | — | ★ |
| 3 | POST | `/auth/token/refresh` | 토큰 갱신(회전) | — | |
| 4 | POST | `/auth/logout` | 이 기기 세션 폐기 | 필요 | |
| 5 | POST | `/users/me/consents` | 약관 재동의 · 마케팅 수신 동의 변경 | 필요 | |
| 6 | POST | `/users/me/withdraw` | 회원 탈퇴 | 필요 | ★ |
| 7 | POST | `/users/me/email-verifications` | 인증 코드 발송 | 필요 | ★ |
| 8 | GET | `/users/me/email-verifications/active` | 진행 중인 인증 조회(재진입용) | 필요 | |
| 9 | POST | `/users/me/email-verifications/:id/verify` | 코드 검증 → `users.email` 저장 | 필요 | |

**설계 메모**

- **탈퇴가 `DELETE /users/me`가 아닌 이유**: 사유·확인 값·구독 만료 동의를 본문으로 받아야 하고, 서버가 이관과 파기를 하나의 트랜잭션으로 수행하는 **상태 전이**이기 때문이다. `convention.md` 5.2의 하위 액션 규칙을 따른다.
- **이메일 인증이 두 단계인 이유**: `auth.md` 3장 — `email`과 `verification_code`를 한 번에 보내지 않는다. 발송(7)으로 인증 건을 만들고, 그 건에 대해 검증(9)한다.
- **진입 경로(결제 전·설정·프로필)별로 엔드포인트를 나누지 않는다.** `auth.md` 4.4가 세 경로에 같은 규칙을 적용하도록 확정했다. 경로를 나누면 **발송 횟수 제한이 경로별로 새는 구멍**이 된다. 복귀 지점은 클라이언트가 관리한다.

---

## 4. 엔드포인트 상세

### 4.1 `POST /auth/social-login`

소셜 토큰을 서버가 제공자 API로 검증하고, 기존 계정 여부를 판정한다.

**Request**

```json
{
  "provider": "kakao",
  "provider_token": "<제공자 SDK가 반환한 인증 코드 또는 액세스 토큰>",
  "device_id": "<기기 식별자>"
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| provider | enum `kakao` \| `google` \| `naver` | 필수 | |
| provider_token | string | 필수 | 서버가 제공자 API로 **반드시 검증**한다 |
| device_id | string | 필수 | 푸시 토큰 매핑용 |

- **동의 값을 여기에 싣지 않는다.** 동의는 로그인 성공 이후 별도 화면에서 받는다(`auth.md` 4.1).
- 클라이언트가 보낸 프로필 정보(이메일·이름·소셜 ID)를 **그대로 신뢰하지 않는다**(`architecture.md` 9.1).

**Response 200 — 기존 계정**

```json
{
  "status": "authenticated",
  "access_token": "...",
  "refresh_token": "...",
  "access_token_expires_at": "2026-08-03T09:30:00Z",
  "pending_consents": [],
  "user": {
    "id": "uuid",
    "nickname": "지훈",
    "email": "user@example.com",
    "provider": "kakao",
    "tier": "light",
    "role": "user",
    "onboarding_completed": true,
    "onboarding_step": "done"
  }
}
```

**Response 200 — 신규 계정 (계정 미생성)**

```json
{
  "status": "consent_required",
  "signup_token": "<단기 토큰>",
  "signup_token_expires_at": "2026-08-03T09:10:00Z",
  "required_consents": [
    { "consent_type": "terms",     "version": "1.2", "is_required": true },
    { "consent_type": "privacy",   "version": "1.1", "is_required": true },
    { "consent_type": "marketing", "version": null,  "is_required": false }
  ]
}
```

- **이 응답 시점에는 계정이 존재하지 않는다.** 계정은 `/auth/sign-up`에서 생성된다(`auth.md` 4.1 — "동의 버튼을 누른 시점에 계정이 생성된다").
- `signup_token`은 검증된 제공자 신원을 담은 **단기 토큰**이다. 클라이언트가 `provider_user_id`를 들고 다니게 하지 않는다.
- **동의 화면에 보여줄 현행 버전을 서버가 내려준다.** 클라이언트에 버전을 하드코딩하지 않는다.

**`pending_consents`** — 기존 계정이라도 약관이 개정됐으면 재동의가 필요한 항목이 담긴다. 판정은 **서버가 `consents`의 최신 버전과 현행 버전을 비교해서** 한다. 클라이언트가 보낸 버전을 신뢰하지 않는다(`auth.md` 7). 재동의는 `/users/me/consents`로 처리한다.

**이메일 처리** — 제공자가 이메일을 주면 **가입 시점에 그대로 저장**한다. 발송이 불가능한 마스킹 주소(`ka***@kakao.com`)는 저장하지 않고 `null`로 둔다(`auth.md` 4.1).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `AUTH_PROVIDER_TOKEN_INVALID` | 401 | 제공자 토큰 검증 실패·만료 |
| `AUTH_PROVIDER_UNAVAILABLE` | 502 | 제공자 API 장애·타임아웃. `retryable: true` |

- 재시도 시 같은 `provider_token`이 만료됐을 수 있으므로, 클라이언트는 **제공자 인증부터 다시 수행**한다(`auth.md` 7).

---

### 4.2 `POST /auth/sign-up`

약관 동의를 기록하고 **계정을 생성**한다.

**Request** — `Idempotency-Key` 필수

```json
{
  "signup_token": "<social-login이 내려준 단기 토큰>",
  "device_id": "<기기 식별자>",
  "consents": [
    { "consent_type": "terms",     "version": "1.2", "is_agreed": true },
    { "consent_type": "privacy",   "version": "1.1", "is_agreed": true },
    { "consent_type": "marketing", "version": null,  "is_agreed": false }
  ]
}
```

- **동의 3종을 각각 별개 행으로 기록한다.** 개정 시점이 서로 다르므로 한 행에 묶지 않는다(`domain.md` 3.2 — append-only).
- 필수 2종(`terms`·`privacy`)이 `is_agreed: true`가 아니면 계정을 만들지 않는다.

**Response 201** — `social-login`의 `authenticated` 응답과 같은 형태. `onboarding_completed: false`, `onboarding_step: "topic"`.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `AUTH_SIGNUP_TOKEN_EXPIRED` | 401 | `signup_token` 만료·위조 → 제공자 인증부터 재시작 |
| `CONSENT_REQUIRED` | 400 | 필수 동의 누락 |
| `CONSENT_VERSION_STALE` | 409 | 동의한 버전이 현행 버전과 다름(동의 화면 체류 중 개정) → 최신 버전으로 다시 받는다 |

- **동의 화면에서 이탈하면 계정이 생성되지 않는다.** 서버는 아무것도 남기지 않으며, 다시 로그인하면 약관 동의부터 재시작한다(`auth.md` 7).

---

### 4.3 `POST /auth/token/refresh`

**Request**

```json
{ "refresh_token": "...", "device_id": "..." }
```

**Response 200** — 새 `access_token` + **새 `refresh_token`**(회전).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | 만료·폐기·존재하지 않음 |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | 이미 회전된 토큰의 재사용 → **해당 사용자 세션 전체 무효화** |

- 갱신 실패는 **재갱신 여지 없이 명확히 실패시킨다**(무한 루프 방지 — `architecture.md` 9.1). 클라이언트는 시작 화면으로 보낸다.

---

### 4.4 `POST /auth/logout`

**Request**

```json
{ "device_id": "..." }
```

**Response 204**

- **해당 기기 세션만 폐기한다.** 다중 기기 동시 로그인을 허용하므로 다른 기기 세션은 유지된다(`auth.md` 7).
- 푸시 토큰 등록도 함께 해제한다.
- **서버 호출이 실패해도 클라이언트는 로그아웃을 진행한다**(`auth.md` 4.2). 로컬 토큰·캐시 삭제가 우선이다.

---

### 4.5 `POST /users/me/consents`

약관 재동의, 마케팅 수신 동의 변경에 쓴다.

**Request**

```json
{
  "consents": [
    { "consent_type": "marketing", "version": null, "is_agreed": true }
  ]
}
```

**Response 200** — 갱신 후 현재 동의 상태.

- **`UPDATE`하지 않고 행을 추가한다.** 철회도 `is_agreed: false` 행 추가다(`domain.md` 3.2).
- 마케팅 동의만 바꿨는데 약관 동의 이력이 함께 갱신되면 안 된다.

---

### 4.6 `POST /users/me/withdraw`

**Request** — `Idempotency-Key` 필수

```json
{
  "reason_code": "no_time",
  "reason_text": "자유 입력",
  "confirm": true,
  "agreed_subscription_expiry": true
}
```

| 필드 | 필수 | 비고 |
|---|---|---|
| reason_code | 선택 | 선택형 사유 |
| reason_text | 선택 | 자유 입력 |
| confirm | **필수** | 안내 확인 체크. `true`가 아니면 거부 |
| agreed_subscription_expiry | 조건부 필수 | **활성 구독이 있을 때만** 필수 |

**Response 204**

**서버 처리** — 이관과 파기를 **하나의 트랜잭션**에서 수행한다(`domain.md` 12.3).

- 즉시 파기: 라이브러리·관심사·커리어·재생 위치·재생 기록·소비 신호·설정·기기 토큰·세션·알림 로그·드립 제외 목록
- 아카이브 후 파기(5년): `archived_users` · `archived_consents` · `archived_subscriptions`
- `users` 행은 이관 후 **삭제한다.** `status = withdrawn`으로 남겨두지 않는다

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `WITHDRAWAL_CONFIRM_REQUIRED` | 400 | `confirm != true` |
| `WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED` | 400 | 활성 구독이 있는데 만료 동의 없음 |

- **스토어 구독은 탈퇴로 자동 해지되지 않는다.** 서버는 해지를 대행하지 않으며, 클라이언트는 안내를 **텍스트로만** 노출한다(스토어 이동 버튼·딥링크 금지 — `auth.md` 4.3).
- 탈퇴 처리 중 앱이 종료돼도 서버 트랜잭션은 완료된다. 재실행 시 토큰 갱신이 실패해 시작 화면으로 간다.

---

### 4.7 `POST /users/me/email-verifications` — 코드 발송

**Request** — `Idempotency-Key` 필수(연타로 발송 횟수가 소모되는 것을 막는다)

```json
{ "email": "user@example.com" }
```

**Response 201**

```json
{
  "verification_id": "uuid",
  "email": "user@example.com",
  "expires_at": "2026-08-03T09:03:00Z",
  "resend_available_at": "2026-08-03T09:01:00Z",
  "send_count_used": 2,
  "send_count_limit": 5,
  "attempts_limit": 5
}
```

**규칙** (`auth.md` 4.5)

| 항목 | 값 |
|---|---|
| 코드 형식 | 6자리 숫자 |
| 유효 시간 | **3분** (발송 시각 기준) |
| 동시 유효 코드 | **1개** — 재발송 시 이전 코드 즉시 무효 |
| 재발송 쿨다운 | **60초** |
| 발송 가능 횟수 | **5회** |
| 발송 횟수 초기화 | 5회째 발송 시각 + **1시간** |

- **코드 원문을 저장하지 않는다.** 해시만 저장한다(`sessions.refresh_token_hash`와 같은 규칙).
- **발송 횟수는 계정 단위로 센다.** 이메일 주소 단위가 아니다 — 주소를 바꿔가며 발송하는 우회를 막는다.
- **발송에 성공한 건만 카운트한다.** 메일 발송 API 자체가 실패하면 차감하지 않는다. 인프라 장애로 사용자의 5회를 소진시키지 않기 위해서다.
- 유효 시간·발송 횟수·쿨다운은 **전부 서버가 판정한다.** 앱을 재설치하거나 다른 기기에서 시도해도 제한이 그대로 적용돼야 한다.
- 세 진입 경로(결제·설정·프로필)의 호출이 **같은 카운터에 합산**된다.

**에러**

| 코드 | HTTP | `retry_after_sec` | 상황 |
|---|---|---|---|
| `EMAIL_FORMAT_INVALID` | 400 | — | 형식 검증 실패 |
| `EMAIL_ALREADY_REGISTERED` | 409 | — | 현재 계정에 이미 등록된 것과 **같은 주소**. 코드를 보내지 않으며 **발송 횟수를 소모하지 않는다** |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN` | 429 | 남은 초 | 직전 발송으로부터 60초 미경과 |
| `EMAIL_VERIFICATION_SEND_LIMIT` | 429 | **잠금 해제까지 남은 초** | 5회 소진. 클라이언트는 이 값을 **분 단위로** 환산해 안내한다 |
| `EMAIL_SEND_FAILED` | 502 | — | 메일 발송 실패. `retryable: true`, **횟수 미차감** |

- **다른 계정이 이미 쓰는 이메일은 허용한다.** 이메일은 식별자가 아니라 거래 주체 확인용 연락처이며, 계정 식별은 `provider + provider_user_id`가 한다(`auth.md` 7).

---

### 4.8 `GET /users/me/email-verifications/active`

코드 입력 중 앱이 종료됐다가 재진입한 경우, **재발송 없이 이어서 입력**하기 위한 조회다.

**Response 200 — 진행 중인 인증 있음**

```json
{
  "active": true,
  "verification_id": "uuid",
  "email": "user@example.com",
  "expires_at": "2026-08-03T09:03:00Z",
  "attempts_remaining": 4,
  "resend_available_at": "2026-08-03T09:01:00Z",
  "send_count_used": 2,
  "send_count_limit": 5,
  "send_locked_until": null
}
```

**Response 200 — 없음**

```json
{ "active": false, "send_count_used": 5, "send_count_limit": 5, "send_locked_until": "2026-08-03T10:03:00Z" }
```

- **없음을 404로 응답하지 않는다.** 진행 중인 인증이 없는 것은 정상 상태이며, 클라이언트는 이 응답으로 **발송 잠금 여부까지** 판단해야 하기 때문이다.
- 클라이언트는 남은 시간을 자체 타이머로 복원하지 않고 **`expires_at`으로 다시 계산한다**(`auth.md` 7).
- **발송이 잠긴 상태여도 유효한 코드가 남아 있으면 `active: true`다.** 잠기는 것은 발송이지 검증이 아니다.

---

### 4.9 `POST /users/me/email-verifications/:id/verify` — 코드 검증

**Request**

```json
{ "code": "482913" }
```

**Response 200**

```json
{ "email": "user@example.com", "verified_at": "2026-08-03T09:01:20Z" }
```

- **검증에 성공한 서버가 `users.email`을 저장한다.** 클라이언트가 "인증 완료" 상태를 보내는 경로는 없다.
- **성공 시점에만 값이 바뀐다.** 코드 발송까지 했더라도 검증 전에 이탈하면 기존 이메일이 그대로 남는다. 중간 상태를 `users.email`에 쓰지 않는다.

**에러**

| 코드 | HTTP | 추가 필드 | 상황 |
|---|---|---|---|
| `EMAIL_VERIFICATION_CODE_MISMATCH` | 400 | `attempts_remaining` | 코드 불일치 |
| `EMAIL_VERIFICATION_CODE_EXPIRED` | 400 | — | 3분 경과 |
| `EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED` | 400 | — | 검증 시도 5회 소진 → 코드 무효, 재발송 필요 |
| `EMAIL_VERIFICATION_NOT_FOUND` | 404 | — | `:id`가 없거나 재발송으로 무효화된 이전 건 |

- **"코드가 틀림"과 "코드가 만료됨"을 반드시 다른 코드로 내려준다.** 둘을 뭉뚱그리면 사용자가 재발송해야 하는지 다시 입력해야 하는지 알 수 없다(`auth.md` 4.5).
- **응답 시간을 일정하게 유지한다**(타이밍 공격 방지).
- 재발송으로 새 코드를 받은 뒤 이전 코드를 입력하면 실패한다. 유효한 코드는 항상 마지막 1개다.

---

## 5. 에러 코드 표

**추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 `common-error-handling.md` 6장 표를 함께 갱신한다.** 이미 배포된 코드의 의미를 바꾸지 않는다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `AUTH_PROVIDER_TOKEN_INVALID` | 401 | false | 토스트 후 시작 화면 유지 |
| `AUTH_PROVIDER_UNAVAILABLE` | 502 | **true** | [다시 시도] — 제공자 인증부터 재수행 |
| `AUTH_SIGNUP_TOKEN_EXPIRED` | 401 | false | 시작 화면으로, 로그인부터 재시작 |
| `CONSENT_REQUIRED` | 400 | false | 필수 동의 체크 유도 |
| `CONSENT_VERSION_STALE` | 409 | false | 최신 약관 다시 조회 후 재동의 |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | false | 로컬 세션 정리 → 시작 화면 |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | false | 동일. 서버는 전 세션 무효화 |
| `WITHDRAWAL_CONFIRM_REQUIRED` | 400 | false | 확인 체크박스 강조 |
| `WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED` | 400 | false | 구독 만료 동의 체크 강조 |
| `EMAIL_FORMAT_INVALID` | 400 | false | 인라인 "이메일 형식을 확인해주세요" |
| `EMAIL_ALREADY_REGISTERED` | 409 | false | 인라인 "이미 등록된 이메일이에요" |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN` | 429 | false | [재전송] 비활성 + 남은 초 표시 |
| `EMAIL_VERIFICATION_SEND_LIMIT` | 429 | false | 발송 버튼 비활성 + **분 단위** 잠금 안내 |
| `EMAIL_SEND_FAILED` | 502 | **true** | 토스트 + [다시 시도]. 횟수 미차감 안내 |
| `EMAIL_VERIFICATION_CODE_MISMATCH` | 400 | false | 인라인 + 남은 시도 횟수 |
| `EMAIL_VERIFICATION_CODE_EXPIRED` | 400 | false | 만료 안내 + [재전송] 활성화 |
| `EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED` | 400 | false | "코드를 다시 받아주세요" + [재전송] |
| `EMAIL_VERIFICATION_NOT_FOUND` | 404 | false | 입력 화면으로 되돌림 |

## 6. 흐름

**신규 가입**

```
POST /auth/social-login          → status: consent_required, signup_token
        (약관 동의 화면)
POST /auth/sign-up               → 201 계정 생성 + 토큰
        (온보딩)
```

**이메일 등록·인증** — 세 진입 경로 공통

```
(재진입 시) GET  /users/me/email-verifications/active
POST /users/me/email-verifications              → verification_id, expires_at
POST /users/me/email-verifications/:id/verify   → users.email 저장
```

- 복귀 지점만 다르다: 결제 경로는 원래 결제 플로우로, 설정·프로필 경로는 직전 화면으로.
- **결제 경로에서는 인증이 끝나기 전에 결제를 시작하지 않는다.** 결제만 되고 이메일이 없는 상태를 만들지 않기 위해서다(`auth.md` 4.4). 판정은 결제 API가 수행하며, 이메일이 없으면 `EMAIL_REQUIRED_FOR_PURCHASE`로 막는다 → **`subscription-api` 소관이므로 이 문서에서 정의하지 않는다.**

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **소셜 토큰은 서버가 제공자 API로 검증한다.** 클라이언트가 보낸 프로필을 신뢰하지 않는다.
- **모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR 방지).
- 인증 요청(로그인·토큰 갱신)은 **IP·계정 단위 레이트 리밋** 대상이다.
- **이메일 인증 코드는 해시로 저장하고 원문을 로그에 남기지 않는다.** 로그 마스킹 대상: 소셜 토큰, refresh token, 인증 코드, 이메일 주소.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.
- 발송·검증 응답 시간을 일정하게 유지한다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `users` | 3.1 |
| `consents` (append-only) | 3.2 |
| `sessions` | 3.3 |
| `withdrawal_logs` | 3.4 |
| `archived_users` · `archived_consents` · `archived_subscriptions` | 11장 |
| `email_verifications` | **미등재 — 추가 필요** |

- **`email_verifications`가 아직 `domain.md`에 없다.** 4.7~4.9가 요구하는 값(코드 해시·발송 시각·만료 시각·검증 시도 횟수·계정별 발송 횟수·잠금 해제 시각)을 서버가 판정하려면 저장소가 필요하다. `domain.md` 3장에 추가한 뒤 이 표의 참조를 채운다.
- 만료·완료된 인증 행은 배치로 정리한다(개인정보 최소보유).

## 9. 미결 사항

- **`email_verifications` 테이블 추가** — 위 8장. 이것 없이는 4.7~4.9를 구현할 수 없다.
- **메일 발송 인프라** — SES·SendGrid 등 제공자와 발신 도메인(SPF·DKIM·DMARC). 인증 메일이 스팸으로 분류되면 5회 제한이 그대로 이탈로 이어진다.
- **`signup_token` 수명** — 약관 동의 화면 체류 시간을 감안해 정해야 한다(잠정 10분).
- **탈퇴 사유 `reason_code` 값 목록** — 화면 카피와 함께 확정 필요.
- **레이트 리밋 구체 수치** — `architecture.md` 9.6이 "잠정"으로 두고 있다. 인증 요청 IP·계정 단위 임계값 확정 필요.
