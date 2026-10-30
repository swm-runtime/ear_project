# 시리즈 편별 완청·이탈 조회 — `GET /admin/insights/series-episodes`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 인사이트 계열 다음에 `GET /admin/insights/series-episodes` 절 신설) · `features/backend-monitoring.md`(조회 대상 목록에 시리즈 편별 완청·이탈 추가) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/exp-series-completion-insight`(KAN-293) |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

단기 실험 ② "IT 특화"의 근거는 CS 시리즈 완청률이다. 편별 완청률(`/admin/insights/completion-by-length`)은 편을 길이로만 묶어 "몇 편에서 빠지는가"가 보이지 않았다. 시리즈·편 번호로 묶은 읽기 전용 조회를 더했다(KAN-293). 콘솔 화면은 범위 밖이다.

## 고칠 내용

### 1. `admin-api.md` — `GET /admin/insights/series-episodes?market=`

관리자 전용(`JwtAuthGuard` + `AdminRoleGuard`), 읽기 전용, `Cache-Control: no-store`. 편 단위 집계 — 사용자는 수로만(`user_id`·이름·이메일 없음).

- 요청: `market` `kr`|`global`|없음(전부). **콘텐츠 시장**(`contents.market`)으로 거른다 — 시리즈는 시장 칸이 없고 편의 시장을 따른다. 모르는 값은 400
- 대상: `contents.series_id`·`episode_no`가 있는 콘텐츠만 — **단일 콘텐츠는 나오지 않는다**. 단위는 (사용자, 시리즈, 편 번호). 같은 편 번호에 콘텐츠 행이 여럿이면(철회 뒤 다시 올림) 사람을 합쳐 센다. 대표 콘텐츠(`content_id`·`title`·`duration_sec`·`status`)는 발행 중인 행, 없으면 가장 최근 행
- 시작 = 0초가 아닌 재생 행이 있고 첫 재생이 24시간(`SERIES_EPISODES_MIN_AGE_HOURS` = `COMPLETION_LENGTH_MIN_AGE_HOURS`) 전인 (사용자, 편) — 길이별 완청률과 같다
- 완청 = 공용 정의(`domain.md` 6장 — 라이브러리 `completed` · 최대 도달 ≥ 길이 × 90% · 완청 신호)
- 다음 편 = 그 시리즈에 있는 편 번호 중 이 편 다음으로 큰 것(번호가 비면 건너뛴다). 다음 편 **시작**은 시점을 따지지 않는다(0초가 아닌 재생 한 번이면 진행)
- 응답: `generated_at` · `market`(요청값, 없으면 null) · `min_age_hours`
  - `series[]`(1화 시작자 많은 순, 같으면 제목 순): `series_id` · `title` · `market` · `total_episodes`(`series.total_episodes`) · `first_episode_starters`
  - `series[].episodes[]`(편 번호 순, 시작자 0인 편도 포함): `episode_no` · `content_id` · `title` · `duration_sec` · `status` · `next_episode_no`(마지막 편 null) · `starters` · `completers` · `completion_rate` · `next_started_of_starters` · `next_started_of_completers` · `next_rate_of_starters` · `next_rate_of_completers`
  - 비율은 분모가 0이면 null, 마지막 편의 진행률은 null

### 2. `backend-monitoring.md`

인사이트 조회 목록에 "시리즈 편별 완청·이탈(`GET /admin/insights/series-episodes`, KAN-293) — 시리즈 편마다 시작·완청·다음 편 진행. 콘솔 화면 없음(필요하면 콘솔 작업)"을 추가한다.

## 완료 조건

- Given 위 두 문서 / When `GET /admin/insights/series-episodes` 절을 읽으면 / Then 대상(시리즈 편만 · 콘텐츠 시장)·시작(24시간)·완청 공용 정의·다음 편 정의·응답 필드가 적혀 있고 `AdminInsightsRepository.seriesEpisodes`와 `admin-insights-series.calc.ts`의 계산과 같다
- Given `backend-monitoring.md` / When 인사이트 조회 목록을 보면 / Then 시리즈 편별 완청·이탈 행이 있다

## 처리 기록

- 2026-10-29 발행.
- 2026-10-30 반영 — `spec/api/admin-api.md` 4.22-5 `GET /admin/insights/series-episodes` 신설(대상 · 시작 24시간 · 완청 공용 정의 · 다음 편 · 응답) + 3장 목록 행, `features/backend-monitoring.md` 4장 표 아래 "콘솔 화면이 없는 인사이트 조회" 줄. 컨트롤러 경로와 대조함.
