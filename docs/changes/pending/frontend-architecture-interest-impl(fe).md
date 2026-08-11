# [FE] frontend/architecture.md — onboarding → interest 의존 실현 + 요약 invalidate 브리지 기록

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 4.4(의존 방향 표) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-11 |
| 관련 작업 | interest feature 구현(`feat(fe)/interest-management`) — IM1~IM9, 주제 목록 소유권 이동 |
| 파급 | 코드는 이미 이 내용대로 구현됨. features/spec 문서에는 영향 없음(동작 규칙 무변경 — 의존 표 비고만 개정) |
| 상태 | pending |

## 왜 기록하는가

### 1. onboarding → interest 의존이 코드로 실현됨 — 주제 목록 소유권 이동

4.4 표의 `onboarding | interest | 주제 선택` 의존이 이번 구현으로 실제 import가 됐다.
주제 목록은 온보딩 1단계와 관심사 관리가 **같은 계약·같은 캐시**를 써야 하므로
(`interest-management-api.md` 4.1 — 같은 목록을 두 벌 두면 두 화면의 선택지가 어긋난다),
다음을 interest feature가 소유하고 onboarding이 공개 API로 가져다 쓰도록 이동했다.

- `GET /onboarding/topics`의 DTO·fetch·query key(`interestKeys.topics()`) — 온보딩의
  `fetchOnboardingTopics` · `onboardingKeys.topics()`는 삭제
- `TopicChip` 컴포넌트(uiux "온보딩 1단계와 같은 컴포넌트" 규칙의 구현)

### 2. 저장 성공 시 프로필·설정 요약 invalidate — 브리지 주입(표 변경 없음)

`profile/index.ts` · `settings/index.ts`의 갱신 계약(관심사 저장 성공에만 각
`summary()` invalidate)을 이행하되, interest가 `profileKeys` · `settingsKeys`를 직접
import하면 표의 `profile → interest` · `settings → interest`와 **순환**이 된다.
player ↔ library 브리지와 같은 방식으로 **`registerInterestSavedListener`를 interest가
노출하고 `app/bootstrap`이 invalidate 구현을 주입**했다 — 표의 방향은 그대로 유지된다.

### 3. dev mock의 관심사 원본 통합 (구현 메모)

실서버에서는 온보딩 1단계·프로필 카드·설정 요약 행·관심사 관리가 전부 같은
`user_interests`를 읽는다. mock도 원본을 interest mock 하나로 통합했다 — 온보딩 저장이
`seedInterestMockFromOnboarding`으로 갱신하고, 프로필·설정 mock의 `interest_summary`는
`getInterestMockSummary`를 읽는다(기존 하드코딩 fixture "자기계발" 등 제거).
profile mock의 `career-empty` 시나리오가 겸하던 "관심 5개(+2 표시)" 재현은
`EXPO_PUBLIC_INTEREST_MOCK_SCENARIO=over-limit` 조합으로 대체됐다.

### 4. (부기) feature 디렉터리명

`convention.md` 1.5는 "화면 명세 문서명과 대응"(`interest-management.md`)을,
`architecture.md` 4.1·4.4는 모듈명 `interest`를 쓴다. 구현은 4.1·4.4의 **`features/interest`**
를 따랐다 — 의존 표의 행 이름과 코드가 일치하는 쪽을 우선했다.

## 기록할 내용

1. **4.4 `onboarding` 행 비고 보강** — "주제 선택"을 "주제 목록 조회(useTopicsQuery — 같은
   계약·같은 캐시) · TopicChip · mock 원본 갱신"으로 구체화한다.
2. **4.4 `profile` · `settings` 행 비고 보강** — 관심사 저장 후 요약 invalidate는
   `registerInterestSavedListener`(bootstrap 주입)로 배선됨을 명시한다(역방향 import 없음).
3. (선택) `convention.md` 1.5에 `interest-management.md ↔ features/interest` 대응 예외를
   명시하거나, 4.1 모듈 목록 쪽에 문서명 병기.

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When `frontend/architecture.md` 4.4 표를 읽는다 /
  Then interest 관련 의존(onboarding·profile·settings → interest)의 비고가 코드의 실제
  import·브리지 배선과 일치하고, interest → profile·settings 방향의 import는 코드에 없다
