# [FE] 온보딩 1단계 주제 마퀴가 주제 수 1~7개에서 깨진다 — 줄당 1개일 때 공백 노출·자동 흐름 정지

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/onboarding/components/TopicMarqueeRow.tsx` · `frontend/src/features/onboarding/screens/TopicSelectScreen.tsx`(`toRows`) · (부수) `frontend/src/features/onboarding/onboarding.copy.ts` · `frontend/src/features/interest/interest.copy.ts` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 백엔드 전체 검증 중 "0건 주제 노출 금지"(`tickets/backend/pending/topic-visibility-requires-content.md`)를 정하면서, 노출 주제가 적어질 때 온보딩 UI가 주제 수에 맞게 바뀌는지 별도 에이전트가 코드로 검증 — 코드 산술로 도출한 결론이며 **실기기 재현은 하지 않았다** |
| 근거 문서 | `features/onboarding.md` 3장 · `spec/uiux/onboarding-uiux.md` 4.1~4.2 · `spec/api/onboarding-api.md` 142·147행(`max_selectable`) |
| 심각도 | **중** — 지금 운영 노출 주제 36건에서는 증상 없음. 운영이 `is_visible`을 소수만 켜는 시점(신규 주제 공개 초기, 노출 조건 강화 이후)에 첫 화면에서 드러난다 |
| 우선순위 | Medium(3일 안) |
| Jira | [KAN-59](https://runtime364.atlassian.net/browse/KAN-59) |
| 상태 | 대기 — 코드 선반영(2026-09-17), **실기기 확인 남음** |

## 잘 되는 것(변경 불필요)

- **0건**: `isTopicListUnavailable`(`interest/services/topic-list-state.ts`)이 `items: []`를 잡아 전체 화면 "아직 준비 중이에요" + [다시 시도]를 그리고 하단 [다음]은 그리지 않는다. `onboarding-uiux.md` 4.2와 일치(`tickets/frontend/archive/onboarding-empty-topic-list-state.md` 처리 완료).
- **1개 선택으로 진행 가능**: `canGoNext = selectedCount >= 1`(`useTopicSelectScreen.ts`), 상한은 서버 `max_selectable`을 쓴다. 고정 열·행 수나 고정 높이 목록으로 아이템이 잘리는 구조는 없다.
- **다수(20~40개)**: 4줄 무한 마퀴라 클리핑 없이 전부 흘러 들어온다. `parent_category` 그룹화는 렌더에 쓰이지 않아 "카테고리 0건" 케이스가 없다.

## 문제

`TopicSelectScreen.toRows`는 주제 수와 무관하게 **항상 4줄 라운드로빈**으로 나눈다. 전체 주제가 1~4개면 모든 줄이 줄당 1개, 5~7개면 앞쪽 1~3줄이 줄당 1개가 된다. `TopicMarqueeRow`는 한 벌 폭을 `count × (156 + 8)`px로 잡고 3벌을 복제해 흘리는데, **한 벌 폭이 뷰포트 폭 이상**이라는 가정이 암묵적으로 깔려 있다.

- **iOS·web**: `translateX`가 `0 ↔ −164N`을 왕복한다. 이음새가 안 보이려면 `164N + W ≤ 492N`, 즉 `W ≤ 328N`. **N=1이면 W ≤ 328**이라 폰(360~430px)에서 매 주기 오른쪽에 빈 공간이 드러난다. N=2는 폰은 무사하지만 태블릿·넓은 웹 창에서 같은 결함.
- **Android**: `ScrollView` 최대 offset이 `492N − W`(N=1·W≈390이면 약 102px)인데 초기 `scrollTo(x = 164 + phase)`가 클램프되고 되감기 임계(`loopTarget`)도 스크롤 범위 밖이라, `handleScroll`의 위치 동기화와 rAF 루프가 서로 되감아 **자동 흐름이 멈추거나 튄다**.
- 8개 이상이면 폰에서는 문제 없다.

## 요청 내용

1. **마퀴가 뷰포트 폭에 맞춰 벌 수를 정하게 한다** — 벌 수를 고정 3이 아니라 `ceil(W / copyWidth) + 1`(최소 2)로 계산해, 한 벌이 뷰포트보다 좁아도 이음새가 보이지 않게 한다. Android 초기 위치·되감기 임계도 같은 값으로 계산한다.
2. **줄 수를 주제 수에 맞춘다** — `toRows`의 줄 수를 `min(4, ceil(topics.length / k))`(k는 줄당 최소 개수, 예 3)로 줄이거나, 주제가 소수(예 ≤ 7)일 때는 관심사 관리 화면(`InterestManagementScreen`)과 같은 **2열 격자로 폴백**한다. 격자는 1개든 40개든 자연히 늘어나 더 견고하다.
3. (부수, 같은 PR에 묶거나 Low로 분리) 상한 카피의 **"3개" 하드코딩 제거** — `onboarding.copy.ts` 헤드라인·토스트, `interest.copy.ts` `limitNotice`·`overLimitBanner`가 3을 문자열에 박아 두었다. `onboarding-api.md` 142·147행은 상한을 클라이언트 상수로 두지 말고 `max_selectable`을 쓰라고 한다. 지금 서버값이 3이라 증상은 없다.
4. 실기기(또는 시뮬레이터) 확인 — 노출 주제를 1·2·4·7·8개로 두고 iOS·Android·web에서 마퀴가 끊김 없이 흐르는지 본다.

## 완료 조건

- Given 노출 주제 1개 / When 온보딩 1단계를 연다 / Then 마퀴(또는 폴백 격자)에 빈 공백이 주기적으로 드러나지 않고, Android에서 자동 흐름이 멈추거나 튀지 않는다
- Given 노출 주제 4개·7개 / When 온보딩 1단계를 연다 / Then 모든 줄이 이음새 없이 흐른다(또는 격자로 폴백된다)
- Given 노출 주제 36개 / When 온보딩 1단계를 연다 / Then 현행과 같은 4줄 마퀴가 유지된다
- Given 서버 `max_selectable`이 3이 아닌 값 / When 헤드라인·상한 토스트·관리 화면 안내를 본다 / Then 그 값이 표시된다(3이 남아 있지 않다)

## 처리 기록 (2026-09-17 — 코드 선반영, 실기기 확인 대기)

- 요청 1: 벌 수를 `marqueeCopyCount(뷰포트 폭, 한 벌 폭) = max(3, ceil(W/w) + 2)` 로 계산한다(`onboarding/services/topic-rows.ts`). 세 플랫폼 구현이 공통 `MarqueeCopies`에 `copyCount`를 넘기고, Android 는 콘텐츠 폭을 같은 벌 수로 나눠 시작 위치·되감기 임계를 잡는다. 낭독 대상은 1번 벌 고정. 뷰포트는 창 폭(`useWindowDimensions`)으로 본다 — 줄이 화면 폭을 꽉 채우므로 onLayout 한 프레임 지연을 피했다.
- 요청 2: 줄 수 = `min(4, ceil(n / 3))` (`toTopicRows`). 1~3개 1줄, 4~6개 2줄, 7~9개 3줄, 10개부터 4줄. 격자 폴백은 넣지 않았다 — 벌 수 계산으로 이음새가 사라지니 마퀴 하나로 충분하고, 폴백은 상태가 하나 더 느는 것이다.
- 요청 3: "3" 하드코딩 제거 — `onboarding.copy.ts` `title(max)`·`limitToast(max)`, `interest.copy.ts` `limitNotice(max)`·`overLimitBanner(n, max)`. 값은 두 화면 훅의 `maxSelectable`(서버 `max_selectable`). 조회 전(0)에는 헤드라인이 개수 없이 "궁금한 이야기를 골라주세요".
- 테스트: `topic-rows.test.ts`(줄 수·분배·벌 수 10건). interest mock 에 `few-topics` 시나리오(주제 5개) 추가.
- 확인: web(헤드리스 Chrome, `EXPO_PUBLIC_INTEREST_MOCK_SCENARIO=few-topics`) — 5개가 2줄(3+2)로 흐르고 10초 동안 빈 공간 없음. 36개는 기존과 같은 4줄.
- **남은 것(요청 4)**: iOS·Android 실기기에서 주제 1·2·4·7·8개 확인(특히 Android ScrollView 되감기). 확인되면 archive · KAN-59 완료.
