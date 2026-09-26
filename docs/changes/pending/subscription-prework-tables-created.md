# domain.md 8.3 · 8.4 "구현 상태" 주석 갱신 — 테이블이 생겼다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 8.3 `purchase_intents` · 8.4 `store_notification_logs` |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-09-26 |
| 관련 티켓 | `tickets/backend/pending/subscription-receipt-verification.md`([KAN-40](https://runtime364.atlassian.net/browse/KAN-40)) |

## 수정 내용

두 절 상단의 인용 블록을 바꾼다.

**현재**

> **구현 상태(2026-09-26)** — 이 테이블은 아직 만들지 않았다(마이그레이션·엔티티 없음). 구독 영수증 검증(KAN-40)과 함께 생긴다. 12.3 즉시 파기 목록의 이 항목은 테이블이 생길 때 코드에 붙는다.

**변경**

> **구현 상태(2026-09-26)** — 테이블·엔티티는 만들었다(`1787800000000-AddPurchaseIntentsAndStoreNotificationLogs`). **읽고 쓰는 코드는 아직 없다** — 구독 영수증 검증(KAN-40)이 저장소·서비스를 붙인다. `purchase_intents.user_id`는 ON DELETE CASCADE라 12.3 즉시 파기는 DB 제약이 수행한다.

(8.4에는 마지막 문장 대신 "`store_notification_logs`는 개인 식별자가 없어 탈퇴 시 그대로 둔다(12.3)"를 쓴다.)

## 사유

KAN-40 선행 스키마를 미리 반영했다(2026-09-26 — 스토어 준비물이 없어도 할 수 있는 부분만 먼저). 주석이 "아직 만들지 않았다"로 남아 있으면 다음에 읽는 사람이 마이그레이션을 다시 쓰게 된다.

## 완료 조건

- Given `domain.md` 8.3 · 8.4 / When 읽는다 / Then 테이블은 있고 쓰는 코드는 없다는 상태가 마이그레이션 이름과 함께 적혀 있다
