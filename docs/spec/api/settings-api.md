# 설정 API 명세서

> 기준 문서: [`docs/features/settings.md`](../../features/settings.md)
> 관련 규칙: [`docs/features/notification.md`](../../features/notification.md) 4.2(알림 토글)·4.1(사전 안내 유도 배너) · [`docs/features/interest-management.md`](../../features/interest-management.md) 3장(자동 확장 토글) · [`docs/features/career.md`](../../features/career.md)(커리어 정보 화면)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3.1 · 3.2 · 3.5 · 3.6 · 8장

## 1. 범위

`settings.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 설정은 대부분 하위 기능으로 연결하는 허브이므로, 이 문서가 소유하는 것은 셋뿐이다.

- 설정 화면 조회 — 계정·구독 요약 + `user_settings` + **마케팅 수신 동의 상태** + 버전 정보를 한 번에
- 설정 값 변경 — 배속·자동 확장·이어 PICK 알림의 **즉시 저장**(낙관적 UI)
- **마케팅 수신 동의·철회** — `user_settings`가 아니라 **`consents`에 행을 추가**하는 별도 엔드포인트(합의 2026-08-06 — `domain.md` 3.2)

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 이메일 등록·인증·변경 | `auth-api.md` 4.8~4.11 | 계정 섹션 표시용 값만 조회 |
| 로그아웃 | `auth-api.md` 4.4 | 참조만 한다 |
| 회원 탈퇴 | `auth-api.md` 4.6~4.7 | 참조만 한다 |
| 관심 주제 일괄 편집 | `interest-management.md` (API 명세 미작성) | 요약 표시용 값만 조회. **자동 확장 토글만 이 문서의 PATCH가 저장한다**(일괄 편집 대상이 아님 — `interest-management.md` 3장) |
| 커리어 정보 편집 | `career.md` (합의 2026-08-06 분리 — API 명세 미작성) | **메뉴 목적지(커리어 정보 화면)만 안다.** 커리어 요약도 이 응답에 없다 — 요약 표시는 프로필 카드 소관(`profile-api.md` 4.1)이고 설정 메뉴는 진입 행만 둔다 |
| 구독 변경·해지·복원 | `subscription.md` (API 명세 미작성) | 구독 요약 표시용 값만 조회(결제 유예 상태 포함 — 4.1) |
| OS 알림 권한 상태 동기화 | `onboarding-api.md` 4.9 (`PUT /users/me/devices/:device_id`) | 참조만 한다. 포그라운드 복귀·사전 안내 완료 시 같은 엔드포인트를 호출한다 |
| 강제 업데이트 판정 | `splash.md` | 설정의 버전 항목은 **안내 표시**일 뿐, 차단 판정이 아니다 |
| 오프라인 저장 관리 | `offline-download.md` (P1 이연) | 엔드포인트를 정의하지 않는다. 메뉴 자체가 미노출이다 |
| 공지사항 | 인앱 화면(합의 2026-08-06 — 화면 명세 추후 작성) | **목록 API는 화면 명세 확정 후 정의한다**(9장 미결). 이 문서는 메뉴 항목만 안다 |
| 이용약관·개인정보처리방침 본문 | 인앱 브라우저(URL은 배포 설정) | 엔드포인트를 정의하지 않는다 |
| 문의하기 | 카카오톡 채널(합의 2026-08-06 — `settings.md` 4.1) | **엔드포인트가 없다.** 채널 URL은 배포 설정으로 관리하고, 열 수 없으면 링크 복사 폴백(`settings.md` 7장) — 전부 클라이언트 동작이다 |
| 관리자 페이지 | `admin.md` | **메뉴 노출 판단 필드(`account.is_admin`)만 내려준다.** 관리자 기능의 API·접근 통제는 admin 소관이다 |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — **모든 엔드포인트 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **없다.** PATCH는 절대값 저장이라 결과가 수렴하고(3장 설계 메모), 동의 POST는 이력 추가지만 상태는 최신 행으로 수렴한다(4.3) |

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/users/me/settings` | 설정 화면 조회 — 계정·구독 요약 + 설정값 + 동의 상태 + 버전 | 필요 | |
| 2 | PATCH | `/users/me/settings` | 설정 값 부분 변경(배속·자동 확장·이어 PICK 알림) | 필요 | |
| 3 | POST | `/users/me/consents/marketing` | 마케팅 수신 동의·철회 — `consents` 행 추가 | 필요 | |

**설계 메모**

- **조회를 항목별로 나누지 않는다.** 계정·구독 카드와 토글 값이 한 화면에 함께 뜨므로 한 번에 받는다(`settings.md` 3장). 조회가 실패해도 서버 값이 필요 없는 메뉴(약관·로그아웃 등)는 동작해야 하므로, 부분 실패는 `profile-api.md` 4.1과 같은 `failed_sections` 방식으로 표현한다.
- **PATCH는 토글·시트 선택의 절대값 저장이다.** "켜라/꺼라"가 아니라 "이 값으로 하라"를 보내므로, 같은 요청이 두 번 도착해도 결과가 같다 — 멱등키가 필요 없다.
- **마케팅 수신 동의는 PATCH에 싣지 않는다.** 저장 구조가 다르다 — `user_settings`는 절대값 UPDATE지만 동의는 `consents`에 **이력 행을 추가하는 INSERT**다(`domain.md` 3.2 — append-only, 합의 2026-08-06). 한 PATCH에 섞으면 같은 요청의 절반은 갱신·절반은 적재가 되어 실패·재전송의 성질이 갈라지고, "마케팅 토글 컬럼이 `user_settings`에 있다"는 오해를 계약이 다시 만든다. 상세는 4.3.
- **연타의 순서 문제는 `client_seq`로 푼다**(`settings.md` 7장 — 마지막 상태가 최종). 서버가 순번을 저장·판정하지 않고 응답에 되돌리기만 하는 이유는 `explore-api.md` 4.3과 같다 — 표시 순서 문제를 풀자고 컬럼을 만들지 않는다.
- **알림 토글의 OS 권한 게이트는 서버가 판정할 수 없다.** OS 권한 상태는 기기만 안다. 권한이 거부된 상태에서 토글 ON 시도는 **클라이언트가 서버 호출 없이** "기기 설정에서 알림을 허용해주세요" 안내로 막는다(`settings.md` 4.3). 서버의 `is_drip_notification_enabled`는 **앱 토글**이며, 발송 여부 판정은 이 값과 `device_tokens.is_os_permission_granted`를 **둘 다** 본다(`notification.md` 4.2).
- **알림 사전 안내 유도 배너의 노출 판단 필드도 없다**((b)안 — 합의 2026-08-06). 노출 조건은 "OS 알림 권한 미결정"이고(`settings.md` 4.3 · `notification.md` 4.1) 그 상태는 클라이언트가 OS API로 직접 안다. 서버가 아는 것은 `device_tokens`에 동기화된 사본뿐이라, 필드를 내려주면 실제 권한과 어긋난 판단을 하게 된다 — **이 응답에 배너 관련 필드를 두지 않는다.**
- **관리자 메뉴 노출은 서버가 판정한 boolean 하나로 내려준다**(`account.is_admin`). 화면이 필요한 것은 [관리자] 섹션의 노출 여부 하나이므로 `users.role` enum을 그대로 내려 클라이언트가 해석하게 하지 않는다 — 판정은 서버가 한다. 이 값은 **표시 전용**이며, 관리자 기능의 접근 통제는 서버의 role 가드가 한다(`admin.md`).

---

## 4. 엔드포인트 상세

### 4.1 `GET /users/me/settings`

설정 화면 진입 시 호출한다.

**Request** — 쿼리 파라미터

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| app_version | string (semver) | 필수 | 업데이트 안내 판정용. **정책 판정이 아니라 표시 판정이다** |

**Response 200**

```json
{
  "account": {
    "email": "user@example.com",
    "is_email_verified": false,
    "is_admin": false
  },
  "plan": {
    "status": "subscribed",
    "tier": "daily",
    "plan_name": "데일리",
    "daily_play_limit": 5,
    "renews_at": "2026-09-01T00:00:00Z",
    "expires_at": null,
    "has_payment_issue": false
  },
  "interest_summary": {
    "count": 3,
    "top_topics": [ { "id": "uuid", "name": "커리어" } ]
  },
  "settings": {
    "default_playback_rate": 1.2,
    "is_auto_expand_enabled": true,
    "is_drip_notification_enabled": true
  },
  "marketing_consent": {
    "is_agreed": true,
    "agreed_at": "2026-05-01T09:00:00Z"
  },
  "version": {
    "latest_version": "1.4.0",
    "min_supported_version": "1.1.0",
    "update_available": true
  },
  "failed_sections": []
}
```

**`account`**

- `email` · `is_email_verified` **두 값을 함께 내려준다** — 미등록 / 미인증 / 인증됨 세 상태의 구분에 둘 다 필요하다(`settings.md` 3장). 상태 구분과 화면은 `profile.md` 4.3과 동일하다.
- `is_admin`: `users.role = 'admin'` 판정 결과다(`domain.md` 3.1). **[관리자] 메뉴 섹션의 노출 판단 전용이다** — `true`면 메뉴 맨 아래에 관리자 섹션을 노출하고, 일반 계정에는 행 자체가 없다(`settings.md` 4.1). 접근 통제가 아니다(3장 설계 메모). `account` 섹션 조회가 실패하면 관리자 섹션은 **노출하지 않는다**(안전한 기본값 false).
- **닉네임·제공자는 내려주지 않는다.** 그 표시는 프로필이 담당한다(`settings.md` 3장). 설정 화면에는 프로필로 되돌아가는 계정 카드를 두지 않는다(`settings.md` 2장).

**`plan`** — `profile-api.md` 4.1의 `plan`과 **같은 모양, 같은 조립 함수**를 쓴다. 두 화면이 다른 로직으로 조립하면 프로필과 설정의 구독 표시가 어긋난다.

- **결제 실패 유예(`status = "grace"`)의 표시를 이 요약이 담당한다.** `has_payment_issue = true`면 구독 섹션에 경고색 + "결제에 문제가 있어요"를 그린다(`settings.md` 5장 — `profile.md` 4.2 · `subscription.md` 4.7과 동일).

**`interest_summary`** — `profile-api.md` 4.1과 동일한 모양·동일한 규칙(count ≥ 1, `top_topics`는 서버 응답 순서 앞 3개). 콘텐츠 섹션의 "관심 주제 관리" 항목에 요약을 붙일 때 쓴다.

**`settings`** — `user_settings` 원값(`domain.md` 3.5).

- `default_playback_rate`: `0.8 | 1.0 | 1.2 | 1.5 | 2.0`
- `is_auto_expand_enabled`: 주제 자동 확장(FR-06, **P1**). MVP에서는 값만 저장되고 배치는 돌지 않는다(`interest-management.md` 미결). **P1 미구현 상태에서는 화면이 섹션 자체를 숨긴다** — 값은 내려주되 그리지 않는다.
- `is_drip_notification_enabled`: **이어 PICK 알림** 앱 토글(FR-19, **P1**). 사용자 노출 명칭은 **"이어 PICK 알림"**(PICK 전부 대문자)이다 — "드립"은 내부 용어라 화면에 노출하지 않는다(합의 2026-08-06, `settings.md` 4.1). **컬럼명·필드명은 유지한다**(`domain.md` 3.5 — 화면 이름만 바뀐 것이지 데이터 의미가 바뀐 것이 아니다).
- 행이 없는 사용자(설정을 한 번도 바꾼 적 없음)는 **기본값으로 채워 내려준다.** 행 생성은 첫 PATCH 때 한다 — 조회가 쓰기를 유발하지 않는다.
- **마케팅 수신 동의는 이 오브젝트에 없다.** 저장소가 `user_settings`가 아니기 때문이다(아래 `marketing_consent`).

**`marketing_consent`** — 현재 동의 상태. `consents`의 `consent_type = 'marketing'` **최신 행**이다(`domain.md` 3.2).

- `settings`와 별도 필드로 두는 이유: 저장소가 다르고(이력 테이블), 변경 경로도 다르다(4.3). 계약에서 합쳐 두면 PATCH로 바꿀 수 있다는 오해가 생긴다.
- `agreed_at`은 최신 행의 시각이다(동의든 철회든). 가입 시 동의 3종이 항상 기록되므로(`auth.md` 3장) 행이 없는 경우는 정상적으로 없지만, 방어적으로 행이 없으면 `is_agreed: false` · `agreed_at: null`로 내려준다.

**`version`**

- `latest_version` · `min_supported_version`의 원천은 **배포 시 입력된 버전(배포 설정)으로 확정됐다**(합의 2026-08-06 — `settings.md` 3장 · `domain.md` 13.3). 테이블이 아니다.
- `update_available`은 요청의 `app_version < latest_version` 판정 결과다. **비교를 서버가 한다** — 클라이언트마다 semver 비교를 재작성하면 판정이 갈라진다. `true`면 앱 버전 항목에 배지 + [업데이트]를 노출한다.
- **강제 업데이트(`app_version < min_supported_version`) 판정은 스플래시 소관이다**(`splash.md`). 설정까지 들어온 세션은 이미 그 관문을 통과했으므로 여기서는 안내만 한다.

**`failed_sections`** — `profile-api.md` 4.1과 같은 방식. `account`·`plan`·`interest_summary` 조회가 실패하면 해당 키를 담고 그 필드를 `null`로 내려준다. **`settings`·`marketing_consent`·`version`이 실패하면 응답 전체가 실패한다** — 토글 기준값이 없으면 낙관적 UI를 시작할 수 없다.

---

### 4.2 `PATCH /users/me/settings`

배속·자동 확장·이어 PICK 알림의 즉시 저장. 토글·시트에서 값을 바꾸는 순간 호출된다.

**Request** — 바꿀 필드만 보낸다(부분 갱신)

```json
{ "is_drip_notification_enabled": false, "client_seq": 7 }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| default_playback_rate | float | 선택 | `0.8 / 1.0 / 1.2 / 1.5 / 2.0` 외의 값은 400 |
| is_auto_expand_enabled | boolean | 선택 | |
| is_drip_notification_enabled | boolean | 선택 | |
| client_seq | int | 필수 | 사용자별 설정 조작의 단조 증가 순번. 서버는 응답에 그대로 되돌린다 |

- 세 설정 필드 중 **최소 하나**는 있어야 한다. 전부 없으면 400.
- **마케팅 수신 동의 필드는 받지 않는다.** 전역 `ValidationPipe`가 잘라내는 것과 별개로, 계약에 존재하지 않는다 — 동의·철회는 4.3이다.
- **토글 연타**: 클라이언트는 자신이 마지막으로 보낸 순번보다 작은 `client_seq` 응답을 무시한다. 서버 상태는 마지막 도착 요청으로 수렴한다(절대값 저장이므로).

**Response 200**

```json
{
  "settings": {
    "default_playback_rate": 1.2,
    "is_auto_expand_enabled": true,
    "is_drip_notification_enabled": false
  },
  "client_seq": 7
}
```

- 갱신 후의 **설정 전체**를 되돌린다. 낙관적으로 바꾼 화면 값을 이 응답으로 확정한다.
- 저장 실패(5xx·타임아웃) 시 클라이언트는 **토글을 원상 복구하고 토스트**로 알린다(`settings.md` 4.2 · `common-error-handling.md` 4.4).
- **오프라인 중의 토글 조작은 큐에 적재해 복귀 시 재전송한다**(`settings.md` 7장). 같은 필드는 마지막 상태만 유지한다(`common-error-handling.md` 4.5 — "담기·삭제"와 같은 규칙).

**서버 처리**

1. `user_settings` 행이 없으면 기본값으로 생성 후 갱신(upsert). `uq_user_settings_user_id`가 중복 생성을 막는다
2. 보낸 필드만 갱신한다. 보내지 않은 필드는 건드리지 않는다

- **알림 토글 ON 저장에 OS 권한을 요구하지 않는다.** 권한은 기기 단위 값이라 서버가 검증할 수 없고, 권한 없는 기기에는 발송 판정(`notification.md` 4.2)이 어차피 보내지 않는다. ON 시도를 막는 것은 클라이언트의 안내 게이트다(3장 설계 메모).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 배속 허용값 외 / 설정 필드 0개 |

---

### 4.3 `POST /users/me/consents/marketing`

마케팅 수신 동의 토글. 켜면 동의, 끄면 철회 — **둘 다 `consents`에 새 행을 추가하는 append다**(`domain.md` 3.2, 합의 2026-08-06). 이 토글은 가입 시 받은 동의(`auth.md` 3장 `agreed_marketing`)의 **철회 경로**이기도 하다(정보통신망법 — `settings.md` 4.1).

**Request**

```json
{ "is_agreed": false, "client_seq": 8 }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| is_agreed | boolean | 필수 | 토글의 절대값. `false` = 철회 |
| client_seq | int | 필수 | 4.2와 같은 의미 — 서버는 저장·판정하지 않고 되돌린다 |

**Response 200**

```json
{
  "marketing_consent": { "is_agreed": false, "agreed_at": "2026-08-06T02:10:00Z" },
  "client_seq": 8
}
```

**서버 처리**

1. `consents`에 행 추가 — `consent_type = 'marketing'`, `is_agreed = 요청값`, `agreed_at = now()`. **기존 행을 UPDATE하지 않는다**(append-only — `domain.md` 3.2. 갱신하는 순간 이력 테이블이 아니게 된다)
2. 현재 상태(최신 행)를 응답으로 되돌린다

- **POST인 이유** — PATCH(4.2)가 절대값 UPDATE인 것과 달리 매 호출이 이력 행을 만든다. 관측되는 상태는 최신 행으로 수렴하지만, 리소스 표현은 "상태 갱신"이 아니라 "동의·철회 사실의 기록 추가"다.
- **같은 값의 중복 도착(재시도·오프라인 큐 재전송)도 행을 추가한다.** 상태는 최신 행 기준이라 결과가 변하지 않고, 이력에 같은 값 행이 더 있어도 해석이 달라지지 않는다. 서버가 직전 상태와 비교해 스킵하는 최적화를 두지 않는 이유는 **재동의가 "같은 값의 새 행"으로 표현되기 때문**이다 — 2년 재확인(정보통신망법 제50조 제8항)의 기산점은 최신 `is_agreed = true` 행의 `agreed_at`이며, 재동의 행 추가가 기산점을 갱신한다(`domain.md` 3.2).
- 토글 UI는 4.2와 같은 낙관적 규칙이다(`settings.md` 5장 — 즉시 반영, 실패 시 원복 + 토스트). 오프라인 큐 규칙도 같다(같은 토글은 마지막 상태만 유지).
- **2년 재확인의 대상 판정·통지는 서버 배치 소관이다**(`domain.md` 3.2 — `notification_logs`). 이 API는 관여하지 않는다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `is_agreed` 누락·boolean 아님 |

---

## 5. 에러 코드 표

**설정에는 고유 에러 코드가 없다.** 아래는 `common-error-handling.md` 9장 중앙 표의 공용 코드(9.1) 중 이 화면이 실제로 분기하는 것만 옮긴 것이며, 어긋나면 9장이 기준이다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | false | 토글 원복 + 일반 오류 토스트. 사용자에게 코드 노출하지 않음 |

- 401·429·5xx는 `common-error-handling.md` 4.1~4.2를 따른다. PATCH·POST의 5xx는 **자동 재시도하지 않고** 원복 + 토스트다(사용자 액션 실패는 즉시 알린다 — 4.3).

## 6. 흐름

**설정 진입**

```
프로필 [⚙] ──> GET /users/me/settings?app_version=1.3.0
   ├─ 계정 섹션(이메일)         → auth-api 4.8~4.11 (이메일 인증 화면)
   ├─ 구독 섹션                 → 구독 관리 (subscription.md)
   ├─ 관심 주제 관리            → 관심사 관리 (interest-management.md)
   ├─ 커리어 정보               → 커리어 정보 화면 (career.md)
   ├─ 토글 · 배속 시트          → PATCH /users/me/settings (낙관적)
   ├─ 마케팅 수신 동의 토글     → POST /users/me/consents/marketing (낙관적 — 4.3)
   ├─ 공지사항                  → 인앱 공지 화면 (목록 API는 9장 미결)
   ├─ 문의하기                  → 카카오톡 채널 열기 (실패 시 링크 복사 폴백 — 서버 호출 없음)
   ├─ 로그아웃                  → 확인 팝업 → POST /auth/logout (auth-api 4.4)
   ├─ 회원 탈퇴                 → GET /users/me/withdrawal-preview → POST /users/me/withdraw (auth-api 4.6~4.7)
   └─ [관리자] (is_admin일 때만) → 관리자 페이지 (admin.md 2장)
```

**이어 PICK 알림 토글 ON**

```
토글 ON 시도
   ├─ OS 권한 허용됨   → 토글 즉시 ON(낙관적) → PATCH { is_drip_notification_enabled: true }
   └─ OS 권한 거부됨   → 서버 호출 없음. "기기 설정에서 알림을 허용해주세요" + [설정 열기]. 토글은 OFF 유지
        └─ OS 설정에서 허용 후 앱 복귀 → PUT /users/me/devices/:device_id (권한 동기화 — onboarding-api 4.9)
```

**알림 사전 안내 유도 배너** ((b)안 — 합의 2026-08-06)

```
설정 진입 시 (클라이언트) OS 권한 상태 확인 — 서버 필드 없음(3장 설계 메모)
   ├─ 미결정        → 알림 섹션에 유도 배너 노출
   │     └─ 배너 탭 → 사전 안내 → [알림 받기] → OS 다이얼로그
   │           └─ 결과(허용·거부)를 PUT /users/me/devices/:device_id로 동기화 (onboarding-api 4.9)
   └─ 허용 · 거부   → 배너 숨김 (문구·상세 규칙은 notification.md 소유)
```

- **포그라운드 복귀 시마다 OS 권한 상태를 재확인해 `PUT /users/me/devices/:device_id`로 동기화한다**(`notification.md` 4.2). 설정 화면의 토글 표시·배너 노출도 이때 갱신한다(권한이 꺼졌으면 토글을 시각적으로 비활성 톤으로).

## 7. 보안·검증 규칙

- **토큰의 `user_id`로만 조회·변경한다.** 경로에 `userId`를 받지 않는다(`architecture.md` 9.2).
- `app_version`은 표시 판정에만 쓴다. **티어·기능 접근 분기에 쓰지 않는다.**
- `is_admin`은 **표시 판단 값이다.** 관리자 API의 접근 통제는 서버가 요청마다 `users.role`로 다시 판정한다 — 클라이언트가 보낸 값·화면 상태를 신뢰하지 않는다.
- 배속 허용값을 서버가 검증한다 — 클라이언트를 우회해 임의 배속을 저장할 수 없다.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `user_settings` — 배속·자동 확장·이어 PICK 알림 (4개 설정 테이블의 통합) | 3.5 |
| `consents` — 마케팅 수신 동의 상태·이력(**append-only, 최신 행이 현재 상태.** `user_settings`에 토글 컬럼 없음) | 3.2 |
| `users` — `email` · `is_email_verified` · `role`(→ `is_admin` 판정) | 3.1 |
| `subscriptions` · `plans` — 구독 요약 조립 | 8.2 · 8.1 |
| `user_interests` · `topics` — 관심 주제 요약 | 4.2 · 4.1 |
| `device_tokens` — OS 권한은 **기기 단위**라 여기에만 있다. 갱신은 `onboarding-api.md` 4.9 | 3.6 |
| `latest_version` · `min_supported_version` — 테이블이 아니라 **배포 설정**(원천 확정 — 합의 2026-08-06) | 13.3 |

- `sleep_timer_last_choice`는 플레이어 소관이라 이 API가 다루지 않는다(`user_settings`에 있지만 조회·변경 모두 `player-api` 몫).

## 9. 미결 사항

- ~~문의하기~~ → **확정(2026-08-06): 카카오톡 채널**(`settings.md` 4.1). 엔드포인트 없음 — 채널 URL은 배포 설정으로 관리하고, 열 수 없으면 링크 복사 폴백(1장 경계 표).
- ~~공지사항의 형태~~ → **형태는 확정(2026-08-06): 인앱 화면**(`settings.md` 4.1). **목록 API의 필요 여부·스펙은 화면 명세 작성 후 확정한다** — 확정되면 이 문서에 조회 엔드포인트를 추가한다(미결 유지).
- ~~`latest_version`의 원천~~ → **확정(2026-08-06): 배포 시 입력된 버전(배포 설정)**(`domain.md` 13.3). 수동 기입이므로 배포 직후 갱신 누락 시 [업데이트] 배지가 늦게 뜰 수 있다 — 배포 체크리스트로 관리한다(운영 사항, 계약 아님).
- ~~알림 사전 안내 재노출 경로~~ → **확정(2026-08-06): (b)안 — 설정 알림 섹션 유도 배너**(`settings.md` 4.3 · `notification.md` 4.1). **서버 응답 필드는 필요 없다** — 노출 판정 입력(OS 권한 미결정)은 기기만 알고, 클라이언트가 OS API로 직접 확인한다(3장 설계 메모). `device_tokens` 행 부재 판정 아이디어는 폐기한다(서버 사본은 실제 권한과 어긋날 수 있다).
- **`plan` 조립 함수의 소유** — `profile-api.md` 9장과 같은 건. `subscription.md` API 명세 작성 시 그쪽으로 옮긴다.
- **마케팅 재동의(2년 재확인) 흐름의 엔드포인트 재사용 여부** — 재확인 통지에서 사용자가 다시 동의할 때 4.3을 재사용할 수 있도록 "같은 값 행 추가 허용"으로 설계해뒀다. 재확인 UI(인앱 팝업·푸시 랜딩)가 정해지면 재사용 여부를 확정한다 — `notification.md`·법무 확인과 함께.
