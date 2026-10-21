# auth-api.md 4.x 추가 요청 — 가입 동의 목록 재조회 `POST /auth/sign-up/consents` (백엔드 확인 필요)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 3장(엔드포인트 목록) · 4장(새 절 — 4.2 sign-up 다음) · 5장(에러 표 — 새 코드 없음, 적용 범위만) |
| 요청 파트 | 프론트엔드 (백엔드 협의 필요 — 문서·서버 모두 BE 소유) |
| 발행 날짜 | 2026-10-16 |
| 발견 시점 | KAN-216(글로벌 동의 화면) 구현 — 국외 이전 동의(KAN-215)는 GLOBAL 목록에만 오는데, 가입 동의 목록을 받는 로그인 응답 시점엔 시장이 정해지지 않았다 |
| 관련 | FE [KAN-216](https://runtime364.atlassian.net/browse/KAN-216) `tickets/frontend/pending/global-consent-screen-legal.md` · BE [KAN-215](https://runtime364.atlassian.net/browse/KAN-215) `tickets/backend/archive/global-cross-border-consent.md` · [KAN-212](https://runtime364.atlassian.net/browse/KAN-212)(GLOBAL 약관 버전 — 같은 질문) |

## 배경

가입 흐름은 **소셜 로그인 → A21(콘텐츠 언어 선택) → A4(약관 동의)** 다. 시장은 A21에서 고른 콘텐츠 언어(`ko` → `kr`, `en` → `global`)로 서버가 정한다(`global-api.md` 2.1).

A4에 그리는 동의 목록은 지금 로그인 응답(4.1 `consent_required.required_consents`)이 준다. 그런데 이 응답은 **A21 선택 전**에 나와 시장별 항목을 담을 수 없다 — GLOBAL만 필수인 국외 이전 동의(`cross_border_transfer`, KAN-215)와 시장 네임스페이스 버전(`terms_global_v1`, KAN-212)이 그렇다. BE 티켓 KAN-215는 "로그인 요청의 `locale.preferred_language`로 미리 판정"을 적었지만, 로그인 시점에는 사용자가 아직 언어를 고르지 않았다.

**PM 결정(2026-10-16, 이주호)** — 화면 순서는 지금대로 두고, **A21에서 언어를 고른 뒤 서버에 동의 목록을 다시 받는다.** 판정은 서버가 하고 클라이언트는 받은 목록을 그대로 그린다(시장으로 항목을 하드코딩하지 않는다).

## 수정 내용 — 추가할 절(제안)

**3장 표에 한 줄**

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
| --- | --- | --- | --- | --- | --- |
| 14 | POST | `/auth/sign-up/consents` | 고른 콘텐츠 언어(시장)의 가입 동의 목록 재조회 — 계정 미생성 | — |  |

**4장 새 절 — `POST /auth/sign-up/consents`**

Request

```json
{
  "signup_token": "<social-login이 내려준 단기 토큰>",
  "locale": { "preferred_language": "en", "language_code": "en-US", "region_code": "US", "timezone": "America/New_York" }
}
```

- `locale`은 **4.2 sign-up과 같은 객체**다. 서버는 sign-up과 **같은 규칙**으로 시장을 판정해(`preferred_language` 우선 → `language_code` 폴백 → `kr`) 그 시장의 현행 필수·선택 동의 목록을 돌려준다. 같은 입력이면 sign-up이 요구하는 목록과 정확히 같아야 한다 — 다르면 A4가 그린 대로 보내도 `CONSENT_REQUIRED`·`CONSENT_VERSION_STALE`가 난다.
- **계정·동의를 만들지 않는 조회다.** 아무것도 기록하지 않는다. 같은 요청을 여러 번 보내도 결과가 같다.
- `signup_token`은 소비하지 않는다(만료 시각도 그대로). 이 요청 뒤 같은 토큰으로 sign-up을 한다.

Response 200

```json
{
  "required_consents": [
    { "consent_type": "terms",                 "version": "terms_global_v1",   "is_required": true },
    { "consent_type": "privacy",               "version": "privacy_global_v1", "is_required": true },
    { "consent_type": "age_confirmation",      "version": null,                "is_required": true },
    { "consent_type": "cross_border_transfer", "version": "<서버 값 또는 null>", "is_required": true },
    { "consent_type": "marketing",             "version": null,                "is_required": false }
  ],
  "market": "global"
}
```

- `required_consents`의 모양은 4.1 `consent_required`의 것과 같다(`ConsentItemDto`). KR이면 국외 이전 항목이 없다(KAN-215).
- **`market`(선택 — FE 추가 제안)** — 서버가 이 `locale`로 판정한 시장(`kr` \| `global`). `GLOBAL_SIGNUP_ENABLED`가 닫혀 있으면 `en`도 `kr`이 되는데(`global-api.md` 2.1), 앱이 A21 선택만으로 시장을 짐작하면 A4의 연령 문구(16/18)·약관 링크(영어/한국어)가 실제로 가입될 시장과 어긋난다. 있으면 앱은 이 값으로 A4를 그리고, 없으면 종전처럼 A21 선택이 가리키는 시장으로 그린다(앱은 이미 둘 다 처리한다).

에러

| 코드 | HTTP | 상황 | 클라이언트 동작(FE 구현) |
| --- | --- | --- | --- |
| `AUTH_SIGNUP_TOKEN_EXPIRED` | 401 | `signup_token` 만료·위조 | 4.2와 같다 — 토스트 후 제공자 인증부터 재시작 |
| `VALIDATION_FAILED` | 400 | `locale` 형식 오류 | 아래 "구 서버·그 밖" 폴백 |

**FE 폴백(이 계약이 없는 서버와의 호환)** — 앱은 이 PR(KAN-216)부터 이 요청을 보낸다.

- 404 `NOT_FOUND`(구 서버 — 라우터에 경로 없음) · 그 밖의 재시도 무의미한 실패 → **로그인 응답의 목록으로 A4를 그린다.** 빠진 필수 항목은 sign-up이 `CONSENT_REQUIRED`로 막으므로 동의 없이 계정이 생기지 않는다.
- 네트워크·타임아웃·5xx·429(`retryable: true`) → A21에 머물며 토스트, [다음]으로 재시도(`common-error-handling.md` 4.3). 조회라 부작용이 없지만 POST라 앱의 자동 재시도 대상은 아니다(GET·멱등키 요청만 — `frontend/architecture.md` 8.2).

## 백엔드와 정할 것 (문서 반영 전 결정 필요)

1. 경로·메서드 — 제안은 `POST /auth/sign-up/consents`(본문에 `signup_token`). GET + 쿼리는 토큰이 접근 로그·프록시에 남아 택하지 않았다.
2. `cross_border_transfer`의 `version` — 처리방침 개정에 묶을지(`privacy`와 같은 값), 별도 버전을 둘지, `null`(자기 선언형)로 둘지. 앱은 어느 쪽이든 서버 값을 그대로 돌려보낸다.
3. 레이트 리밋 — 인증 없는 엔드포인트라 social-login·sign-up과 같은 묶음에 넣을지.
4. 응답 `market` 필드를 둘지 — 두지 않으면 글로벌 가입이 닫힌 동안 English를 고른 사용자는 A4에서 16세 문구·영어 약관을 보고 KR 계정으로 가입된다.

## 완료 조건

- Given `auth-api.md`를 읽는다 / When 3장 표와 4장을 확인한다 / Then `POST /auth/sign-up/consents`의 요청(`signup_token`·`locale`)·응답(`required_consents`)·에러(`AUTH_SIGNUP_TOKEN_EXPIRED`)가 기재되어 있다
- Given GLOBAL(`preferred_language: "en"`) 재조회 / When 응답을 받는다 / Then `cross_border_transfer`가 `is_required: true`로 있고, 그 목록 그대로 동의해 sign-up하면 201이다
- Given KR(`preferred_language: "ko"`) 재조회 / When 응답을 받는다 / Then 국외 이전 항목이 없고 종전 목록과 같다
- Given `GLOBAL_SIGNUP_ENABLED` 닫힘 + `preferred_language: "en"` / When 재조회한다 / Then 국외 이전 항목이 없고(KR 목록) `market`을 둔다면 `"kr"`이다
- Given 만료된 `signup_token` / When 재조회한다 / Then 401 `AUTH_SIGNUP_TOKEN_EXPIRED`
- Given 이 엔드포인트가 없는 서버 / When 앱이 A21 [다음]을 누른다 / Then 404를 받고 로그인 응답의 목록으로 A4가 그려진다(FE 구현 — `useContentLanguageScreen.ts`)

## 처리 기록

- 2026-10-16 발행(FE — KAN-216 구현과 함께). 앱은 이 계약대로 구현했고 서버가 생기기 전까지 404 폴백으로 동작한다. 반영 전.
- 2026-10-16 반영 — 반영 날짜 2026-10-16. auth-api.md 3장 표 #14 · 새 절 4.14(요청·응답·market·에러·404 폴백) · 5장 적용 범위, auth-uiux.md 화면 순서 절의 계약 위치를 확정본으로. `archive/`로 이동.
