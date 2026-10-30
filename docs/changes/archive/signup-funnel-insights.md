# 로그 콘솔 "실험 지표" 탭 가입 퍼널·길이별 완청률 — `GET /admin/insights/funnel` · `GET /admin/insights/completion-by-length`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 다음에 `GET /admin/insights/funnel` · `GET /admin/insights/completion-by-length` 신설) · `features/backend-monitoring.md`(탭 표에 "실험 지표" 행) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-28 |
| 반영 날짜 | 2026-10-30 |
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
  - `steps[]`(퍼널 순서): `signups` → `onboarding_completed` → `first_play_24h` → `first_complete` → `w1_return` → `habit_14d` → `paid_ever`. 각 `key` · `mature_cohorts` · `rate`(성숙한 묶음 합산 `Σ이 단계 / Σ앞 단계`) · `rate_of_signups`(같은 성숙 묶음의 `Σ이 단계 / Σ가입`) · `drop`(`1 - rate`, 0 아래는 0). 첫 단계는 `rate`·`rate_of_signups`·`drop` null
  - `largest_drop_step`: `drop`이 가장 큰 단계(같으면 앞 단계), 판정할 단계가 없으면 null
  - `cohorts[]`(최근 가입 주 먼저): `week_start` · `in_progress` · `signups` · `onboarding_completed` · `first_play_24h` · `first_play_ever`(참고 값, 단계 아님) · `first_complete` · `w1_return` · `w1_partial` · `habit_14d` · `paid_ever` · `rates.<단계>` = `{ count, of_prev, of_signups }`
- 단계 정의
  - `first_play_24h`: 가입 시각 + 24시간 안의 재생 행(0초 포함). 묶음 끝 + 24시간이 안 지났으면 null
  - `first_complete`: 완청 신호(`user_signals.action = complete`)가 한 번이라도 — 신호 180일 보존이라 그보다 오래된 완청은 빠질 수 있다
  - `w1_return`: 가입 KST 달력일 + 7~13일에 접속(`user_active_dates` · 남은 `sessions`) 또는 재생 — 코호트 리텐션 W1과 같은 정의. `week_start + 20일 < 오늘(KST)` 전에는 null. `week_start + 7일 < reliable_since`면 `w1_partial`(재생만 잡혀 낮다 — 가장 큰 이탈 판정에서 뺀다)
  - `habit_14d`: 가입 시각 + 14일 안에 들은(`listened_sec > 0`) 서로 다른 `play_date`가 `habit_min_play_days`일 이상. 묶음 끝 + 14일 전에는 null
  - `paid_ever`: 실결제(`subscriptions.environment = production`, `status <> refunded`)가 한 번이라도
- **단계는 깔때기다** — 각 단계는 앞 단계를 모두 통과한 사람만 센다(예: `w1_return` = 온보딩·24시간 첫 재생·첫 완청을 모두 한 사람 중 복귀). 비율은 1을 넘지 않는다. `first_play_ever`만 단계가 아닌 참고 값(가입자 중 재생 전체). 처음(2026-10-28 #2120)에는 단계를 따로 세어 "첫 완청 → W1 75%"가 완청 안 한 복귀자까지 넣은 값이 됐다 — 실제 완청자 중 W1 복귀는 16%(9/57). 같은 날 깔때기로 고쳤다
- 성숙 = `in_progress`가 아니고 이 단계·앞 단계가 둘 다 숫자(W1 partial 은 null 취급)이며 앞 단계가 1명 이상

### 1-2. `admin-api.md` — `GET /admin/insights/completion-by-length`

관리자 전용, 읽기 전용, `Cache-Control: no-store`, 요청 파라미터 없음. 편 단위 집계 — 사용자는 수로만(`user_id`·이름·이메일 없음).

- 대상: **한국 콘텐츠**(`contents.market = kr`, 백엔드 상수 `COMPLETION_LENGTH_CONTENT_MARKET`)·길이가 있는 편. 단위는 (사용자, 편) — 0초가 아닌 재생 행이 있으면 "시작", 첫 재생이 24시간(`COMPLETION_LENGTH_MIN_AGE_HOURS`) 전인 것만
- 완청 = 공용 정의(`domain.md` 6장 — 라이브러리 `completed` · 최대 도달 ≥ 길이 × 90% · 완청 신호)
- 응답: `generated_at` · `content_market` · `min_age_hours` · `overall_rate`(p0) · `prior_strength`(k) · `starters` · `completers`
  - `contents[]`(짧은 편 먼저): `content_id` · `title` · `duration_sec` · `starters` · `completers` · `raw_rate` · `shrunk_rate`
  - `shrunk_rate` = 경험적 베이즈 축소 `(completers + k·p0) / (starters + k)`. k 는 시작자 수로 가중한 편별 비율 분산에서 이항 잡음 몫을 뺀 값으로 적률 추정(2~500)
  - `trend`(편 5개 미만·길이가 다 같음·전원 완청/미완청이면 null): (사용자, 편) 단위 로지스틱 회귀 `logit p = b0 + b1·분`. `slope_step_min`(5) · `odds_ratio_per_step` = `exp(5·b1)` · `odds_ratio_low/high`(95%, 과분산 보정 — 피어슨 χ²/자유도, 1 아래는 1) · `direction`(구간 상한 < 1 → `down`, 하한 > 1 → `up`, 아니면 `flat`) · `dispersion` · `curve[]`(분 단위 `minute`·`rate`·`low`·`high`)

### 2. `backend-monitoring.md` 탭 표

"실험 지표 | `/backend-logs/experiments` | 누구나 보고 싶은 지표를 추가해 보는 비공식 지표 모음(공식 지표는 '서비스 지표'). 지표마다 보는 이유·추가한 사람·정의(+ 관련 실험·메모)를 함께 적는다. 숫자가 붙은 지표: 가입 퍼널(가입 주 코호트, 가장 많이 빠지는 단계 강조 + '다음에 고칠 곳') · 길이별 완청률(한국 콘텐츠 편별 축소 비율 점 + 로지스틱 추세선·95% 띠, 추세 판정 한 줄, 편별 표). 실배포·개발계 토글 · 시장 [통합|국내|글로벌] · 4/8/12주, 열 때 1회 + [새로고침]. 옛 서버(404)는 안내" 추가.

## 완료 조건

- Given 위 두 문서 / When `GET /admin/insights/funnel` 절과 탭 표를 읽으면 / Then 요청 파라미터·응답 필드·단계 정의(24시간 · W1 7~13일 · 14일 습관 3일 · 성숙/부분 규칙)가 적혀 있고 `AdminInsightsRepository.funnelCohorts`와 `admin-insights-funnel.calc.ts`의 판정과 같다
- Given 같은 문서 / When `GET /admin/insights/completion-by-length` 절을 읽으면 / Then 대상(한국 콘텐츠·24시간)·완청 정의·축소식·회귀와 과분산 보정·판정 기준이 적혀 있고 `AdminInsightsRepository.completionByContent`와 `admin-insights-completion.calc.ts`의 계산과 같다

## 처리 기록

- 2026-10-28 발행.
- 2026-10-30 반영 — `spec/api/admin-api.md` 4.22-3 `GET /admin/insights/funnel` · 4.22-4 `GET /admin/insights/completion-by-length` 신설(요청 · 응답 · 단계 정의 · 깔때기 · 성숙 규칙 · 축소식 · 회귀) + 3장 목록 행, `features/backend-monitoring.md` 4장 탭 표 "실험 지표" 행(패널 ① · ②, 뒤에 생긴 ③ · ④도 같은 행에).
