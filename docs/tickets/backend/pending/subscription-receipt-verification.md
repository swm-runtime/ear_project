# [BE] 구독 영수증 검증이 없다 — 결제해도 `users.tier`가 바뀌지 않는다

| 항목 | 값 |
|---|---|
| 대상 | `src/modules/subscription/` 전체 · `users.tier` 갱신 경로 · `purchase_intents` · `store_notification_logs` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 2026-09-08 백엔드 전수 점검 — "미구현 5건" 중 유일하게 **지금 착수할 수 없는** 건이라 분리했다 |
| 근거 문서 | `features/subscription.md` 4장 · `features/paywall.md` · `backend/domain.md` 1.3 · 8.3 · 8.4 |
| 심각도 | **중** — 보안 문제는 아니다. **유료 기능을 켤 수 없는 상태**다 |
| 상태 | 대기 — **외부 준비물이 있어 코드만으로 끝나지 않는다** |

## 현재 상태

`subscription` 모듈은 **읽기 전용**이다. `@Controller`가 없고, 스토어 클라이언트도 S2S 수신 경로도 없다.

`users.tier`에 **쓰는 코드는 가입 시 `LIGHT` 하나뿐**이다. `subscriptions`에 행을 만드는 코드도 없다.

`subscription.md`는 이렇게 정한다.

> 결제 성공 → 클라이언트가 영수증/구매 토큰을 서버로 전송 / **서버가 스토어 API로 영수증 검증** — 클라이언트 응답을 신뢰하지 않는다 / 검증 성공 → `Subscription` 생성/갱신, `User.tier` 즉시 반영

## 무엇이 문제인가

**좋은 소식** — 클라이언트가 티어를 위조할 수 없다. 쓰는 경로가 아예 없어 권한 상승 여지가 없다.

**나쁜 소식** — `users.tier`가 영원히 `light`이므로:

- `play-policy.service.ts`가 **결제한 사용자도 무료 한도로 판정**한다
- `plan.service.ts`의 `isTopTier`가 항상 `false`라, 한도에 걸리면 안내가 아니라 **페이월 바텀시트**가 뜬다
- 드립 편수도 무료 기준으로 계산된다
- 반면 `SubscriptionService.buildPlanView`는 표시용으로 `subscriptions`를 직접 읽는다 — **구매가 생기는 순간 화면과 판정이 어긋난다**

## 왜 지금 착수하지 못하는가

코드 밖 준비물이 선행한다.

- **스토어 계정·상품 등록** — App Store Connect · Google Play Console의 구독 상품 ID
- **검증 자격증명** — Apple `App Store Server API` 키(Issuer ID · Key ID · .p8), Google 서비스 계정
- **S2S 알림 수신 엔드포인트** — 갱신·해지·환불을 서버가 받는 경로와 그 서명 검증
- **테이블 2개** — `purchase_intents`(8.3) · `store_notification_logs`(8.4)가 아직 없다. 둘 다 `domain.md`에 정의는 있다
- **`spec/api/`에 구독 계약 문서가 없다** — `backend/CLAUDE.md` 6장 3항("api 문서가 없으면 만들지 말고 물어본다")에 걸린다

## 요청 내용

1. **먼저 계약 문서를 만든다** — `spec/api/subscription-api.md`. 영수증 제출·복원·S2S 수신의 요청·응답·에러 코드
2. `purchase_intents` · `store_notification_logs` 마이그레이션(`domain.md` 8.3·8.4). `user_id` FK에 **`ON DELETE CASCADE`** — 12.3 즉시 파기 목록이다
3. 스토어 검증 클라이언트 — **클라이언트가 보낸 값을 신뢰하지 않는다**
4. `users.tier` 갱신을 `SubscriptionService` **한 곳으로** 제한한다(`domain.md` 3.1 — 캐시의 단일 기록자)
5. 재가입 복원(`subscription.md` 4.5 · `domain.md` 12.3)

6. **탈퇴한 계정의 구독을 다른 계정이 가져가지 못하게 막는다.** 2026-09-09에 `archived_subscriptions` 유니크를 `(user_hash, original_transaction_id)`로 좁히면서, 종전에 아카이브가 대신 막던 이 경로가 **검증 시점의 책임으로 옮겨왔다**(`domain.md` 11.5). 영수증의 `original_transaction_id`가 이미 다른 계정에 살아 있으면 거부한다 — 살아 있는 계정끼리는 `uq_subscriptions_original_transaction_id`가 막지만, **탈퇴로 풀린 값**은 이 검사가 유일한 방어다.

## 완료 조건

- Given 스토어 결제를 마친 클라이언트가 영수증을 보낸다 / When 서버가 검증한다 / Then `subscriptions` 행이 생기고 `users.tier`가 바뀐다
- Given 위조된 영수증 / When 제출한다 / Then 티어가 바뀌지 않는다
- Given 유료 사용자 / When 재생 한도를 확인한다 / Then 무료 한도가 아니라 그 티어의 한도로 판정된다
- Given 스토어 S2S 갱신 알림 / When 서버가 받는다 / Then 중복 수신이 `store_notification_logs`로 걸러진다

## 추기 (2026-09-09 — 전수 감사에서 발견, 구현 시 함께 수정)

**"현재 구독" 선택 결함** — `subscription.repository.ts:58-66`이 사용자의 구독을 `expires_at DESC` 단건으로
고른다. 연간 구독을 환불(`refunded`, `expires_at`은 먼 미래)한 뒤 월간을 재구독하면 **refunded 행이
선택돼 무료로 표시**된다. 지금은 구독 행을 만드는 경로가 없어 잠재 결함이지만, 영수증 검증(이 티켓)이
행을 만들기 시작하는 순간 실결함이 된다. 구현 시 **비종결 상태(`active`/`grace`/`cancelled`)를 우선
선택하고, 없을 때만 최근 행으로 폴백**하도록 함께 고친다.
