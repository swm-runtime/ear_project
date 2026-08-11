# [BE] 모듈 의존 표 — `Playback` 행에 `Idempotency` 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` 4.5(의존 방향 기록 표의 `Playback` 행) |
| 발행 날짜 | 2026-08-11 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 플레이어 백엔드 구현 (`feat(be)/player`) — `replay`·원문 클릭 엔드포인트에 멱등키를 붙이면서 의존이 늘었다 |
| 근거 문서 | `docs/spec/api/player-api.md` 3장·4.4·4.5(멱등키 필수 결정) · `docs/backend/domain.md` 1.4 |
| 성격 | **표에 없는 의존이 코드에 생겼다** — 표 자신의 규칙상 리뷰 반려 대상이다. `Settings` 행 건(2026-08-09 반영)과 같은 유형 |
| 상태 | **반영 완료** (2026-08-11, 플레이어 통합 시점) — 제안대로 문서를 고쳤고 코드는 바꾸지 않았다 |

> **2026-08-11 반영 결과** — "제안 문구"의 행을 그대로 반영했다.
>
> - `architecture.md` 4.5 표의 `Playback` 행에 **`Idempotency`를 추가**하고, 비고에 이유(신호 테이블에 유니크 제약이 없어 재전송 중복을 DB가 못 막는다)를 붙였다. `playback.module.ts`의 실제 import와 1:1로 일치한다
> - "함께 확인할 것"의 권고대로 **`Subscription | *(없음)*` 행도 신설**했다 — 표에 아예 빠져 있던 모듈이다. 현재 코드가 아무 모듈도 import 하지 않음을 확인하고 `Interest`와 같은 형식으로 적었다(`domain.md` 2장의 `Subscription → User` 방향은 결제 구현 시 코드에 생기며, 그때 표를 갱신한다 — `User` 행의 한시적 방향 설명이 이미 그 전환을 다룬다)
>
> 코드 수정 없음.

> **기존 행의 다섯 의존은 그대로다.** `Content, Library, Subscription, User, Drip`에 `Idempotency` 하나가 더해질 뿐이며, 순환도 생기지 않는다 — `Idempotency`는 도메인이 없는 플랫폼 모듈이라(4.5 하단) 어떤 모듈도 알지 못한다.

---

## 어긋난 지점

`architecture.md` 4.5는 이렇게 못박고 있다.

> 모듈이 늘어나면 아래 표를 갱신한다. **표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.**

플레이어 구현으로 `PlaybackModule`이 `IdempotencyModule`을 import 하게 됐는데 표에는 없다.

| | 표 | 코드의 실제 |
|---|---|---|
| Playback | Content, Library, Subscription, User, Drip | Content, Library, Subscription, User, Drip, **Idempotency** |

## 왜 이 의존이 생겼는가

`player-api.md`가 두 엔드포인트에 **`Idempotency-Key`를 필수**로 정했다(3장 설계 메모 · 4.4 · 4.5).

| 엔드포인트 | 왜 멱등키인가 |
|---|---|
| `POST /contents/:id/replay` | `user_signals`에 중복을 막는 유니크 제약이 없고, 오프라인 큐의 소비 신호는 "전부 보존·순서대로 전송"이라 응답 유실 후 재전송이 같은 신호를 두 번 적재한다. 중복은 `content_stats.replay_count`(정산·지표)와 드립 스코어링을 부풀린다 |
| `POST /contents/:id/source-link-clicks` | 같은 문제 + 이 값은 파트너 정산 지표의 유일한 원천이다(`domain.md` 6.6) |

재생 시작(`/play`)은 멱등키를 쓰지 않는다 — `uq_play_records_user_id_content_id_play_date`가 하루 단위 멱등을 DB로 보장한다. **두 신호 테이블에는 그런 제약이 없어서** 멱등키가 유일한 방어이고, 그 인터셉터를 쓰려면 `IdempotencyModule` import가 필요하다. `auth` · `user` · `onboarding`이 같은 이유로 이미 이 의존을 갖고 있다(표에 기재됨).

## 제안 문구

`architecture.md` 4.5 표의 `Playback` 행을 다음으로 교체한다.

> | Playback | Content, Library, Subscription, **User**, **Drip**, **Idempotency** | `domain.md` 2장의 세 방향 + 재생 한도 판정에 `users.tier`가 필요해 User를, 재생 시 드립 영구 제외 적재(`drip_excluded_contents`)에 Drip을, `replay`·원문 클릭의 멱등키(`player-api.md` 4.4·4.5 — 신호 테이블에 유니크 제약이 없어 재전송 중복을 DB가 못 막는다)에 Idempotency를 더한다. 세 모듈 모두 `Playback`을 모르므로 순환은 없다 |

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `playback.module.ts`가 `IdempotencyModule`을 import 하고, 모듈 주석에 이유를 기록해 뒀다
- 멱등 동작은 실 DB로 확인했다 — 같은 `Idempotency-Key` 재전송 시 행이 늘지 않고 저장된 첫 응답이 반환되며, 키 없는 요청은 400이다

## 함께 확인할 것

- **`Subscription` 행이 표에 아예 없다.** 의존이 0이어도 `Interest`처럼 *(없음)* 행을 두는 것이 표의 일관성에 맞다 — 이 요청의 범위는 아니지만 같은 표를 고칠 때 한 줄 추가를 권한다.

## 완료 조건

- Given `architecture.md` 4.5 표를 본다 / When `Playback` 행을 확인한다 / Then `Idempotency`가 포함되어 있고, `playback.module.ts`의 실제 import 목록과 1:1로 일치한다
- Given 리뷰어가 `playback` 모듈의 import를 본다 / When 4.5 표와 대조한다 / Then 표에 없는 의존이 하나도 없다
- Given 왜 이 의존이 필요한지 처음 보는 사람이 있다 / When 행의 비고를 읽는다 / Then 신호 테이블에 유니크 제약이 없다는 근거까지 문서만으로 알 수 있다
