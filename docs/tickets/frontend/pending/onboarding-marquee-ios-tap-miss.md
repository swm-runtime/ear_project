# [FE] 온보딩 O1 마퀴 — iOS에서 칩이 흐르는 동안 탭이 무시된다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/onboarding/components/TopicMarqueeRow.tsx`(네이티브 경로 — ScrollView + rAF `scrollTo`) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 내부 테스트 배포 실기기 확인 — iOS에서만 재현, Android는 정상 |
| 근거 문서 | `spec/uiux/onboarding-uiux.md` 4.1(O1 주제 선택 — 칩 탭 = 선택 토글) · 구현 주석(`TopicMarqueeRow.tsx` — "만지면 멈춘다") |
| 심각도 | **중** — 온보딩 필수 경로의 첫 상호작용. 흐르는 중 첫 탭이 선택으로 이어지지 않아 여러 번 탭하게 된다(멈춘 상태에서는 선택 가능해 완전 차단은 아님) |
| 상태 | pending |

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
