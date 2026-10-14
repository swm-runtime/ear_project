# 드립 편성·도착 알림 — 발송 그룹(현지 05:00 편성 · 현지 07:00 알림)

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-14 |
| 발행자 | BE (박준현 — KAN-191) |
| 반영 대상 | `features/drip-scheduling.md` 2장 "일일 편성 배치" 행(23행) · 4.6-5 · 7장 재시작 재개(320행) · 완료 조건 · `features/notification.md` 4.3 "시점" 행 |
| 코드 반영 | PR `feat(be)/drip-timezone-groups` — `drip-group.policy.ts` · `DripBatchScheduler` 그룹 크론 · `drip_batch_runs.group` |
| 근거 | `spec/api/global-api.md` 2.4 · 8장 `drip_batch_runs` 행 · 9장 미결 #3 |

## 수정 내용

- **발송 그룹**: GLOBAL 시장 사용자는 `users.timezone`의 현재 UTC 오프셋으로 `asia`(UTC+5 이상) · `europe`(UTC−1 이상) · `americas`(그 아래) 중 하나다. KR 시장·시간대 없음·모르는 시간대는 `asia`.
- 그룹마다 기준 시간대(asia `Asia/Seoul` · europe `Europe/London` · americas `America/Chicago`)의 **현지 05:00에 그 그룹만 편성**하고 **현지 07:00에 그 그룹 적립분만 알린다**. 서머타임은 기준 시간대를 따른다.
- 실행 기록·멱등은 그룹 단위다 — `drip_batch_runs`가 `(run_date, group)`마다 1행, 재시작 재개도 그룹마다 따로 이어받는다. `already_placed`는 종전대로 서비스 날짜(05:00 KST) 기준이라, 시간대를 바꿔 그룹이 옮겨 간 사용자도 같은 날 두 번 받지 않는다.
- 알림이 다시 읽는 범위는 **그 그룹 실행 기록이 생긴 시각부터 배치 종료까지**다(종전 "서비스 날짜 시작부터" — `changes/pending/drip-arrival-push-0700.md`를 이 값으로 함께 반영한다). 같은 날 먼저 돈 다른 그룹의 적립분이 섞이지 않는다.
- **서버 스위치 `DRIP_TIMEZONE_GROUPS_ENABLED`** — `true`일 때만 그룹이 갈린다. 꺼져 있으면 전원 `asia`(05:00 KST 편성 · 07:00 KST 알림)로 종전과 같다. 글로벌 빌드 출시 전까지 운영은 끈다.
- 서비스 날짜 경계(05:00 KST)·재생 한도·체험은 그대로다. 기준 시간대의 현지 05:00·07:00이 같은 KST 서비스 날짜 안에 들도록 골랐다(서머타임 양쪽 포함 — `drip-group.policy.spec.ts`).

## 남은 것

- 알림 `ttl`은 아직 "다음 05:00 KST 배치까지"다 — americas 그룹 알림(약 22:00 KST)은 7시간 남짓으로 짧다. 그룹의 다음 배치까지로 바꿀지는 글로벌 출시 전 결정.
- 그룹 경계·기준 시간대 확정은 `global-api.md` 9장 미결 #3.

## 사유

글로벌 사용자에게 KST 05:00 편성·07:00 알림은 현지 새벽·한밤이다. KR 07:00 알림 분리(PR #1532)와 같은 이유로, 현지 출근 전에 도착해야 청취로 이어진다(2026-10-14 결정).

## 완료 조건

- Given `features/drip-scheduling.md` 2장 / When 일일 편성 배치 트리거를 읽는다 / Then "발송 그룹마다 현지 05:00(KR = 05:00 KST), 서버 스위치로 켠다"가 적혀 있다
- Given `features/notification.md` 4.3 / When 발송 시점을 읽는다 / Then "그룹 현지 07:00, 그 그룹 실행이 적립한 것만"이 적혀 있다
- Given `features/drip-scheduling.md` 7장 / When 재시작 재개를 읽는다 / Then 그룹마다 이어받는다고 적혀 있다
