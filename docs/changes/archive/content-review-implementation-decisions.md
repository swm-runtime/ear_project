# 콘텐츠 후기 구현 — 계약이 정하지 않은 것의 서버 결정 (BE · KAN-279)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/content-review-api.md` (4.1~4.9) · `features/content-review.md` 4.3 · `backend/architecture.md` 4.5 |
| 요청 파트 | 백엔드 — 박준현 (KAN-279) |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-30 (Low — KAN-279와 같다. 이번 주 금요일) |
| 선행 | 없음 — 서버 구현 PR(`feat(be)/content-review-api`)과 함께 올린다 |
| 근거 | `tickets/backend/pending/content-rating-feedback.md` · `changes/pending/content-review-contract.md` |

## 배경

KAN-279 서버 구현 중 계약(`content-review-api.md`)이 값을 정하지 않은 곳이 있어 **보수적인 쪽**으로 정해 구현했다. 계약 소유 파트가 통합 때 확인하고, 맞으면 계약에 적고 아니면 서버를 고친다(이 문서에 적힌 대로 동작한다).

## 반영할 것 — 1단계(후기 API)

1. **4.1 시트 열기의 판정 순서** — 없는 편 · 다른 시장 편(404)을 **스위치보다 먼저** 본다. 스위치가 꺼져 있어도 이미 쓴 후기(`review`)는 싣는다(`reason: disabled`).
2. **4.3 스위치 꺼짐의 `muted_until`** — `null`로 준다(판정 1이 먼저라 그만 보기 상태를 읽지 않는다).
3. **4.3 "끝까지 들은 시각"** — 라이브러리 행의 `completed_at`(지운 행 포함, 여러 행이면 가장 늦은 값), 없으면 그 편 완청 신호(`user_signals.action = complete`)의 **가장 늦은** 시각. 위치만 90%를 넘고 완청 신호가 없는 편은 시각이 없어 묻지 않는다(완청 신호는 완청 때 함께 남으므로 실제로는 드물다).
4. **4.4 · 4.5 스위치 꺼짐의 닫기 · 그만 보기** — 거부하지 않고 그대로 적는다(204 · 200). 상태만 바꾸는 무해한 호출이라 오프라인 큐의 재전송을 실패로 만들지 않는다.
5. **4.8 평균 별점** — 소수 둘째 자리 반올림(`3.8`, `4.33`). 전체 평균(`totals.average_stars`)은 편 평균의 평균이 아니라 후기 단위 가중 평균이다.
6. **4.9 커서** — 발급 때의 필터(`content_id` · `market` · `has_text`)와 다르면 400 `VALIDATION_FAILED`. 시각은 마이크로초까지 담는다.
7. **4.2 동시 저장** — 저장 트랜잭션은 사용자 행을 먼저 잠근다(같은 계정의 두 기기 저장을 직렬로). 보상 단계의 "서로 다른 편 3개" 셈이 둘 다 2로 보고 지나치지 않게 한다.
8. **`market`(6.8)** — access token 의 `market`으로 적는다(계약 2장 "시장은 token 의 market" — 편 시장 판정과 같은 값).

## 반영할 것 — 2단계(보상)

9. **후기 저장(4.2)은 `billing` 모듈이 받는다**(`ContentReviewSaveController`) — 응답의 `issued_promotion`(쓸 수 있는지 · 사유 · 요금제 이름 · 체험 겹침)이 구독 · 지급 상태로 조립되는데, `content-review`는 `subscription`을 의존하지 않는다(`domain.md` 2장). 저장 판정 · 발급은 `ContentReviewService`가 그대로 한다. 시트 열기(GET 같은 경로) · 먼저 묻기 · 관리자는 `content-review`에 남는다. → `backend/architecture.md` 4.5 의존 표에 **`Billing → ContentReview`**(+ `ContentReview`: Content · Library · Playback · User 행)를 더한다.
10. **`promotions` 엔티티가 지급 표 엔티티(`InviteCodeRedemption`)를 FK 선언용으로만 참조한다** — 스키마 비교(`migration:generate`)가 FK · 부분 유니크를 지우지 않게. 그 표를 읽고 쓰는 일은 `billing`이 `InviteCodeService`로 한다.
11. **`REVIEW-REWARD` 행의 관리자 수정(PATCH)은 409 `CONFLICT`**(공용 코드 — 신설하지 않음). 코드 입력은 `is_active`와 무관하게 404 `INVITE_CODE_NOT_FOUND`.
12. **프로모션 `name` · `plan_name` · `plan.grant.name`의 언어는 `users.market`**(구독 조회의 요금제 이름 규칙과 같은 값). 후기 시장 판정만 token 의 `market`이다.
13. **보상 셈의 공백** — JS `\s`(유니코드 공백 전부 — NBSP · 전각 공백 포함)를 뺀 코드 포인트 수. DB 로케일에 맡기지 않는다.
14. **`reward_progress`는 세 곳(시트 · 저장 · 먼저 묻기 · S12)이 한 함수**다 — 후기 스위치 · 발급 스위치가 모두 켜져 있고 받은 적 없을 때만 값. 후기 스위치가 꺼지면 S12 에서도 `null`.
15. **사용의 "쓸 때 구독 중"(`subscribed_at_start`)** — `SubscriptionService.findEntitled`(해지 예약 · 유예 포함)로 본다(초대 코드 입력과 같은 술어). Pro 구독 중 판정도 같은 행의 티어다(다운그레이드 예약은 지금 Pro 라 거부).
16. **관리자 프로모션 건수는 필터와 무관한 전체**(계약 그대로), 탈퇴로 지워진 행은 세지 않는다.
17. **마이그레이션 `down`** — `REVIEW-REWARD`를 가리키는 지급이 있으면 코드 행을 남긴다(지급 기록을 지우면서 되돌리지 않는다).

## 완료 조건

- Given 위 1~17 / When 통합에서 계약을 검토한다 / Then 각 항목이 `content-review-api.md`에 적혀 있거나, 다르게 정했으면 서버 수정 티켓이 `tickets/backend/pending/`에 있다

## 처리 기록

- 2026-10-29 발행 — 1단계(후기 API) 구현과 함께(KAN-279, PR #2141)
- 2026-10-29 2단계(보상) 결정 9~17 추가
- 2026-10-30 반영 — 1~17 전부 서버 구현대로 적었다(다르게 정한 항목 없음 — 서버 수정 티켓 없음). `spec/api/content-review-api.md` 머리말 · 2장 시장 행(후기 `market` = token · 프로모션 이름 언어 = `users.market` — 8 · 12) · 4.1(404가 스위치보다 먼저 — 1) · 4.2(동시 저장 사용자 행 잠금 · 공백 셈 `\s` · `billing` 모듈이 받음 — 7 · 13 · 9) · 4.3 판정 1 · 4(`muted_until` null · 끝까지 들은 시각 — 2 · 3) · 4.4(스위치 꺼짐에도 204/200 — 4) · 4.6 `reward_progress` 한 함수(14) · 4.7 `findEntitled`(15) · 4.8 평균 반올림 · 가중 평균(5) · 4.9 커서 필터 불일치 400 · 마이크로초(6) · 4.8 건수는 기존 문구 그대로(16). `features/content-review.md` 4.3(끝까지 들은 시각). `backend/architecture.md` 4.5 의존 표에 `ContentReview`(Content · Library · Playback · User — `promotions`의 FK 선언용 엔티티 참조 10) · `Billing`(Subscription · User · Alert · **ContentReview**) 행 신설. `backend/domain.md` 8.5 `REVIEW-REWARD` PATCH 409 `CONFLICT`(11) · 마이그레이션 `down`(17). 코드 입력 404(11)는 `subscription-api.md` 4.8-1(`content-review-contract.md`와 같이).
