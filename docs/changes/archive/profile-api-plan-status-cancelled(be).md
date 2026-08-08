# [BE] `cancelled` 상태의 의미 확정 — domain.md 8.2 신설 + profile-api.md 4.1 판정 명시

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 8.2 · `docs/spec/api/profile-api.md` 4.1 |
| 위치 | `domain.md` 8.2 `subscriptions`(status 의미 표 신설) · `profile-api.md` 4.1 판정 표 + 설계 메모 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 프로필 백엔드 구현 (`feat(be)/profile`) |
| 근거 문서 | `docs/backend/domain.md` 8.2(`subscriptions.status` enum 5개) |
| 성격 | **누락.** 실재하는 상태값 하나가 판정 규칙에 언급되지 않아, 구현이 판단해야 했다 |
| 상태 | **반영 완료** (2026-08-08, 프로필 통합 시점) — **A안 확정**: 뿌리인 `domain.md`부터 고쳤다 |

> **FE 대응은 없다.** 표는 3열(`status` / 판정(서버) / 화면)이고 이 요청이 건드리는 것은 **가운데 열 하나뿐**이다. FE가 받는 `status`는 여전히 `free` · `subscribed` · `cancel_scheduled` · `grace` **넷**이며, 새 값이 생기지 않는다.
>
> **다만 이 판단이 뒤집히면 FE 수정 건이 된다** — "함께 확인할 것" 참조.

> **2026-08-08 반영 결과 — 논의 끝에 요청 범위를 넓혔다**
>
> 원안은 `profile-api.md` 4.1 판정 열만 고치는 것이었다. 그런데 파고들어 보니 **표가 빠진 것은 증상이고, 진짜 문제는 `cancelled`의 의미가 어디에도 정의돼 있지 않다는 것**이었다 — `domain.md` 8.2가 enum 값만 나열하고 뜻을 적지 않았다.
>
> **의미가 없으면 두 가지로 읽힌다.** 스토어마다 "cancel"이 다른 사건을 가리키기 때문이다 — Google Play의 `userCancellationTimeMillis`는 해지 예약(만료 전 유효)이고, Apple 영수증의 `cancellation_date`는 환불·철회(즉시 무효)다. 후자로 해석되면 **환불받은 사용자가 만료일까지 유료 혜택을 계속 쓴다.**
>
> **enum 안에서 답이 나왔다.** `refunded`가 이미 있으므로 환불·철회는 그 값이 가져가고, `cancelled`에 남는 뜻은 **해지 예약** 하나뿐이다. 세 값(`cancelled` · `refunded` · `expired`)이 각자 다른 사건을 가리키게 된다.
>
> **반영한 것**
>
> - **`domain.md` 8.2 — `status` 값의 의미 표를 신설했다.** 다섯 값의 뜻 · 만료 전 접근 권한 · `is_auto_renew` 관계를 적고, **`cancelled`와 `refunded`를 반드시 구분한다**는 것과 그 이유(스토어 필드명이 아니라 의미로 환산해 저장한다)를 함께 남겼다. `cancelled`는 정의상 `is_auto_renew = false`라는 것도 명시했다
> - **`profile-api.md` 4.1 — 다섯 값이 각각 어느 분기로 가는지 대응표를 추가**하고, `cancel_scheduled` 행에 `status = 'cancelled'`가 여기라고 못박았다. 만료 시각을 앞질러 비교하지 않는 이유도 함께 적었다
> - **`status` 열과 화면 열은 건드리지 않았다** — FE가 받는 값은 `free` · `subscribed` · `cancel_scheduled` · `grace` 넷 그대로다
>
> **코드는 바꾸지 않았다.** `toPlanStatus()`가 이미 이 규칙대로 판정한다. 결정 시점에 `subscriptions`에 행을 쓰는 코드가 아직 하나도 없어(결제 흐름 미구현) 잘못 저장된 데이터도 없다.
>
> **남은 것** — `cancelled`인데 `is_auto_renew = true`인 모순 조합에 방어 로그를 넣을지는 별도 판단이다. 지금은 조용히 `subscribed`로 보낸다.

---

## 어긋난 지점

`domain.md` 8.2의 `subscriptions.status`는 **다섯 값**이다.

```
status  enum  active | grace | cancelled | expired | refunded
```

그런데 `profile-api.md` 4.1의 판정 표는 넷만 다룬다.

| `status` | 판정(서버) | `cancelled`가 여기 해당하는가 |
|---|---|---|
| `free` | 행 자체가 없거나 `expired` · `refunded`뿐 | **언급 없음** |
| `subscribed` | `status = 'active'` 이고 `is_auto_renew = true` | **언급 없음** |
| `cancel_scheduled` | 해지 예약 — `is_auto_renew = false`이고 만료 전 | 상태를 지정하지 않아 **해석 여지** |
| `grace` | `status = 'grace'` | 아니다 |

`cancelled` 행이 왔을 때 어느 분기로 보낼지가 문서에 없다. **구현이 판단할 수밖에 없었고, 판단한 내용이 문서에 남지 않으면 다음 사람이 같은 조사를 반복한다.**

## 구현이 택한 방향

**`cancelled`를 `active`와 같이 취급하고 `is_auto_renew`로만 가른다.**

근거는 표 자신의 `cancel_scheduled` 행이다 — 그 정의가 `status`가 아니라 **"`is_auto_renew = false`이고 만료 전"** 이다. 상태값이 아니라 자동 갱신 여부를 축으로 삼고 있으므로, `cancelled`도 같은 축으로 가르는 것이 표의 서술과 어긋나지 않는다.

| `subscriptions` 행 | 응답 `status` |
|---|---|
| `cancelled` + `is_auto_renew = true` | `subscribed` |
| `cancelled` + `is_auto_renew = false` | `cancel_scheduled` |

**`free`로 보내지 않은 이유**: `free`의 정의가 "유효한 구독 행 없음(`expired` · `refunded`뿐)"이다. `cancelled`는 만료 전이라 아직 혜택이 살아 있는 상태이므로, 무료로 내리면 **이용 종료일까지 남은 기간에 사용자가 유료 기능을 못 쓴다.**

## 제안 문구

판정 열 두 줄만 고친다. **`status` 열과 화면 열은 그대로다.**

| `status` | 판정(서버) | 화면 |
|---|---|---|
| `subscribed` | `status`가 `active` 또는 **`cancelled`**이고 `is_auto_renew = true` | *(그대로)* |
| `cancel_scheduled` | 해지 예약 — `is_auto_renew = false`이고 만료 전. **`status`가 `active`든 `cancelled`든 같다** | *(그대로)* |

표 아래 설계 메모에 한 줄 덧붙인다.

> - **`cancelled`는 별도 분기가 아니다.** 만료 전이라 혜택이 살아 있으므로 `free`가 아니고, 화면이 갈라야 하는 것은 "다음 결제일이 있는가 / 이용 종료일이 있는가"뿐이다. 스토어 상태값을 그대로 노출하면 클라이언트가 `subscriptions`의 enum 변화를 따라다녀야 한다(같은 표의 "raw `status`를 그대로 내려주지 않는다"와 같은 이유).

## 서버 구현 상태

**문서를 갱신하는 쪽으로 확정되면 코드는 바꿀 필요가 없다.**

- `backend/src/modules/profile/profile.orchestrator.ts`의 `toPlanStatus()`가 위 규칙으로 판정한다
- 4분기 전부를 실 DB로 확인했다(2026-08-08)

```
active/renew=true  → subscribed        renews_at 채움
active/renew=false → cancel_scheduled  expires_at 채움
grace              → grace             has_payment_issue=true
expired            → free              tier=light
```

- **`expires_at` 시각을 비교해 만료를 앞질러 판정하지 않는다.** 만료 반영은 스토어 S2S가 `status`를 바꿔서 하는 일이므로(`domain.md` 8.2 — "실제 갱신 근거는 스토어 서버 알림"), 조회 쪽이 시각으로 판정하면 진실의 원천이 둘이 된다. 이 판단도 문서에 없어 구현이 택한 것이며, 아래에 남긴다.

## 함께 확인할 것

- **이 판단이 뒤집히면 FE 수정 건이 된다.** 팀이 "`cancelled`는 화면에서도 구별해야 한다"로 정하면 `status`가 다섯 개가 되고, **프로필 화면을 만들고 있는 FE가 새 케이스를 추가해야 한다.** 뒤집을 여지가 있다면 프로필 FE 구현 중인 지금이 정할 시점이다.
- **S2S 지연으로 `active`인데 만료 시각이 지난 행**은 계속 `subscribed`로 보인다. 위 이유로 시각 비교를 넣지 않았는데, 스토어 알림이 실패하면 만료된 구독이 유료로 표시된다. **`subscription.md`의 API 명세를 쓸 때 함께 볼 지점**이며(9장의 `renews_at` 정확성 미결과 같은 뿌리다), 이 문서에서 결론내지 않는다.
- **`plan.status` enum의 소유가 옮겨갈 예정이다**(`profile-api.md` 9장 — 설정·구독 관리 화면도 같은 4분기를 쓰므로 `subscription.md` 명세 작성 시 이관). 이관 시점에 이 판정 규칙도 함께 옮긴다.

## 완료 조건

- Given `profile-api.md` 4.1의 플랜 판정 표를 본다 / When `cancelled`를 찾는다 / Then `subscribed` · `cancel_scheduled` 두 행의 판정 열에 명시돼 있다
- Given `domain.md` 8.2의 `status` 다섯 값을 하나씩 표와 대조한다 / When 각 값이 어느 분기로 가는지 확인한다 / Then 다섯 값 모두 갈 곳이 정해져 있다
- Given FE가 프로필 화면을 구현한다 / When 응답의 `status`를 분기한다 / Then 처리할 값은 네 개뿐이며 `cancelled`를 직접 다루지 않는다
- Given 다음 사람이 `toPlanStatus()` 코드를 본다 / When 왜 `cancelled`가 `active`와 같이 처리되는지 묻는다 / Then 문서만으로 답을 찾을 수 있다
