# [BE] 로그아웃으로 폐기된 세션의 갱신 토큰 재제출을 "회전 토큰 재사용"으로 보지 않는다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/auth/services/auth.service.ts` `refresh`(폐기 세션 분기) · `session.entity`/`domain.md` 5장 `sessions`(폐기 사유 컬럼 추가 여부) · `spec/api/auth-api.md` 4.3 · `backend/architecture.md` 9.1 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 박준현 |
| Jira | [KAN-167](https://runtime364.atlassian.net/browse/KAN-167) |
| 발행 날짜 | 2026-10-09 |
| 시작 날짜 | 2026-10-09 |
| 기한 | 2026-10-12 (Medium — 3일 안) |
| 선행 | 없음 |
| 근거 문서 | `spec/api/auth-api.md` 4.3(REUSED 는 "이미 회전된 토큰") · `backend/architecture.md` 9.1 · `features/auth.md` 4.2(로그아웃 순서: 서버 폐기 → 로컬 삭제) · `features/common-error-handling.md` 4.1(401 → 단일 인플라이트 갱신) |
| 중요도 | Medium — 발생 조건이 좁지만(로그아웃 직후 수 ms 안의 자동 갱신) 결과가 "다른 기기까지 로그아웃"이라 사용자가 설명할 수 없는 현상이다. 2026-10-09 전체 검증(인증 리뷰) 발견 |
| 상태 | 대기 |

## 현상

`auth.service.ts` `refresh`는 `session.revokedAt`이 있으면 **사유를 묻지 않고** `AUTH_REFRESH_TOKEN_REUSED`로 판정하고 `revokeAllByUserId`로 그 사용자의 모든 세션을 폐기한다. 계약(`auth-api.md` 4.3 · `architecture.md` 9.1)은 "**이미 회전된** 토큰의 재제출 = 탈취 의심"만 REUSED 다. 그런데 **로그아웃(`revokeByUserIdAndDeviceId`)으로 폐기된 세션**도 `revokedAt`이 찍히므로 같은 분기에 들어간다.

정상 경로에서 생긴다: `auth.md` 4.2 로그아웃 순서는 "서버 폐기(204) → 앱이 로컬 토큰 삭제"다. 그 사이에 다른 요청이 401을 받아 앱의 단일 인플라이트 갱신(`common-error-handling.md` 4.1)이 **방금 폐기된 refresh token**으로 `/auth/token/refresh`를 보내면 REUSED → 기기 B·C의 세션까지 폐기된다.

- Given 기기 A·B 로그인 / When A가 logout 204 직후 로컬 삭제 전에 401 자동 갱신이 A의 refresh token으로 전송된다 / Then REUSED 판정으로 **B도 강제 로그아웃**

## 무엇을 한다

1. **폐기 사유를 구분한다.** 두 길 중 하나(설계 결정 — 담당이 고른다):
   - (a) `sessions.revoked_reason`(enum `rotated | logout | reuse_detected | withdrawn …`) 컬럼 추가 — `domain.md` 5장 먼저 개정(스키마는 domain.md 가 기준), 마이그레이션.
   - (b) 컬럼 없이: 폐기된 세션에 대해 **같은 사용자·같은 기기의 더 새 세션이 있으면** 회전된 것(REUSED), 없으면 로그아웃된 것으로 본다. 컬럼이 없어 단순하지만 "회전 직후 새 세션도 로그아웃" 같은 경우에 판정이 흐려진다.
2. 로그아웃으로 폐기된 토큰의 재제출은 **`AUTH_REFRESH_TOKEN_INVALID`(401)만** 돌려주고 다른 세션을 건드리지 않는다. 회전된 토큰의 재제출은 종전대로 REUSED + 전체 폐기.
3. `auth.service.spec.ts`에 두 케이스를 추가한다(로그아웃 세션 재제출 → INVALID·타 세션 유지 / 회전 세션 재제출 → REUSED·전체 폐기).
4. 계약 문서(`auth-api.md` 4.3)에 "로그아웃된 토큰은 INVALID" 한 줄 — `changes/pending` 경유(spec/api 는 다른 파트 소유).

## 함께 본 것(이 티켓 범위 밖, 기록만)

- 갱신 시 세션의 `device_id`와 요청 `device_id`를 대조하지 않아 다른 기기 ID로 갱신하면 원 기기 로그아웃이 그 세션을 폐기하지 못한다(하). 1-(b)를 고르면 이 대조가 판정의 일부가 되므로 같은 PR에서 다룰 수 있다.

## 완료 조건

- Given 기기 A·B 로그인 / When A 로그아웃 뒤 A의 옛 refresh token으로 갱신 요청 / Then 401 `AUTH_REFRESH_TOKEN_INVALID`이고 B의 세션은 살아 있다
- Given 기기 A에서 갱신으로 회전된 옛 토큰 / When 그 토큰으로 다시 갱신 / Then 401 `AUTH_REFRESH_TOKEN_REUSED`이고 그 사용자의 모든 세션이 폐기된다(종전 동작 유지)
- `auth.service.spec.ts`에 위 두 케이스가 있고 통과한다
- `domain.md`(컬럼을 추가했다면)·`auth-api.md` 4.3 반영 요청이 기록돼 있다

## 처리 기록

- 2026-10-09 발행(마크다운 + Jira). 2026-10-09 백엔드 전체 검증(인증 코어 리뷰)에서 발견. 코드 대조: `auth.service.ts` 174~189행.
