# 도착 알림 시각 실험 지표 조회 — `GET /admin/insights/drip-arrival-time`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 인사이트 계열 다음에 `GET /admin/insights/drip-arrival-time` 절 신설) · `features/backend-monitoring.md`(조회 대상 목록·"실험 지표" 탭 패널에 추가) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-30 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-30 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/drip-arrival-time-insights`(KAN-289) |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

단기 실험 ③-1 도착 알림 시각 A/B(KAN-289 — `DRIP_ARRIVAL_AB_ENABLED`, A 07:30 · B 08:00)를 읽으려면 07:00 기준선과 A·B의 재생률을 같은 정의로 나란히 봐야 한다. `notification_logs.opened_at`이 기록되지 않아 클릭률은 쓸 수 없으므로 **재생률만** 내는 읽기 전용 조회와 로그 콘솔 "실험 지표" 탭 패널을 더했다. 실험 기간의 계약 원본은 `spec/api/experiments-api.md` 4.6이다(이번에 직접 썼다). 통합 때 아래로 옮긴다.

## 고칠 내용

### 1. `admin-api.md` — `GET /admin/insights/drip-arrival-time?days=&market=`

`experiments-api.md` 4.6을 그대로 옮긴다. 요지:

- 관리자 전용 · 읽기 전용 · `Cache-Control: no-store` · 집계만(`user_id`·이름·이메일 없음). `days` 1~90(기본 14) · `market` `kr`|`global`|없음 — 사용자의 지금 시장, 범위 밖·모르는 값 400
- 대상 = 창 안 `status = 'sent'` 알림. 묶음 `baseline`(`drip_arrival`, 07:00) · `a`(`drip_arrival.a`, 07:30) · `b`(`drip_arrival.b`, 08:00) · `morning`(`retention.morning.*`, 참고 행 — A/B 비교 아님)
- 2시간 재생 = 알림 반응(`push_reactions`)과 같은 판정(새 재생 행 또는 위치 저장). 당일 재생 = 같은 판정 · 그 서비스 날짜 끝까지(05:00 경계)
- 응답: `generated_at` · `market` · `days` · `since` · `min_sample`(100) · `reaction_window_hours`(2) · `arms[]`(`key` · `send_time` · `reference` · `sent` · `users` · `played_2h` · `played_same_day` · `play_rate_2h` · `play_rate_same_day` · `first_sent_at` · `last_sent_at`) — 늘 네 행, 보낸 알림 0이면 비율 null

### 2. `backend-monitoring.md`

"실험 지표" 탭 패널 목록에 "도착 알림 시각 실험 — 07:00 기준선 · 07:30(A) · 08:00(B) 재생률(`GET /admin/insights/drip-arrival-time`, KAN-289) — 2시간·당일 재생률 표, 참고 행(아침 알림), 기간 선택, 표본 작음(보낸 알림 100건 미만) 표시"를 추가한다.

## 완료 조건

- Given `admin-api.md` / When `GET /admin/insights/drip-arrival-time` 절을 읽으면 / Then 대상(보낸 알림)·묶음 네 개·2시간·당일(서비스 날짜) 재생·시장·기간·응답 필드가 적혀 있고 `AdminInsightsRepository.dripArrivalTimeRows`와 `admin-insights-drip-arrival-time.calc.ts`의 계산과 같다
- Given `backend-monitoring.md` / When "실험 지표" 탭 패널 목록을 보면 / Then 도착 알림 시각 실험 패널 행이 있다
- Given 통합이 끝났을 때 / When `experiments-api.md` 4.6을 보면 / Then `admin-api.md`로 옮겼다는 안내만 남아 있다

## 처리 기록

- 2026-10-30 발행.
- 2026-10-30 반영 — `spec/api/admin-api.md` 4.22-7 `GET /admin/insights/drip-arrival-time` 신설(`experiments-api.md` 4.6 그대로 — 대상 · 묶음 네 개 · 2시간 · 당일 재생 · 시장 · 기간 · 응답) + 3장 목록 행, `features/backend-monitoring.md` 4장 "실험 지표" 탭 패널 ④. `experiments-api.md` 4.6은 옮긴 곳 안내만 남겼다. 컨트롤러 `admin-insights.controller.ts` `drip-arrival-time` 경로와 대조함.
