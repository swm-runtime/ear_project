# [문서] 관심사 관리 API(조회·저장)는 온보딩을 마친 계정만 쓸 수 있다 — `ONBOARDING_NOT_COMPLETED` 409

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/interest-management-api.md` 4.2 · 4.3 · 5장 · `docs/features/common-error-handling.md` 9.8 · `docs/features/interest-management.md` 3장 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 2026-09-15 백엔드 전체 검증 — 온보딩 미완료 계정이 `PUT /users/me/interests`로 상한(3)을 우회할 수 있었다 |
| 심각도 | 중 — 드립 편성이 여섯 주제로 쪼개지고 스스로 낫지 않는다(상한이 `max(3, 보유 개수)`라 6이 영구 허용) |

## 문제

`interest-management-api.md`는 관리 화면이 "온보딩 이후" 열리는 것을 전제하지만, API 자체에는 그 전제가 없다. 토큰만 있으면 온보딩 단계와 무관하게 `PUT /users/me/interests`를 부를 수 있었다.

두 저장 경로는 서로의 행을 내리지 않는다.

- 온보딩 저장(`PUT /onboarding/interests`)은 요청에 없는 **`onboarding` 출처** 활성 행만 내린다.
- 관리 저장(`PUT /users/me/interests`)은 새 주제를 **`manual` 출처**로 넣는다.

미완료 계정이 관리 저장으로 `manual` 3개를 넣은 뒤 온보딩 저장으로 다른 `onboarding` 3개를 넣으면 활성 6개가 된다. 관리 저장의 상한은 `max(3, 저장 전 활성 개수)`이므로 이후에도 6개가 계속 통과한다.

## 수정 내용

코드(2026-09-15 반영): `UserInterestService.findEditableSelection` · `replaceManagedSelection`이 사용자 행을 읽은 직후 `UserOnboardingService.assertCompleted`로 판정한다. 미완료면 **409 `ONBOARDING_NOT_COMPLETED`**. 온보딩 API가 이미 쓰는 코드·상태를 그대로 재사용했다 — 뜻("온보딩이 끝나지 않았다")이 같고, `architecture.md` 7.5(배포된 코드의 의미를 바꾸지 않는다)에 맞게 새 코드를 만들지 않았다. 5장의 "`ONBOARDING_INTEREST_*`를 재사용하지 않는다" 규칙은 **상한 판정** 코드에 대한 것이고, 이 코드는 상한이 아니라 전제 조건이라 그 규칙과 충돌하지 않는다.

정상 클라이언트는 도달하지 않는다 — 관리 화면(IM)은 온보딩 완료 이후에만 진입 경로가 있다(`interest-management.md` 6장). FE 변경은 없다.

문서에 다음을 반영한다.

- `interest-management-api.md` 4.2 **에러**: "고유 코드 없음"을 고쳐 `ONBOARDING_NOT_COMPLETED` 409를 적는다(정상 화면에서는 도달하지 않음).
- `interest-management-api.md` 4.3 **에러 표**에 행 추가: `ONBOARDING_NOT_COMPLETED` · 409 · "온보딩을 마치지 않은 계정. 관리 화면 진입 전이라 정상 클라이언트는 도달하지 않는다".
- `interest-management-api.md` 5장 표 아래에 한 줄: **"온보딩 미완료 계정은 4.2·4.3 모두 `ONBOARDING_NOT_COMPLETED`(409, `onboarding-api.md` 5장과 같은 코드)로 거부한다. 두 저장 경로(온보딩·관리)가 같은 계정에 동시에 열려 있으면 출처가 다른 행이 겹쳐 상한이 우회되기 때문이다."**
- `common-error-handling.md` 9.8에 같은 코드 재사용을 표기한다(9.4의 코드를 관심사 관리 4.2·4.3도 낸다).
- `interest-management.md` 3장 규칙에 한 줄: **"관리 화면의 조회·저장은 온보딩을 마친 계정에만 열린다. 온보딩 중의 관심 주제 변경은 온보딩 1단계로 되돌아가서 한다."**

## 완료 조건

- Given `interest-management-api.md` 4.3 에러 표 / When 읽는다 / Then `ONBOARDING_NOT_COMPLETED` 409 행이 있다
- Given 온보딩을 마치지 않은 계정 / When `GET`·`PUT /users/me/interests`를 부른다 / Then 409 `ONBOARDING_NOT_COMPLETED`이고 `user_interests`에 `manual` 행이 생기지 않는다 (`test/onboarding.e2e-spec.ts` "완료 전에는 관심사 관리 API(조회·저장)를 쓸 수 없다")
- Given 온보딩을 마친 계정 / When 같은 API를 부른다 / Then 기존 계약(4.2·4.3) 그대로 동작한다
