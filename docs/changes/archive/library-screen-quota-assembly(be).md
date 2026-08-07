# [BE] 모듈 의존 표 — `LibraryScreen`에서 `Subscription` · `User` 제거

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` |
| 위치 | 4.5 의존 방향 기록 표 — `LibraryScreen` 행 (+ 설명 문단) |
| 요청 파트 | 백엔드 |
| 관련 작업 | 탐색 백엔드 구현 (`feat(be)/explore`) |
| 성격 | 잔여 재생 표시값 조립을 한 곳으로 모으면서 **의존 두 방향이 사라졌다** |
| 상태 | **반영 완료** (2026-08-07, 탐색 통합 시점) — 코드·문서 모두 반영 |

> **2026-08-07 반영 결과**
>
> - `architecture.md` 4.5 — `LibraryScreen` 행에서 `Subscription` · `User` 제거(`Library, Playback, Content, Drip`)
> - `LibraryScreen` 설명 문단에 "잔여 재생 표시값은 직접 조립하지 않는다" 불릿 추가. 한도 판정이 필요한 재생 시작은 이 함수를 쓰지 않는다는 단서도 함께 적었다
> - 같은 표의 `Explore` 행 신설과 함께 반영했다 — `changes/archive/module-dependency-explore(be).md`

> `changes/pending/module-dependency-explore(be).md`의 "함께 확인할 것"에서 별도 결정으로 미뤄 두었던 항목이다. **하기로 확정**되어 이 문서로 분리한다.

---

## 왜 고쳤는가

`explore-api.md` 2장이 잔여 재생 표시값 세 필드에 대해 이렇게 정한다.

> 라이브러리와 다른 이름·다른 계산을 쓰면 같은 사용자에게 두 화면이 다른 숫자를 보여준다(`explore.md` 3장). **조립 함수도 라이브러리와 같은 것을 호출한다.**

그런데 탐색을 구현하면서 조립 경로가 둘이 됐다.

| 화면 | 조립 경로 |
|---|---|
| 라이브러리 | `LibraryScreenOrchestrator`가 `UserService`(티어) → `PlanService`(한도) → `PlaybackService.buildQuota`(집계)를 **직접 조합** |
| 탐색 | `PlaybackService.buildQuotaForUser` **한 번 호출** |

두 경로가 결국 같은 함수를 같은 순서로 부르므로 지금 값이 어긋나지는 않는다. 다만 **한쪽만 바뀌면 그 순간 갈라지고**, 그것이 문서가 "같은 조립 함수"를 요구한 이유다.

## 무엇을 바꿨는가

라이브러리 화면도 `PlaybackService.buildQuotaForUser`를 호출하게 바꿨다. **그 결과 `library-screen` 모듈이 `subscription` · `user`를 알 필요가 없어졌다.**

- 티어 조회(`users.tier`)와 요금제 한도(`plans.daily_play_limit`)는 이제 `playback` 모듈 안에서만 일어난다.
- **`playback → user` · `playback → subscription`은 이미 4.5 표에 있다**(재생 한도 판정에 필요해서 등재된 방향이다). 새 의존이 생기지 않고, 있던 의존 두 개가 없어진다.
- 순환도 생기지 않는다 — `user` · `subscription` 어느 쪽도 `playback`을 모른다.

**한도 판정(`paywall.md` 4.1)이 필요한 재생 시작은 이 함수를 쓰지 않는다.** 거기서는 `isTopTier`까지 있는 정책 자체가 필요해 `PlayService`가 `PlanService`를 그대로 쓴다 — 그 의존은 4.5 표의 `Playback` 행에 이미 있다.

---

## 제안 문구

### `architecture.md` 4.5 — `LibraryScreen` 행 교체

**현재**

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| LibraryScreen | Library, Playback, Content, Subscription, User, Drip | **Entity를 소유하지 않는 유스케이스 모듈** |

**제안**

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| LibraryScreen | Library, Playback, Content, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

### 설명 문단에 한 줄 추가

기존 `LibraryScreen` 설명 문단(재생 시작이 Playback에 남는 이유를 적은 곳) 끝에 덧붙인다.

> **잔여 재생 표시값은 `PlaybackService.buildQuotaForUser`가 조립한다.** 티어 조회 → 요금제 한도 → `play_records` 집계까지를 한 함수가 하고, 탐색 화면도 같은 함수를 호출한다(`explore-api.md` 2장 — 화면마다 조립하면 같은 사용자에게 서로 다른 숫자가 표시된다). 그래서 이 모듈은 `subscription` · `user`를 의존하지 않는다.

---

## 클라이언트 계약 변경 여부

**없다.** 응답 필드도 값도 그대로다. 서버 내부에서 같은 값을 만드는 경로만 하나로 합쳤다.

## 서버 구현 상태

**반영 완료.**

- `backend/src/modules/library-screen/library-screen.orchestrator.ts` — `private buildQuota()` 삭제, `PlanService` · `UserService` 주입 제거
- `backend/src/modules/library-screen/library-screen.module.ts` — `SubscriptionModule` · `UserModule` import 제거
- `backend/src/modules/playback/services/playback.service.ts` — `buildQuotaForUser` (탐색 구현 때 추가한 것을 그대로 쓴다)
- 단위 테스트 191개 · lint · build 통과

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `LibraryScreen` 행을 본다 / Then `Library, Playback, Content, Drip` 넷이며 `LibraryScreenModule`의 import와 일치한다
- Given 라이브러리 목록과 탐색 피드를 같은 시점에 조회한다 / When 세 필드를 비교한다 / Then 값이 같고, 두 응답이 같은 함수를 거쳐 조립됐다
- Given 잔여 표시값 조립 규칙을 바꿔야 한다 / When 고칠 곳을 찾는다 / Then `PlaybackService.buildQuotaForUser` 한 곳이다
