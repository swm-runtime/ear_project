# [FE] frontend/architecture.md — career feature 신설에 따른 의존 표(4.4) 갱신

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 4.4(의존 방향 표) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-11 |
| 관련 작업 | career feature 구현(`feat(fe)/career`) — CR1~CR5, 직군 목록 소유권 |
| 파급 | 코드는 이미 이 내용대로 구현됨. features/spec 문서에는 영향 없음(동작 규칙 무변경 — 의존 표만 갱신) |
| 상태 | pending |

## 왜 기록하는가

### 1. profile → career 의존이 생김 — dev mock 커리어 원본 통합

실서버에서는 프로필 카드와 커리어 정보 화면이 같은 `users` 행(커리어 3필드)을 읽는다.
mock도 원본을 career mock 하나로 통합했다 — 프로필 mock의 `career` 요약이
`getCareerMockSummary`(career 공개 API)를 읽는다(기존 하드코딩 fixture 제거.
`career-empty` 시나리오는 유지). interest의 `getInterestMockSummary`와 같은 패턴이며,
표의 `profile` 행 의존 목록에 `career`가 추가되어야 한다.

### 2. onboarding → career 의존이 생김 — mock 원본 갱신(+ 직군 목록 공용 예정)

온보딩 커리어 단계 저장(mock)이 `seedCareerMockFromOnboarding`으로 커리어 원본을
갱신한다 — 온보딩에서 입력한 값이 프로필 카드·커리어 정보 화면에 이어진다
(`seedInterestMockFromOnboarding`과 같은 패턴). 직군 목록(`GET /job-categories` —
`career-api.md` 4.3 소유, 온보딩과 공용)의 온보딩 쪽 교체는 백엔드 발행 티켓
`tickets/frontend/pending/onboarding-job-categories-server-list.md`가 소유하며, 반영 시
이 의존(`useJobCategoriesQuery` · `careerKeys.jobCategories()` 공용)이 코드로 실현된다.

### 3. 저장 성공 시 프로필 요약 invalidate — 브리지 주입(표 방향 유지)

`profile/index.ts`의 갱신 계약(커리어 저장 성공에만 `summary()` invalidate)을 이행하되,
career가 `profileKeys`를 직접 import하면 `profile → career`와 순환이 된다.
interest와 같은 방식으로 **`registerCareerSavedListener`를 career가 노출하고
`app/bootstrap`이 invalidate 구현을 주입**했다. 설정은 커리어 값을 표시하지 않아
(진입 행 라벨뿐 — `settings.md` 4.1) `settingsKeys`는 invalidate하지 않는다.

## 기록할 내용

1. **4.4 `profile` 행 의존 목록에 `career` 추가** — 비고: 커리어 카드(dev mock 요약 원본
   `getCareerMockSummary`). 저장 후 요약 invalidate는 `registerCareerSavedListener`
   (bootstrap 주입)로 배선됨을 명시한다(역방향 import 없음).
2. **4.4 `onboarding` 행 의존 목록에 `career` 추가** — 비고: 커리어 단계 저장 시 career
   mock 원본 갱신. 직군 목록 공용(`useJobCategoriesQuery`)은 티켓
   `onboarding-job-categories-server-list` 반영 시 실현.

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When `frontend/architecture.md` 4.4 표를 읽는다 /
  Then career 관련 의존(profile·onboarding → career)의 비고가 코드의 실제 import·브리지
  배선과 일치하고, career → profile 방향의 import는 코드에 없다
