# 로그 콘솔 "서비스 지표 v2" 탭 — 질문형 지표 `GET /admin/insights/v2`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 다음에 `GET /admin/insights/v2` 신설) · `features/backend-monitoring.md`(탭 표에 "서비스 지표 v2" 행 + 지표 정의) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-28 |
| 시작 날짜 | 2026-10-28 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/insights-v2` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

멘토 피드백(2026-10-28): 기존 "서비스 지표" 탭은 일별 청취·일별 가입·상위 사용자·상위 콘텐츠처럼 숫자가 많지만 **어느 것도 가설이나 행동으로 이어지지 않는다.** v2는 패널마다 질문 하나에 답하고 고칠 곳을 한 줄로 단다. 일별 합계 대신 **서비스 주·가입 주 코호트**로 비교하고, 상위 N 대신 **안 듣는 쪽**(어디서 새나 · 누가 안 듣나)을 본다. 기존 탭은 그대로 둔다.

## 고칠 내용

### 1. `admin-api.md` — `GET /admin/insights/v2?weeks=&market=`

관리자 전용(`JwtAuthGuard` + `AdminRoleGuard`), 읽기 전용, `Cache-Control: no-store`. 집계값만 — `user_id`·이름·이메일 없음.

- 요청: `weeks` 4~12(기본 8, 이번 주 포함 서비스 주 수) · `market` `kr`|`global`|없음(통합 — 요약 4.22와 같은 "지금 시장" 규칙). 범위 밖·모르는 값은 400.
- 주 = **서비스 주**(월요일 05:00 KST 시작, `service-date.util` — 전환 전 시각은 04:00).
- 응답 `weeks` · `market` · `generated_at` 과 세 덩어리:

**`north_star`** — "이번 주 3일 이상 들은 사람"
- `min_play_days`(정의값 — 백엔드 상수 `NORTH_STAR_MIN_PLAY_DAYS = 3`) · `current_week_start` · `days_elapsed`(이번 주에 지난 서비스 날짜 수 1~7, 오늘 포함)
- `weeks[]`(오래된 주 먼저, 마지막이 이번 주): `week_start` · `listeners`(그 주에 1일 이상 들은 사람) · `habit_users`(서로 다른 `play_date`가 `min_play_days`일 이상) · `habit_ratio`(`habit_users / listeners`) · `partial`(이번 주만 true)
- `last_week_same_point`: 지난주를 이번 주와 같은 요일까지(첫 `days`일)만 센 `listeners` · `habit_users` · `habit_ratio` — 진행 중인 주는 이것과 비교한다(오늘은 하루가 덜 지나 그만큼 불리하다)
- "들었다" = `play_records.listened_sec > 0`

**`funnel`** — 가입 주 코호트 퍼널(`users.created_at`을 서비스 주로 묶음, 현재 계정 — 탈퇴자 제외)
- `steps[]`(퍼널 순서): `signups` → `onboarding_completed` → `first_play_24h` → `first_complete` → `w1_return` → `habit_14d` → `paid_ever`. 각 `key` · `mature_cohorts` · `rate`(성숙한 묶음 합산 `Σ이 단계 / Σ앞 단계`) · `drop`(`1 - rate`, 0 아래는 0). 첫 단계는 `rate`·`drop` null
- `largest_drop_step`: `drop`이 가장 큰 단계(같으면 앞 단계), 판정할 단계가 없으면 null
- `reliable_since`: 접속 기록을 믿을 수 있는 첫 날(코호트 리텐션 표와 같은 계산 `cohortReliableSince`)
- `cohorts[]`(최근 가입 주 먼저): `week_start` · `in_progress`(가입 주가 아직 안 끝남) · `signups` · `onboarding_completed` · `first_play_24h` · `first_play_ever`(참고 값, 단계 아님) · `first_complete` · `w1_return` · `w1_partial` · `habit_14d` · `paid_ever` · `rates.<단계>` = `{ count, of_prev, of_signups }`
- 단계 정의
  - `first_play_24h`: 가입 시각 + 24시간 안의 재생 행(0초 포함). 묶음 끝 + 24시간이 안 지났으면 null
  - `first_complete`: 완청 신호(`user_signals.action = complete`)가 한 번이라도 — 신호 180일 보존이라 그보다 오래된 완청은 빠질 수 있다
  - `w1_return`: 가입 KST 달력일 + 7~13일에 접속(`user_active_dates` · 남은 `sessions`) 또는 재생 — 코호트 리텐션 W1과 같은 정의. `week_start + 20일 < 오늘(KST)` 전에는 null(묶음의 마지막 가입자 기준). `week_start + 7일 < reliable_since`면 `w1_partial`(재생만 잡혀 낮다 — 가장 큰 이탈 판정에서 뺀다)
  - `habit_14d`: 가입 시각 + 14일 안에 들은 서로 다른 `play_date`가 `min_play_days`일 이상. 묶음 끝 + 14일 전에는 null
  - `paid_ever`: 실결제(`subscriptions.environment = production`, `status <> refunded`)가 한 번이라도
- 단계는 엄밀한 포함 관계가 아니다(24시간 안에 안 듣고 나중에 완청 가능) — 비율이 1을 넘을 수 있다
- 성숙 = `in_progress`가 아니고 이 단계·앞 단계가 둘 다 숫자(W1 partial 은 null 취급)이며 앞 단계가 1명 이상

**`segments`** — 안 듣는 세 무리(현재 계정, 온보딩 여부 무관)
- `population`(현재 계정 수) · `lapse_window_days`(7)
- `items[]`: `key` · `count` · `base`(분모) · `rate` · `week_ago { count, base, rate }` · `delta`(`count - week_ago.count`) · `breakdown[]`
  - `no_play` 가입했는데 재생 0 — 가입 1일 지났고 재생 행이 없다(분모 = 가입 1일 지난 사람)
  - `no_complete` 재생했는데 완청 0 — 재생 행이 있고 완청 신호가 없다(분모 = 재생한 사람)
  - `lapsing` 이탈 직전 — `[지금-14일, 지금-7일)`에 들었고 `[지금-7일, 지금)`에 안 들었다(분모 = 앞 창 청취자). **굴러가는 7일 창**을 쓴다 — 서비스 주로 자르면 월요일엔 거의 모두가 이탈로 보인다
  - `week_ago`: 같은 정의를 `지금 - 7일` 시각으로 다시 센 값(그때 이미 있던 가입·재생·완청만)
- `breakdown[]`: `dimension`(`market` · `push` · `provider` · `marketing` · `onboarding`) · `key` · `count` · `population`(그 칸의 현재 계정 수) · `share`(무리 안 비율) · `population_share`(전체 현재 계정 안 비율) · `gap`(`share - population_share`) · `notable`(`|gap| ≥ 0.15`이고 `count ≥ 5`)
  - `push` `yes`/`no` = 보낼 수 있는 기기(토큰 있음 · `invalidated_at` 없음 · `is_os_permission_granted`)가 하나라도 · `marketing` `agreed`/`not_agreed` = `consents` 마케팅 최신 행(행 없으면 미동의) · `onboarding` `completed`/`not_completed` · `provider` = `users.provider` · `market` = `users.market`
  - 분해 차원은 **지금 상태**다(1주 전 값은 합계만)

### 2. `backend-monitoring.md` 탭 표

"서비스 지표 v2 | `/backend-logs/insights-v2` | 질문형 패널 셋 — ① 이번 주 습관이 된 사람은 늘었나(이번 주 진행 중 · 지난주 같은 시점 · 지난주 · 4주 전, 주별 막대) ② 가입한 사람은 어디서 새나(가입 주 코호트 퍼널, 가장 큰 이탈 단계 강조 + 단계별 '다음에 고칠 곳') ③ 안 듣는 사람은 누구고 왜인가(세 무리 · 1주 전 대비 · 분해 칸 강조 + '할 수 있는 일'). 패널마다 '그래서 할 일' 한 줄. 변경 기록(웹 상수 `CHANGE_LOG`)을 주별 막대·코호트 행에 표시. 실배포·개발계 토글 · 시장 [통합|국내|글로벌] · 4/8/12주, 열 때 1회 + [새로고침]. 옛 서버(404)는 안내" 추가.

## 완료 조건

- Given 위 두 문서 / When `GET /admin/insights/v2` 절과 탭 표를 읽으면 / Then 요청 파라미터·응답 필드·지표 정의(습관 3일 · 24시간 · W1 7~13일 · 14일 습관 · 이탈 직전 굴러가는 7일 창 · 성숙/부분 규칙 · 강조 기준)가 적혀 있고 `AdminInsightsRepository.northStarWeeks`·`funnelCohorts`·`segmentCounts`와 `admin-insights-v2.calc.ts`의 판정과 같다

## 처리 기록

- 2026-10-28 발행.
