# 시리즈 잠긴 편 — 잠금 시트(PW2)·잠금 표시·`paywall_view` 진입 이유 (KAN-294)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/uiux/subscription-uiux.md` 2장 · 4.6-1(PW2 신설) · `spec/uiux/explore-uiux.md` 4.11(잠긴 편 표시 · 낭독 카피) · `features/analytics.md` 3.4 · 구현 현황(`paywall_view` `reason`) · `features/player.md` 4.2-4(자동 재생이 잠긴 편에서 멈춤) · `frontend/design.md` 5장(잠긴 편) |
| 요청 파트 | 프론트엔드 — 이주호 |
| 관련 | 계약 `spec/api/experiments-api.md` 4.2(KAN-290 ↔ KAN-294) · 티켓 `tickets/frontend/archive/exp-series-paywall-lock-ui.md` · Jira [KAN-294](https://runtime364.atlassian.net/browse/KAN-294) · 계약 통합 기록 `changes/pending/exp-contracts.md` |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 없음 — 카피는 PM 확인 후 확정, 계약 통합은 `exp-contracts.md`와 함께 |
| 선행 | 없음 |

## 왜

단기 실험 ⑤ 시리즈 유료화(2026-10-29) — 시리즈 4편부터 구독 전용이고 판정은 서버가 한다(`is_locked` · `403 SERIES_EPISODE_LOCKED`). 앱은 서버 값만 보고 잠금 표시와 잠금 시트를 그린다. 티켓은 "카피는 `spec/uiux` 먼저(문서 수정은 `changes/pending`)"라고 했고, 같은 주의 FE 선례(커밋 c26c95d3 — 잔여 링 → 페이월)는 uiux·features 를 **같은 PR에서 직접 고쳤다** — 그래서 이 PR이 문서를 직접 고치고, 카피가 PM 확인 전 초안이라는 것과 남은 결정을 이 기록에 둔다.

## 수정 내용 (이 PR에서 반영함)

- `subscription-uiux.md` — 화면 목록에 **PW2 잠금 시트** 행, 4.6-1 신설: 여는 때(잠긴 편 탭 = 발급 없이 · 서버 403 = 플레이어를 닫고), 순서(자물쇠 원 56 → 제목 → 설명 → SB2 …), 구독 UI 켜짐/꺼짐 카피 표, 결제 뒤 재요청(잠금 힌트를 떼고 서버에 다시 묻는다).
- `explore-uiux.md` 4.11 — 잠긴 편 표시(메타 줄 앞 자물쇠 · 사진 위 금지 · 머리 [재생] ▶ → 자물쇠 · 시리즈 카드엔 없음 · 셔플은 잠기지 않은 첫 편부터), 낭독 카피 행.
- `analytics.md` — `paywall_view`에 `reason`: `play_limit` | `ring_tap` | `series_locked`.
- `player.md` 4.2-4 — 다음 줄이 잠긴 편이면 넘어가지 않는다(건너뛰지 않는다), 추천 목록에서는 잠긴 편을 뺀다.
- `design.md` 5장 — "잠긴 편": SF `lock.fill` / Android SVG, 목록은 메타 줄 앞 글리프, 시트 머리는 옅은 회색 원.

### 확정 전 카피 (PM 확인 필요)

| 자리 | 한국어 | 영어 |
|---|---|---|
| PW2 제목(구독 UI 켬, 서버 문구 없을 때) | 이 편은 구독하면 들을 수 있어요 | Subscribe to listen to this episode |
| PW2 설명(구독 UI 켬) | 구독하고 시리즈를 끝까지 들어 보세요 | Subscribe to hear the whole series |
| PW2 제목(구독 UI 끔) | 지금은 들을 수 없는 편이에요 | This episode isn't available right now |
| PW2 설명(구독 UI 끔) | 다른 콘텐츠는 지금처럼 들을 수 있어요 | You can keep listening to everything else |
| 잠긴 편 낭독 | 잠김 | Locked |
| 서버 에러 영어 문구(`error-messages.ts`) | — (서버 `message` "이 편은 프로 구독에서 들을 수 있어요") | This episode is available with a subscription. |

- 구독 UI 켬 빌드의 제목은 **서버 `message`가 우선**이다(한국어 표시일 때). 서버 문구에 "프로"가 들어 있어 앱 카피에는 티어명을 넣지 않았다 — 미리 막기(서버 호출 없음)일 때만 위 확정 카피가 보인다. 두 문구가 같은 사용자에게 번갈아 보일 수 있다(목록에서 누름 → 앱 카피 / 푸시로 들어와 403 → 서버 문구). 하나로 맞출지가 남은 결정이다.

## 남은 결정

1. PW2 카피 확정(위 표) — 특히 서버 문구와 앱 카피를 하나로 맞출지.
2. `is_locked`의 콘텐츠 상세 위치 — 계약은 "상세 최상위"와 "콘텐츠 객체"가 둘 다 읽힌다(`experiments-api.md` 4.2-2 표 · `exp-contracts.md` 3번). 앱은 둘 다 읽는다(어느 쪽이든 true 면 잠금). BE(KAN-290)가 한쪽으로 정하면 계약 문서를 고친다.
3. 라이브러리 격자 타일에도 자물쇠를 둘지 — 이번엔 티켓 범위(시리즈 편 행 · 탐색 타일 · 시리즈 머리)만 그렸다. 라이브러리에서 잠긴 편을 누르면 잠금 시트는 뜬다(미리 막기).

## 완료 조건

- Given PM 카피 확인 / When `subscription-uiux.md` 4.6-1을 연다 / Then 표의 카피가 확정 문구이고 `player.copy.ts` `seriesLock`과 1:1이다
- Given BE(KAN-290)가 상세의 `is_locked` 위치를 정했다 / When `experiments-api.md` 4.2-2를 연다 / Then 위치가 하나로 적혀 있다
- Given 통합 반영 / When `analytics.md` 3.4를 연다 / Then `paywall_view`의 `reason` 세 값이 있고 `analytics.events.ts`와 같다

## 처리 기록

- 2026-10-29 발행 — 위 문서 수정은 KAN-294 PR에서 직접 반영, 카피 확정·남은 결정 대기.
