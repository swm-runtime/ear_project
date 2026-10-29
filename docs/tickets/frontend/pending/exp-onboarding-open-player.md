# [FE] 단기 실험 ⑧ 온보딩 완료 후 플레이어 띄우기(지금은 탐색 탭)

| 항목 | 값 |
|---|---|
| 대상 | `onboarding-exit.service.ts` · `useCompleteScreen.ts` · `MainNavigator.tsx` · 플레이 게이트 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-295](https://runtime364.atlassian.net/browse/KAN-295) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | **API 명세 선행** — KAN-292(BE)의 첫 콘텐츠 id 필드 명세 확정 후 착수 |
| 근거 문서 | `features/onboarding.md` 4·5 · `spec/uiux/onboarding-uiux.md` 4.6~4.7 · `features/analytics.md` |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

온보딩 직후 첫 콘텐츠를 바로 듣게 해 첫 재생까지의 이탈을 줄인다. 지금은 온보딩이 끝나면 탐색 탭으로 간다(`initialRouteName`).

## 무엇을 한다

- 온보딩 종료 시 열 대상 저장 → Main에서 소비. 알림 탭과 같은 경로(`requestPlay(..., { openAfterIssue, openPaused })`)로 **멈춘 플레이어**를 연다(차감 팝업은 ▶ 때).
- 첫 드립이 준비되지 않음(`queued`·`no_candidates`·대기 초과)이면 지금처럼 탐색으로 폴백.
- 알림 권한 안내(O10)·체험 안내(P11)가 플레이어 모달 위에 겹치지 않게 순서 정리(iOS 모달 겹침 멈춤 전례).
- `PlayEntryPoint`에 `onboarding` 추가 — `analytics.md` 먼저.
- 문서 수정은 `changes/pending`에 기록. OTA 배포.

## 범위 밖

- 첫 콘텐츠 선정 규칙(KAN-292).

## 완료 조건

- Given 첫 드립이 완료된 신규 가입자 / When 온보딩을 마친다 / Then 첫 콘텐츠 플레이어가 멈춘 상태로 열린다
- Given 첫 드립 미완료·후보 없음 / Then 탐색 탭으로 간다
- Given 플레이어가 열린 직후 / Then 알림 권한 안내·체험 안내가 플레이어와 겹쳐 앱이 멈추지 않는다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-295).
