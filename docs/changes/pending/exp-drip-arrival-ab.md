# notification · drip-scheduling · domain — 드립 도착 알림 시각 A/B(`DRIP_ARRIVAL_AB_ENABLED`) (BE · KAN-289)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 4.3·8·미결 · `features/drip-scheduling.md` 2(트리거 표)·7(재개) · `backend/domain.md` 9.1 `notification_logs.type` · `spec/api/admin-api.md`(알림 반응 `variant`) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-11-01 (Medium — 다음 통합 때) |
| 선행 | 없음 |
| 중요도 | Medium — 서술 추가. 스위치가 꺼져 있으면 동작은 종전(07:00)과 같다 |
| 관련 | [KAN-289](https://runtime364.atlassian.net/browse/KAN-289) · 브랜치 `feat(be)/drip-arrival-ab` · 티켓 `tickets/backend/pending/exp-drip-arrival-time.md` |

## 배경

단기 실험 ③-1(2026-10-29 확정) — 도착 알림 시각에 따라 당일 재생이 달라지는지 본다. 편성(현지 05:00)은 서비스 날짜 경계라 그대로 두고 알림 시각만 A/B로 가른다. 2026-10-29 결정: 신규 코호트만이 아니라 **전 사용자**를 나누고, 서버 스위치 뒤에 둔다.

## 고칠 내용

### 1. `features/notification.md` 4.3 발송 규칙 — "시점" 행에 덧붙인다

> **시각 A/B 실험(KAN-289, 2026-10-29 — 서버 스위치 `DRIP_ARRIVAL_AB_ENABLED`, `true`를 명시했을 때만 켜짐, 기본 꺼짐)**: 켜면 전 사용자를 사용자 id 해시(실험 키 `drip_arrival_time` — 공용 버킷 `experimentBucket`)로 A/B에 나눠 **A 그룹은 07:30 · B 그룹은 08:00**(그룹 현지)에 보낸다. 같은 사용자는 매일 같은 그룹이다. 07:00 크론은 쉬고 07:30·08:00 크론이 각자 자기 그룹만 보낸다. 대상·문구·탭 목적지·`ttl`은 종전과 같다. 배치가 그 시각까지 끝나지 않았으면 종전처럼 배치가 끝나는 즉시 보낸다 — 시각마다 따로 판정한다(07:45에 끝난 배치는 A를 곧바로, B는 08:00 크론이 보낸다). 하루 1건 판정은 종류 머리(`drip_arrival`)로 묶어, 도중에 스위치를 바꿔도 같은 날 두 번 가지 않는다. 꺼져 있으면 전원 07:00이다.

### 2. `features/notification.md` 8장 완료 조건 — 추가

> - Given `DRIP_ARRIVAL_AB_ENABLED=true` / When 그룹 현지 07:30·08:00이 된다 / Then A 그룹은 07:30, B 그룹은 08:00에 도착 알림이 가고 07:00에는 아무것도 가지 않는다(대상·문구는 종전과 같다)
> - Given 같은 사용자 / When 여러 날 실험을 돌린다 / Then 매일 같은 그룹이다
> - Given 실험 중 보낸 도착 알림 / When `notification_logs`를 본다 / Then 종류가 `drip_arrival.a`(07:30) 또는 `drip_arrival.b`(08:00)다. 앱이 받는 `data.type`은 `drip_arrival` 그대로다
> - Given 스위치가 꺼져 있다 / Then 종전과 같이 전원 07:00, 종류 `drip_arrival`이다

### 3. `features/drip-scheduling.md` 2 트리거 표 · 7 재개

- 2: "도착 알림은 편성과 떼어 **그룹 현지 07:00**에 보낸다" 뒤에 "(시각 A/B 실험 중에는 A 07:30 · B 08:00 — `notification.md` 4.3, KAN-289)"를 덧붙인다.
- 7: "재개가 그 그룹의 현지 07:00 뒤에 끝나면" → "재개가 그 그룹의 알림 시각(07:00, 실험 중에는 그룹별 07:30·08:00) 뒤에 끝나면 지난 시각의 알림을".
- 2의 "현지 05:00·07:00이 같은 KST 서비스 날짜 안에 들도록" → "현지 05:00~08:00이" (08:00도 같은 서비스 날짜 안이다 — `drip-group.policy.spec.ts`가 기준 시간대·서머타임 포함 확인).

### 4. `backend/domain.md` 9.1 `notification_logs.type`

> `type varchar(40)` — `drip_arrival` · **`drip_arrival.<그룹>`(도착 알림 시각 A/B — `a` 07:30 · `b` 08:00, KAN-289, 2026-10-29)** · `retention.<규칙>.<변형>`. 그룹은 컬럼을 늘리지 않고 종류에 붙인다 — 리텐션 변형과 같은 방식이고, 앱으로 가는 푸시 `data.type`과는 별개라 앱 변경이 없다. 하루 1건 판정과 집계는 `drip_arrival` 머리로 묶는다.

### 5. `spec/api/admin-api.md` — 인사이트 `push_reactions`

> `type`이 `drip_arrival.<그룹>`이면 `rule`은 null, `variant`는 그룹(`a`·`b`)이다(KAN-289). 반응률 기준선은 그룹 없는 `drip_arrival`(07:00) 줄이다.

## 완료 조건

- Given `features/notification.md` 4.3 / When 시점 규칙을 본다 / Then 스위치 이름·기본 꺼짐·A 07:30·B 08:00·사용자 id 해시·늦은 배치 처리·하루 1건 머리 판정이 적혀 있다
- Given `features/drip-scheduling.md` 2·7 / When 도착 알림 시각 서술을 본다 / Then 실험 중 07:30·08:00이 함께 적혀 있다
- Given `backend/domain.md` 9.1 / When `notification_logs.type` 값을 본다 / Then `drip_arrival.<그룹>`이 있다
- Given `spec/api/admin-api.md` / When `push_reactions`를 본다 / Then `drip_arrival.<그룹>`의 `rule`·`variant` 규칙이 있다

## 처리 기록

- 2026-10-29 발행(BE — 구현과 같은 PR).
