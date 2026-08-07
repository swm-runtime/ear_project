# [BE] 인기 콘텐츠 구간 선택 — `GET /explore/popular` 미구현

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/explore/` (Controller · Orchestrator · DTO · 커서) · `backend/src/modules/content/` (Repository · Service · types) · `backend/src/common/utils/service-date.util.ts` |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-07 탐색 통합 (`integration/explore`) — 인기 구간 선택 문서 반영 중 |
| 근거 문서 | `spec/api/explore-api.md` 3장·4.1·**4.2-1** · `features/explore.md` **4.1-1** · `spec/uiux/explore-uiux.md` **4.10** |
| 심각도 | **중** — 기존 동작이 깨지지는 않는다. 다만 확정된 화면 규칙이 서버에 없어 FE가 구현을 시작할 수 없다 |
| 상태 | 대기 |

> **짝 티켓** — `tickets/frontend/pending/explore-popular-period.md`. **서버가 먼저 나가야 FE가 mock을 벗을 수 있다.**

## 증상

인기 콘텐츠의 집계 구간을 사용자가 고르는 규칙이 2026-08-07에 확정돼 세 문서에 반영됐는데, **서버는 구간을 고정으로 하나만 쓴다.**

| 계약 | 현재 코드 |
|---|---|
| `GET /explore/popular?period=week\|month\|all` | **엔드포인트가 없다** |
| 피드의 인기 섹션은 **기본 구간(월간)** | `toPreviousFinalWeekStart` — **직전 확정 주 고정** |
| 피드 응답 `sections[].period` | **필드가 없다** |

토글을 누를 곳도, 지금 어느 구간인지 알 방법도 서버가 주지 않는다.

## 재현 절차

1. `backend`를 띄우고 온보딩까지 마친 계정을 준비한다.
2. `GET /api/v1/explore/popular?period=month` 호출 → **404**(라우트 없음).
3. `GET /api/v1/explore/feed` 응답의 `popular` 섹션을 본다 → **`period` 필드가 없다.**

## 원인

탐색 백엔드 구현(`feat(be)/explore`, PR #17) 시점에는 `features/explore.md` 4.1이 구간을 `직전 확정 구간(지난주·지난달)`으로만 병기해 두어, **서버가 주간을 쓸지 월간을 쓸지조차 정해져 있지 않았다.** 구현은 주간을 골랐고 그 판단을 `changes/pending`에 올렸다. 통합 과정에서 **사용자가 세 구간을 고른다**로 확정되면서 계약이 넓어졌고, 코드만 남았다.

## 고쳐야 할 것

### 1. 구간 계산 — `common/utils/service-date.util.ts`

`toPreviousFinalWeekStart` · `toPreviousFinalMonthStart`가 이미 있다. **`all` 구간의 `period_start`(`1970-01-01`)는 `content.enum.ts`의 `ALL_TIME_PERIOD_START` 상수를 그대로 쓴다** — 경계 계산이 아니라 고정값이라 이 유틸에 넣지 않는다.

- 04시 경계는 두 함수가 이미 지킨다(`domain.md` 1.2). 새로 만들 계산이 없다.

### 2. 구간별 조회 — `content` 모듈

`ContentRepository.findPopular(periodStart, limit, now)`가 **주간 전용으로 하드코딩**되어 있다(`period_type = 'week' AND is_final = true`). `period_type`을 인자로 받도록 넓히고 커서를 붙인다.

| 구간 | `period_type` | `period_start` | `is_final` |
|---|---|---|---|
| 주간 | `week` | 직전 확정 주 월요일 | **`true`만** |
| 월간 | `month` | 직전 확정 월 1일 | **`true`만** |
| 전체 | `all` | `1970-01-01` 고정 | **조건을 걸지 않는다** |

- **`all`에 `is_final`을 걸면 아무것도 나오지 않는다.** 전체 구간은 끝나는 시점이 없어 확정 개념 자체가 없다(`explore-api.md` 4.2-1). `findCandidates`가 `all` 구간을 조인할 때 이미 그렇게 하고 있다 — 같은 방식이다.
- **커서는 `findExplorePage`와 같은 keyset 구조를 쓴다.** 정렬 키가 `(구간 재생 수, 완청 수, published_at, id)`로 하나 늘어나므로 커서 payload도 그만큼 담는다. **전부 내림차순으로 맞춘다** — 방향이 섞이면 행 비교로 표현할 수 없다.
- **`LEFT JOIN`을 유지한다.** 확정 구간이 없어도 목록이 비지 않아야 한다(2026-08-06 합의를 세 구간에 적용 — `explore.md` 4.1-1).

### 3. 엔드포인트 — `explore` 모듈

`GET /explore/popular` (`ExploreController`).

- `period`는 **선택**이며 미전송이면 서버가 `month`로 해석한다. **기본값을 DTO가 아니라 Orchestrator에서 정한다**(`convention.md` 3.3 — 미전송과 기본값 적용을 구분해야 하는 쪽은 호출부다).
- 응답에 **`period`를 되돌린다.** 클라이언트가 토글의 선택 상태를 그리는 근거다.
- 잔여 재생 표시값 세 필드를 함께 싣는다 — `PlaybackService.buildQuotaForUser`를 그대로 호출한다.
- 행 조립은 `ExploreOrchestrator`의 기존 `decorate`를 재사용한다. **행 모양이 피드·필터 목록과 달라지면 안 된다.**
- 커서 지문에 **`period`를 포함**한다. 구간이 바뀐 커서를 이어 쓰면 두 구간이 섞인 목록이 된다 → `EXPLORE_CURSOR_INVALID`(400).

### 4. 피드의 인기 섹션 — 기본 구간 + `period` 노출

- `ExploreOrchestrator.getFeed`가 인기 섹션을 만들 때 **월간**을 쓴다(현재 주간).
- 섹션 뷰에 `period`를 추가하고 DTO에 실어 보낸다. **`popular` 섹션에만 값이 있고 나머지는 `null`이다** — `topic`이 `topic_group`에만 있는 것과 같은 형태다.

### 5. 테스트

- 단위: 구간별 `period_type`·`period_start` 선택, **`all`에 `is_final`을 걸지 않는 것**, 미전송 시 `month` 적용, 커서 지문에 `period` 포함·불일치 시 거절
- `service-date.util.spec.ts`는 그대로 둔다 — 새 계산이 없다
- 피드 테스트: 인기 섹션의 `period`가 `month`로 내려가는지

## 함께 확인할 것

- **인덱스** — `idx_content_stats_period_type_period_start_play_count`(`domain.md` 5.4)가 `(period_type, period_start, play_count DESC)`라 구간별 상위 조회에 그대로 맞는다. **새 인덱스가 필요 없다.**
- **온보딩 추천과 기본 구간이 같아졌다.** 둘 다 직전 확정 월을 쓰므로(`onboarding.md` 4 [3]) 두 화면의 "인기"가 같은 목록을 보게 된다. 의도된 결과다(`explore.md` 4.1-1).
- **`content_stats.replay_count`가 Entity에 없다**(`domain.md` 5.4에는 있다). 이 티켓의 정렬은 `play_count` · `complete_count`만 쓰므로 영향이 없지만, 집계 배치를 만들 때 함께 봐야 한다.

## 완료 조건

- Given 서버가 기동한다 / When `GET /api/v1/explore/popular?period=month`를 호출한다 / Then 200과 함께 직전 확정 월 집계 기준 목록 + `period: "month"` + 잔여 재생 표시값 3필드가 내려온다
- Given `period`를 보내지 않는다 / When 응답을 본다 / Then 월간 목록이 내려오고 `period`가 `"month"`다
- Given `period=all`로 호출한다 / When 응답을 본다 / Then **빈 목록이 아니다** — `is_final` 조건을 걸지 않으므로 누적 집계 상위가 내려온다
- Given `period=week`로 첫 페이지를 받았다 / When 그 `next_cursor`를 `period=month`와 함께 보낸다 / Then **400 `EXPLORE_CURSOR_INVALID`** 다
- Given `period=quarter`처럼 enum 밖 값을 보낸다 / When 응답을 본다 / Then 400 `VALIDATION_FAILED`다
- Given `GET /explore/feed`를 호출한다 / When `popular` 섹션을 본다 / Then `period`가 `"month"`이고, 다른 섹션의 `period`는 `null`이다
- Given 인기 목록의 행 하나를 본다 / When 피드·주제 필터 목록의 행과 비교한다 / Then `content` · `library` · `is_counted_today` 구조가 완전히 같다
- Given 확정 구간 집계가 하나도 없는 상태다 / When 세 구간을 각각 조회한다 / Then 어느 구간도 빈 목록이 아니며, 발행 콘텐츠가 신선도 순으로 내려온다
