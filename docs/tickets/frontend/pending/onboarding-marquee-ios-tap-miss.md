# [FE] 온보딩 O1 마퀴 — iOS에서 칩이 흐르는 동안 탭이 무시된다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/onboarding/components/TopicMarqueeRow.tsx`(네이티브 경로 — ScrollView + rAF `scrollTo`) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 내부 테스트 배포 실기기 확인 — iOS에서만 재현, Android는 정상 |
| 근거 문서 | `spec/uiux/onboarding-uiux.md` 4.1(O1 주제 선택 — 칩 탭 = 선택 토글) · 구현 주석(`TopicMarqueeRow.tsx` — "만지면 멈춘다") |
| 심각도 | **중** — 온보딩 필수 경로의 첫 상호작용. 흐르는 중 첫 탭이 선택으로 이어지지 않아 여러 번 탭하게 된다(멈춘 상태에서는 선택 가능해 완전 차단은 아님) |
| 상태 | pending — 후보 1 반영(2026-09-07). **iOS 실기기 확인 대기** |

## 문제

O1 주제 선택의 마퀴 줄이 자동으로 흐르는 동안 **iOS에서는 주제 칩 탭이 선택으로 이어지지 않는다.** Android는 같은 조건에서 정상 선택된다.

## 재현

- Given iOS 기기(또는 시뮬레이터)에서 온보딩 O1 진입, 마퀴가 흐르는 상태
- When 흐르는 주제 칩을 탭한다
- Then 칩이 선택되지 않는다(마퀴만 멈추거나 무반응). Android에서는 같은 탭이 선택으로 동작한다

## 원인 추정

네이티브 마퀴는 `ScrollView`를 rAF마다 `scrollTo`로 미는 구조다. iOS `UIScrollView`는 **콘텐츠가 움직이는 중의 첫 터치를 "스크롤 멈춤"으로 소비**하고(터치 캔슬 — `canCancelContentTouches` 계열 동작) 자식 Pressable에 전달하지 않는다. Android `ScrollView`는 이 경우에도 자식에게 탭을 전달한다 — 플랫폼 간 차이가 증상과 일치한다.

추가로 네이티브 경로는 **`onScrollBeginDrag`(드래그 시작)에서만 pause**하고 터치 시작에서는 멈추지 않는다 — 웹 경로가 `onTouchStart`/`onPointerDown`에서 즉시 pause하는 것과 다르다. 터치 순간에도 scrollTo가 계속 밀리므로 iOS의 터치 캔슬 조건이 유지된다.

## 수정 방향 후보 (수정 시 결정)

1. **터치 시작 시 즉시 pause** — 네이티브에도 `onTouchStart`에서 pause를 걸어 터치 중 `scrollTo` 유입을 끊는다(웹 경로와 대칭). 탭 인식 전에 흐름이 멈추므로 터치 캔슬 조건이 사라질 가능성이 높다 — 최우선 시도.
2. `canCancelContentTouches={false}` — 칩 위에서 시작한 터치를 스크롤이 뺏지 않게 한다. 단 **칩 위에서 시작하는 스와이프가 스크롤로 전환되지 않는 부작용**이 있어 수동 스와이프 UX와 상충하는지 실기기 확인 필요.
3. (1·2로 부족하면) `delayContentTouches`·Pressable `pressRetentionOffset` 등 터치 파이프라인 미세 조정.

## 요청 내용

1. iOS에서 마퀴가 흐르는 중의 칩 탭이 **한 번에** 선택으로 이어지게 한다.
2. 기존 동작 보존: 수동 스와이프(스크롤), 손 뗀 뒤 1.5초 후 재개, 무한 루프 되감기, Android·웹 동작.

## 완료 조건

- Given iOS에서 마퀴가 흐르는 상태 / When 칩을 한 번 탭한다 / Then 해당 칩이 선택(또는 해제)된다
- Given iOS / When 칩이 아닌 곳을 잡고 스와이프한다 / Then 수동 스크롤이 되고, 손을 뗀 뒤 약 1.5초 후 자동 흐름이 재개된다
- Given Android·웹 / When 같은 조작을 한다 / Then 기존 동작에 변화가 없다

## 진행 기록

- 2026-09-07 — 발행(내부 테스트 실기기 확인 중 발견). 테스트 종료 후 일괄 반영 대상.

## 진행 기록 (2026-09-07 저녁 — 후보 1 반영. 실기기 확인 대기)

**후보 1(터치 시작 시 즉시 pause)만 반영했다.** 티켓이 "최우선 시도"로 지목한 항목이고,
웹 경로와의 비대칭을 없애는 변경이라 부작용이 가장 적다.

```tsx
// NativeMarqueeRow — ScrollView
onTouchStart={handleTouchStart}   // 드래그 판정 전에 흐름을 끊는다
onTouchEnd={scheduleResume}       // 탭으로 끝난 터치도 흐름을 되살린다
onTouchCancel={scheduleResume}
```

`onScrollBeginDrag`는 **드래그로 판정된 뒤에야** 온다. 그래서 탭 한 번은 흐르는 동안 그대로
지나갔고, 그 사이 rAF가 `scrollTo`를 계속 밀었다. 이제 손가락이 닿는 순간 `paused.current`가
서므로 터치 구간에 `scrollTo` 유입이 없다.

`onTouchEnd`·`onTouchCancel`을 함께 단 이유는 **탭은 스크롤 이벤트를 한 번도 만들지 않기**
때문이다. 그것만 넣고 끝내면 탭 한 번에 마퀴가 영영 멈춘다.

### 반영하지 않은 것과 이유

| 후보 | 판단 |
|---|---|
| 2. `canCancelContentTouches={false}` | **쓰지 않는다.** 알약 위에서 시작한 스와이프가 스크롤로 전환되지 않아 수동 스와이프가 막힌다(티켓이 이미 지적한 부작용). 후보 1로 부족할 때만 본다 |
| 3-a. `delaysContentTouches={false}` | **넣을 수 없었다.** RN 0.86의 `ScrollViewProps` 타입에 이 prop이 없다(`ScrollView.d.ts`에 `canCancelContentTouches`만 있다). 네이티브 구현은 `RCTScrollView.m`·`RCTScrollViewComponentView.mm`에 남아 있으나 노출되지 않는다. 타입 캐스팅으로 우회하는 것은 **iOS 실기기 검증 없이는 위험**하다고 판단해 보류했다 |
| 3-b. `pressRetentionOffset` 등 | 후보 1의 결과를 보고 판단한다 |

### 확인 필요 — 이 티켓은 아직 pending이다

**iOS 실기기가 필요하다.** `tsc`·`eslint`·`jest`는 통과했지만 이 증상은 타입·단위 테스트로
잡히지 않는다.

- Given iOS에서 마퀴가 흐르는 상태 / When 칩을 **한 번** 탭한다 / Then 선택된다
- Given iOS / When 칩이 아닌 곳을 잡고 스와이프한다 / Then 수동 스크롤되고 약 1.5초 뒤 재개
- Given iOS / When 칩을 **탭만** 한다 / Then 약 1.5초 뒤 자동 흐름이 재개된다 ← **이번 변경으로 새로 생긴 확인 항목**
- Given Android / When 같은 조작 / Then 변화 없음

**후보 1로 해결되지 않으면** 위 표의 3-a를 타입 캐스팅으로 시도하고, 그래도 안 되면 2를 검토한다.
다음에 집는 사람이 다시 조사할 것은 없다 — 순서가 정해져 있다.

## 진행 기록 (2026-09-07 밤 — 후보 1로 부족했다. 후보 3-a 반영)

OTA로 후보 1(터치 시작 시 pause)이 iOS vc=3에 전달된 뒤 실기기에서 확인했다.

> **여전히 두 번 탭해야 선택된다.** 첫 탭이 먹힌다.

후보 1은 필요했지만 충분하지 않았다. 흐름은 멈췄는데 **첫 터치 자체가 자식에게 전달되지 않는다.**

### 후보 3-a 반영 — `delaysContentTouches={false}`

iOS `UIScrollView`는 자식에게 터치를 넘기기 전에 약 150ms 붙들고 "스크롤인가"를 판정한다
(`delaysContentTouches` 기본값 `true`). 그 지연 구간에서 짧은 탭이 소비된다. Android에는
대응 동작이 없어 증상이 iOS에만 나타난 것과 일치한다.

**RN 0.86의 `ScrollViewProps` 타입에 이 prop이 없다.** 네이티브 구현은 살아 있으므로
(`RCTScrollView.m`·`RCTScrollViewComponentView.mm`) 타입만 우회했고, **iOS일 때만** 넘긴다.

```tsx
const IOS_TAP_PROPS = (
  Platform.OS === 'ios' ? { delaysContentTouches: false } : {}
) as Partial<ScrollViewProps>;
```

Android에 넘기지 않는 이유는 그쪽이 원래 정상이기 때문이다 — 무시되는 prop이라도 의도를 좁혀 둔다.

`canCancelContentTouches={false}`(후보 2)는 **여전히 쓰지 않는다.** 알약 위에서 시작한 스와이프가
스크롤로 전환되지 않아 수동 스와이프가 막힌다.

### 다시 확인해야 할 것

- Given iOS에서 마퀴가 흐르는 상태 / When 칩을 **한 번** 탭한다 / Then 선택된다
- Given iOS / When 칩 위에서 시작해 옆으로 **스와이프**한다 / Then 스크롤이 된다 ← **후보 3-a가
  이걸 깨뜨리는지 반드시 본다.** 터치 지연을 없앤 것이라 이론상 스크롤 전환은 유지되지만,
  후보 2가 깨뜨리는 바로 그 동작이라 같이 확인한다
- Given iOS / When 칩을 탭만 한다 / Then 약 1.5초 뒤 자동 흐름 재개
- Given Android / When 같은 조작 / Then 변화 없음

**3-a로도 안 되면 후보 2를 시도한다** — 그때는 스와이프를 포기하는 트레이드오프를 감수할지
결정이 필요하다.
