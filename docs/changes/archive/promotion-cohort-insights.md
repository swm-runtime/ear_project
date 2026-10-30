# 로그 콘솔 "프로모션" 탭 — 초대 코드별 묶음 지표 `GET /admin/insights/invite-codes`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md`(4.22 다음에 `GET /admin/insights/invite-codes` 신설) · `features/backend-monitoring.md`(탭 표에 "프로모션" 행) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-28 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-28 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/promotion-cohort-insights` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

SANKUN(Pro, 12-10까지) 같은 프로모션 사용자만 따로 지표를 보고 싶다(2026-10-28 박준현). 서비스 지표 탭은 이미 정보가 많아 **새 탭**으로 둔다.

## 고칠 내용

1. `admin-api.md` — `GET /admin/insights/invite-codes?days=`(관리자, 읽기 전용, `Cache-Control: no-store`). `days` 1~90, 기본 14(청취 시간의 창).
   - `codes[]`(초대 코드마다, 입력 수 많은 순): `code` · `name` · `tier` · `grant_days` · `grant_until_date` · `is_active` · `redeemed`(누적 — `invite_codes.redeemed_count`) · `current`(지금 남은 입력 계정) · `withdrawn`(`redeemed - current`) · `active_grants`(지급 중) · `ended_grants`(지급 끝) · `active_7d`(세션 기준 — 지표 탭 `active_7d`와 같다) · `listeners_7d`(재생) · `listen_sec`(창 안) · `listen_sec_per_user` · `active_7d_rate` · `paid_after_start`(입력 뒤 실결제 시작 — production · 환불 제외) · `paid_after_start_rate`.
   - `baseline`: 코드를 입력한 적 없는 현재 계정의 같은 값 + `paid_ever` · `paid_ever_rate`.
   - 집계값만 — 이름·이메일·user_id 없음. 탈퇴하면 입력 기록이 함께 지워져(CASCADE) 지표는 지금 남은 계정 기준이다.
2. `backend-monitoring.md` 탭 표 — "프로모션 | `/backend-logs/promotions` | 초대 코드별 묶음(입력·지금·탈퇴 · 지급 중·끝 · 7일 활성·청취자와 기준선 대비 %p · 1인당 청취 · 입력 뒤 결제). 실배포·개발계 토글, 열 때 1회" 추가.

## 완료 조건

- Given 위 두 문서 / Then 엔드포인트·필드 정의·화면이 적혀 있고 `AdminInsightsRepository.inviteCodeCohorts`와 같다

## 처리 기록

- 2026-10-28 발행(박준현).
- 2026-10-30 반영 — `spec/api/admin-api.md` 4.22-2 `GET /admin/insights/invite-codes` 신설(요청 · `codes[]` · `baseline` · 집계만) + 3장 목록 행, `features/backend-monitoring.md` 4장 탭 표 "프로모션" 행(헤딩 "콘솔 6탭" → "8탭"). 콘솔 경로 `pipeline/apps/web/app/backend-logs/promotions`와 대조함.
