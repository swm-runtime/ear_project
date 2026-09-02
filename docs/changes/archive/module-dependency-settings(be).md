# [BE] 모듈 의존 표 — `Settings` 행 신설

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` |
| 위치 | 4.5 의존 방향 기록 표 (+ 유스케이스 모듈 설명 문단) |
| 요청 파트 | 백엔드 |
| 관련 작업 | 설정 백엔드 구현 (`feat(be)/settings`) |
| 성격 | **표에 없는 모듈·의존이 코드에 생겼다** — 문서 자신의 규칙상 리뷰 반려 대상이다 |
| 상태 | **반영 완료** (2026-08-09, 설정 통합 시점) — 제안대로 문서를 고쳤고 코드는 바꾸지 않았다 |

> **2026-08-09 반영 결과** — "제안 문구"를 그대로 반영했다.
>
> - `architecture.md` 4.5 표에 **`Settings | User, Subscription, Interest` 행을 추가**했다. `SettingsModule`의 실제 import(`settings.module.ts:25`)와 일치한다
> - `Profile` 설명 문단 뒤에 **`**Settings도 Entity를 갖지 않는다.**` 문단 + 불릿 4개**를 넣었다. 제안한 셋(`user_settings` 소유 · 조립 함수 · `playback` 미의존)에 **마케팅 동의를 설정 값 변경에 싣지 않는 이유**를 하나 더했다 — 같은 화면의 토글인데 엔드포인트가 둘인 것이 표만 보고는 설명되지 않는다
> - **기존 행은 하나도 바뀌지 않았다.** `Profile` 행(6개)도 그대로다 — 조립 함수를 소유 모듈로 올려 `ProfileOrchestrator`의 주입은 줄었지만 **모듈 단위 import는 6개 그대로**임을 `profile.module.ts:30-37`로 확인했다. "함께 확인할 것"이 예상한 대로다
> - `domain.md` 2장은 손대지 않았다 — 예고한 대로 `settings`는 Entity를 소유하지 않아 그 표의 대상이 아니다
>
> **코드 수정 건이 없다.** 문서가 코드를 따라온 것이라 티켓을 발행하지 않았다.

> **`domain.md` 2장은 고치지 않는다.** `settings`는 Entity를 소유하지 않으므로 그 표(Entity 소유 모듈의 의존 표)의 대상이 아니다 — `onboarding` · `library-screen` · `explore` · `profile`이 거기에 없는 것과 같은 이유이며, `domain.md` 2장이 "유스케이스 모듈은 위 두 표에 없다"고 이미 명시하고 있다.
>
> **`user_settings`의 소유 모듈도 바뀌지 않는다.** `domain.md` 2장이 이미 `user`로 지정하고 있고, 구현도 그대로 따랐다(아래 참조).

---

## 어긋난 지점

`architecture.md` 4.5는 이렇게 못박고 있다.

> 모듈이 늘어나면 아래 표를 갱신한다. **표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.**

설정 구현으로 모듈이 하나 늘었는데 표에 행 자체가 없다.

| 표 | 현재 | 코드의 실제 |
|---|---|---|
| `architecture.md` 4.5 | **`Settings` 행 자체가 없다** | User, Subscription, Interest |

**기존 행은 하나도 바뀌지 않는다.** 세 모듈 어느 쪽도 `settings`를 모르므로 순환이 생기지 않는다.

---

## 왜 이 구조가 됐는가

### 1. Entity를 소유하지 않는 유스케이스 모듈이다

설정 화면 하나에 **세 모듈이 소유한 데이터가 함께 나간다.**

| 응답에 들어가는 것 | 소유 모듈 (`domain.md` 2장) |
|---|---|
| 계정(`email` · `is_email_verified` · `role` → `is_admin`), 설정값, 마케팅 동의 상태 | `user` (`users` · `user_settings` · `consents`) |
| 구독 요약 4분기 | `subscription` (`subscriptions` · `plans`) |
| 관심 주제 요약 | `interest` (`user_interests` · `topics`) |

`settings-api.md` 1장이 "설정은 대부분 하위 기능으로 연결하는 허브"라고 정한 그대로다 — 이 모듈이 소유하는 것은 화면 조회 · 설정 값 변경 · 마케팅 동의·철회 셋뿐이고, 나머지는 각 소유 API가 담당한다.

### 2. **`user_settings`를 이 모듈이 소유하지 않는다** — 가장 헷갈릴 수 있는 지점

설정 화면이 그 테이블의 주 사용처이지만, **소유는 화면이 아니라 데이터 기준으로 나눈다**(`architecture.md` 4.1). `domain.md` 2장이 `user_settings`를 `user` 모듈 소유로 이미 지정하고 있고, 구현도 그대로 따랐다 — Entity·Repository·Service가 전부 `user` 모듈에 있고 설정 모듈은 `UserSettingService`를 호출한다.

화면 기준으로 나눴다면 어긋났을 근거가 둘 있다.

- **`default_playback_rate`는 플레이어도 읽는다**(`player.md` 4.2 — 사용자 전역 배속). 설정 모듈이 소유하면 플레이어가 화면 모듈에 의존하게 된다.
- **`sleep_timer_last_choice`는 설정 API가 아예 다루지 않는다**(`settings-api.md` 8장 — 플레이어 소관). 같은 테이블 안에 이 화면이 건드리지 않는 컬럼이 있다.

### 3. `user` · `subscription` · `interest`만 의존한다

- **`playback`을 의존하지 않는다.** 설정 응답에는 잔여 재생 표시값이 없다 — 그 세 필드가 필요한 화면(라이브러리·탐색)과 달리 설정은 구독 요약만 보여준다.
- **`plan` 조립과 `interest_summary` 조립은 소유 모듈의 함수를 호출한다.** `settings-api.md` 4.1이 **"`profile-api.md` 4.1의 `plan`과 같은 모양, 같은 조립 함수를 쓴다"**고 요구하므로, 프로필이 갖고 있던 private 조립을 `SubscriptionService.buildPlanView` · `UserInterestService.buildSummary`로 올리고 두 화면이 같은 함수를 부르게 했다. **각자 조립하면 프로필과 설정의 구독 표시가 어긋난다.**
  - 이 이관으로 **`Profile` 행의 의존이 줄어들 수 있다**(아래 "함께 확인할 것").

---

## 제안 문구

### `architecture.md` 4.5 — 한 행 추가

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| Settings | User, Subscription, Interest | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

이어서 `Onboarding` · `LibraryScreen` · `Explore` · `Profile` 설명 문단과 같은 자리에 다음을 덧붙인다.

> **Settings도 Entity를 갖지 않는다.** 설정 응답에는 계정·설정값·마케팅 동의 상태(`user` 소유), 구독 요약(`subscription` 소유), 관심 주제 요약(`interest` 소유)이 함께 나간다. 설정은 대부분 하위 기능으로 연결하는 허브라(`settings-api.md` 1장) 이 모듈이 소유하는 것은 화면 조회·설정 값 변경·마케팅 동의뿐이며, 이메일 인증·로그아웃·탈퇴·구독 변경은 각 소유 API가 담당한다. `/users/me/settings`와 `/users/me/consents/marketing`이 여기에 속한다.
>
> - **`user_settings`를 이 모듈이 소유하지 않는다.** 설정 화면이 주 사용처이지만 소유는 데이터 기준으로 나눈다(→ 4.1) — `domain.md` 2장이 `user` 모듈로 지정하고 있다. `default_playback_rate`는 플레이어도 읽고(`player.md` 4.2), `sleep_timer_last_choice`는 이 화면이 아예 다루지 않는다(`settings-api.md` 8장).
> - **`plan` · `interest_summary`는 소유 모듈의 조립 함수를 호출한다.** `settings-api.md` 4.1이 프로필과 **같은 조립 함수**를 쓰라고 요구하므로 `SubscriptionService` · `UserInterestService`가 조립하고 두 화면이 그것을 부른다 — 화면마다 조립하면 같은 사용자에게 다른 구독 표시·다른 주제 개수가 나간다.
> - **`playback`을 의존하지 않는다.** 설정 응답에는 잔여 재생 표시값이 없다.

---

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `backend/src/modules/settings/` — Entity 없음. Orchestrator + Controller + DTO 5개
  - `GET /users/me/settings` · `PATCH /users/me/settings` · `POST /users/me/consents/marketing`
- `backend/src/modules/user/` — **`user_settings` Entity·Repository·Service 신설**(소유 모듈). 마이그레이션 1건, FK는 `ON DELETE CASCADE`(domain.md 12.3 즉시 파기 대상)
- `subscription` · `interest` 모듈에는 **조립 함수만** 더했고 의존 방향은 바뀌지 않았다
- 단위 263개 · E2E 21개 · lint 0 errors · build 통과. 순환 없이 기동하며 실 DB로 세 엔드포인트와 에러 경로까지 확인했다

## 함께 확인할 것

- **`Profile` 행의 의존이 줄었다.** 조립 함수를 소유 모듈로 옮기면서 `ProfileOrchestrator`가 `PlanService` · `TopicService`를 더 이상 주입받지 않는다. **다만 모듈 단위 의존은 그대로다** — `SubscriptionModule` · `InterestModule`을 여전히 import 하므로(각각 `SubscriptionService` · `UserInterestService`가 필요하다) 4.5 표의 `Profile` 행은 바뀌지 않는다. 표를 고칠 필요가 없다는 것을 확인만 해두면 된다.
- **`plan.status` enum의 문서 소유는 아직 옮겨지지 않았다.** `profile-api.md` 9장 · `settings-api.md` 9장이 "`subscription.md` API 명세 작성 시 그쪽으로 옮긴다"고 예고해 둔 상태이며, **코드는 이번에 `subscription` 모듈로 먼저 옮겼다**(두 화면이 같은 값을 쓰므로). 명세가 작성될 때 문서 쪽 소유도 함께 옮기면 된다 — 이 요청의 범위 밖이다.

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `Settings` 행을 찾는다 / Then 행이 존재하고, `SettingsModule`이 실제로 import 하는 세 모듈과 일치한다
- Given 리뷰어가 `settings` 모듈의 `import`를 본다 / When 4.5 표와 대조한다 / Then 표에 없는 의존이 하나도 없다
- Given `user_settings`가 어느 모듈 소유인지 처음 보는 사람이 있다 / When 4.5의 설명 문단을 읽는다 / Then **설정 화면이 주 사용처인데도 `user` 모듈 소유인 이유**를 문서만으로 알 수 있다
- Given `domain.md` 2장 의존 표를 본다 / When `settings`를 찾는다 / Then 없으며, "유스케이스 모듈은 이 표에 없다"는 기존 문장이 그 이유를 설명한다
