# 콘텐츠 후기 계약 확정 — 다른 문서 후속 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/subscription-api.md` · `features/common-error-handling.md` · `spec/api/admin-api.md` · `features/content-review.md` 6장 · 머리말 · 루트 `CLAUDE.md` 파일별 인덱스 · `features/backend-monitoring.md`(일일 보고 줄) |
| 요청 파트 | 백엔드 — 박준현 (KAN-279) |
| 발행 날짜 | 2026-10-28 |
| 시작 날짜 | 2026-10-28 |
| 기한 | 2026-10-30 (Low — KAN-279와 같다. 이번 주 금요일) |
| 선행 | 없음 — 계약(`spec/api/content-review-api.md`)과 스키마(`backend/domain.md` 3.5 · 6.8 · 8.5 · 8.6 · 8.7 · 12.3)는 이 문서와 함께 올렸다 |
| 근거 | `features/content-review.md` 2.3 · 4.5 · 4.7 · 4.9 · 6장 · `tickets/backend/pending/content-rating-feedback.md` 요청 1 · 6 |

## 배경

KAN-279로 콘텐츠 후기 · 후기 참여 프로모션의 HTTP 계약을 `spec/api/content-review-api.md`로 확정하고 스키마를 `domain.md`에 올렸다. 계약이 다른 문서의 계약 · 표에 닿는 곳이 있어, 그 문서들은 소유 파트가 통합 때 반영한다.

## 반영할 것

### 1. `spec/api/subscription-api.md`

- **3장 목록 · 1장 범위**: 프로모션 경로 두 개를 "다루지 않는 것"에 참조로 추가 — `GET /users/me/promotions` · `POST /users/me/promotions/:promotionId/redeem`(소유 `content-review-api.md` 4.6 · 4.7). 사용 응답은 4.2와 같은 본문이다.
- **4.8 `plan.grant`**: 지급 출처에 후기 참여 프로모션을 더한다 — `name`은 KR "후기 참여" · GLOBAL "Review"(서버 상수 — 내부 캠페인 행 `REVIEW-REWARD`, `domain.md` 8.5 · 8.6). 초대 코드 지급의 `name`은 종전대로 코드 행 이름이다. "사용자 시장의 언어" 규칙이 `grant.name`에도 이 경우에 한해 적용된다.
- **4.8-1 코드 입력**: 판정 순서의 "없음 · 꺼짐(404)"에 **내부 캠페인 코드 `REVIEW-REWARD`는 `is_active`와 무관하게 없는 코드**를 더한다.

### 2. `features/common-error-handling.md` (FE 소유) — 9장에 새 절 "9.10-4 콘텐츠 후기 · 프로모션"

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `CONTENT_REVIEW_DISABLED` | 409 | false | [후기]를 숨기고 큐의 후기를 버린다 |
| `CONTENT_REVIEW_NOT_PLAYED` | 409 | false | "들어 본 편에만 후기를 남길 수 있어요" · 큐에서 버린다 |
| `PROMOTION_NOT_FOUND` | 404 | false | S12 재조회 |
| `PROMOTION_ALREADY_USED` | 409 | false | S12 · 구독 조회 재조회 — `grant`가 있으면 성공으로 그린다 |
| `PROMOTION_EXPIRED` | 409 | false | "사용 기한이 지난 프로모션이에요" + S12 재조회 |
| `PROMOTION_PRO_SUBSCRIBED` | 409 | false | "Pro 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요" + S12 재조회 |

- 재사용: `INVITE_GRANT_ALREADY_ACTIVE`(9.10-3)가 프로모션 사용(다른 지급 이용 중)에도 온다 — 이 화면에서는 "이용 중인 프로모션이 끝난 뒤 쓸 수 있어요"를 쓴다. `CONTENT_WITHDRAWN`(9.2)이 후기 저장에도 온다(큐에서 버림).
- 오프라인 큐(4.5) 대상에 후기 저장 · 먼저 묻기 닫기 · 그만 보기를 더한다. **프로모션 사용은 큐 대상이 아니다**(지급 시작일이 보낸 날로 정해진다).

### 3. `spec/api/admin-api.md`

- **4.25 신설(참조)**: `GET /admin/content-reviews/summary` · `GET /admin/content-reviews` — 상세는 `content-review-api.md` 4.8 · 4.9(drip-feedback 4.19처럼 데이터 소유 문서가 상세를 가진다). 응답에 `user_id` · 닉네임 · 이메일이 없다는 것을 함께 적는다.
- **4.23 초대 코드**: 목록에 내부 캠페인 행 `REVIEW-REWARD`(이름 "후기 참여", 꺼짐)가 보인다. **이 행의 수정(PATCH)은 409 `CONFLICT`로 거부한다** — 켜면 사용자가 코드로 입력할 수 있게 보이지만 입력 경로가 막고 있어 혼란만 생긴다. 사용 수는 이 행의 `redeemed_count`로 보인다.

### 4. `features/content-review.md`

- 머리말 "통신 계약: `spec/api/`(미작성)" → `spec/api/content-review-api.md`.
- **6장 표 → `domain.md` 절 번호**: 후기 행 → 6.8 `content_reviews` · 프로모션 행 → 8.7 `promotions` · 사용으로 생긴 지급 → 8.6(**① 내부 캠페인 행** `REVIEW-REWARD`를 골랐다 — 8.5) · 먼저 묻는 시트 상태 → 3.5 `content_review_last_prompted_date` · `content_review_muted_until`.
- 미결 "지급 표 연결 방식(6장 ① · ②) — BE 판단" → 해소(①).
- 4.9 "켜짐 여부는 서버가 내려준다(위치는 `spec/api`)" → 위치 확정: 먼저 묻기 판정(`GET /users/me/content-review/prompt`)의 `enabled`(시트 열기 · 프로모션 화면에도 같은 값).
- 4.3 "닫든 보내든 물었다로 친다"의 계약 표현: 시트가 닫힐 때 앱이 `dismiss`(또는 `mute`)를 한 번 보낸다 — 저장은 "물었다"를 적지 않는다.

### 5. 루트 `CLAUDE.md` — 파일별 인덱스 `spec/api/` 줄

"화면에 묶이지 않는 기능 계약" 목록에 한 줄 더한다:

> `content-review-api.md`(콘텐츠 후기 · 후기 참여 프로모션 · 관리자 후기 집계, 2026-10-28 — KAN-279)

### 6. `features/backend-monitoring.md` — 일일 Slack 보고

일일 지표 보고에 한 줄: "후기 {어제 새로 쓴 건수}건 · 평균 {x.x} (누적 {N}건)". **원문 · 편 제목 · 사용자는 싣지 않는다**(`content-review.md` 4.7).

## 완료 조건

- Given 위 1~6 / When 통합에서 반영한다 / Then 각 문서가 `content-review-api.md`와 같은 경로 · 필드 · 에러 코드를 가리키고, `content-review.md` 6장이 `domain.md` 절 번호로 바뀌어 있다
- Given `common-error-handling.md` 9장 / When 신설 코드 6개를 찾는다 / Then HTTP · retryable · 클라이언트 동작이 이 문서 2절과 같다
- Given 루트 `CLAUDE.md` 인덱스 / When `spec/api/` 줄을 읽는다 / Then `content-review-api.md`가 있다

## 처리 기록

- 2026-10-28 발행 — 계약 · 스키마와 함께 올림(KAN-279)
