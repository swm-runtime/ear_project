# [FE] 재생 목록(PL12) 썸네일 로딩 중 스켈레톤 반짝임 적용

| 항목 | 값 |
|---|---|
| 대상 | 플레이어 재생 목록 패널 PL12 — `features/player/components/PlayerQueuePanel.tsx` 행 썸네일(`RemoteImage`) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-283](https://runtime364.atlassian.net/browse/KAN-283) |
| 발행 날짜 | 2026-10-27 |
| 시작 날짜 | 2026-10-27 |
| 기한 | 2026-10-30 (Low — 이번 주 금요일) |
| 선행 | 없음 |
| 근거 문서 | `spec/uiux/player-uiux.md` PL12 · `frontend/design.md` §4(스켈레톤·모션) |
| 중요도 | Low |
| 상태 | 발행 |

## 왜

재생 목록을 처음 불러올 때는 `QueueSkeleton`(`SkeletonGroup`·`SkeletonBlock`)이 반짝이며 자리를 잡는다. 그런데 목록이 뜬 뒤 **각 행의 썸네일**은 이미지가 받아지기 전까지 `styles.thumbnail`의 단색 배경(`playerColor.surface`)만 보이고 반짝임이 없다. `RemoteImage`에 로딩 표시가 없어서다. 같은 화면 안에서 "로딩 중"의 모습이 두 가지가 되고, 단색 칸은 빈 이미지(오류)처럼 읽힌다. `thumbnailUrl`이 없는 행도 같은 단색 칸이다.

## 무엇을 한다

- 행 썸네일이 로드되기 전에는 목록 로딩 스켈레톤과 같은 반짝임(`shared/ui/Skeleton` — 플레이어 토큰 `playerColor.skeleton`)을 보여 주고, 로드되면 이미지로 바꾼다(`RemoteImage`의 `onLoad`, 필요하면 짧은 페이드인).
- 캐시된 이미지는 깜빡이지 않게 한다 — 바로 뜨면 반짝임이 보이지 않아야 한다.
- 재사용되는 행(`recyclingKey`)에서 이전 행의 썸네일이나 반짝임 상태가 남지 않게 한다.
- `thumbnailUrl`이 없는 행은 계속 반짝이지 않는다(영원히 로딩처럼 보이지 않게 — 기본 이미지 또는 단색 그대로, FE가 정한다).
- 동작 줄이기 설정이 켜져 있으면 정지 상태(`Skeleton`의 기존 처리 그대로).
- 다른 목록(라이브러리·탐색 타일)에도 같은 모습이 있으면 함께 맞출지 FE가 판단해 처리 기록에 적는다.

## 범위 밖

재생 목록 로딩 스켈레톤(`QueueSkeleton`) 자체 — 이미 반짝인다.

## 완료 조건

- Given 재생 목록을 연다 / When 썸네일이 아직 안 받아진 행 / Then 그 자리에 반짝이는 스켈레톤이 보이고, 받아지면 이미지로 바뀐다
- Given 이미 본 썸네일(캐시) / Then 반짝임 없이 바로 이미지가 보인다
- Given `thumbnailUrl`이 없는 행 / Then 반짝임이 계속되지 않는다
- Given 동작 줄이기 켬 / Then 반짝이지 않는다

## 처리 기록

- 2026-10-27 발행(마크다운 + Jira KAN-283).
