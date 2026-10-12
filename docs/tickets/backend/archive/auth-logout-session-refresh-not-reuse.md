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
| 상태 | 완료 (반영 날짜 2026-10-10) |

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
- **2026-10-10 — 반영(반영 날짜 2026-10-10).** 1-(a)를 골랐다 — `sessions.revoked_reason`(`rotated | logout | reuse_detected`, NULL 허용) 추가. (b)는 컬럼이 없지만 "회전 직후 새 세션도 로그아웃"처럼 같은 기기의 더 새 세션 유무가 사유를 말해 주지 못하는 경우 판정이 흐려지고, 판정이 다른 행의 존재에 기대 경합에도 약하다. 사유를 폐기 시점에 직접 남기면 갱신은 그 행 하나만 보고 판정한다.
  - 폐기 경로 전수: 회전(`SessionRepository.revokeIfActive` → `rotated`) · 로그아웃(`revokeByUserIdAndDeviceId` → `logout`) · 재사용 감지 전체 폐기(`revokeAllByUserId` → `reuse_detected`) — 이 셋뿐이다. 회원 탈퇴는 `users` FK CASCADE 로 행을 지우므로 사유가 없다.
  - `refresh`: 폐기 + 사유 `rotated` 또는 **NULL**(컬럼 도입 전 폐기 행 — 사유를 모르므로 종전 동작 유지) → REUSED + 전체 폐기. `logout`·`reuse_detected` → `AUTH_REFRESH_TOKEN_INVALID`만, 다른 세션 미변경.
  - 문서: `domain.md` 3.3(컬럼·값 의미·NULL 취급) · `architecture.md` 9.1(탈취 판정 범위) 개정. `auth-api.md` 4.3 반영 요청은 `changes/pending/auth-refresh-logout-token-invalid.md`. 마이그레이션 `1789500000000-AddSessionRevokedReason`(기존 행 미변경, revert 확인).
  - 완료 조건 1(로그아웃 토큰 → INVALID·B 유지): E2E `test/auth-refresh.e2e-spec.ts` 첫 케이스 — A 로그아웃 뒤 A 옛 토큰 401 `AUTH_REFRESH_TOKEN_INVALID`, A 행 `revoked_reason = logout`, B 행 활성이고 B 갱신 200.
  - 완료 조건 2(회전 토큰 → REUSED·전체 폐기): 같은 E2E 둘째 케이스 — 회전된 A 옛 토큰 401 `AUTH_REFRESH_TOKEN_REUSED`, 활성 세션 0, B 행 `reuse_detected`, 함께 끊긴 토큰 재제출은 INVALID.
  - 완료 조건 3: `auth.service.spec.ts` refresh 에 로그아웃 사유 → INVALID·`revokeAllByUserId` 미호출 / 회전 사유 → REUSED·전체 폐기 / `reuse_detected` → INVALID / 사유 NULL → REUSED(종전 유지) 4건.
  - 완료 조건 4: `domain.md` 3.3 반영 · `auth-api.md` 4.3 은 `changes/pending` 경유 기록.
  - 검증(로컬): lint·build 통과, 유닛 135 스위트 1581건 통과, E2E 17 스위트 81건 통과, `migration:revert` → `migration:run` 왕복 확인.
  - 함께 본 것(device_id 대조)은 (a)를 골라 이번 범위에 넣지 않았다.
