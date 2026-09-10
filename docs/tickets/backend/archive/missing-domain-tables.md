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

## 처리 기록 (반영 날짜: 2026-09-10 — 결정 기록으로 종결)

**`content_control_requests`: (b) 채택** — 테이블을 만들지 않고 `audit_logs`로 갈음한다.

- 근거(코드): 회수·복구·영구 정리는 운영자가 어드민 콘솔에서 실행하고 `admin-content.service`가 `audit_logs`에 `actor`·`action`·`before/after`(사유 포함)를 남긴다. 파트너 포털이 없고, `exclude`는 코드 자체가 없으며, 실서버 파트너 콘텐츠는 0건이다. 지금 테이블을 만들면 같은 클릭에 동일 정보가 두 벌 쌓이고, 10.2의 고유 컬럼(`requested_by`·`requested_at`·`status = pending`·`applied_surfaces`)은 채울 주체가 없다.
- 남는 공백 "파트너 측 요청자·요청일"은 회수 사유란 운영 규칙으로 처리한다. 필요해지면 withdraw 요청 본문에 선택 필드로 구조화하는 것이 테이블보다 싸다.
- **(a)로 돌아가는 조건**(`domain.md` 10.2에 기록): ① 파트너 포털(파트너가 직접 요청 → `pending` 존재) ② `exclude`의 파이프라인 소스 풀 연동 ③ 회수 반영이 노출면별 비동기 배치가 되어 `applied_surfaces` 추적이 필요할 때.
- 문서: `domain.md` 10.2 개정(백엔드 소유, 같은 PR) · `partner-control.md` 4.1·표는 `changes/pending/partner-control-request-history-mvp.md`로 요청.

**나머지 3종은 결정할 것이 없다** — 쓰는 코드가 생기는 PR에서 마이그레이션을 동반한다.
- `purchase_intents` · `store_notification_logs` → `subscription-receipt-verification` 티켓 착수 시
- `content_scripts` → FR-25(P1) 착수 시

마이그레이션 0건. 완료 조건("(a)/(b)와 근거가 기록돼 있다")을 충족해 archive.
