# 국외 이전 동의(`cross_border_transfer`) · 시장별 필수 동의 · 가입 동의 목록 재조회 — 서버 구현 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 3.2 · 11.4 · `spec/api/auth-api.md` 3장 · 4.1 · 4.2 · 4.5 · (새 절) 4.14 · `spec/api/global-api.md` 4.1 · `infra/runbook.md` 글로벌 가입 스위치 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | BE [KAN-215](https://runtime364.atlassian.net/browse/KAN-215) `tickets/backend/pending/global-cross-border-consent.md` · FE [KAN-216](https://runtime364.atlassian.net/browse/KAN-216) · FE 계약 제안 `changes/pending/auth-signup-consents-refetch.md`(PR #1606) |

## 배경

해외 사용자 정보는 서울 서버와 미국 외부 서비스로 넘어가서, GLOBAL 가입자에게 국외 이전 동의를 필수로 받는다(KAN-215). 가입 화면 순서는 **로그인 → 콘텐츠 언어(A21) → 동의 목록 재조회 → 약관(A4)**으로 정해졌다(2026-10-16 이주호). 재조회 엔드포인트의 계약 본문은 FE 제안 문서가 담고 있다. 이 문서는 **서버가 구현한 내용**과, 제안 문서의 "백엔드와 정할 것" 4개에 대한 답을 적는다. 통합할 때 두 문서를 함께 반영한다.

## 수정 내용

### `domain.md` 3.2 `consents` · 11.4 `archived_consents`

- `consent_type` 값에 `cross_border_transfer`를 추가한다: `terms | privacy | marketing | age_confirmation | cross_border_transfer`. 저장 길이는 varchar(20)에서 **32**로 늘린다. 새 값이 21자라서다(마이그레이션 `1790300000000-WidenConsentType`).
- 3.2 주석에 한 줄을 넣는다.
  - `cross_border_transfer`는 **국외 이전 동의**다. 가입 필수 동의는 **GLOBAL 시장에만** 있다.
  - 이전 내용은 영어 처리방침이 고지하고 별도 문서가 없어서 `version`은 NULL이다.
  - KR은 한국어 처리방침의 국외 이전 고지로 갈음하므로 받지 않는다.
- 필수 동의 목록이 시장별이라는 점을 적는다. KR은 `terms·privacy·age_confirmation`, GLOBAL은 거기에 `cross_border_transfer`를 더한다. 이 목록 하나를 가입 거절 판정, 가입 동의 목록, 재동의 판정(`pending_consents`)이 함께 쓴다.

### `auth-api.md`

- **3장 표에 한 줄을 넣는다.** `POST /auth/sign-up/consents`, 인증 없음, 멱등키 없음.
- **4.1 `consent_required.required_consents`**
  - 기기 로캘(`locale.language_code`)로 정한 시장의 목록이다. 로그인 시점에는 사용자가 아직 콘텐츠 언어를 고르지 않았다.
  - 앱은 A21 뒤에 재조회(4.14) 결과로 이 목록을 덮는다.
  - 글로벌 가입이 닫혀 있으면 항상 KR 목록이다.
- **4.2 sign-up**
  - "필수 3종"을 **"그 시장의 필수 동의"**로 바꾼다. GLOBAL은 `cross_border_transfer`가 빠지면 `CONSENT_REQUIRED`다.
  - 시장 판정은 4.14와 같은 규칙이다. 같은 `locale`이면 같은 목록이 나온다.
  - `consents` 배열 최대 길이를 4에서 **5**(동의 종류 수)로 바꾼다.
- **4.5 `POST /users/me/consents`**
  - 철회 불가 판정이 그 사용자 시장의 필수 목록 기준이다. GLOBAL 사용자는 국외 이전 동의를 철회할 수 없다.
  - 배열 최대 길이는 5다.
- **4.13 `GET /users/me` · 로그인 `pending_consents`**: 국외 이전 동의 기록이 없는 GLOBAL 기존 가입자는 한 번 요구받는다. KR은 변화가 없다.
- **4.14 새 절 `POST /auth/sign-up/consents`**: FE 제안 문서의 본문을 그대로 쓴다. 아래 "정할 것"의 답을 반영한다.

### `global-api.md` 4.1

- 연령 동의 문단 옆에 한 줄을 넣는다. GLOBAL 가입 필수 동의에 국외 이전 동의(`cross_border_transfer`, 버전 없음)가 있다(KAN-215).

## FE 제안 문서 "백엔드와 정할 것" — 답(2026-10-16 박준현)

1. **경로·메서드** — 제안대로 `POST /auth/sign-up/consents`다. 본문으로 `signup_token`을 받는다. 응답은 200이다.
2. **`cross_border_transfer`의 `version`** — **`null`**이다(자기 선언형). 이전 내용은 처리방침이 고지한다. 그래서 이전 대상이 바뀌어 다시 받아야 할 때는 처리방침 버전 개정을 따라간다.
3. **레이트 리밋** — social-login·sign-up과 같은 인증 묶음이다. 같은 IP 기준 한도다(`AUTH_THROTTLE`).
4. **응답 `market`** — **둔다.** 서버가 그 `locale`로 판정한 시장이다. 글로벌 가입이 닫혀 있으면 `en`이어도 `kr`이다. 앱은 이 값으로 A4(연령 문구·약관 링크)를 그린다.

- 조회는 아무것도 기록하지 않고 `signup_token`을 소비하지 않는다. 다만 토큰은 검증한다(만료·위조면 401 `AUTH_SIGNUP_TOKEN_EXPIRED`). 가입 흐름 밖에서 판정 결과를 캐내지 못하게 하려는 것이다.

## 주의 — 글로벌 가입 스위치를 열기 전

- 스위치(`GLOBAL_SIGNUP_ENABLED`)가 열린 뒤 **국외 이전 동의를 모르는 구 앱**이 영어 기기로 가입하면 문제가 생긴다. 로그인 응답에 낯선 필수 항목이 온다. 앱이 그 항목을 그리지 않으면 sign-up이 `CONSENT_REQUIRED`로 막힌다.
- 스위치는 KAN-216이 들어간 앱 버전이 스토어에 나간 뒤 연다(`infra/runbook.md` 글로벌 가입 스위치 절차에 한 줄 추가).

## 완료 조건

- Given `domain.md` 3.2 / Then `consent_type`에 `cross_border_transfer`가 있고 길이가 32이며, 필수 동의가 시장별로 적혀 있다
- Given `auth-api.md` / Then 3장 표와 4.14에 `POST /auth/sign-up/consents`(요청 `signup_token`·`locale`, 응답 `required_consents`·`market`, 401)가 있다
- Given `auth-api.md` 4.2 / Then GLOBAL 필수 동의에 국외 이전이 있고 `consents` 최대 5개다

## 처리 기록

- 2026-10-16 발행(서버 구현 PR과 함께). 반영 전.
