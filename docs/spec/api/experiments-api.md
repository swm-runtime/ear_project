# 단기 실험 API 계약 (2026-10-29) — 통합됨

> **2026-10-30 통합으로 각 절의 계약을 원래 문서로 옮겼다.** 이 문서는 옮긴 곳을 가리키는 안내만 남긴다 — 코드 주석 · 티켓이 이 문서의 절 번호를 가리키므로 절 제목은 지우지 않는다. 기준은 아래 "옮긴 곳"이다(`changes/archive/exp-contracts.md` 외).

단기 실험 8종(2026-10-29 확정) 중 **다른 파트와 계약이 필요한 것**만 모은 HTTP 계약이었다. 판정은 서버가 한다 — 앱은 서버가 준 값(`first_content_id`, `is_locked`, `is_discounted`, 에러 코드)으로만 그린다. 티어명으로 분기하지 않는다(루트 `CLAUDE.md`).

| 절 | 실험 | BE 티켓 | 옮긴 곳 |
|---|---|---|---|
| 4.1 | ⑧ 온보딩 완료 후 플레이어 띄우기 | KAN-292 ↔ KAN-295 | `onboarding-api.md` 4.8 `first_content_id` |
| 4.2 | ⑤ 시리즈 유료화 — 4편부터 구독 전용 | KAN-290 ↔ KAN-294 | 판정 `features/paywall.md` 4.1 · 에러 `player-api.md` 4.1 · 4.2 · 4.4 · 4.7 · 5장 · `library-api.md` 4.4 · `common-error-handling.md` 9.5 · `is_locked` `explore-api.md` 4.1 · 4.7 · `content-detail-api.md` 4.1 · `library-api.md` 4.1 · 4.3 · `player-api.md` 4.8 · 편성 `drip-scheduling.md` 4.2 · 알림 `notification.md` 4.6 |
| 4.3 | ④ 짧은 판 코호트 — 가입 시점으로 노출 분리 | KAN-298 · KAN-296 | 스키마 · 노출 조건 `backend/domain.md` 5.1 · 5.9 · 업로드 · 시리즈 `admin-api.md` 4.6 · 4.10 · 4.24 · 8장 · 편성 `drip-scheduling.md` 4.2 · 7장 · 탐색 `features/explore.md` · 토큰 클레임 `backend/architecture.md` 9.1 |
| 4.4 | ① 구독 가격 인하 — 할인 표시 | KAN-286 | `subscription-api.md` 4.1 "할인 표시" · `features/subscription.md` 7장 |
| 4.5 | ④ 짧은 판 · 도입부 — 실험 지표 조회 | KAN-298 · KAN-296 | `admin-api.md` 4.22-6 `GET /admin/insights/short-variant` |
| 4.6 | ③-1 도착 알림 시각 — 실험 지표 조회 | KAN-289 | `admin-api.md` 4.22-7 `GET /admin/insights/drip-arrival-time` |

---

## 4.1 `GET /onboarding/first-drip` — `first_content_id` 추가 (KAN-292 ↔ KAN-295)

옮김 — `onboarding-api.md` 4.8.

## 4.2 시리즈 유료화 — 4편부터 구독 전용 (KAN-290 ↔ KAN-294)

옮김 — 판정 규칙(4.2-1)은 `features/paywall.md` 4.1, 응답 필드 `is_locked`(4.2-2)는 `explore-api.md` 4.1(정의) · `content-detail-api.md` 4.1 · `library-api.md` 4.1 · `player-api.md` 4.8, 재생 거절 `SERIES_EPISODE_LOCKED`(4.2-3)는 `player-api.md` 5장 · `common-error-handling.md` 9.5, 편성 · 알림(4.2-4)은 `drip-scheduling.md` 4.2 · `notification.md` 4.6.

- **2026-10-30 개정** — 열리는 사람이 "유효 티어 pro 또는 체험"에서 **"저장 티어가 유료 요금제(daily · pro) 또는 체험"**으로 바뀌었고, 에러 메시지가 "이 편은 구독하면 들을 수 있어요"가 됐다(`changes/archive/exp-series-paywall-daily.md`). 옮긴 문서에는 개정된 값으로 적었다.

### 4.2-1 판정 규칙 (서버)

옮김 — `features/paywall.md` 4.1 "시리즈 유료화 — 잠긴 편".

### 4.2-2 응답 필드 `is_locked`

옮김 — `explore-api.md` 4.1 `content.is_locked`(다른 응답은 같은 정의를 가리킨다).

### 4.2-3 재생 거절 — 새 에러 코드 `SERIES_EPISODE_LOCKED`

옮김 — `player-api.md` 5장 · `common-error-handling.md` 9.5.

### 4.2-4 편성 · 알림 (앱 변경 없음, 참고)

옮김 — `drip-scheduling.md` 4.2 · `notification.md` 4.6.

## 4.3 짧은 판 코호트 — 가입 시점으로 노출 분리 (KAN-298 · 파이프라인 KAN-296)

옮김 — 코호트 판정 · 노출 분리(4.3-1 · 4.3-2)는 `backend/domain.md` 5.1 "짧은 판 코호트" · `drip-scheduling.md` 4.2 · `features/explore.md`, 토큰 클레임 `signed_up_at`은 `backend/architecture.md` 9.1, 업로드 필드(4.3-3)는 `admin-api.md` 4.6 "짧은 판 필드 검증" · 4.10 · 4.24, 도입부 버전(4.3-4)은 `backend/domain.md` 5.1 `intro_version` · `admin-api.md` 4.6 · 8장.

## 4.4 `GET /plans` — 정가 · 할인 표시 필드 추가 (KAN-286)

옮김 — `subscription-api.md` 4.1 "할인 표시".

## 4.5 `GET /admin/insights/short-variant` — 짧은 판 · 도입부 실험 지표 (KAN-298 · KAN-296, 2026-10-29)

옮김 — `admin-api.md` 4.22-6.

## 4.6 `GET /admin/insights/drip-arrival-time` — 도착 알림 시각 실험 지표 (KAN-289, 2026-10-30)

옮김 — `admin-api.md` 4.22-7.

---

## 미결 · 확인 필요

| 항목 | 상태 |
|---|---|
| 4.1 "짧은 편 먼저" 선정 | 이 문서에서 정했다(`onboarding-api.md` 4.8로 옮김) — 다르게 하려면 KAN-292 처리 기록에 남기고 그 절을 고친다 |
| 4.2 차단 시트 카피 · 잠금 아이콘 | `spec/uiux`(FE · KAN-294) 소관 |
| 4.2 탐색 피드에서 잠긴 편을 뺄지 보여 줄지 | 보여 준다(잠금 표시) — 유료 동기가 실험 목적이다 |
| 4.3 `SHORT_CONTENT_COHORT_SINCE` 값 | 새 앱의 스토어 배포 시각으로 운영이 넣는다(KAN-298 미결 · 운영 반영 체크리스트 KAN-300) |
| 4.3 주제 칩 · 주제별 건수 | 코호트로 거르지 않는다 — 짧은 판이 없는 주제도 칩은 보이고 목록이 빈다(폴백 없음과 같은 결과). 재고를 채우는 것이 전제다 |
| 4.4 "지금 할인 중" 카피 · 취소선 배치 | `spec/uiux`(FE) 소관 |
| 4.4 할인 표시 기간 | **실험 기간 한정이다** — `subscription-api.md` 4.1 "할인 표시". 가격을 유지하기로 하면 스위치(`PLAN_DISCOUNT_DISPLAY_ENABLED`)를 끄고 표시를 없앤다 |
| 4.4 요금제 표의 가격 값(1,900 · 3,900원) | 스토어 콘솔 가격 변경(사람 손) 뒤 반영한다 — `changes/pending/exp-price-discount.md`(보류) |
