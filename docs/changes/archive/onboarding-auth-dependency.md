# onboarding → auth 의존 추가

> 작성: 2026-08-05, FE
> 상태: 미반영 (통합 수정 대기)

## 대상 문서

- `docs/frontend/architecture.md` 4.4 "의존 방향 기록" 표

## 수정 내용

onboarding 행에 의존 feature로 `auth`를 추가한다.

| 항목 | 내용 |
|---|---|
| 현재 | `onboarding | interest, library, notification | 주제 선택 / 첫 담기 / 알림 권한` |
| 변경안 | `onboarding | interest, library, notification, auth | 주제 선택 / 첫 담기 / 알림 권한 / 종료 시 세션 상태 갱신(라이브러리 진입 전환)` |

## 이유

온보딩 구현(`frontend/src/features/onboarding`)에서 onboarding이 auth의 공개 API(`sessionService`)를 실제로 사용하게 됐다.

- 온보딩 종료(알림 단계까지 완료) 시점에 `sessionService.markOnboardingCompleted()`를 호출해 세션 상태를 갱신하고, RootNavigator가 이를 구독해 온보딩 스택을 Main으로 통째로 교체한다(architecture.md 6.3 스택 초기화 규칙).
- 서버 완료 처리는 3단계 종료 시점에 이미 끝나 있으므로(onboarding-api.md 4.7), 이 호출은 로컬 세션 상태를 뒤따라 갱신하는 역할만 한다.
- 호출 위치: `features/onboarding/services/onboarding-exit.service.ts` → `@/features/auth`(공개 API)만 import.

architecture.md 4.4는 "표에 없는 의존이 코드에 생기면 리뷰에서 반려한다"고 규정하므로, 코드에 존재하는 이 의존을 표에 기록해야 문서와 구현이 일치한다.

## 영향 범위

- 다른 문서에는 영향 없음. `pages/onboarding.md`·`spec/api/onboarding-api.md`의 동작 규칙과 충돌하지 않는다(화면 전환 방식은 클라이언트 구조 관심사).
