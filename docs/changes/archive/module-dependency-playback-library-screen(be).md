# [BE] 모듈 의존 표 — `playback` 신설 · `library-screen` 신설 · 의존 2방향 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` · `docs/backend/domain.md` |
| 위치 | `architecture.md` 4.5 의존 방향 기록 표 · `domain.md` 2장 의존 방향 표 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 라이브러리 백엔드 구현 (`feat(be)/library`) |
| 성격 | **표에 없는 의존이 코드에 생겼다** — 문서 자신의 규칙상 리뷰 반려 대상이다 |
| 상태 | **반영 완료** (2026-08-07, 라이브러리 통합 시점) — 문서를 고치는 쪽으로 확정. 코드는 바꾸지 않았다 |

> **2026-08-07 반영 결과**
>
> - `architecture.md` 4.5 — `Playback` · `LibraryScreen` 두 행 추가 + LibraryScreen 설명 문단(재생 시작이 Playback에 남는 이유 포함) 추가
> - `domain.md` 2장 — `playback` 행에 `user` · `drip` 추가, **`drip` 행에도 `user` 추가**(이번 작업과 무관하게 이미 뒤처져 있던 누락, "함께 확인할 것"의 지적을 그대로 반영)
> - `domain.md` 2장 — "유스케이스 모듈은 이 표에 없다" 한 줄 추가. `library-screen`이 왜 여기 없는지 묻지 않게 한다
> - **두 문서가 같은 표를 두 벌 유지하는 문제는 손대지 않았다.** 이 문서가 "이번 정정과 별개의 결정"으로 선을 그은 대로다 — 원본을 한쪽으로 정하는 결정은 따로 필요하다

> **참고** — 두 문서 모두 backend 소유라 백엔드가 직접 고칠 수 있는 대상이다. 다만 `domain.md`는 **스키마의 유일한 기준**이고 `architecture.md` 4.5는 리뷰 판정 근거라, 임의로 손대지 않고 여기에 남긴다. 승인해 주면 문서를 바로 고치겠다.
>
> **이 제안이 반려되면 고칠 대상은 코드다.** 표가 맞다고 판단하면 `playback`이 `user` · `drip`을 모르도록 재생 시작을 Orchestrator로 올려야 한다. 그때는 문서 요청이 아니라 **`tickets/backend/`** 대상이므로 이 문서에서 다루지 않는다.

---

## 어긋난 지점

`architecture.md` 4.5는 이렇게 못박고 있다.

> 모듈이 늘어나면 아래 표를 갱신한다. **표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.**

라이브러리 구현으로 모듈이 둘 늘고 의존이 둘 추가됐는데, 두 표 어디에도 없다.

| 표 | 현재 | 코드의 실제 |
|---|---|---|
| `architecture.md` 4.5 | **`Playback` 행 자체가 없다** | Content, Library, Subscription, **User**, **Drip** |
| `architecture.md` 4.5 | **`LibraryScreen` 행 자체가 없다** | Library, Playback, Content, Subscription, User, Drip |
| `domain.md` 2장 | `playback` \| `content`, `library`, `subscription` | **`user` · `drip` 두 방향이 빠져 있다** |

`domain.md` 2장의 **소유권 표는 이미 맞다** — `playback`이 `playback_progresses` · `play_records` · `user_signals`를 소유한다고 정확히 적혀 있고, 구현이 그대로 따랐다. 어긋난 것은 **의존 방향 표 한 줄**이다.

`library-screen`은 **Entity를 소유하지 않으므로 `domain.md` 소유권 표에도 의존 표에도 넣지 않는다.** `onboarding`이 두 표 어디에도 없는 것과 같은 이유다 — `domain.md` 2장은 Entity 소유 모듈의 표이고, 유스케이스 모듈은 `architecture.md` 4.5가 담당한다.

---

## 왜 이 구조가 됐는가

### 1. `library-screen` — Entity를 소유하지 않는 유스케이스 모듈

라이브러리 화면의 응답에는 **`playback`이 소유한 데이터가 반드시 들어간다.**

| 응답 필드 | 소유 모듈 |
|---|---|
| `progress` (재생 위치) | `playback` (`playback_progresses`) |
| `is_counted_today` | `playback` (`play_records`) |
| `daily_play_count` | `playback` (`play_records` 집계) |
| `daily_play_limit` | `subscription` (`plans`) |

그런데 `library-api.md` 8장이 반대 방향을 함께 못박고 있다.

> `play_records` · `user_signals` · `playback_progresses`는 `playback` 모듈 소유이며, **`library` 모듈은 `content` · `user`에만 의존한다.** 재생 시작(4.4)은 `playback` 모듈의 엔드포인트이고, 라이브러리 상태 전이는 `library` Service를 호출해 수행한다.

`playback → library`가 계약으로 정해져 있으므로 **`library → playback`을 만들면 순환**이 되고, `forwardRef`는 금지다(`architecture.md` 4.3). 그래서 `architecture.md` 3.3과 `onboarding` 선례를 따라 **두 모듈 위에서 Orchestrator로 조합**했다.

- `library` 모듈의 의존은 **`content` · `user` 그대로 유지된다.** 표를 고칠 필요가 없다.
- `library-screen`은 Repository·Entity를 갖지 않고 각 소유 모듈의 Service만 조합한다.

### 2. `playback → user` — 한도 판정에 `users.tier`가 필요하다

`paywall.md` 4.1의 판정은 `plans[user.tier].daily_play_limit`을 읽는다. 티어는 `users.tier`에 있다.

**`drip`이 편성 편수 판정 때문에 `User`를 더한 것과 같은 선례다**(`architecture.md` 4.5 비고란에 그 사유가 적혀 있다). `user`는 `playback`을 모르므로 순환은 없다.

### 3. `playback → drip` — 재생한 콘텐츠는 드립에서 영구 제외된다

FR-16과 `library-api.md` 4.4 서버 처리 5번이 재생 시작 시 `drip_excluded_contents`에 `reason = 'played'`를 적재하도록 정한다. 그 테이블은 `drip` 모듈 소유다.

`drip → library`와 `playback → library`는 **같은 방향**이므로 `playback → drip → library` 경로에 순환이 없다.

---

## 제안 문구

### `architecture.md` 4.5 — 두 행 추가

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| Playback | Content, Library, Subscription, **User**, **Drip** | `domain.md` 2장의 세 방향 + 한도 판정에 `users.tier`가 필요해 User를, 재생 시 드립 영구 제외 적재에 `drip_excluded_contents`가 필요해 Drip을 더한다. 두 모듈 모두 Playback을 모르므로 순환은 없다 |
| LibraryScreen | Library, Playback, Content, Subscription, User, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

이어서 `Onboarding` 설명 문단과 같은 자리에 다음을 덧붙인다.

> **LibraryScreen도 Entity를 갖지 않는다.** 라이브러리 화면의 응답에는 재생 위치·오늘 카운트(`playback` 소유)와 재생 한도(`subscription` 소유)가 함께 나가고, 삭제는 드립 영구 제외(`drip` 소유)까지 건드린다. 그런데 `library-api.md` 8장이 **`playback` → `library`** 방향과 "`library` 모듈은 `content` · `user`에만 의존한다"를 함께 정하고 있어, `library`가 `playback`을 의존하면 순환이 된다(`forwardRef` 금지 — 4.3). 그래서 두 모듈 **위에서** Orchestrator가 조합한다(→ 3.3). `/users/me/library-items`의 6개 엔드포인트가 여기에 속하며, 재생 시작(`POST /contents/:id/play`)은 `library-api.md` 8장이 지정한 대로 Playback 모듈에 남는다.

### `domain.md` 2장 — `playback` 행 갱신

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| `playback` | `content`, `library`, `subscription`, **`user`**, **`drip`** | `content_stats` 집계 배치를 `playback`이 실행한다. 재생 한도 판정에 `users.tier`가, 재생 시 드립 영구 제외 적재에 `drip_excluded_contents`가 필요하다 |

---

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `backend/src/modules/playback/` — `playback_progresses` · `play_records` · `user_signals` 소유. `POST /contents/:content_id/play`
- `backend/src/modules/library-screen/` — Entity 없음. `/users/me/library-items` 6개 엔드포인트 + Orchestrator
- `backend/src/modules/library/` — 의존은 `content` · `user` 그대로. 목록 쿼리·완청 판정·소프트 삭제만 추가
- 단위 139개 · E2E 20개 통과, 순환 없이 애플리케이션이 기동하는 것을 확인했다

## 함께 확인할 것

- **`domain.md` 2장의 `drip` 행도 이미 뒤처져 있다.** `architecture.md` 4.5는 `Drip`에 `User`를 포함하는데(편성 편수 판정) `domain.md`는 `content`, `library`, `interest`, `subscription`만 적고 있다. 이번 작업으로 생긴 어긋남은 아니지만 **같은 표의 같은 종류 누락**이라, `playback` 행을 고칠 때 함께 맞추는 편이 낫다.
- **두 문서가 같은 표를 두 벌 유지하고 있다.** `architecture.md` 4.5와 `domain.md` 2장이 같은 사실을 서로 다른 표기(PascalCase / 백틱 소문자)로 적고 있어 이번처럼 한쪽만 갱신되면 바로 갈라진다. 한쪽을 원본으로 정하고 다른 쪽은 참조만 남기는 것을 검토할 만하다 — **이번 정정과 별개의 결정이므로 여기서 실행하지 않는다.**

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `Playback` · `LibraryScreen` 행을 찾는다 / Then 두 행이 존재하고, 코드가 실제로 주입받는 모듈 목록과 일치한다
- Given `domain.md` 2장 의존 표를 본다 / When `playback` 행을 본다 / Then `user` · `drip`이 포함되어 있고 그 사유가 비고에 적혀 있다
- Given 리뷰어가 `playback` 모듈의 `import`를 본다 / When 4.5 표와 대조한다 / Then 표에 없는 의존이 하나도 없다
- Given `library-screen` 모듈이 무엇인지 처음 보는 사람이 있다 / When `architecture.md` 4.5의 설명 문단을 읽는다 / Then **왜 `library` 모듈에 두지 않았는지**(순환)를 문서만으로 알 수 있다
