# [BE] 글로벌 — 연령 확인 기준 연령을 나라별로 판정해 `min_age`로 내려주기

| 항목 | 값 |
|---|---|
| 대상 | 동의 항목 응답(`required_consents`·`pending_consents`·가입 동의 재조회)의 `age_confirmation` · sign-up 연령 판정 · `users.region_code` 활용 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-220](https://runtime364.atlassian.net/browse/KAN-220) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-16 |
| 시작 날짜 | 2026-10-16 |
| 기한 | 2026-10-19 (Medium) |
| 선행 | 없음 |
| 관련 | FE [KAN-206](https://runtime364.atlassian.net/browse/KAN-206)(이 티켓이 막는다 — FE는 반영 완료, 서버 값이 없으면 18로 그린다) · [KAN-215](https://runtime364.atlassian.net/browse/KAN-215)(동의 재조회 — 같은 응답) · [KAN-207](https://runtime364.atlassian.net/browse/KAN-207)(스토어 연령 — 최저 16 유지) |
| 근거 문서 | `changes/archive/auth-age-by-region.md` · `spec/api/global-api.md` 2.1 연령 행 |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-16) |

## 왜
PM이 GLOBAL 연령을 **나라별(3안)**로 정했다(2026-10-16, KAN-206 — 박준현 선택지 정리 13:38). 일괄 16은 말레이시아·필리핀·인도네시아(18세 미만 법정대리인 동의)에서, 일괄 18은 16~17세 사용자를 놓친다. 그래서 기기 지역으로 나눈다.

## 무엇을 한다
- `age_confirmation` 동의 항목에 `min_age`(정수)를 싣는다 — social-login `required_consents` · 동의 재조회 응답 · `pending_consents` 모두.
- 판정: KR 시장 18. GLOBAL은 `region_code`가 `SG`·`HK`·`KR`이면 16, 그 밖·없음 18. 가입 전엔 요청 `locale`, 가입 후엔 `users.region_code`.
- sign-up이 같은 판정을 한다. 어떤 기준 연령으로 확인받았는지 이력에 남길지 정한다(예: `version`).
- `auth-api.md`·`global-api.md`에 `min_age` 반영(`changes/archive/auth-age-by-region.md`).

## 완료 조건
- Given GLOBAL·지역 SG 신규 / When 동의 목록 / Then `age_confirmation.min_age = 16`
- Given GLOBAL·지역 MY·PH·ID·TH 또는 지역 없음 / Then 18
- Given KR 시장 / Then 18
- Given 기존 GLOBAL 가입자의 연령 재동의(`pending_consents`) / Then `users.region_code` 기준 같은 값

## 처리 기록
- 2026-10-16 발행(마크다운 + Jira).
- 2026-10-16 구현 — PR `feat(be)/age-by-region`(KAN-212 PR #1610 위에 쌓음, dev 대상).
  - 판정 `policies/age-confirmation.policy.ts`: KR 18 · GLOBAL `SG`·`HK`·`KR` 16, 그 밖·없음 18. 가입 전 요청 `locale.region_code`, 가입 후 `users.region_code`.
  - `age_confirmation` 항목에 `min_age` — social-login `required_consents` · 가입 동의 재조회 · `pending_consents`(로그인·sign-up·`GET /users/me`).
  - 이력: GLOBAL은 `version`에 `age-16`·`age-18`, KR은 null 그대로(기존 KR 재확인 없음). 다른 기준을 보내면 409 `CONSENT_VERSION_STALE`.
  - 재확인은 "확인받은 기준 연령 ≥ 지금 기준"일 때 생략한다 — 16 → 18 지역 이동만 다시 묻는다. null은 18로 본다.
  - 동의 판정 대상이 시장에서 `{ market, regionCode }`(사용자 행)로 넓어졌다. 동의 갱신(4.5)·마케팅 동의는 사용자 행을 읽는다.
  - 문서 `changes/archive/age-by-region-backend.md`.
  - 리뷰 반영(필수 0 · 권장 3): 모르는 버전 형식은 0으로 봐서 다시 묻는다, 연령 버전 상수 주석, 가입 대상 조립 한 곳(`signUpAudienceOf`), KR null 기록 테스트.
  - 테스트: 단위 1854 · e2e 127 통과(정책 단위 9 · 서비스 단위 9 · e2e 3 추가). 재확인 규칙을 버전 무시로 바꾸면 단위 2건이 실패함을 확인.
- 2026-10-16 완료 — 반영 날짜 2026-10-16. PR #1614 dev 머지·CI(lint·build·단위·e2e) 통과, 개발계 배포 확인(배포 성공·health 200·15분 에러 0건·컨테이너에 `age-confirmation.policy`·`min_age` 반영). 완료 조건 4개는 e2e `signup-consents.e2e-spec.ts`로 확인했다 — GLOBAL·SG 16 · MY/지역 없음 18 · KR 18 · 기존 GLOBAL 가입자의 재확인이 `users.region_code` 기준. FE KAN-206은 서버 값을 받아 그린다(값이 없으면 18). `archive/`로 이동, Jira 완료.
