# 로그 콘솔 "실험 지표" 탭 가입 퍼널 — `GET /admin/insights/funnel`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 다음에 `GET /admin/insights/funnel` 신설) · `features/backend-monitoring.md`(탭 표에 "실험 지표" 행) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-28 |
| 시작 날짜 | 2026-10-28 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/experiment-funnel` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

보류한 서비스 지표 v2(#2116, #2118로 되돌림)의 세 패널 중 **가입 퍼널**만 떼어 "실험 지표" 탭(누구나 보고 싶은 지표를 추가해 보는 비공식 지표 모음, #2117·#2119)에 둔다. 가입한 사람이 어느 단계에서 가장 많이 빠지는지 보고 실험할 곳을 고르려는 것이다. 정의는 v2 의 퍼널과 같다.

## 고칠 내용

### 1. `admin-api.md` — `GET /admin/insights/funnel?weeks=&market=`

관리자 전용(`JwtAuthGuard` + `AdminRoleGuard`), 읽기 전용, `Cache-Control: no-store`. 집계값만 — `user_id`·이름·이메일 없음.

- 요청: `weeks` 4~12(기본 8, 이번 주 포함 가입 주 수) · `market` `kr`|`global`|없음(통합 — 요약 4.22와 같은 "지금 시장" 규칙). 범위 밖·모르는 값은 400
- 가입 주 = **서비스 주**(월요일 05:00 KST 시작, `service-date.util` — 전환 전 시각은 04:00). `users.created_at`으로 묶는다. 현재 계정만(탈퇴자 제외)
- 응답: `weeks` · `market` · `generated_at` · `habit_min_play_days`(백엔드 상수 `FUNNEL_HABIT_MIN_PLAY_DAYS = 3`) · `reliable_since`(접속 기록을 믿을 수 있는 첫 날 — 코호트 리텐션 표와 같은 `cohortReliableSince`)
  - `steps[]`(퍼널 순서): `signups` → `onboarding_completed` → `first_play_24h` → `first_complete` → `w1_return` → `habit_14d` → `paid_ever`. 각 `key` · `mature_cohorts` · `rate`(성숙한 묶음 합산 `Σ이 단계 / Σ앞 단계`) · `drop`(`1 - rate`, 0 아래는 0). 첫 단계는 `rate`·`drop` null
  - `largest_drop_step`: `drop`이 가장 큰 단계(같으면 앞 단계), 판정할 단계가 없으면 null
  - `cohorts[]`(최근 가입 주 먼저): `week_start` · `in_progress` · `signups` · `onboarding_completed` · `first_play_24h` · `first_play_ever`(참고 값, 단계 아님) · `first_complete` · `w1_return` · `w1_partial` · `habit_14d` · `paid_ever` · `rates.<단계>` = `{ count, of_prev, of_signups }`
- 단계 정의
  - `first_play_24h`: 가입 시각 + 24시간 안의 재생 행(0초 포함). 묶음 끝 + 24시간이 안 지났으면 null
  - `first_complete`: 완청 신호(`user_signals.action = complete`)가 한 번이라도 — 신호 180일 보존이라 그보다 오래된 완청은 빠질 수 있다
  - `w1_return`: 가입 KST 달력일 + 7~13일에 접속(`user_active_dates` · 남은 `sessions`) 또는 재생 — 코호트 리텐션 W1과 같은 정의. `week_start + 20일 < 오늘(KST)` 전에는 null. `week_start + 7일 < reliable_since`면 `w1_partial`(재생만 잡혀 낮다 — 가장 큰 이탈 판정에서 뺀다)
  - `habit_14d`: 가입 시각 + 14일 안에 들은(`listened_sec > 0`) 서로 다른 `play_date`가 `habit_min_play_days`일 이상. 묶음 끝 + 14일 전에는 null
  - `paid_ever`: 실결제(`subscriptions.environment = production`, `status <> refunded`)가 한 번이라도
- 단계는 엄밀한 포함 관계가 아니다 — 비율이 1을 넘을 수 있다
- 성숙 = `in_progress`가 아니고 이 단계·앞 단계가 둘 다 숫자(W1 partial 은 null 취급)이며 앞 단계가 1명 이상

### 2. `backend-monitoring.md` 탭 표

"실험 지표 | `/backend-logs/experiments` | 누구나 보고 싶은 지표를 추가해 보는 비공식 지표 모음(공식 지표는 '서비스 지표'). 지표마다 보는 이유·추가한 사람·정의(+ 관련 실험·메모)를 함께 적는다. 숫자가 붙은 지표: 가입 퍼널(가입 주 코호트, 가장 많이 빠지는 단계 강조 + '다음에 고칠 곳'). 실배포·개발계 토글 · 시장 [통합|국내|글로벌] · 4/8/12주, 열 때 1회 + [새로고침]. 옛 서버(404)는 안내" 추가.

## 완료 조건

- Given 위 두 문서 / When `GET /admin/insights/funnel` 절과 탭 표를 읽으면 / Then 요청 파라미터·응답 필드·단계 정의(24시간 · W1 7~13일 · 14일 습관 3일 · 성숙/부분 규칙)가 적혀 있고 `AdminInsightsRepository.funnelCohorts`와 `admin-insights-funnel.calc.ts`의 판정과 같다

## 처리 기록

- 2026-10-28 발행.
