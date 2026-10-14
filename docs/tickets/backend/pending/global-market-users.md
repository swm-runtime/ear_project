# [BE] 글로벌 1 — 시장 모델: `users.market` 판정·로케일 저장·`/users/me`·설정

| 항목 | 값 |
|---|---|
| 대상 | `users`·`archived_users` 스키마 · `market.policy.ts`(신설) · `POST /auth/social-login`·`sign-up` · `PUT /users/me/devices/:id` · `GET /users/me` · `GET/PATCH /users/me/settings` · `domain.md` 3.1(changes 경유) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-187](https://runtime364.atlassian.net/browse/KAN-187) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-15 (Medium) |
| 선행 | 없음 |
| 관련 | 뒤 티켓 전부가 이 티켓에 막힌다(`users.market`이 모든 필터의 입력) |
| 근거 문서 | **`spec/api/global-api.md` 2.1 · 4.1 · 4.2 · 4.3 · 8장 `users` 행** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `users`·`archived_users`에 `market`(enum `kr|global`, NOT NULL, DEFAULT `kr`) · `language_code` · `region_code` · `timezone` 추가. 기존 행은 전부 `kr`.
- 판정은 서버 한 곳 `market.policy.ts`: **사용자가 가입 화면에서 고른 `locale.preferred_language`**(`ko` → `kr`, `en` → `global`)가 입력. 없으면(구 앱) `language_code`가 `ko`로 시작하면 `kr`, 아니면 `global`, 그것도 없으면 `kr`. **계정 생성 시 1회**만 호출 — 로그인·기기 등록은 `language_code`·`timezone`만 갱신하고 `market`은 건드리지 않는다(`preferred_language`는 무시). 2026-10-14 결정: 기기 언어 자동 판정은 영어 설정 한국 사용자를 GLOBAL로 보내서, 모든 신규 가입자에게 1회 묻는다.
- 가입·로그인 요청에 `locale { preferred_language, language_code, region_code, timezone }`(선택) 수용 — 형식 검증(BCP 47·ISO 3166·IANA), 모르는 값은 버리고 기본값.
- `PUT /users/me/devices/:id`에 `language_code`·`timezone`(선택) 추가. 기존 가입자가 다음 실행에서 채워지는 경로.
- `GET /users/me`·로그인 응답 `user`에 `market`·`language_code`·`timezone`. 설정 GET에 세 필드, PATCH로 `language_code` 변경(시장은 불변).
- `Accept-Language`·`X-Timezone` 헤더는 요청 로그에만 남긴다(판정 입력 아님).
- `domain.md` 3.1 개정 요청을 `changes/pending`에 기록.

## 범위 밖

시장 전환(불허 기본값 — 결정이 바뀌면 이 티켓이 아니라 후속 티켓) · 시장별 콘텐츠 필터(2번 티켓)

## 완료 조건

- Given `locale.preferred_language = "en"`로 가입 / When 완료 / Then `users.market = global`, 응답 `user.market = "global"`
- Given `preferred_language = "ko"` + `language_code = "en-US"`(영어 기기의 한국 사용자) / Then `market = kr`
- Given `preferred_language` 없이 `language_code = "en-US"`(구 앱) / Then `market = global`(폴백 규칙)
- Given 같은 계정이 `language_code = "ko-KR"`로 다시 로그인 / Then `market`은 `global` 그대로, `language_code`만 `ko-KR`
- Given `locale` 없는 구 앱 가입 / Then `market = kr`(기존과 동일)
- Given 기존 가입자 / When 기기 등록에 `timezone` 포함 / Then `users.timezone` 갱신, `market` 불변
- `changes/pending`에 `domain.md` 3.1 개정 요청이 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 판정 입력을 기기 언어 → 가입 시 사용자 선택(`preferred_language`)으로 변경(박준현).
