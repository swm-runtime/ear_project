# [BE] 모듈 의존 표 — `Explore` 행 신설

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` |
| 위치 | 4.5 의존 방향 기록 표 (+ 유스케이스 모듈 설명 문단) |
| 요청 파트 | 백엔드 |
| 관련 작업 | 탐색 백엔드 구현 (`feat(be)/explore`) |
| 성격 | **표에 없는 모듈·의존이 코드에 생겼다** — 문서 자신의 규칙상 리뷰 반려 대상이다 |
| 상태 | 승인 대기 |

> **`domain.md` 2장은 고치지 않는다.** `explore`는 Entity를 소유하지 않으므로 그 표(Entity 소유 모듈의 의존 표)의 대상이 아니다 — `onboarding` · `library-screen`이 거기에 없는 것과 같은 이유이며, `domain.md` 2장이 "유스케이스 모듈은 위 두 표에 없다"고 이미 명시하고 있다.
>
> **이 제안이 반려되면 고칠 대상은 코드다.** 표가 맞다고 판단하면 탐색 조회를 어느 소유 모듈 안으로 넣어야 하는데, 그 경우 순환이 생긴다(아래 "왜 이 구조가 됐는가" 참조). 그때는 문서 요청이 아니라 **`tickets/backend/`** 대상이므로 이 문서에서 다루지 않는다.

---

## 어긋난 지점

`architecture.md` 4.5는 이렇게 못박고 있다.

> 모듈이 늘어나면 아래 표를 갱신한다. **표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.**

탐색 구현으로 모듈이 하나 늘었는데 표에 행 자체가 없다.

| 표 | 현재 | 코드의 실제 |
|---|---|---|
| `architecture.md` 4.5 | **`Explore` 행 자체가 없다** | Content, Library, Playback, Interest, Drip |

**기존 행은 하나도 바뀌지 않는다.** `Playback`이 `User` · `Subscription`에 의존하는 것은 이미 표에 있고(잔여 재생 표시값 조립을 그 모듈에 둔 근거가 그것이다), `Library` · `Content` · `Interest` · `Drip`의 의존도 그대로다.

---

## 왜 이 구조가 됐는가

### 1. Entity를 소유하지 않는 유스케이스 모듈이다

탐색 화면 하나에 **다섯 모듈이 소유한 데이터가 함께 나간다.**

| 응답에 들어가는 것 | 소유 모듈 (`domain.md` 2장) |
|---|---|
| 콘텐츠 · 주제 · 인기 집계 | `content` (`contents` · `content_topics` · `content_stats`) |
| 행의 "담김" 표시, 담기 · 해제 | `library` (`library_items`) |
| `is_counted_today` · 잔여 재생 표시값 · 소비 신호 | `playback` (`play_records` · `user_signals`) |
| 관심사 섹션 · 주제별 모아보기의 입력 | `interest` (`user_interests` · `topics`) |
| 담기 해제 시의 드립 영구 제외 | `drip` (`drip_excluded_contents`) |

어느 한 모듈의 Entity로 환원되지 않으므로 `architecture.md` 3.3과 `onboarding` · `library-screen` 선례를 따라 **소유 모듈들 위에서 Orchestrator로 조합**했다. Repository·Entity를 갖지 않고 각 소유 모듈이 `exports`한 Service만 호출한다.

**`content` 모듈에 넣을 수 없는 이유**가 특히 분명하다 — 담기·해제가 `library_items`를 쓰고 영구 제외가 `drip_excluded_contents`를 건드리는데, `content` 모듈은 `interest`에만 의존한다(`domain.md` 2장). 거기에 `library` · `drip` · `playback`을 더하면 `library → content` · `drip → content` · `playback → content`와 정면으로 부딪쳐 **순환**이 된다(`forwardRef` 금지 — 4.3).

### 2. `user` · `subscription`을 직접 의존하지 않는다

잔여 재생 표시값 세 필드(`daily_play_limit` · `daily_play_count` · `service_date`)는 `users.tier` → `plans.daily_play_limit` → `play_records` 집계 순으로 조립된다. 탐색이 이 셋을 직접 조합하지 않고 **`PlaybackService`가 조립해 내려주는 것을 그대로 쓴다.**

`explore-api.md` 2장이 그렇게 요구한다.

> 라이브러리와 다른 이름·다른 계산을 쓰면 같은 사용자에게 두 화면이 다른 숫자를 보여준다. **조립 함수도 라이브러리와 같은 것을 호출한다.**

`playback → user` · `playback → subscription`은 이미 4.5 표에 있으므로 새 의존이 생기지 않고, 탐색의 의존 목록에서 두 모듈이 빠진다.

### 3. `interest` 의존은 탐색에서 처음 생긴다

관심사 섹션과 주제별 모아보기 섹션이 `user_interests`(활성 관심 주제)와 `topics`(섹션 제목에 쓰는 주제명)를 읽는다. `interest`는 **다른 모듈을 모르는 기반 모듈**이므로(4.5 — "`Interest` | *(없음)*") 어느 방향으로도 순환이 생기지 않는다.

---

## 제안 문구

### `architecture.md` 4.5 — 한 행 추가

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| Explore | Content, Library, Playback, Interest, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

이어서 `Onboarding` · `LibraryScreen` 설명 문단과 같은 자리에 다음을 덧붙인다.

> **Explore도 Entity를 갖지 않는다.** 탐색 응답에는 콘텐츠·주제·인기 집계(`content` 소유), 행의 "담김" 표시와 담기·해제(`library` 소유), 오늘 카운트·잔여 재생 표시값·소비 신호(`playback` 소유), 관심 주제(`interest` 소유)가 함께 나가고, 담기 해제는 드립 영구 제외(`drip` 소유)까지 건드린다. 어느 한 모듈의 Entity로 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `/explore/feed` · `/explore/contents`와 담기·해제(`/contents/:content_id/save`)가 여기에 속한다.
>
> - **`user` · `subscription`을 직접 의존하지 않는다.** 잔여 재생 표시값은 `PlaybackService`가 조립해 내려준다 — 라이브러리와 **같은 조립 경로**를 써야 두 화면이 같은 숫자를 보여준다(`explore-api.md` 2장).
> - **재생 시작은 여기에 없다.** 담기·해제와 경로 계층이 같지만(`/contents/:content_id/...`) 재생은 `library-api.md` 8장이 지정한 대로 Playback 모듈에 남는다 — 진입점마다 모듈이 갈리면 한도 판정이 경로별로 새는 구멍이 된다.

---

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `backend/src/modules/explore/` — Entity 없음. Orchestrator + 커서 + 랭킹(순수 함수) + Controller 2개
  - `GET /explore/feed` · `GET /explore/contents` (`ExploreController`)
  - `POST /contents/:content_id/save` · `DELETE /contents/:content_id/save` (`ContentSaveController`)
  - `GET /explore/search`는 **P1 확정이라 배포하지 않았다**(`explore-api.md` 3장 설계 메모)
- `backend/src/modules/playback/` — `PlaybackService.buildQuotaForUser` 추가. **의존 모듈은 그대로**(`user` · `subscription`은 이미 4.5 표에 있다)
- `content` · `library` 모듈에는 조회·저장 메서드만 추가했고 **의존 방향은 바뀌지 않았다**
- 단위 테스트 189개 · lint · build 통과, 순환 없이 애플리케이션이 기동하며 실제 요청까지 확인했다

## 함께 확인할 것

- ~~**`LibraryScreen` 행의 `Subscription` · `User`는 나중에 뺄 수 있다.**~~ → **확정(2026-08-07): 통일하기로 했다.** 잔여 표시값 조립을 `PlaybackService.buildQuotaForUser` 한 곳으로 모아 `LibraryScreen`의 두 의존이 사라졌다. **같은 표의 다른 행을 고치는 일이라 별도 문서로 분리했다** — `changes/pending/library-screen-quota-assembly(be).md`. 두 문서가 `architecture.md` 4.5의 서로 다른 행을 건드리므로 **함께 반영해야 표가 한 번에 맞는다.**

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `Explore` 행을 찾는다 / Then 행이 존재하고, `ExploreModule`이 실제로 import 하는 모듈 목록과 일치한다
- Given 리뷰어가 `explore` 모듈의 `import`를 본다 / When 4.5 표와 대조한다 / Then 표에 없는 의존이 하나도 없다
- Given `explore` 모듈이 무엇인지 처음 보는 사람이 있다 / When 4.5의 설명 문단을 읽는다 / Then **왜 `content`나 `library` 모듈에 두지 않았는지**(순환)를 문서만으로 알 수 있다
- Given `domain.md` 2장 의존 표를 본다 / When `explore`를 찾는다 / Then 없으며, "유스케이스 모듈은 이 표에 없다"는 기존 문장이 그 이유를 설명한다
