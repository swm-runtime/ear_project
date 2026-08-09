# [FE] onboarding-uiux.md — O10 사전 안내 헤드라인의 옛 표기 정정

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/uiux/onboarding-uiux.md` 4.7 (O10 구성) |
| 요청 파트 | 프론트엔드 (기록) |
| 관련 작업 | settings 개발(2026-08-09) 중 발견 — 설정의 유도 배너가 사전 안내 헤드라인을 그대로 쓰는 규칙(`settings-uiux.md` 4.3)을 구현하다 확인 |
| 파급 | `frontend/src/features/onboarding/onboarding.copy.ts` (코드는 이미 정정 반영) |
| 상태 | **반영 완료** (2026-08-09, 설정 통합 시점) |

> **2026-08-09 반영 결과** — "기록할 내용" 두 항목을 그대로 반영했다.
>
> - `onboarding-uiux.md` 4.7 O10 구성의 헤드라인을 **"새 콘텐츠가 도착하면 알려드릴까요?"**로 고쳤다
> - **카피 소유가 `notification.md` 5장임을 불릿으로 명시**했다. 설정 유도 배너가 같은 문자열을 쓰는 근거(`settings-uiux.md` 4.3)와 "드립"을 카피에 쓰지 않는 결정(합의 2026-08-06)을 함께 적어, 이 화면이 독자적으로 고치지 않도록 했다
>
> **같은 줄의 부제는 그대로 뒀다** — "새 콘텐츠가 도착하면 알림 한 번만 보내드려요. 하루 1회를 넘지 않습니다"는 발송 빈도 명시 규칙(4.7의 별도 불릿)에 걸린 문구라 이 요청의 범위가 아니다.
>
> **전수 검색으로 확인했다.** 반영 전 `"드립 도착을 알려"`가 남아 있던 곳은 `onboarding-uiux.md` 232행 **하나뿐**이었고, `notification.md` 5장·`onboarding.md` 4.5·`settings-uiux.md` 4.3은 이미 새 문구였다. 이제 네 문서가 같은 문자열이다 — 완료 조건 2번이 성립한다.
>
> **코드 수정 건이 없다.** FE 코드는 이미 features 표기로 맞춰져 있다.

## 왜 기록하는가

O10 사전 안내의 헤드라인이 문서 간에 어긋나 있다.

- `onboarding-uiux.md` 4.7: **"드립 도착을 알려드릴까요?"** — 합의 2026-08-06 이전의 옛 표기다.
- `features/notification.md` 5장·`features/onboarding.md` 4.5(및 `settings-uiux.md` 4.3):
  **"새 콘텐츠가 도착하면 알려드릴까요?"** — "드립"은 내부 용어라 카피에 쓰지 않는다(합의 2026-08-06).

동작 규칙이 충돌하면 `features/`가 기준이므로(CLAUDE.md), 코드는 features 표기로 맞췄다 —
사전 안내 카피의 원 정의를 `features/notification`의 `NOTIFICATION_COPY.prePrompt`로 옮기고
온보딩 O10과 설정 유도 배너·사전 안내가 같은 문자열을 참조한다.

## 기록할 내용 (onboarding-uiux.md 4.7에 반영)

- O10 구성의 헤드라인을 `"드립 도착을 알려드릴까요?"` → **`"새 콘텐츠가 도착하면 알려드릴까요?"`** 로 정정한다.
- 카피 소유가 `notification.md` 5장임을 명시한다(배너·사전 안내가 같은 문자열을 쓰는 근거 — `settings-uiux.md` 4.3).

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When `onboarding-uiux.md` 4.7의 O10 구성을 읽는다 /
  Then 헤드라인이 "새 콘텐츠가 도착하면 알려드릴까요?"로 기재되어 있고 "드립" 표기가 없다
- Given 반영 후 / When `notification.md` 5장·`settings-uiux.md` 4.3과 대조한다 /
  Then 세 문서의 사전 안내 헤드라인이 같은 문자열이다
