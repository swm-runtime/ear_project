# partner-control.md 4.1 · 데이터 모델 표 — 요청 이력은 MVP에서 `audit_logs`가 맡는다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/partner-control.md` 4.1(사전 제외 지정) · "사용하는 것" 표의 `content_control_requests` 행 |
| 발행 날짜 | 2026-09-10 |
| 발견 시점 | `tickets/backend/pending/missing-domain-tables.md` 결정 — `content_control_requests` 테이블을 MVP에서 만들지 않기로 함(안 (b)). `domain.md` 10.2는 백엔드가 같은 날 개정했다 |
| 요청 파트 | 백엔드 |

## 왜 필요한가

`domain.md` 10.2는 2026-09-10에 "MVP는 테이블 미생성, 요청 이력은 `audit_logs`, 파트너 포털·exclude 파이프라인 연동·비동기 반영 중 하나가 생기면 생성"으로 개정됐다. `partner-control.md`에는 그 테이블을 현재 사용하는 것처럼 적힌 곳이 두 군데 남아 문서끼리 어긋난다.

## 수정 내용

1. **4.1 사전 제외 지정** 첫 불릿
   - 현재: "파트너가 원문 단위로 오디오화 제외를 지정하면 `content_control_requests(action = exclude)`로 기록한다"
   - 수정: "파트너가 원문 단위로 오디오화 제외를 지정하면 요청 이력을 남긴다. **MVP에서는 `audit_logs`에 운영자가 기록한다**(`domain.md` 10.2 MVP 구현 상태). `content_control_requests(action = exclude)`는 파이프라인 소스 풀 연동 시점에 도입한다"
2. **"사용하는 것" 표** `content_control_requests` 행
   - 현재: "`content_control_requests` — 제외·회수·복구 요청 이력 | 10.2"
   - 수정: "`content_control_requests` — 제외·회수·복구 요청 이력 (**MVP 미생성 — `audit_logs`로 갈음**, 도입 조건은 10.2) | 10.2"
3. 4.3 처리 순서에 한 줄 추가(선택): "파트너 측 요청자·요청일은 회수 사유(`reason`)에 적는다 — 운영 규칙."

## 완료 조건

- Given `partner-control.md` 4.1 / When 첫 불릿을 읽는다 / Then MVP는 `audit_logs`이고 테이블은 파이프라인 연동 시점임이 적혀 있다
- Given 같은 문서 데이터 모델 표 / When `content_control_requests` 행을 읽는다 / Then "MVP 미생성"과 도입 조건 참조(10.2)가 있다

## 처리 기록 (반영 날짜: 2026-09-10)

요청 1·2·3 모두 반영했다.

- **4.1 첫 불릿** — MVP는 `audit_logs`에 운영자가 기록하고, `content_control_requests`는 파이프라인 소스 풀 연동 시점에 도입한다는 것을 적었다
- **데이터 모델 표** — `content_control_requests` 행에 "MVP 미생성 — `audit_logs`로 갈음"과 도입 조건 참조(10.2)를 붙였다
- **4.3 처리 순서** — "파트너 측 요청자·요청일은 회수 사유(`reason`)에 적는다"를 넣었다. 선택 항목이었지만 **넣는 편이 맞다** — 테이블이 없으니 요청의 출처를 남길 자리가 `reason`뿐이고, 그 사실을 적어 두지 않으면 비워 둔 채 운영된다
