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
| 근거 문서 | `changes/pending/auth-age-by-region.md` · `spec/api/global-api.md` 2.1 연령 행 |
| 중요도 | Medium |
| 상태 | 대기 |

## 왜
PM이 GLOBAL 연령을 **나라별(3안)**로 정했다(2026-10-16, KAN-206 — 박준현 선택지 정리 13:38). 일괄 16은 말레이시아·필리핀·인도네시아(18세 미만 법정대리인 동의)에서, 일괄 18은 16~17세 사용자를 놓친다. 그래서 기기 지역으로 나눈다.

## 무엇을 한다
- `age_confirmation` 동의 항목에 `min_age`(정수)를 싣는다 — social-login `required_consents` · 동의 재조회 응답 · `pending_consents` 모두.
- 판정: KR 시장 18. GLOBAL은 `region_code`가 `SG`·`HK`·`KR`이면 16, 그 밖·없음 18. 가입 전엔 요청 `locale`, 가입 후엔 `users.region_code`.
- sign-up이 같은 판정을 한다. 어떤 기준 연령으로 확인받았는지 이력에 남길지 정한다(예: `version`).
- `auth-api.md`·`global-api.md`에 `min_age` 반영(`changes/pending/auth-age-by-region.md`).

## 완료 조건
- Given GLOBAL·지역 SG 신규 / When 동의 목록 / Then `age_confirmation.min_age = 16`
- Given GLOBAL·지역 MY·PH·ID·TH 또는 지역 없음 / Then 18
- Given KR 시장 / Then 18
- Given 기존 GLOBAL 가입자의 연령 재동의(`pending_consents`) / Then `users.region_code` 기준 같은 값

## 처리 기록
- 2026-10-16 발행(마크다운 + Jira).
