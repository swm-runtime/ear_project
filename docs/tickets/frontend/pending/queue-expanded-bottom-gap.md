# [FE] 재생 목록 2단 — "다음에 들어볼 만한" 끝까지 내리면 바닥에 빈 자리가 크게 남는다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/player/screens/PlayerScreen.tsx`(패널 `bottomInset={queueExpandTravel + bottomPadding}` · `queueExpandTravel`) · `components/PlayerQueuePanel.tsx`(`listContentStyle` paddingBottom) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현 |
| 담당 | 이주호 |
| Jira | [KAN-262](https://runtime364.atlassian.net/browse/KAN-262) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | 없음 |
| 근거 문서 | `features/player.md` 4.2-1(시트 2단 — KAN-241 "4번") · `frontend/design.md` |
| 중요도 | Medium |
| 상태 | 발행 |

## 증상 (2026-10-23 박준현, Android)

재생 목록을 열고 "다음에 들어볼 만한" 섹션 끝까지 내리면 마지막 줄 아래에 **빈 바탕이 크게 남는다**(화면 몇 줄 높이).

## 원인 — 알려진 대가로 남겨 둔 여백

`PlayerScreen.tsx` 가 패널에 `bottomInset = queueExpandTravel + bottomPadding` 을 준다. 시트 틀은 2단 자리에 고정돼 있고 1단에서는 `queueExpandTravel`(= `queueOpenTop - 72`) 만큼이 화면 밖이라 그 몫을 바닥 여백으로 준 것이다. **2단에서도 빼지 않는다** — 코드 주석: "2단에 앉는 순간 여백을 빼면 내용이 짧아져, 재생 중인 줄로 맞춘 스크롤 위치가 끝을 넘어 목록이 툭 내려앉았다. 대가: 2단에서 마지막 줄 밑에 그만큼 빈 자리가 남는다(추천이 끝없이 붙어 바닥에 닿는 일은 드물다)". 추천이 끝(더 받을 장 없음)에 닿거나 목록이 짧으면 이 대가가 그대로 보인다. `queueExpandTravel` 이 아트워크·컨트롤 높이만큼이라 수백 pt 다.

iOS 도 같은 계산이다 — 같이 확인한다(Android 에서 먼저 보고됨).

## 무엇을 한다 (방법은 FE 판단)

여백을 **지금 보이는 단계에 필요한 만큼만** 준다. 내려앉음(스크롤 위치가 끝을 넘음)을 막는 방법 예:
- 2단에 **앉은 뒤**(전환 애니메이션 완료) 여백을 `bottomPadding` 으로 줄이면서, 그때 스크롤 위치가 새 끝을 넘으면 같은 프레임에 끝으로 맞춘다(`scrollTo` 애니메이션 없이) — 1단으로 내릴 때는 내리기 시작할 때 다시 늘린다
- 또는 1단에서만 화면 밖 몫을 바닥 스페이서로 두고, 스페이서 높이를 UI 스레드 값(`queueExpand`)으로 줄인다 — Android 레이아웃 애니메이션 금지 규칙(같은 파일 주석)과 충돌하면 앞의 방법

## 완료 조건

- Given 재생 목록 2단 · 추천 끝까지 받은 상태 / When 끝까지 내린다 / Then 마지막 줄 아래 여백이 하단 안전영역 + 기본 여백(`spacing.md`) 정도다
- Given 1단 / When 끝까지 내린다 / Then 마지막 줄이 화면 안에 다 보인다(종전처럼 화면 밖에 잘리지 않는다)
- Given 재생 중인 줄로 스크롤이 맞춰진 1단 / When 2단으로 올린다 / Then 목록이 툭 내려앉지 않는다(PM 2026-10-23 지적 재발 없음)
- Given iOS·Android 둘 다 / Then 위와 같다

## 처리 기록

- 2026-10-23 발행(박준현 — Android 실측. 코드 확인: `PlayerScreen.tsx` 패널 `bottomInset` 주석의 "대가").
