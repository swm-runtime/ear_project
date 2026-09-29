# [문서] `admin-api.md` 에 일일 지표 보고 수동 트리거 엔드포인트를 등재한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 3장 목록 · 4장 상세 |
| 요청 파트 | 문서(구현은 KAN-107 2단계 PR 에서 선반영) |
| 발행 날짜 | 2026-09-29 |
| 발견 시점 | 일일 지표 보고(17:00 KST 크론)를 만들며 — "지금 한 번 보내 달라"는 요청에 크론 밖에서 부를 길이 필요했다 |
| 심각도 | 하 — 관리자 전용 운영 엔드포인트 하나 |

## 수정 내용

3장 목록에 한 줄, 4장에 상세를 더한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/admin/reports/daily-metrics` | 일일 지표(GA4 활성·신규·가입·리텐션 D1/D7)를 **지금** Slack 에 게시한다. 크론(매일 17:00 KST)과 같은 본문이며, 어제 하루치다 |

- 인증: 다른 `/admin/*` 과 같다(JWT + 관리자 역할)
- 응답: `202 { "date": "YYYY-MM-DD" }` — 게시는 비동기이며 실패는 서버 로그(`daily metrics failed`)로만 남는다. 본문에 지표를 되돌려주지 않는다 — 출처는 Slack 채널 하나로 둔다
- GA4 자격(`GA4_PROPERTY_ID`·`GA4_SERVICE_ACCOUNT_BASE64`)이나 웹훅이 비면 `409 ADMIN_REPORT_NOT_CONFIGURED`

## 완료 조건

- Given `admin-api.md` 3장 / When 목록을 본다 / Then `POST /admin/reports/daily-metrics` 가 있다
- Given 4장 상세 / When 읽는다 / Then 인증·202 응답·미설정 시 409 가 적혀 있다
