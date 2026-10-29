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
| 상태 | 완료(2026-10-29) — 실기기 확인 남음 |

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
- 2026-10-29 반영: 줄 썸네일을 `features/player/components/QueueThumbnail.tsx`로 뺐다. 결정은 아래와 같다.
  - **반짝임은 이미지 밑에 깐다** — 이미지가 네이티브에서 그려지는 순간 위에서 덮으므로 JS `onLoad`가 늦게 와도 스켈레톤이 이미지 위로 비치지 않는다.
  - **캐시 깜빡임** — `useDelayedVisible`(0.3초, design.md §5 · common-error-handling.md 5)로 0.3초 안에 뜨면 반짝임을 아예 그리지 않는다. 캐시(메모리·디스크) 적중은 이 안이라 루프도 돌지 않는다. `onLoadStart`·`cacheType`으로 가르는 방법은 `onLoad` 이벤트가 JS에 오기 전 한 프레임을 막지 못하고 `RemoteImage` 계약을 넓혀야 해서 쓰지 않았다.
  - **페이드인 없음** — expo-image `transition`(`fadeInMs`)은 캐시 적중에도 매번 페이드한다(iOS `ImageView.renderSourceImage`·Android `ExpoImageViewWrapper.onResourceReady` 둘 다 출처를 보지 않음, expo-image 57 소스 확인). 시트를 열 때마다 썸네일이 깜빡이게 되어 넣지 않았다.
  - **재사용 줄** — 로드 결과를 `recyclingKey`+주소 키에 묶어 렌더 중에 파생한다. 키가 바뀌면 지난 줄의 "다 받음/실패"가 따라오지 않는다(effect 되돌림 없음). 콜백도 그 키를 잡아 지난 결과가 새 키로 기록되지 않는다.
  - **주소 없음·실패** — 기본 이미지 대신 종전 단색 칸(`playerColor.surface`) 그대로. 받을 것이 없거나 끝난 상태라 반짝이지 않는다. 브랜드 기본 이미지는 커버 색이 비치는 어두운 바탕에서 48pt 칸마다 로고가 반복돼 목록이 시끄러워진다.
  - **동작 줄이기** — `SkeletonGroup` 기존 처리(정지 블록). 블록 영역은 줄(Pressable)이 낭독 단위라 숨겼다.
  - Animated 값은 새로 붙이지 않았다(숫자↔값 바꿔 끼우기 없음). 상태는 썸네일 컴포넌트 안에만 있어 줄(`QueueRow` memo)·끌기 제스처는 다시 그려지지 않는다.
  - `spec/uiux/player-uiux.md` PL12 "줄"에 썸네일 로딩 상태 한 줄 추가. 테스트 `QueueThumbnail.test.tsx`(캐시 0.3초 안 · 지연 후 반짝임 → 로드 시 걷힘 · 키 변경 시 초기화 · 실패/주소 없음).
  - **다른 목록은 맞추지 않았다** — 라이브러리 타일(`LibraryItemTile`)·탐색 타일(`ExploreTile`·`ExploreFeaturedCard`·`ExploreSeriesTile`·`SeriesStackedArtwork`)도 받기 전엔 단색 바탕만 있는 같은 모습이다. 다만 흰 바탕 화면이라 단색 칸이 오류처럼 읽히는 정도가 덜하고, 탐색 격자는 이미 페이드인·`warmRemoteImages`로 다르게 다룬다. 필요하면 `QueueThumbnail`의 방식(밑에 깔기 + 0.3초 지연)을 `shared/ui`로 올려 별도 티켓으로 맞춘다.
