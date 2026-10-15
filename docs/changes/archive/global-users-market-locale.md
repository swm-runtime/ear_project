# [문서] 글로벌 1 — `users.market`·로케일 컬럼과 가입·기기 등록·설정 계약의 로케일 필드

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 3.1 · `docs/spec/api/auth-api.md` 4.1·4.2·4.13 · `docs/spec/api/onboarding-api.md` 4.9 · `docs/spec/api/settings-api.md` 4.1·4.2 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-14 |
| 발견 시점 | KAN-187(글로벌 1 — 시장 모델) 구현. 확정 계약은 `docs/spec/api/global-api.md` 2.1·4.1·4.2·4.3이며 이 요청은 그 내용을 원 문서에 옮겨 적는 것 |
| 관련 | [KAN-187](https://runtime364.atlassian.net/browse/KAN-187) `tickets/backend/pending/global-market-users.md` · 에픽 KAN-186 |

## 수정 내용

### `domain.md` 3.1 `users`

컬럼 4개 추가(마이그레이션 `1789900000000-AddUserMarketAndLocale`):

```
  market                    enum            kr | global   DEFAULT 'kr'   ★가입 시 1회 판정, 이후 불변 (global-api.md 2.1, 2026-10-14)
  language_code             varchar(16)     NULL   기기 언어 BCP 47(예 en-US). 표시·푸시·메일 언어의 원천. 가입·로그인·기기 등록마다 갱신
  region_code               varchar(2)      NULL   기기 지역 ISO 3166-1 alpha-2(대문자). 통계용 — 판정에 쓰지 않는다
  timezone                  varchar(64)     NULL   기기 시간대 IANA. 드립 발송 그룹에만 쓴다 — 서비스 날짜 경계는 바꾸지 않는다
```

- 설명 항목 추가: **`market`은 계정 생성 시 `market.policy.ts`가 1회 정한다.** 입력은 사용자가 가입 화면에서 고른 콘텐츠 언어(`locale.preferred_language` — `ko` → `kr`, `en` → `global`), 없으면 기기 `language_code`(`ko*` → `kr`, 그 밖 `global`), 그것도 없으면 `kr`. 로그인·기기 등록은 `language_code`·`region_code`·`timezone`만 갱신한다. 시장 전환은 불허(기본값 — 바뀌면 `global-api.md` 9장).
- **`archived_users`에는 넣지 않는다.** 거래 주체 식별과 무관해 보존 근거가 없다(11.3이 닉네임·커리어를 담지 않는 것과 같은 이유). `global-api.md` 8장도 같은 날 맞춰 고쳤다.

### `auth-api.md` 4.1 `POST /auth/social-login` · 4.2 `POST /auth/sign-up`

요청에 선택 객체 `locale` 추가(두 엔드포인트 공통):

```json
"locale": { "preferred_language": "en", "language_code": "en-US", "region_code": "US", "timezone": "America/New_York" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `locale.preferred_language` | `ko` · `en` | 선택 | 가입 화면에서 고른 콘텐츠 언어 — **시장 판정의 입력**. 4.2(계정 생성)에서만 쓰이고 4.1의 기존 계정 로그인에서는 무시 |
| `locale.language_code` | BCP 47 | 선택 | 기기 언어. 가입·로그인마다 갱신 |
| `locale.region_code` | ISO 3166-1 alpha-2 | 선택 | 통계용 |
| `locale.timezone` | IANA | 선택 | 드립 발송 그룹 |

- 형식이 아닌 값은 **버리고 가입을 막지 않는다**(로케일은 자격 조건이 아니다). `locale` 자체가 없는 구 앱은 `market = kr`.
- 응답 `user` 객체(4.1 `authenticated` · 4.2 · 4.13)에 `market`(`kr`/`global`) · `language_code`(string|null) · `timezone`(string|null) 추가. 클라이언트의 제공자 목록·온보딩 단계·요금제 분기는 **`market`으로** 한다(언어로 추측 금지).

### `onboarding-api.md` 4.9 `PUT /users/me/devices/:device_id`

요청 필드 추가: `language_code`(BCP 47, 선택) · `timezone`(IANA, 선택). **기존 가입자의 로케일이 채워지는 경로**다(매 실행 호출). 값은 기기 행이 아니라 `users` 행에 저장하고 `market`은 바꾸지 않는다.

### `settings-api.md` 4.1 · 4.2

- 4.1 응답 `account`에 `market`(읽기 전용) · `language_code` · `timezone` 추가.
- 4.2 요청에 `language_code`(BCP 47, 선택) 추가 — 표시 언어 변경. 시장은 바뀌지 않는다. 형식이 아니면 400 `VALIDATION_FAILED`. "세 설정 필드 중 최소 하나" 조건에 이 필드도 포함(네 필드 또는 `language_code` 중 하나). 응답 모양은 그대로.

## 완료 조건

- Given `domain.md` 3.1 / Then 컬럼 4개와 판정 규칙·`archived_users` 제외 사유가 적혀 있다
- Given `auth-api.md` 4.1·4.2·4.13 / Then `locale` 요청 표와 `user.market/language_code/timezone`이 있다
- Given `onboarding-api.md` 4.9 · `settings-api.md` 4.1·4.2 / Then 위 필드가 있다

## 처리 기록
- 2026-10-14 발행. 코드는 KAN-187 PR에 반영 완료(계약은 `global-api.md`가 먼저 확정).
- 2026-10-15 반영 — `backend/domain.md` 3.1 · `auth-api.md` 4.1·4.2·4.13 · `onboarding-api.md` 4.9 · `settings-api.md` 4.1·4.2. 코드 대조 결과 로그인 때 `region_code`도 갱신해 세 필드로 적었고, 서버 문구 언어는 `users.market` 기준으로 정정(`global-api.md` 4.1·4.3도 함께). 반영 전 코드와 대조함.
