# [BE] 단기 실험 ⑦ 가입 체험 기간 7일 → 3일

| 항목 | 값 |
|---|---|
| 대상 | 운영 `.env.prod` `SIGNUP_TRIAL_DAYS` |
| 요청 파트 | 백엔드(운영) |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-287](https://runtime364.atlassian.net/browse/KAN-287) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | 없음 |
| 근거 문서 | `features/subscription.md` 4.8 |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

체험이 짧을수록 유료 전환 판단 시점이 빨리 와서 전환 지표가 빨리 쌓인다. 체험은 서버 판정이고 일수는 env `SIGNUP_TRIAL_DAYS`(기본 7, 1~30)라 코드 변경이 없다. 앱에는 "7일" 문구가 없다(FE 변경 없음).

## 무엇을 한다

- 운영 `.env.prod`에 `SIGNUP_TRIAL_DAYS=3` → 같은 이미지로 API 재생성 · health 확인. 백업을 남긴다.
- `SIGNUP_TRIAL_EXISTING_USERS_BEFORE` 부여분도 3일이 되는지 확인해 처리 기록에 남긴다.
- 전환 시각을 처리 기록에 남긴다 — 비교는 가입일 코호트(전후)로 한다. 기존 체험자의 `trial_ends_at`은 바뀌지 않는다(설계).
- 문서 수정은 `changes/pending`에 기록(`subscription.md` 4.8 "기본 7").

## 범위 밖

- 체험 기간 동시 A/B — `resolveSignupTrialEndsAtFor`에 사용자 분할이 필요하다.

## 완료 조건

- Given 전환 뒤 신규 가입 / Then `trial_ends_at`이 가입 서비스 날짜 + 3일(05시 경계)이다
- Given 전환 전 가입한 체험자 / Then `trial_ends_at`이 그대로다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-287).
