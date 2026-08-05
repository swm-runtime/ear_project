# [FE] 온보딩 재개 진입 시 뒤로가기 버튼이 동작하지 않는다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/onboarding` · `frontend/src/app/navigation/OnboardingNavigator.tsx` |
| 요청 파트 | 통합 테스트 (BE·FE 공통 확인) |
| 발견 시점 | 2026-08-05 온보딩 통합 테스트 (`integration/onboarding`) |
| 근거 문서 | `spec/uiux/onboarding-uiux.md` O2·O3 · `pages/onboarding.md` 4·7 · `spec/api/onboarding-api.md` 4.1 |
| 심각도 | 중 — 이탈로 이어지지는 않지만 명세가 요구하는 경로 하나가 막힌다 |

## 증상

`onboarding_step`이 `career` 또는 `pick`인 계정으로 **재로그인해 온보딩에 재진입하면**, 상단 뒤로가기(`‹`) 버튼이 눌려도 아무 화면 전환이 일어나지 않는다.

개발 빌드에서는 화면 하단에 다음 배너가 뜬다.

```
The action 'GO_BACK' was not handled by any navigator
```

프로덕션 빌드에서는 배너 없이 **반응하지 않는 버튼**이 된다. 사용자에게는 앱이 멈춘 것처럼 보인다.

## 재현 절차

1. 온보딩 1단계에서 주제를 고르고 [다음]만 누른다 (서버 `onboarding_step = career`).
2. 앱을 강제 종료한다 (`adb shell am force-stop host.exp.exponent`).
3. 앱을 다시 열고 같은 계정으로 로그인한다.
4. 2/3 커리어 화면으로 재개된다 — **여기까지는 정상이다**(`onboarding-api.md` 4.1).
5. 상단 `‹`를 누른다 → 아무 일도 일어나지 않고 위 에러 배너가 뜬다.

3단계(`pick`)로 재개된 경우도 같다.

## 원인

`OnboardingNavigator.tsx`가 재개 지점을 **`initialRouteName`으로** 지정한다. 이렇게 하면 스택에 그 화면 **하나만** 쌓이므로 되돌아갈 이전 화면이 없다.

```ts
// OnboardingNavigator.tsx
const RESUME_ROUTES: Record<OnboardingStep, keyof OnboardingStackParamList> = {
  topic: 'Topic', career: 'Career', pick: 'Pick', done: 'Pick',
};
...
<OnboardingStack.Navigator initialRouteName={RESUME_ROUTES[state.onboardingStep]}>
```

그런데 두 화면의 핸들러는 **갈 수 있는지 확인하지 않고** `goBack()`을 호출하고, 버튼 자체도 조건 없이 렌더링된다.

| 위치 | 코드 |
|---|---|
| `features/onboarding/hooks/useCareerScreen.ts:60` | `handleBackPress: () => navigation.goBack()` |
| `features/onboarding/hooks/usePickScreen.ts:95` | `handleBackPress: () => navigation.goBack()` |
| `features/onboarding/screens/CareerScreen.tsx:44-51` | `<Pressable onPress={handleBackPress} …>` — 조건 없이 렌더 |
| `features/onboarding/screens/PickScreen.tsx:41` | 같음 |

**정상 흐름(1단계부터 순서대로 진행)에서는 재현되지 않는다.** 그때는 스택에 `Topic → Career`가 쌓여 있어 `goBack()`이 정상 동작한다.

## 명세와 어긋나는 지점

단순한 죽은 버튼 문제가 아니라, **명세가 요구하는 경로 하나가 재개 진입에서만 사라진다.**

- `onboarding-uiux.md` O2 (127·135행)
  > 구성 — 인디케이터 `2/3` / **뒤로가기** / …
  > **뒤로가기로 O1에 돌아갈 수 있고, 이때 선택한 주제가 그대로 남아 있어야 한다.** 되돌아갔다가 선택이 비어 있으면 다시 고르는 대신 이탈한다.

- `onboarding-api.md` 4.1
  > **뒤로가기로 1단계에 돌아온 사용자에게는 `selected_topic_ids`로 선택 상태를 복원한다.** 로컬 임시 저장분만 믿으면 다른 기기에서 바꾼 선택이 조용히 덮인다.

재개 진입에서는 O1로 돌아갈 수 없으므로 이 복원 경로가 **실행될 수 없다.** 서버는 `selected_topic_ids`를 정상적으로 내려주고 있고(통합 테스트에서 확인), 받은 값을 `onboardingStore`에 이미 반영하고 있는데도 화면에 도달할 방법이 없다.

또한 1단계에서 더 뒤로 갈 때의 규정은 **"아무 동작도 하지 않는다"** 이지 "에러를 낸다"가 아니다.

- `onboarding.md` 7 (201행) — **뒤로가기로 1단계에서 더 뒤로**: 온보딩 이탈 확인 팝업 없이 아무 동작 안 함
- `onboarding-uiux.md` O1 (108행) — 뒤로가기로 이 화면에서 더 뒤로 가면 **아무 동작도 하지 않는다**

## 서버 변경은 필요 없다

**두 선택지 모두 프론트엔드 수정만으로 해결된다.** 서버 코드를 읽고 확인한 근거는 다음 셋이다.

1. **되돌아간 화면을 그릴 데이터가 이미 응답에 있다.** `GET /onboarding/state`가 `selected_topic_ids`와 `career`(미입력은 `null`)를 함께 내려주고(4.1), `OnboardingNavigator`는 이미 그 값을 `onboardingStore`에 넣고 있다. `GET /onboarding/topics`에는 단계 전제조건이 없다. **필요한 값을 받고도 도달할 화면이 없는 상태**라, 새 엔드포인트도 필드 추가도 필요 없다.
2. **뒤 단계에서 앞 단계를 다시 저장해도 서버가 거부하지 않는다.** `replaceInterests` · `updateCareer`는 `assertNotCompleted`만 검사하고 현재 `onboarding_step`을 보지 않는다.
3. **되돌아갔다 다시 진행해도 재개 지점이 밀리지 않는다.** `advanceStep`이 `ONBOARDING_STEP_ORDER[다음] > ONBOARDING_STEP_ORDER[현재]`일 때만 갱신하는 단조 증가라, `pick` 상태에서 1단계를 다시 저장해도 `pick`이 유지된다 — `onboarding-api.md` 4.1의 "`onboarding_step`은 앞으로만 전진한다"가 코드로 지켜져 있다.

> **확인 범위** — 위 2·3은 서버 코드를 읽어 확인했고, 실제 요청으로 재현하지는 않았다(통합 테스트 계정을 정리한 뒤라 새 계정을 만들지 않았다). 구현 전에 한 번 태워 보면 확실하다: `onboarding_step = pick`인 계정으로 `PUT /onboarding/interests`를 정상 본문으로 호출했을 때 200이 나오고 `onboarding_step`이 `pick` 그대로인지.

## 선택지

어느 쪽을 택할지는 FE 판단이다. 다만 **(A)만 적용하면 위 명세 두 줄이 재개 경로에서 충족되지 않은 채로 남는다**는 점을 함께 정해야 한다.

| | 방식 | 결과 |
|---|---|---|
| **A** | `navigation.canGoBack()`이 `false`면 버튼을 렌더링하지 않는다 (핸들러에도 가드) | 에러 배너와 죽은 버튼은 사라진다. **O1 복귀 경로는 여전히 없다** |
| **B** | 재개 시 `initialRouteName` 대신 앞 단계까지 스택에 쌓는다 (`navigationState` 또는 진입 후 `reset`) | 명세대로 O1까지 되돌아갈 수 있다. 재개 지점 판정 로직은 그대로 두고 스택 구성만 바뀐다 |

**B를 택하더라도 A의 가드는 함께 넣는 편이 안전하다** — `topic`으로 재개하면 스택이 1개인 상태가 여전히 남고, 그때 O1의 뒤로가기는 위 규정대로 "아무 동작 안 함"이어야 한다.

`FirstDripWaiting` · `Complete` · `NotificationPermission` 세 화면은 이미 `gestureEnabled: false`이고 뒤로가기 버튼이 없으므로 **이 티켓의 범위가 아니다.**

## 완료 조건

- Given `onboarding_step = career`인 계정 / When 재로그인해 2/3 화면에서 뒤로가기를 누른다 / Then 에러 배너가 뜨지 않는다
- Given 위와 같은 상태 / When 뒤로가기를 누른다 / Then (B 채택 시) 1단계로 이동하고 **서버의 `selected_topic_ids`가 선택된 상태로 복원된다**
- Given `onboarding_step = pick`인 계정 / When 재로그인해 3/3 화면에서 뒤로가기를 누른다 / Then 위와 같이 동작한다
- Given 1단계(O1)에 있다 / When 뒤로가기를 누른다 / Then 아무 동작도 하지 않고 에러도 나지 않는다
- Given 1단계부터 순서대로 진행한다 / When 각 단계에서 뒤로가기를 누른다 / Then 기존과 동일하게 이전 단계로 이동한다 (회귀 없음)
