# [FE] 한도 안내 "새벽 4시" → "새벽 5시" (서비스 날짜 05:00 전환)

| 항목 | 값 |
|---|---|
| 대상 | `features/player/player.copy.ts`(`limitNotice.description`) · 04:00 경계 주석(`player.mock.ts` · `player.types.ts` · `play-confirm-suppression.service.ts` · `play-limit.store.ts` · `profile.dto.ts`) · `spec/uiux/` 의 같은 카피 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-150](https://runtime364.atlassian.net/browse/KAN-150) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 2026-10-09 (Low — 이번 주 안에 PR 준비). **OTA 는 전환 시각(2026-10-12 05:00 KST)에 맞춘다** — 먼저 나가면 04~05시에 문구와 실제 리셋이 어긋난다 |
| 선행 | `tickets/backend/pending/service-day-boundary-0500.md`(KAN-149 — 서버 경계 전환) · 전환 시각은 `tickets/frontend/archive/terms-amendment-service-day-0500.md`(KAN-148 완료 — 전환 **2026-10-12(월) 05:00 KST**) |
| 근거 문서 | 팀 합의(2026-10-07) · `paywall.md` 4.5·5장(한도 안내 시트 문구) |
| 중요도 | Low |
| 상태 | 완료 — 반영 2026-10-07 |

## 할 일

- "매일 새벽 4시에 다시 채워져요" → **"매일 새벽 5시에 다시 채워져요"**
- 주석의 "04:00 경계"·"04시" → 05:00 (판정은 그대로 서버 — 클라이언트는 `service_date` 만 본다)
- 문구가 `spec/uiux/`·`features/paywall.md`에 박힌 곳은 `changes/pending/service-day-boundary-0500.md`로 함께 반영

## 완료 조건

- Given 전환 후 한도 소진 / When 한도 안내 시트·페이월을 연다 / Then "매일 새벽 5시에 다시 채워져요"다
- Given `grep -rn "새벽 4시\|04:00\|04시" frontend/src` / When 결과를 본다 / Then 서비스 날짜를 뜻하는 줄이 없다(공지 mock 의 점검 시각 등 무관한 것 제외)
- Given OTA 발행 시각 / When 서버 전환 시각과 비교한다 / Then 같은 날 05:00 전후로 나갔다

## 처리 기록 — 반영 2026-10-07

**PM 결정(2026-10-07) — 지금 바꿔 1.2.0 빌드에 싣는다.** dev·main 모두 runtimeVersion `"32"`라 이 변경은 OTA 로 **1.2.0 빌드에만** 닿는다(rt 32 빌드는 아직 없음). 그래서 "OTA 를 전환 시각에 맞춘다"는 원래 계획 대신:
- **1.2.0 사용자**: 출시가 10-12 즈음이거나 뒤일 가능성이 높아 그대로 둔다. 10-12 전에 스토어에 나가면 그 며칠은 문구(5시)와 실제 리셋(4시)이 어긋난다
- **1.1.0 사용자**: 10-12 뒤에도 "새벽 4시"가 남는다 — 백필 OTA 하지 않고 업데이트 유도로 넘긴다(1시간 안내 차이, 백필은 1.1.0 운영 runtime 확인 + 그 시점 JS 기준 번들이 필요해 비용이 크다)

**반영**
- `player.copy.ts` `limitNotice.description` "매일 새벽 5시에 다시 채워져요"
- `WeeklyChart.tsx` `SERVICE_DAY_OFFSET_MS` 4h → 5h(오늘 요일 강조·평균의 지난 날 수 — 표시용, 판정 아님)
- 04:00 경계 주석(player mock·types·억제 서비스·한도 스토어 · profile dto·copy·types)
- `spec/uiux/` library(2곳)·player·subscription 의 같은 문구. `features/paywall.md` 등 규칙 문서는 `changes/pending/service-day-boundary-0500.md`로 서버 전환 때 반영
- 검증: `tsc` · `eslint` · `jest`

**완료 조건 중 확인 못 한 것**
- "전환 후 한도 소진 시 5시 문구" — 1.2.0 빌드 + 10-12 전환 뒤 실기기에서 본다
- "OTA 시각 = 전환 시각" — 위 결정으로 대체(1.2.0 출시로 닿는다)
