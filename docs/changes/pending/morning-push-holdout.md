# 아침 알림 비교 그룹(50:50) — notification.md 4.6 · experiments-api 반영 요청

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 4.6(아침 알림) · `spec/api/experiments-api.md`(도착 알림 시각 실험 응답 `arms`) |
| 요청 | 박준현(BE) |
| 발행 날짜 | 2026-10-31 |
| 관련 | KAN-288 아침 알림 · KAN-289 도착 알림 시각 실험 |

## 무엇을 고치나

1. `notification.md` 4.6 — 아침 알림 비교 그룹을 적는다.
   - 서버 스위치 `RETENTION_MORNING_HOLDOUT_ENABLED`(`true` 명시일 때만)가 켜지고 `RETENTION_MORNING_PUSH_MODE=on`이면, 보낼 대상 중 사용자 id 해시 반(실험 키 `morning_push_holdout` — 도착 알림 A/B와 독립)은 보내지 않는다.
   - 보내지 않은 건은 `notification_logs`에 `type = retention.morning.holdout` · `status = skipped` · `skip_reason` 비움 · `sent_at` 비움으로 남긴다. 하루 1건 판정(20시간)에 이 기록도 든다.
   - 다른 집계(알림 반응·빈도)는 모두 `sent`만 세므로 이 기록이 섞이지 않는다.
2. `experiments-api.md` — `GET /admin/insights/drip-arrival-time`의 `arms`에 `morning_holdout`(08:00 · reference) 행을 더한다. 보낸 시각 대신 `scheduled_at`으로 센다. `arms`는 늘 다섯 행.

## 왜

아침 알림이 실제로 재방문을 늘리는지 보려면 받지 않은 비교 그룹이 필요하다(받은 사람의 재생률만으로는 "원래 들을 사람"을 가를 수 없다). 표본을 빨리 모으려고 50:50으로 나눈다(대상 하루 100~250명 추정 → 그룹당 약 900건까지 1~2주).

## 완료 조건

- Given 비교 그룹 켜짐 · 아침 알림 on / When 08:00 아침 알림이 돈다 / Then 대상 중 약 반은 받고 나머지는 `retention.morning.holdout · skipped`로만 남는다
- Given 실험 지표 탭 / Then "아침 알림 받음 / 안 받음" 두 열의 당일 재생률이 보인다

## 처리 기록

- 2026-10-31 발행.
