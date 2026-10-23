# admin-api — 서비스 지표 "추천 검증" 엔드포인트 2종(`/admin/insights/recommendations/*`) 기재 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 3장 엔드포인트 표 · 4.22 뒤 새 절(4.22-1) · `features/backend-monitoring.md` 4장(서비스 지표 탭 — 추천 검증 보기 한 줄) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-22 |
| 기한 | 다음 문서 통합 때(코드와 같은 PR 로 dev 에 들어간다 — 문서가 늦으면 감사 로그 액션·응답 형상이 계약 없이 남는다) |
| 선행 | 없음 |
| 관련 | 브랜치 `feat(be)/insights-recommendation-inspector` · 콘솔 `feat(ai)/insights-recommendation-inspector`(`pipeline/apps/web` 서비스 지표 화면의 "추천 검증" 보기) |

## 배경

서비스 지표 탭은 전체 집계만 보여 "이 사용자에게 추천이 왜 이것을 보냈나"를 확인할 수 없었다. 기존 편성 미리보기(4.16 `GET /admin/drip/preview`)는 **이메일로 사용자를 찾고 응답에 이메일·닉네임을 싣는다** — 실사용자를 골라 보는 화면으로 쓰면 이름·이메일이 세션·화면에 남는다(루트 `CLAUDE.md` 공통 원칙, 개인정보 보호법 18조·59조).

그래서 서비스 지표 아래에 **가명(`user_id`)으로만** 사용자를 고르는 추천 검증 API 를 따로 열었다. 계산은 편성 미리보기와 **같은 저장 없는 경로**(`DripPreviewService.explain` → `DripBatchOrchestrator.planForUser`, `READ_ONLY_PLAN_OPTIONS`)이고, 사용자 행은 편성 계산이 읽는 열(`id`·`tier`·`market`·`job_category`·`years_of_experience`)과 화면 프로필 열만 골라 읽는다. 처리 근거는 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"이다.

- **점수 이력은 DB 에 없다** — `domain.md` 6.1 `library_items` 는 `algorithm_version` 만 남기고 점수 칸이 없으며, 7장 편성 표(`drip_excluded_contents`·`user_preference_vectors`·`drip_batch_runs`·`first_drip_jobs`)에도 없다. 배치가 뽑은 편의 점수는 구조화 로그 `drip pick scored`(CloudWatch, 보존 기간 한정)에만 남는다. 그래서 `explanation`은 **현재 시점 재계산**이고, 응답이 그 문구를 함께 싣는다.
- **감사 로그 액션 목록은 문서에 따로 없다**(`domain.md` 10.3 은 표 정의만, `admin-api.md`는 절마다 인라인). 새 액션 `insights.recommendation_view`는 새 절 안에 적는다.

## 수정 내용

1. **`admin-api.md` 3장 엔드포인트 표** — `/admin/insights/summary` 행 아래에 두 줄을 더한다.
   > | GET | `/admin/insights/recommendations/users` | 추천 검증 후보 사용자 — `user_id`와 행동 수치만, 청취 순·최근 순, 읽기 전용 (4.22-1, 2026-10-22) |
   > | GET | `/admin/insights/recommendations/users/:userId` | 추천 검증 상세 — 프로필·관심 주제·청취·편성 이력·현재 시점 추천 재계산, 읽기 전용 · 감사 로그 (4.22-1) |
2. **`admin-api.md` 4.22 뒤에 4.22-1 절을 더한다.**

   > ### 4.22-1 `/admin/insights/recommendations/*` — 추천 검증 (읽기 전용 · 2026-10-22)
   >
   > 로그 콘솔 서비스 지표 화면의 "추천 검증" 보기가 읽는다. 인증·인가는 4.22 와 같다(`JwtAuthGuard` + `AdminRoleGuard` — 401/403). 응답은 `Cache-Control: no-store`.
   >
   > **개인정보** — 사용자는 `user_id`로만 가리킨다. **이메일·닉네임·제공자 ID·프로필 사진·직함은 서버가 조회하지도 싣지도 않는다**(4.16 편성 미리보기와 다른 점). 콘솔은 `user_id` 앞 8자리로만 보인다. 처리 근거는 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"이다. 탈퇴 사용자(행 없음 · `status ≠ active`)는 목록에 없고 상세는 404 다.
   >
   > **읽기 전용** — 사용자 상태(`user_interests`·`user_preference_vectors`·`library_items`·`drip_*`·`user_settings` …)를 바꾸지 않는다. 계산은 4.16 과 같은 저장 없는 경로다. 유일한 쓰기는 상세 열람 1회마다 남기는 **감사 로그 `insights.recommendation_view`**(actor = 관리자 `user_id`, target = `user:<user_id>`, before/after 없음)다. 감사 로그를 남기지 못하면 데이터를 돌려주지 않는다. 404 는 남기지 않는다.
   >
   > **`GET /admin/insights/recommendations/users?sort=listen|recent&limit=`**
   >
   > | 쿼리 | 설명 |
   > |---|---|
   > | `sort` | `listen`(기본) — 최근 30일 청취 시간 순, 청취가 있는 사용자만 · `recent` — 마지막 재생(없으면 가입) 최신 순 |
   > | `limit` | 1~50, 기본 20 |
   >
   > ```json
   > { "sort": "listen", "since": "…(now-30일)", "generated_at": "…",
   >   "users": [ { "user_id": "uuid", "tier": "light", "signed_up_at": "…", "market": "kr",
   >                "interest_count": 3, "plays_30d": 12, "listen_sec_30d": 5400, "completes_30d": 4, "last_played_at": "…" | null } ] }
   > ```
   >
   > **`GET /admin/insights/recommendations/users/:userId`** — 400(uuid 아님) · 404 `NOT_FOUND`(없음·탈퇴)
   >
   > | 필드 | 설명 |
   > |---|---|
   > | `user_id` · `generated_at` | |
   > | `profile` | `tier` `market` `signed_up_at` `onboarding_completed` `onboarding_step` `onboarding_completed_at` `job_category` `years_of_experience` `career_used`(커리어 적합도를 편성이 쓰는가 — KR 만) `is_auto_expand_enabled`(설정 행 없으면 true) |
   > | `interests[]` | `topic_id` `name` `source`(`onboarding`·`manual`·`auto_expand`) `is_active` `is_user_removed` `is_topic_visible` `added_at`(자동 슬롯 활성 행은 `updated_at`, 그 밖은 `created_at` — `domain.md` 4.2) `deactivated_at`. 비활성·해제 행 포함 |
   > | `listening` | `since`(now-30일) · `items[]`(최근 활동 순 최대 50): `content_id` `title` `topics[]` `duration_sec` `first_played_at` `last_played_at` `play_days`(들은 서비스 날짜 수) `listen_sec` `complete_count` `last_completed_at` `saved_at` `max_reached_sec` `listened_ratio`(도달 위치/길이, 0~1 · 진행 행 없으면 null) |
   > | `deliveries` | `since`(오늘 포함 최근 14 서비스 날짜의 시작) · `items[]`(최신 적립 순 최대 100, `library_items.source in drip,discovery` 삭제분 포함): `service_date` `added_at` `content_id` `title` `topics[]` `source` `algorithm_version` `status` `deleted` `played_after`(적립 뒤 재생 행) `completed_after`(완청 상태 또는 적립 뒤 완청 신호) `feedback_stars`(`drip_feedbacks`, 없으면 null) |
   > | `explanation` | **현재 시점 재계산** — `notice`("현재 시점 재계산 — 실제 과거 편성 당시 점수와 다를 수 있다") `computed_at` `service_date` `skip_reason` `unfinished_count` `unfinished_limit` `drip_count` `discovery_count` · `weights`(4.16 과 같음) · `preference`(4.16 의 값 + `signal_total` `signal_actions{행동:건수}` `signal_counts_by_topic[]{topic_id,name,counts,total}` — 취향 입력 신호를 주제 × 행동으로 센 것) · `auto_expand`(4.16 과 같음 — `feature_off` 등) · `exclusion_sources{library_contents, permanently_excluded}`(후보 SQL 이 빼는 사용자 이력의 원천 행 수) · `regular`·`discovery`(아래) · `discovery_error` · `today_placed[]` |
   >
   > `regular` / `discovery`(편수 0 이면 null): `pool_size` `sql_filters[]`(후보 SQL 조건 설명 문구) `excluded_counts{사유:건수}`(정규 `episode_order` · 탐험 `user_removed_topic`·`below_quality_floor`) `candidate_count` `top[]`(점수 순 상위 20 — 4.16 `candidates[]` 항목 + `rank` `would_place`) `picks[]`(최종 선정 전부 — `pick_order` `content_id` `title` `score` `rank` `is_series_continuation` `is_outside_interests`; 다양성 선정이라 상위 20 밖에서 뽑힐 수 있다). 정규만 `series{gated_out[], continuation_count}`, 탐험만 `quality_floor` `typical_complete_rate`.
   >
   > 점수는 저장되지 않는다(`domain.md` 6.1·7장) — 배치가 뽑은 편의 점수는 구조화 로그 `drip pick scored`에만 있다.
3. **`features/backend-monitoring.md` 4장** — 서비스 지표 탭 설명에 한 줄: "추천 검증 보기 — 가명 사용자(`user_id` 앞 8자리)를 골라 청취·편성 이력과 현재 시점 추천 재계산을 본다(admin-api 4.22-1). 상세 열람은 감사 로그를 남긴다."

## 완료 조건 (Given/When/Then)

- Given `admin-api.md` 3장 / When 엔드포인트 표를 본다 / Then `/admin/insights/recommendations/users`·`/users/:userId` 두 줄이 4.22-1 을 가리킨다
- Given `admin-api.md` 4.22-1 / When 추천 검증 계약을 본다 / Then 목록·상세의 쿼리·필드·오류(400·401·403·404)와 "이메일·닉네임을 조회하지도 싣지도 않는다", "현재 시점 재계산" 문구, 감사 로그 `insights.recommendation_view`(actor·target 형식) 가 적혀 있다
- Given 코드 `backend/src/modules/recommend-inspector/` / When 응답 DTO 와 문서를 대조한다 / Then 필드 이름과 상한(목록 50 · 청취 50 · 편성 100 · 후보 표 20 · 창 30일/14 서비스 날짜)이 같다

## 처리 기록

- 2026-10-22 발행(BE — 코드와 같은 PR `feat(be): add insights recommendation inspector`).
- **2026-10-23 반영**(통합 브랜치 `docs(be)/apply-pending-changes`) — 대상 문서 전부 반영, 코드와 대조. 반영 날짜 2026-10-23.
