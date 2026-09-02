# [BE] 모듈 의존 표 — `Profile` 행 신설

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` |
| 위치 | 4.5 의존 방향 기록 표 (+ 유스케이스 모듈 설명 문단) |
| 요청 파트 | 백엔드 |
| 관련 작업 | 프로필 백엔드 구현 (`feat(be)/profile`) |
| 성격 | **표에 없는 모듈·의존이 코드에 생겼다** — 문서 자신의 규칙상 리뷰 반려 대상이다 |
| 상태 | **반영 완료** (2026-08-08, 프로필 통합 시점) — 문서를 고치는 쪽으로 확정. 코드는 바꾸지 않았다 |

> **`domain.md` 2장은 고치지 않는다.** `profile`은 Entity를 소유하지 않으므로 그 표(Entity 소유 모듈의 의존 표)의 대상이 아니다 — `onboarding` · `library-screen` · `explore`가 거기에 없는 것과 같은 이유이며, `domain.md` 2장이 "유스케이스 모듈은 위 두 표에 없다"고 이미 명시하고 있다.
>
> **이 제안이 반려되면 고칠 대상은 코드다.** 표가 맞다고 판단하면 프로필 조회를 어느 소유 모듈 안으로 넣어야 하는데, 그 경우 순환이 생긴다(아래 "왜 이 구조가 됐는가" 참조). 그때는 문서 요청이 아니라 **`tickets/backend/`** 대상이므로 이 문서에서 다루지 않는다.

> **2026-08-08 반영 결과**
>
> - `architecture.md` 4.5 — `Profile` 행 추가(`User, Subscription, Interest, Library, Playback, Content`) + "Profile도 Entity를 갖지 않는다" 설명 문단 추가
> - 설명 문단에 네 가지를 함께 적었다 — `user` 모듈에 넣으면 순환이 되는 이유, **`LibraryScreen` · `Explore`와 달리 `user` · `subscription`을 직접 의존하는 이유**(잔여 재생 표시값을 응답에 싣지 않는다), 캐시를 고치지 않는 이유, 쓰기 경로가 없다는 것
> - **`domain.md` 2장은 고치지 않았다.** 제안한 대로 유스케이스 모듈은 그 표의 대상이 아니다
> - **코드는 바뀌지 않았다.** `ProfileModule`이 import 하는 여섯 모듈과 표가 일치한다

---

## 어긋난 지점

`architecture.md` 4.5는 이렇게 못박고 있다.

> 모듈이 늘어나면 아래 표를 갱신한다. **표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.**

프로필 구현으로 모듈이 하나 늘었는데 표에 행 자체가 없다.

| 표 | 현재 | 코드의 실제 |
|---|---|---|
| `architecture.md` 4.5 | **`Profile` 행 자체가 없다** | User, Subscription, Interest, Library, Playback, Content |

**기존 행은 하나도 바뀌지 않는다.** 여섯 모듈 어느 쪽도 `profile`을 모르므로 순환이 생기지 않는다.

---

## 왜 이 구조가 됐는가

### 1. Entity를 소유하지 않는 유스케이스 모듈이다

프로필 화면 하나에 **여섯 모듈이 소유한 데이터가 함께 나간다.** `profile.md` 6장이 "프로필 전용 테이블은 만들지 않는다 — 이 화면이 쓰는 값은 전부 기존 테이블에 있다"고 이미 정하고 있다.

| 응답에 들어가는 것 | 소유 모듈 (`domain.md` 2장) |
|---|---|
| 헤더(닉네임·제공자), 이메일 카드, **커리어 3필드** | `user` (`users`) |
| 플랜 카드 — 상태 판정의 진실의 원천, 플랜명·무료 한도 | `subscription` (`subscriptions` · `plans`) |
| 관심 주제 요약(개수·대표 3개) | `interest` (`user_interests` · `topics`) |
| 누적 **완청 고유 콘텐츠 수** | `library` (`library_items`) |
| 누적 청취 시간 · 연속 청취 일수 · 주간 그래프 · 주제 분포의 원천 | `playback` (`play_records`) |
| 주제 분포의 주제 매핑 | `content` (`content_topics`) |

어느 한 모듈의 Entity로 환원되지 않으므로 `architecture.md` 3.3과 `onboarding` · `library-screen` · `explore` 선례를 따라 **소유 모듈들 위에서 Orchestrator로 조합**했다. Repository·Entity를 갖지 않고 각 소유 모듈이 `exports`한 Service만 호출한다.

**`user` 모듈에 넣을 수 없는 이유**가 분명하다 — 통계가 `library_items` · `play_records` · `content_topics`를 읽는데, `user` 모듈은 현재 `Subscription` · `Idempotency`에만 의존한다. 거기에 `library` · `playback` · `content`를 더하면 `library → user` · `playback → user`와 정면으로 부딪쳐 **순환**이 된다(`forwardRef` 금지 — 4.3).

### 2. `user` · `subscription`을 **직접** 의존한다 — 앞선 세 유스케이스 모듈과 다른 점

`library-screen` · `explore`는 두 모듈을 의존하지 않는다. 그 둘이 `user` · `subscription`에서 필요했던 것은 **잔여 재생 표시값**뿐이었고, 그 조립을 `PlaybackService.buildQuotaForUser` 한 곳으로 모았기 때문이다(`changes/archive/library-screen-quota-assembly(be).md`).

**프로필이 필요한 것은 그 값이 아니다.**

| 필요한 것 | 왜 `playback`을 거칠 수 없는가 |
|---|---|
| 닉네임·제공자·이메일·인증 여부·커리어 3필드 | 잔여 재생 표시값과 무관한 계정 정보다. `playback`이 이걸 조립해 줄 이유가 없다 |
| 플랜 카드 4분기 · 플랜명 · 다음 결제일 | **`profile-api.md` 3장이 "`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다"고 요구한다.** `buildQuotaForUser`는 한도 숫자만 돌려주고 구독 상태(해지 예약·유예)를 알려주지 않는다 |

프로필은 **잔여 재생 표시값을 응답에 싣지 않는다**(`profile-api.md` 4.1에 그 세 필드가 없다). 그래서 두 모듈을 직접 의존해도 "화면마다 다른 숫자" 문제가 생기지 않는다 — 애초에 같은 값을 다시 계산하는 것이 아니다.

### 3. 나머지 네 모듈은 조회만 한다

- `interest` — 다른 모듈을 모르는 기반 모듈이다(4.5 — "`Interest` | *(없음)*")
- `library` · `playback` · `content` — 세 모듈 모두 `profile`을 모른다

**프로필은 서버에 아무것도 쓰지 않는다**(`profile.md` 1장 — "프로필에서 직접 서버에 쓰는 값은 하나도 없다"). 조회 전용이라 트랜잭션도 열지 않으며(8.7), 소유 모듈의 상태를 바꾸는 경로가 없다.

---

## 제안 문구

### `architecture.md` 4.5 — 한 행 추가

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| Profile | User, Subscription, Interest, Library, Playback, Content | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

이어서 `Onboarding` · `LibraryScreen` · `Explore` 설명 문단과 같은 자리에 다음을 덧붙인다.

> **Profile도 Entity를 갖지 않는다.** 프로필 응답에는 계정·커리어(`user` 소유), 구독 상태·요금제(`subscription` 소유), 관심 주제 요약(`interest` 소유), 완청 고유 콘텐츠 수(`library` 소유), 청취 시간·연속 일수·주간 그래프(`playback` 소유), 주제 분포의 주제 매핑(`content` 소유)이 함께 나간다. `profile.md` 6장이 **전용 테이블을 만들지 않는다**고 정하고 있어 조립할 자기 Entity가 애초에 없다. 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `/users/me/profile`과 `/users/me/profile/weekly-listening`이 여기에 속한다.
>
> - **`user` · `subscription`을 직접 의존한다 — `LibraryScreen` · `Explore`와 다른 점이다.** 저 둘이 두 모듈을 피한 이유는 잔여 재생 표시값을 `PlaybackService`가 조립해 주기 때문인데, **프로필은 그 값을 응답에 싣지 않는다**(`profile-api.md` 4.1). 프로필이 필요한 것은 계정 정보와 플랜 카드이며, 특히 플랜은 `users.tier` 캐시가 아니라 **`subscriptions`를 기준으로 조립하라**고 계약이 요구한다(`profile-api.md` 3장 설계 메모).
> - **캐시를 고치지 않는다.** 조회 시점에 `users.tier`가 `subscriptions`와 어긋나 있어도 응답만 `subscriptions` 기준으로 내려주고, 캐시 갱신은 `SubscriptionService` 한 곳이 한다(`domain.md` 3.1 — 갱신 경로를 한 곳으로 제한).
> - **쓰기 경로가 없다.** 각 카드의 편집은 소유 화면의 API(`auth-api.md` · `interest-management` · `career` · `subscription`)가 담당한다 — 같은 데이터를 두 화면이 각자 저장하면 규칙이 갈라진다(`profile.md` 1장).

---

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `backend/src/modules/profile/` — Entity 없음. Orchestrator + 통계 순수 함수(`profile.stats.ts`) + Controller 1개
  - `GET /users/me/profile` · `GET /users/me/profile/weekly-listening`
- 소유 모듈에는 **집계 조회 메서드만** 더했고 **의존 방향은 바뀌지 않았다**
  - `playback` — 누적 청취 시간, 재생 날짜 목록, 주간 날짜별 합, 콘텐츠별 합
  - `library` — 완청 고유 콘텐츠 수(`deleted_at` 무관)
  - `subscription` — 현재 구독 한 건(`findCurrent`)
- `common/utils/service-date.util.ts` — 주 경계 계산 4개 추가. **경계 계산은 이 파일에만 둔다**는 기존 규칙(domain.md 1.2)을 그대로 지켰다
- 단위 236개 · E2E 21개 · lint 0 errors · build 통과. 순환 없이 기동하며 실 DB로 두 엔드포인트와 에러 경로까지 확인했다

## 함께 확인할 것

- **`user` 모듈에 연차 구간 환산표를 옮겼다.** `users.years_of_experience`(int) ↔ 구간 라벨 환산이 온보딩 모듈에만 있었는데, 프로필도 같은 환산이 필요해 **컬럼 소유 모듈로 이전**했다(`YearsOfExperienceRange` enum + `YEARS_OF_EXPERIENCE_LOWER_BOUND` + `toYearsOfExperienceRange`). 온보딩은 import 경로만 바뀌었고 계약·동작은 그대로다. **의존 표에 영향이 없다** — `Onboarding`은 이미 `User`를 의존한다.
- **`domain.md` 15.1 #9(집계 캐시)는 그대로 미결이다.** 연속 일수·주제 분포를 매 조회 집계로 구현했으며, 캐시 도입 여부는 비용 실측 후 판단한다. **도입돼도 이 의존 표는 바뀌지 않는다**(`profile-api.md` 3장 — 캐시 여부와 무관하게 계약이 동일하다).

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `Profile` 행을 찾는다 / Then 행이 존재하고, `ProfileModule`이 실제로 import 하는 여섯 모듈과 일치한다
- Given 리뷰어가 `profile` 모듈의 `import`를 본다 / When 4.5 표와 대조한다 / Then 표에 없는 의존이 하나도 없다
- Given `profile` 모듈이 무엇인지 처음 보는 사람이 있다 / When 4.5의 설명 문단을 읽는다 / Then **왜 `user` 모듈에 두지 않았는지**(순환)와 **왜 `LibraryScreen` · `Explore`와 달리 `user` · `subscription`을 직접 의존하는지**를 문서만으로 알 수 있다
- Given `domain.md` 2장 의존 표를 본다 / When `profile`을 찾는다 / Then 없으며, "유스케이스 모듈은 이 표에 없다"는 기존 문장이 그 이유를 설명한다
