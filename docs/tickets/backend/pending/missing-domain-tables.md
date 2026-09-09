# [BE] domain.md에 정의됐으나 마이그레이션이 없는 테이블 4종 — 우선순위 판단 필요

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/database/migrations/` · 해당 모듈 Entity |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 — 마이그레이션 전수 대조 |
| 근거 문서 | `backend/domain.md` 5.3 · 8.3 · 8.4 · 10.2 |
| 심각도 | **중**(`content_control_requests`) / 하(나머지) |
| 상태 | 대기 — **우선순위 결정 필요** |

## 대조 결과

| 테이블 | domain.md | 상태 | 판단 |
|---|---|---|---|
| `content_control_requests` (10.2) | 회수·제외 **요청 이력** — FR-32 P0 "요청 이력은 남긴다" | 없음. 회수 로직은 있으나 이력은 `audit_logs`에만 | **가장 시급** — 파트너 계약 이행 기록. 다만 `audit_logs`가 행위자·전후 상태를 이미 남기므로 "별도 테이블이 여전히 필요한가"부터 결정 |
| `purchase_intents` (8.3) | 결제 의도 | 없음 | `subscription-receipt-verification` 티켓 구현 시 함께 |
| `store_notification_logs` (8.4) | S2S 알림 중복 처리 방어(유니크) | 없음 | 위와 동일 — 영수증 티켓에 종속 |
| `content_scripts` (5.3) | 스크립트 업로드(FR-25) | 없음 | **P1** — 정상. 착수 시점에 |

`topic_adjacencies`(P1)는 의도된 미생성 — 제외.

## 요청 내용

1. `content_control_requests`: (a) 테이블 신설 + 회수/복구 시 행 적재 (b) `audit_logs`로 갈음하고 domain.md 10.2를
   개정 — 둘 중 결정. **권장 (b)** — 회수·복구·재발행 전부 `audit_logs`에 actor·before/after가 남고 있어
   같은 정보를 두 벌 쌓을 이유가 약하다. 다만 "파트너 측 요청서 원문(사유·요청자)"을 남겨야 한다면 (a).
2. `purchase_intents`·`store_notification_logs`: 영수증 검증 티켓에 종속 — 그 티켓 착수 시 마이그레이션 동반.
3. `content_scripts`: P1 착수 시.

## 완료 조건

- Given 결정 / When 이 티켓을 본다 / Then `content_control_requests`의 (a)/(b)와 근거가 기록돼 있다
- Given (a) 채택 / When 회수·복구가 일어난다 / Then 요청 이력 행이 남는다 · Given (b) 채택 / When domain.md 10.2를 본다 / Then `audit_logs`로 갈음함이 적혀 있다
