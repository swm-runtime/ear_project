# 서비스 지표 리텐션 표에 바운디드 N일 리텐션 추가 — `admin-api.md` 4.22 · `backend-monitoring.md`

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.22(응답 `retention[]`에 `bounded_*` 3필드) · `features/backend-monitoring.md`(서비스 지표 탭 리텐션 표 — 열·각주·벤치마크) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-26 |
| 시작 날짜 | 2026-10-26 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/insights-bounded-retention` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

리텐션 표의 D1·D7·D30은 **언바운디드**(가입 N일 뒤부터 지금까지 한 번이라도)라 오래된 가입자일수록 높아지고 업계 벤치마크(바운디드 — 정확히 N일째 하루)와 비교할 수 없었다. 결정(2026-10-26 박준현): 기존 값은 그대로 두고 같은 표에 **바운디드 열**과 **업계 중앙값 열**(MWM Retention Benchmarks, 미국 미디어·엔터테인먼트 앱, 2025 Q3 — D1 24.9% · D7 8.0% · D30 3.4%, 팟캐스트 전용 아님)을 더한다.

## 고칠 내용

1. `admin-api.md` 4.22 응답 `retention[]` — 행마다 추가:
   > | `bounded_cohort_size` | int | 가입한 KST 달력일 `d`에서 `d + N`일이 **다 지났고**(어제까지) 그날 접속 기록을 믿을 수 있는(`retention_cohorts.*.reliable_since` 이후) 현재 계정 수 |
   > | `bounded_returned` | int | 그중 **정확히 `d + N`일 하루**(KST)에 앱을 쓴(접속 — `user_active_dates`·남은 `sessions` — 또는 재생) 사람 수. 코호트 표 D1·D7 칸의 전 기간 합과 같은 원천·정의 |
   > | `bounded_rate` | float \| null | `bounded_returned / bounded_cohort_size`, 분모 0이면 null |
   - 기존 `cohort_size`·`returned`·`rate`는 그대로(언바운디드). `market` 필터를 따른다. 탈퇴자는 분모에 없다(생존 편향 — 다른 리텐션과 같다).
2. `backend-monitoring.md` 서비스 지표 탭 리텐션 행 — "열: 기준 · 대상 · 돌아옴 · 이후 언제든(언바운디드) · N일째 하루(바운디드 — 비율 + 돌아옴/대상) · 업계 중앙값(MWM 2025 Q3 미국 미디어·엔터, 화면 상수). 옛 서버(필드 없음)는 '-'" 추가.

## 완료 조건

- Given 위 두 문서 / Then `bounded_*` 3필드의 정의(달력일 · N일째가 다 지난 가입자 · 신뢰 경계 · 원천)와 화면 열·벤치마크 출처가 적혀 있고 코드(`AdminInsightsRepository.boundedRetention`)와 같다

## 처리 기록

- 2026-10-26 발행(박준현).
