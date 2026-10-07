# 서비스 날짜 경계 04:00 → 05:00 KST (드립·알림 05:00 유지)

| 항목 | 값 |
|---|---|
| 대상 문서 | **규칙 소유**: `backend/domain.md` 1.2(경계 정의 — 유일한 기준) · `features/paywall.md`(4.4·9.1 리셋, 4.5·5장 "새벽 4시" 문구) · `features/README.md`(결정 목록의 04:00 언급) · `features/drip-scheduling.md`(2 배치 시각 · `already_placed` 예외) · `features/backend-monitoring.md`(3-2 새벽 배치 표·순서) · `features/subscription.md`(4.8 체험 종료 경계) · `prd/ear_root_prd.md` 9.1 · ~~`legal/terms-of-service-draft.md` 정의 7조~~(KAN-148에서 반영 2026-10-07). **경계를 인용만 하는 문서**: `features/` analytics·drip-feedback·explore·library·partner-control·player·profile · `spec/api/` admin·explore·library·player·profile · `spec/uiux/` explore·library·player·profile·subscription · `backend/architecture.md`·`convention.md` · `frontend/architecture.md` · `infra/architecture.md`·`inventory.md`·`scaling.md` · `prd/next_doing.md` |
| 요청 파트 | 프론트엔드(PM) |
| 요청자 | 이주호(PM) |
| 발행 날짜 | 2026-10-07 |
| 관련 티켓 | `tickets/backend/pending/service-day-boundary-0500.md`(KAN-149, 서버 경계) · `tickets/frontend/archive/service-day-0500-copy.md`(KAN-150 완료, 앱 문구) · `tickets/frontend/archive/terms-amendment-service-day-0500.md`(KAN-148 완료, 약관·전환 시각) |

## 수정 내용

1. **경계** — "하루의 경계는 04:00 KST, 03:59는 전날" → **"05:00 KST, 04:59는 전날"**. 주 경계 "월요일 04:00 ~ 다음 월요일 03:59" → "월요일 05:00 ~ 다음 월요일 04:59", 월 경계 "1일 04:00" → "1일 05:00"
2. **새벽 배치** (`backend-monitoring.md` 3-2 · `drip-scheduling.md` 2) — **드립 편성·도착 알림은 05:00 그대로**(PM 2026-10-07). 통계 집계는 04:00 → **05:00 이후**(전날이 05:00에 닫힌다). 만료 04:10 · 주제 숨김 04:15 · 보존 삭제 04:30 · 구독 보정 04:45는 서비스 날짜를 계산하지 않아 그대로. 종전 설명 "04시대 순서는 경계(04:00) 뒤에 전날분을 확정하고 편성이 그 결과를 읽게 하려는 것"은 "통계는 경계 뒤, 드립은 누적값만 읽어 하루 늦은 집계를 감수한다"로
3. **`already_placed` 예외** — "경계(04:00)와 배치(05:00) 사이 온보딩 첫 드립" 창이 없어진다(경계 = 배치 시각)
4. **체험 종료** — "10/10 04:00부터 무료 한도" 등 예시를 05:00으로. 전환 전에 이미 쓴 `trial_ends_at` 처리(서버 티켓 3장 결정)를 `domain.md`에 예외로 기록
5. **문구** — "매일 새벽 4시에 다시 채워져요" → "매일 새벽 5시에 다시 채워져요"(`paywall.md` 4.5·5장 · `spec/uiux/explore-uiux.md` 해소 기록). `spec/uiux/` library·player·subscription 은 KAN-150 에서 반영(2026-10-07)
6. **반영 시점** — 서버 전환과 같은 PR(또는 같은 날). 먼저 고치면 문서와 운영이 어긋난다. 전환 시각은 **2026-10-12(월) 05:00 KST**(KAN-148 확정 2026-10-07)

## 사유

팀 합의(2026-10-07): 하루가 채워지는 시각을 새벽 5시로 — 새 에피소드 도착(05:00)과 한도 리셋을 한 시각으로 맞춘다.

## 완료 조건

- Given `grep -rn "04:00\|04시\|03:59\|새벽 4시" docs` / When 결과를 본다 / Then 서비스 날짜 경계를 뜻하는 줄이 없다(백업 크론·점검 시각 등 무관한 것, 이력 기록 제외)
- Given `backend/domain.md` 1.2 · `features/paywall.md` 9.1 / When 읽는다 / Then 경계가 05:00이고 드립·알림이 05:00으로 같다
