# [FE] 단기 실험 ⑤ 시리즈 유료화 — 잠긴 편 표시·차단 시트

| 항목 | 값 |
|---|---|
| 대상 | 플레이 게이트(`playback.service.ts`·`usePlayGate.ts`) · `SeriesEpisodeRow` · `ExploreSeriesTile`/`ExploreTile` · `useSeriesScreen` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-294](https://runtime364.atlassian.net/browse/KAN-294) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | **API 명세 선행** — KAN-290(BE)의 에러 코드·잠금 필드 명세 확정 후 착수. 개발계 실동작 확인은 KAN-290 개발계 배포 선행 |
| 근거 문서 | `features/paywall.md` · `spec/uiux` explore·player·subscription · `features/analytics.md` |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

시리즈 4편부터 프로 전용이다(KAN-290). 판정은 서버가 하고 앱은 서버가 준 잠금 필드·에러만 표시한다(티어명 하드코딩 금지).

## 무엇을 한다

- 새 에러 코드 처리: `shared/api/error-codes.ts`, 플레이 게이트 차단 종류 추가 → 전용 시트 + 페이월 진입. `PLAY_LIMIT_EXCEEDED` 재사용은 남은 횟수 링이 오해를 만들어 쓰지 않는다.
- 잠금 배지: 시리즈 편 행, 탐색 시리즈 타일, 시리즈 헤더 재생 버튼.
- 재생 목록 자동재생이 잠긴 편에 닿을 때의 처리.
- 분석: `paywall_view`에 진입 이유 — `analytics.md` 먼저.
- 카피는 `spec/uiux` 먼저(문서 수정은 `changes/pending`). OTA 배포.

## 범위 밖

- 서버 판정·드립(KAN-290).

## 완료 조건

- Given 비프로 사용자 / When 시리즈 4편을 누른다 / Then 잠금 시트가 뜨고 소리가 나지 않으며 페이월로 갈 수 있다
- Given 시리즈 목록 / Then 서버가 잠금이라 준 편에만 잠금 배지가 보인다
- Given 프로 사용자 / Then 잠금 배지·시트가 없다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-294).
- 2026-10-29 KAN-290 결정 공유: 모든 시리즈 4편부터 잠금, 프로·체험 사용자는 열림, 듣던 비프로 사용자도 잠금. 앱은 서버 잠금 필드만 본다. 구버전 앱 대응 불필요(최소 지원 1.3.0).
