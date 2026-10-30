# 짧은 판·도입부 실험 지표 조회 — `GET /admin/insights/short-variant`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 인사이트 계열 다음에 `GET /admin/insights/short-variant` 절 신설) · `features/backend-monitoring.md`(조회 대상 목록·"실험 지표" 탭 패널에 추가) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/exp-short-variant-metrics`(KAN-298 · KAN-296) |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

단기 실험 ④ 짧은 판 코호트(KAN-298 — 파이프라인 KAN-296)는 짧은 판(5~12분 · 새 도입부)을 경계 뒤 가입자에게만 노출한다. 실험을 읽으려면 **기존 판 vs 짧은 판 완청률**과 **기존 도입부 vs 바뀐 도입부의 10초·30초·1분 이탈률**이 필요해 읽기 전용 조회와 로그 콘솔 "실험 지표" 탭 패널을 더했다. 실험 기간의 계약 원본은 `spec/api/experiments-api.md` 4.5다(이번에 직접 썼다). 통합 때 아래로 옮긴다.

## 고칠 내용

### 1. `admin-api.md` — `GET /admin/insights/short-variant?market=`

`experiments-api.md` 4.5를 그대로 옮긴다. 요지:

- 관리자 전용 · 읽기 전용 · `Cache-Control: no-store` · 집계만(`user_id`·이름·이메일 없음). `market` `kr`|`global`|없음 — 콘텐츠 시장으로 거른다, 모르는 값 400
- 단위 (사용자, 편). 시작 = 0초 아닌 재생 · 첫 재생 24시간 전. 완청 = 공용 정의. 초반 이탈 = 그 편 청취 합 10·30·60초 이하
- 첫 편 = 사용자의 처음 0초 아닌 재생 편 — 모든 묶음에 `all`과 `excluding_first`
- 가입 코호트 = `content-cohort.policy.ts` SQL판. `standard`는 경계 직전 같은 길이 창 가입자만, 두 코호트 모두 가입 뒤 그 길이 안 시작 편만. 경계가 비면 `cohort_since`·`cohort_window_hours`·`by_cohort` null
- 응답: `generated_at` · `market` · `min_age_hours` · `min_sample`(20) · `drop_thresholds_sec` · `cohort_since` · `cohort_window_hours` · `by_cohort` · `by_length_profile` · `by_intro_version`(null = 기존 도입부, 먼저) · `pairs[]`(`short`·`original` 각 `content_id`·`title`·`duration_sec`·`intro_version`·`all`·`excluding_first`)
- 묶음 지표 `{ starters, completers, completion_rate, drop_10s, drop_30s, drop_60s, rate_10s, rate_30s, rate_60s }` — 시작자 0이면 비율 null

### 2. `backend-monitoring.md`

"실험 지표" 탭 패널 목록에 "짧은 판·도입부 실험 — 완청률·초반 이탈 비교(`GET /admin/insights/short-variant`, KAN-298 · KAN-296) — 가입 코호트·길이 프로필·도입부 버전·짝 비교 표, 첫 편 제외 전환, 경계 미설정·표본 작음(시작자 20명 미만) 표시"를 추가한다.

## 완료 조건

- Given `admin-api.md` / When `GET /admin/insights/short-variant` 절을 읽으면 / Then 대상(콘텐츠 시장)·시작(24시간)·완청 공용 정의·초반 이탈(10·30·60초)·첫 편 제외·가입 코호트(같은 길이 창)·경계 미설정·응답 필드가 적혀 있고 `AdminInsightsRepository.shortVariantRows`·`shortVariantPairs`와 `admin-insights-short-variant.calc.ts`의 계산과 같다
- Given `backend-monitoring.md` / When "실험 지표" 탭 패널 목록을 보면 / Then 짧은 판·도입부 실험 패널 행이 있다
- Given 통합이 끝났을 때 / When `experiments-api.md` 4.5를 보면 / Then `admin-api.md`로 옮겼다는 안내만 남아 있다

## 처리 기록

- 2026-10-29 발행.
- 2026-10-30 반영 — `spec/api/admin-api.md` 4.22-6 `GET /admin/insights/short-variant` 신설(`experiments-api.md` 4.5 그대로) + 3장 목록 행, `features/backend-monitoring.md` 4장 "실험 지표" 탭 패널 ③. `experiments-api.md` 4.5는 옮긴 곳 안내만 남겼다.
