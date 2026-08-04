# auth-api

# 인증·계정 API 명세서

> 기준 문서: [`docs/pages/auth.md`](../../pages/auth.md)
규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3장
> 

## 1. 범위

`auth.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 넷이다.

- 소셜 로그인·가입(약관 동의 시점의 계정 생성)
- 토큰 갱신·로그아웃
- 회원 탈퇴
- 이메일 등록·코드 인증

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `auth.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

## 2. 공통 규약

| 항목 | 값 |
| --- | --- |
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
| --- | --- | --- |
| access_token | 30분 | 저장하지 않음(stateless 검증) |
| refresh_token | 30일 | **해시**해서 `sessions`에 저장. 원문 저장 금지 |
- refresh token은 사용 시 **회전**한다. 이미 쓰인 토큰이 재사용되면 해당 사용자의 **세션 전체를 무효화**한다(탈취 감지).

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/auth/social-login` | 소셜 토큰 검증 → 기존 로그인 / 신규 동의 요구 분기 | — |  |
| 2 | POST | `/auth/sign-up` | 약관 동의 → **계정 생성** + 토큰 발급 | — | ★ |
| 3 | POST | `/auth/token/refresh` | 토큰 갱신(회전) | — |  |
| 4 | POST | `/auth/logout` | 이 기기 세션 폐기 | 필요 |  |
| 5 | POST | `/users/me/consents` | 약관 재동의 · 마케팅 수신 동의 변경 | 필요 |  |
| 6 | GET | `/users/me/withdrawal-preview` | 탈퇴 안내 화면에 쓸 파기·보존 범위 조회 | 필요 |  |
| 7 | POST | `/users/me/withdraw` | 회원 탈퇴 | 필요 | ★ |
| 8 | POST | `/users/me/email-verifications` | 인증 코드 발송 | 필요 | ★ |
| 9 | GET | `/users/me/email-verifications/active` | 진행 중인 인증 조회(재진입용) | 필요 |  |
| 10 | POST | `/users/me/email-verifications/:id/verify` | 코드 검증 → `users.email` 저장 | 필요 |  |
| 11 | DELETE | `/users/me/email-verifications/:id` | 진행 중인 인증 무효화 ([메일 다시 입력]) | 필요 |  |

**설계 메모**

- **탈퇴가 `DELETE /users/me`가 아닌 이유**: 사유·확인 값·구독 만료 동의를 본문으로 받아야 하고, 서버가 이관과 파기를 하나의 트랜잭션으로 수행하는 **상태 전이**이기 때문이다. `convention.md` 5.2의 하위 액션 규칙을 따른다.
- **탈퇴 미리보기(6)를 따로 두는 이유**: `auth.md` 4.3이 **결제 이력 유무에 따라 고지 문구를 다르게** 하도록 확정했다. 결제 이력이 없으면 보존 항목이 없으므로 “5년 보관” 안내를 띄우면 사실과 다른 고지가 된다. **판정은 서버 몫이며 클라이언트가 로컬 구독 상태로 추측하지 않는다.**
- **이메일 인증이 두 단계인 이유**: `auth.md` 3장 — `email`과 `verification_code`를 한 번에 보내지 않는다. 발송(8)으로 인증 건을 만들고, 그 건에 대해 검증(10)한다.
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
| --- | --- | --- | --- |
| provider | enum `kakao` | `naver` | `google` | 필수 |  |
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
    "is_email_verified": true,
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

- **이 응답 시점에는 계정이 존재하지 않는다.** 계정은 `/auth/sign-up`에서 생성된다(`auth.md` 4.1 — “동의 버튼을 누른 시점에 계정이 생성된다”).
- `signup_token`은 검증된 제공자 신원을 담은 **단기 토큰**이다. 클라이언트가 `provider_user_id`를 들고 다니게 하지 않는다.
- **동의 화면에 보여줄 현행 버전을 서버가 내려준다.** 클라이언트에 버전을 하드코딩하지 않는다.

**`pending_consents`** — 기존 계정이라도 약관이 개정됐으면 재동의가 필요한 항목이 담긴다. 판정은 **서버가 `consents`의 최신 버전과 현행 버전을 비교해서** 한다. 클라이언트가 보낸 버전을 신뢰하지 않는다(`auth.md` 7). 재동의는 `/users/me/consents`로 처리한다.

**이메일 처리** — 제공자가 이메일을 주면 **주소와 인증 여부를 함께 판정해** `users.email` · `users.is_email_verified`에 저장한다(`auth.md` 4.1).

**카카오는 `kakao_account`의 두 플래그를 모두 확인한다.**

| `is_email_valid` | `is_email_verified` | `users.email` | `users.is_email_verified` |
| --- | --- | --- | --- |
| true | true | 받은 주소 | `true` |
| true | false | 받은 주소 | `false` |
| false | — | **`null`** (마스킹 주소) | `false` |
- **`is_email_valid = false`면 카카오가 주소를 마스킹해서 내려준다**(`ka***@kakao.com`). 발송도 식별도 불가능하므로 저장하지 않는다. **마스킹 여부를 문자열 패턴(`**`)으로 판정하지 않는다** — 제공자가 형식을 바꾸면 그대로 뚫린다.
- **구글·네이버는 대응 플래그가 없어 인증된 것으로 간주한다.** 구글이 `email_verified` 클레임을 내려주면 그 값을 쓴다.
- 응답의 `is_email_verified`는 **`users` 컬럼 값이며 제공자 응답을 그대로 중계한 값이 아니다.** 우리 코드 인증(4.10)으로 확인한 주소도 `true`가 된다.
- 클라이언트는 이 값으로 **결제 전 인증 화면 진입 여부**를 판단한다(`auth.md` 4.4). 다만 최종 판정은 결제 API가 서버에서 다시 한다.

**에러**

| 코드 | HTTP | 상황 |
| --- | --- | --- |
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
| --- | --- | --- |
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
| --- | --- | --- |
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

### 4.6 `GET /users/me/withdrawal-preview`

탈퇴 안내 화면이 **무엇을 고지할지** 서버에서 받아온다. `auth.md` 4.3의 1단계에 대응한다.

**Response 200 — 결제 이력 있음**

```json
{
  "has_payment_history": true,
  "has_active_subscription": true,
  "subscription_expiry_agreement_required": true,
  "retained": {
    "years": 5,
    "items": ["email", "subscription_history", "consent_history"]
  }
}
```

**Response 200 — 결제 이력 없음**

```json
{
  "has_payment_history": false,
  "has_active_subscription": false,
  "subscription_expiry_agreement_required": false,
  "retained": null
}
```

| 필드 | 의미 |
| --- | --- |
| `has_payment_history` | `subscriptions` 행이 하나라도 있는가. **`status`를 보지 않는다** — `refunded` · `expired` · `cancelled`도 거래기록이다 |
| `has_active_subscription` | 만료 동의 안내를 띄울지. 스토어 해지 안내(텍스트만)의 조건이기도 하다 |
| `subscription_expiry_agreement_required` | `withdraw` 요청에 `agreed_subscription_expiry`가 필수인지 |
| `retained` | 보존 항목. **결제 이력이 없으면 `null`이며, 클라이언트는 “모든 데이터가 즉시 삭제됩니다”만 노출한다** |
- **`retained`가 빈 배열이 아니라 `null`인 이유**: “보존할 항목이 0건”과 “보존 자체가 없음”은 화면이 달라진다. 빈 배열이면 클라이언트가 보존 섹션을 껍데기만 그리게 된다.
- **판정은 서버가 한다.** 클라이언트가 로컬 구독 상태(`user.tier`)로 추측하면, 결제했다가 만료돼 `light`로 돌아온 사용자를 “결제 이력 없음”으로 잘못 안내한다.
- 이 응답은 **안내용이다.** `withdraw`는 자기 트랜잭션 안에서 같은 판정을 다시 수행하며, 이 응답을 클라이언트가 되돌려 보내는 필드는 없다(`auth.md` 4.3).

---

### 4.7 `POST /users/me/withdraw`

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
| --- | --- | --- |
| reason_code | 선택 | 선택형 사유 |
| reason_text | 선택 | 자유 입력 |
| confirm | **필수** | 안내 확인 체크. `true`가 아니면 거부 |
| agreed_subscription_expiry | 조건부 필수 | **활성 구독이 있을 때만** 필수 |

**Response 204**

**서버 처리** — **결제 이력 유무로 갈린다.** 이관과 파기는 **하나의 트랜잭션**에서 수행한다(`domain.md` 12.3).

판정 기준은 **`subscriptions` 행의 존재 여부** 하나이며, **트랜잭션 안에서 다시 수행한다.** 4.6이 내려준 값을 신뢰하지 않는다 — 안내 화면 체류 중에 상태가 바뀔 수 있다.

|  | 결제 이력 있음 | 결제 이력 없음 |
| --- | --- | --- |
| 즉시 파기 | 라이브러리·관심사·커리어·재생 위치·재생 기록·소비 신호·설정·기기 토큰·세션·알림 로그·드립 제외 목록·**이메일 인증 기록** | 왼쪽 전부 **+ `users` + `consents`** |
| 아카이브 후 파기(5년) | `archived_users` · `archived_consents` · `archived_subscriptions` | **없음 — 행을 만들지 않는다** |
| `withdrawal_logs` | 남긴다 | 남긴다 |
| `users` 행 | 삭제 | 삭제 |
- **결제 이력이 없으면 아카이브하지 않는다.** 개인정보보호법 제21조 제1항의 원칙은 파기이고 보존은 다른 법령의 근거가 있을 때만 허용되는 예외인데, 거래가 없으면 전자상거래법 시행령 제6조의 보존 대상이 성립하지 않는다(`domain.md` 12.2).
- `users` 행은 두 경우 모두 **삭제한다.** `status = withdrawn`으로 남겨두지 않는다.
- 아카이브 이관 시 `users.email IS NULL`이면 **트랜잭션을 실패시킨다**(`domain.md` 11.3). 결제 이력이 있는데 이메일이 없다는 것은 결제 전 이메일 게이트가 뚫렸다는 뜻이므로 조용히 넘기지 않는다.

**에러**

| 코드 | HTTP | 상황 |
| --- | --- | --- |
| `WITHDRAWAL_CONFIRM_REQUIRED` | 400 | `confirm != true` |
| `WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED` | 400 | 활성 구독이 있는데 만료 동의 없음 |
| `WITHDRAWAL_ARCHIVE_IDENTITY_MISSING` | 500 | 결제 이력이 있는데 `users.email`이 없음. **탈퇴를 진행하지 않는다** — 데이터 정합성 문제이므로 알림 대상이다 |
- **스토어 구독은 탈퇴로 자동 해지되지 않는다.** 서버는 해지를 대행하지 않으며, 클라이언트는 안내를 **텍스트로만** 노출한다(스토어 이동 버튼·딥링크 금지 — `auth.md` 4.3).
- 탈퇴 처리 중 앱이 종료돼도 서버 트랜잭션은 완료된다. 재실행 시 토큰 갱신이 실패해 시작 화면으로 간다.

---

### 4.8 `POST /users/me/email-verifications` — 코드 발송

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
  "resend_available_at": "2026-08-03T09:00:30Z",
  "send_count_used": 2,
  "send_count_limit": 5,
  "attempts_limit": 5
}
```

**규칙** (`auth.md` 4.5)

| 항목 | 값 |
| --- | --- |
| 코드 형식 | 6자리 숫자 |
| 유효 시간 | **3분** (발송 시각 기준) |
| 동시 유효 코드 | **1개** — 재발송 시 이전 코드 즉시 무효 |
| 재발송 쿨다운 | **30초** |
| 발송 가능 횟수 | **이메일 주소당 5회** |
| 발송 횟수 초기화 | 그 주소의 5회째 발송 시각 + **1시간** |
- **코드 원문을 저장하지 않는다.** 해시만 저장한다(`sessions.refresh_token_hash`와 같은 규칙).
- **발송 횟수는 `(계정, 이메일 주소)` 단위로 센다.** 계정 단위가 아니다 — 오타로 잘못 입력한 주소가 맞는 주소의 기회까지 소진하면 사용자가 잘못한 것 없이 1시간을 기다리게 된다.
    - 따라서 `send_count_used` · `send_count_limit`은 **요청 본문의 `email`에 대한 값이다.** 다른 주소를 보내면 다른 카운터가 적용된다.
    - 서버는 `email_verifications`의 `send_seq`로 발송 창을 판정한다(`domain.md` 3.7). `COUNT(*)` 누적으로 세지 않는다.
- **발송에 성공한 건만 카운트한다.** 메일 발송 API 자체가 실패하면 차감하지 않는다. 인프라 장애로 사용자의 5회를 소진시키지 않기 위해서다.
- 유효 시간·발송 횟수·쿨다운은 **전부 서버가 판정한다.** 앱을 재설치하거나 다른 기기에서 시도해도 제한이 그대로 적용돼야 한다.
- 세 진입 경로(결제·설정·프로필)의 호출은 **같은 주소라면 같은 카운터에 합산**된다.
- **같은 `(계정, 주소)`의 동시 요청은 직렬화한다.** 조회와 삽입 사이에 다른 요청이 끼어들면 같은 `send_seq` 행이 두 개 생겨 제한이 샌다(`domain.md` 3.7).

**에러**

| 코드 | HTTP | `retry_after_sec` | 상황 |
| --- | --- | --- | --- |
| `EMAIL_FORMAT_INVALID` | 400 | — | 형식 검증 실패 |
| `EMAIL_ALREADY_REGISTERED` | 409 | — | 현재 계정에 이미 등록됐고 **인증까지 끝난** 같은 주소. 코드를 보내지 않으며 **발송 횟수를 소모하지 않는다** |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN` | 429 | 남은 초 | 같은 주소로 직전 발송한 지 30초 미경과 |
| `EMAIL_VERIFICATION_SEND_LIMIT` | 429 | **잠금 해제까지 남은 초** | **그 주소로** 5회 소진. 클라이언트는 분 단위로 환산해 안내하고, **[메일 다시 입력]은 활성으로 둔다** — 다른 주소로는 발송할 수 있다 |
| `EMAIL_SEND_FAILED` | 502 | — | 메일 발송 실패. `retryable: true`, **횟수 미차감** |
- **`EMAIL_ALREADY_REGISTERED`는 인증까지 끝난 주소에만 적용한다.** `users.email`에 값이 있어도 `is_email_verified = false`면 **그 주소로 코드를 보내야 한다** — `auth.md` 4.4의 [이 주소로 인증] 경로가 바로 이 호출이다. 이 경우를 409로 막으면 미인증 사용자가 결제로 나아갈 방법이 사라진다.
- **다른 계정이 이미 쓰는 이메일은 허용한다.** 이메일은 식별자가 아니라 거래 주체 확인용 연락처이며, 계정 식별은 `provider + provider_user_id`가 한다(`auth.md` 7).
- **[메일 다시 입력]에 대응하는 별도 엔드포인트는 없다.** 클라이언트가 입력 화면으로 돌아가 다른 주소로 이 엔드포인트를 다시 호출할 뿐이다. 같은 주소로 다시 호출하면 재발송과 동일하게 쿨다운·횟수 제한이 걸린다(`auth.md` 4.5).

---

### 4.9 `GET /users/me/email-verifications/active`

코드 입력 중 앱이 종료됐다가 재진입한 경우, **재발송 없이 이어서 입력**하기 위한 조회다.

**Response 200 — 진행 중인 인증 있음**

```json
{
  "active": true,
  "verification_id": "uuid",
  "email": "user@example.com",
  "expires_at": "2026-08-03T09:03:00Z",
  "attempts_remaining": 4,
  "resend_available_at": "2026-08-03T09:00:30Z",
  "send_count_used": 2,
  "send_count_limit": 5,
  "send_locked_until": null
}
```

**Response 200 — 없음**

```json
{ "active": false, "email": null, "send_count_used": null, "send_count_limit": 5, "send_locked_until": null }
```

- **없음을 404로 응답하지 않는다.** 진행 중인 인증이 없는 것은 정상 상태이며, 클라이언트는 이 응답으로 **발송 잠금 여부까지** 판단해야 하기 때문이다.
- **`send_count_used` · `send_locked_until`은 `email` 필드의 주소에 대한 값이다.** 카운터가 주소 단위이므로(4.8) 대상 주소 없이는 의미가 없다.
    - 따라서 `active: false`일 때는 두 값이 `null`이다. **진행 중인 인증이 없으면 어느 주소를 기준으로 셀지 정해지지 않는다.**
    - 클라이언트는 이 경우 잠금 안내를 미리 그리지 않고, 사용자가 주소를 입력해 4.8을 호출한 결과(`EMAIL_VERIFICATION_SEND_LIMIT`)로 판단한다.
- 클라이언트는 남은 시간을 자체 타이머로 복원하지 않고 **`expires_at`으로 다시 계산한다**(`auth.md` 7).
- **발송이 잠긴 상태여도 유효한 코드가 남아 있으면 `active: true`다.** 잠기는 것은 발송이지 검증이 아니다.
- **[메일 다시 입력]으로 무효화된 건은 `active: false`다.** 화면을 벗어나는 순간 서버가 `invalidated_at`을 찍기 때문이다(`domain.md` 3.7).

---

### 4.10 `POST /users/me/email-verifications/:id/verify` — 코드 검증

**Request**

```json
{ "code": "482913" }
```

**Response 200**

```json
{ "email": "user@example.com", "is_email_verified": true, "verified_at": "2026-08-03T09:01:20Z" }
```

- **검증에 성공한 서버가 `users.email`과 `users.is_email_verified = true`를 함께 저장한다.** 클라이언트가 “인증 완료” 상태를 보내는 경로는 없다.
- **두 컬럼을 같은 트랜잭션에서 쓴다.** `email`만 바뀌고 `is_email_verified`가 이전 값으로 남으면, 미인증 주소가 인증된 것으로 둔갑하거나 그 반대가 된다.
- **성공 시점에만 값이 바뀐다.** 코드 발송까지 했더라도 검증 전에 이탈하면 기존 이메일과 인증 상태가 그대로 남는다. 중간 상태를 `users`에 쓰지 않는다.

**에러**

| 코드 | HTTP | 추가 필드 | 상황 |
| --- | --- | --- | --- |
| `EMAIL_VERIFICATION_CODE_MISMATCH` | 400 | `attempts_remaining` | 코드 불일치 |
| `EMAIL_VERIFICATION_CODE_EXPIRED` | 400 | — | 3분 경과 |
| `EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED` | 400 | — | 검증 시도 5회 소진 → 코드 무효, 재발송 필요 |
| `EMAIL_VERIFICATION_NOT_FOUND` | 404 | — | `:id`가 없거나, **재발송 또는 [메일 다시 입력]으로 무효화된** 이전 건 |
- **“코드가 틀림”과 “코드가 만료됨”을 반드시 다른 코드로 내려준다.** 둘을 뭉뚱그리면 사용자가 재발송해야 하는지 다시 입력해야 하는지 알 수 없다(`auth.md` 4.5).
- **응답 시간을 일정하게 유지한다**(타이밍 공격 방지).
- 재발송으로 새 코드를 받은 뒤 이전 코드를 입력하면 실패한다. 유효한 코드는 항상 마지막 1개다.

---

### 4.11 `DELETE /users/me/email-verifications/:id` — 무효화

`auth.md` 4.5의 **[메일 다시 입력]** 에 대응한다. 코드 입력 화면을 벗어날 때 호출한다.

**Response 204**

- 서버는 해당 건에 `invalidated_at`을 찍는다(`domain.md` 3.7). 이후 그 코드로는 검증되지 않는다.
- **발송 횟수를 되돌리지 않는다.** 메일은 이미 나갔고, 되돌리면 무효화를 반복해 제한을 무력화할 수 있다.
- **이미 무효화·만료된 건에도 204를 반환한다.** 화면 이탈 시점에 호출하는 정리성 요청이므로 실패시킬 이유가 없다.
- **호출이 실패해도 클라이언트는 입력 화면으로 되돌아간다.** 무효화되지 않은 코드는 3분 뒤 만료되고, 다음 발송이 어차피 이전 코드를 무효화한다(4.8).
- 이 호출이 없으면 **재진입 시 4.9가 버려진 주소의 인증 건을 `active: true`로 돌려준다.** 사용자는 방금 포기한 주소의 코드 입력 화면을 다시 보게 된다.

---

## 5. 에러 코드 표

**추가·변경 시 `architecture.md` 7.5에 따라 enum 한 곳에서 관리하고 `common-error-handling.md` 6장 표를 함께 갱신한다.** 이미 배포된 코드의 의미를 바꾸지 않는다.

| error_code | HTTP | retryable | 클라이언트 동작 |
| --- | --- | --- | --- |
| `AUTH_PROVIDER_TOKEN_INVALID` | 401 | false | 토스트 후 시작 화면 유지 |
| `AUTH_PROVIDER_UNAVAILABLE` | 502 | **true** | [다시 시도] — 제공자 인증부터 재수행 |
| `AUTH_SIGNUP_TOKEN_EXPIRED` | 401 | false | 시작 화면으로, 로그인부터 재시작 |
| `CONSENT_REQUIRED` | 400 | false | 필수 동의 체크 유도 |
| `CONSENT_VERSION_STALE` | 409 | false | 최신 약관 다시 조회 후 재동의 |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | false | 로컬 세션 정리 → 시작 화면 |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | false | 동일. 서버는 전 세션 무효화 |
| `WITHDRAWAL_CONFIRM_REQUIRED` | 400 | false | 확인 체크박스 강조 |
| `WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED` | 400 | false | 구독 만료 동의 체크 강조 |
| `WITHDRAWAL_ARCHIVE_IDENTITY_MISSING` | 500 | false | 공통 오류 화면. 탈퇴는 진행되지 않았음을 안내 |
| `EMAIL_FORMAT_INVALID` | 400 | false | 인라인 “이메일 형식을 확인해주세요” |
| `EMAIL_ALREADY_REGISTERED` | 409 | false | 인라인 “이미 등록된 이메일이에요” |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN` | 429 | false | [재전송] 비활성 + 남은 초 표시 (30초) |
| `EMAIL_VERIFICATION_SEND_LIMIT` | 429 | false | 발송 버튼 비활성 + **분 단위** 잠금 안내. **[메일 다시 입력]은 활성 유지** |
| `EMAIL_SEND_FAILED` | 502 | **true** | 토스트 + [다시 시도]. 횟수 미차감 안내 |
| `EMAIL_VERIFICATION_CODE_MISMATCH` | 400 | false | 인라인 + 남은 시도 횟수 |
| `EMAIL_VERIFICATION_CODE_EXPIRED` | 400 | false | 만료 안내 + [재전송] 활성화 |
| `EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED` | 400 | false | “코드를 다시 받아주세요” + [재전송] |
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
(재진입 시) GET    /users/me/email-verifications/active
POST   /users/me/email-verifications              → verification_id, expires_at
  ├─ [메일 다시 입력] → DELETE /users/me/email-verifications/:id → 입력 화면으로, 다시 POST
  └─ POST /users/me/email-verifications/:id/verify → users.email + is_email_verified 저장
```

- 복귀 지점만 다르다: 결제 경로는 원래 결제 플로우로, 설정·프로필 경로는 직전 화면으로.
- **결제 경로에서는 인증이 끝나기 전에 결제를 시작하지 않는다.** 결제만 되고 이메일이 없는 상태를 만들지 않기 위해서다(`auth.md` 4.4). 판정은 결제 API가 수행하며, 조건은 **`email IS NOT NULL AND is_email_verified = true`** 다. 충족하지 못하면 `EMAIL_REQUIRED_FOR_PURCHASE`로 막는다 → **`subscription-api` 소관이므로 이 문서에서 정의하지 않는다.**
- **미인증 이메일을 가진 사용자**(`email` 있음 + `is_email_verified = false`)는 인증 선택 화면을 거친다(`auth.md` 4.4). [이 주소로 인증]은 저장된 주소로, [다른 메일 입력]은 새 주소로 같은 발송 엔드포인트를 호출할 뿐 **API가 갈라지지 않는다.**

**회원 탈퇴**

```
GET  /users/me/withdrawal-preview   → has_payment_history로 고지 문구 분기
POST /users/me/withdraw             → 204, 서버가 판정을 다시 수행
```

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
> 

| 사용하는 것 | domain.md |
| --- | --- |
| `users` — `email` · `is_email_verified` | 3.1 |
| `consents` (append-only) | 3.2 |
| `sessions` | 3.3 |
| `withdrawal_logs` | 3.4 |
| `email_verifications` — 코드 해시·만료·검증 시도·주소별 발송 순번 | 3.7 |
| `subscriptions` — 결제 이력 판정(4.6·4.7) | 8.2 |
| `archived_users` · `archived_consents` · `archived_subscriptions` | 11장 |
- **`is_email_verified`는 `users`의 컬럼이며 제공자 응답의 중계값이 아니다.** 가입 시점에 환산해 저장한 값만 쓰고, 판정 때마다 제공자 API를 다시 조회하지 않는다(`domain.md` 3.1).
- **발송 횟수는 컬럼이 아니라 `email_verifications`의 행으로 센다.** `(user_id, email)`당 5행이 한 창이며 `send_seq`로 판정한다(`domain.md` 3.7).
- 만료·완료된 인증 행은 배치로 정리한다 — `expires_at`으로부터 24시간 후 hard delete(`domain.md` 3.7).
- **`subscriptions`는 `subscription` 모듈 소유다**(`domain.md` 2장). 탈퇴·미리보기는 그 모듈이 노출한 Service로 결제 이력 유무만 조회하고, Repository를 직접 주입받지 않는다(`architecture.md` 4.3).

## 9. 미결 사항

- **메일 발송 인프라** — SES·SendGrid 등 제공자와 발신 도메인(SPF·DKIM·DMARC). 인증 메일이 스팸으로 분류되면 5회 제한이 그대로 이탈로 이어진다.
    
    → Amazon SES 를 보낼 예정이지만, 현재 확정은 아니다.
    
- **계정 단위 발송 상한(백스톱) — P0** — 4.8의 카운터가 `(계정, 주소)` 단위라 **계정 단위 총량 제한이 없다.** 주소를 갈아 끼우면 한 계정의 발송량에 상한이 없어 메일 발송기로 악용될 수 있다. 상한을 둘지와 그때 쓸 에러 코드(`EMAIL_VERIFICATION_ACCOUNT_SEND_LIMIT` 신설 여부)를 정해야 한다. 발신 도메인 평판이 걸린 문제라 인프라 선택보다 먼저 결정하는 편이 좋다(`auth.md` 미결 사항).
    
    → 일단은 감안한다.
    
- **`signup_token` 수명** — 약관 동의 화면 체류 시간을 감안해 정해야 한다(잠정 10분).
    
    → 10분으로 진행한다.
    
- **탈퇴 사유 `reason_code` 값 목록** — 화면 카피와 함께 확정 필요.
    
    → content_quailty : 콘텐츠 품질이 기대에 못 미쳤어요.
    → recommendation_mismatch : 제 관심사와 맞지 않는 콘텐츠가 왔어요
    → low_usage : 들을 시간이 없거나 잘 안 쓰게 됐어요.
    → price : 구독 가격이 부담됐어요
    → not_enough_content : 듣고 싶은 주제 콘텐츠가 부족했어요
    → app_issue : 앱 오류나 사용이 불편했어요.
    → alternative : 다른 서비스를 이용하게 됐어요.
    → other : 기타 (직접 입력)