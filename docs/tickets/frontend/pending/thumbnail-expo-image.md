# [FE] 이미지 컴포넌트를 expo-image로 교체 — 디스크 캐시·다운샘플링

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/library/components/LibraryItemTile.tsx` · `explore/components/ExploreTile.tsx` · `player/components/MiniPlayer.tsx` · `player/screens/PlayerScreen.tsx` 등 `Image`(react-native)를 쓰는 21개 파일 |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-09-19 |
| Jira | [KAN-78](https://runtime364.atlassian.net/browse/KAN-78) |
| 발견 시점 | iOS "이미지 로딩이 느리다" 피드백 조사 — 원인은 썸네일 파일(1024px PNG 1.5MB)이었고 BE가 저장 규격을 바꿔 처리했다(`tickets/backend/archive/thumbnail-resize-on-upload.md`, KAN-79). 앱 쪽 보조 조치가 이 티켓이다 |
| 근거 문서 | `spec/api/admin-api.md` 4.6(썸네일 저장 규격) · `frontend/architecture.md` 2.1(runtimeVersion) |
| 중요도 | **Low**(이번 주 안) — 첫 다운로드 용량은 BE 반영으로 이미 해결된다. 이 티켓은 재방문 시 재다운로드와 iOS 디코드 부담을 줄이는 보조 조치 |
| 상태 | 대기 |

## 배경

앱은 `react-native` 기본 `Image`를 쓴다. iOS의 기본 `Image`는

- 디스크 캐시가 약해 화면을 다시 열면 썸네일을 다시 받는다.
- 큰 이미지를 표시 크기로 줄여 디코드하지 않고 원본 크기(1024×1024 = 비트맵 4MB)로 디코드한다.
- 동시 다운로드 4개·동시 디코드 2개로 제한돼 목록 20장이 순서대로 뜬다.

Android의 기본 `Image`는 Fresco가 다운샘플링과 디스크 캐시를 하므로 같은 파일에서도 체감이 없었다. expo-image는 두 플랫폼 모두 디스크 캐시·다운샘플링·병렬 디코드를 제공한다.

## 요청

1. 목록 타일(`LibraryItemTile`·`ExploreTile`)과 플레이어 아트워크·미니플레이어의 `Image`를 `expo-image`의 `Image`로 바꾼다. `contentFit="cover"`, 기본 `cachePolicy`(disk) 유지, 목록 타일에는 `recyclingKey={content.id}`로 재사용 시 잔상을 막는다.
2. 나머지(로고·튜토리얼 등 정적 자산)는 그대로 둬도 된다. 바꾸면 한 종류로 통일되는 이점만 있다.
3. 네이티브 모듈이라 **runtimeVersion을 올려야 하고 OTA로는 나갈 수 없다.** 다음 스토어 빌드에 묶고 `app.json`의 `_runtimeVersionNote`에 적는다.
4. 썸네일 URL은 BE 반영 뒤 `.webp`로 온다 — expo-image·기본 Image 모두 iOS 14+/Android에서 WebP를 지원하므로 앱 쪽 대응은 없다.

## 범위 밖

- 썸네일 파일 크기 자체 — BE(KAN-79)가 저장 시점에 WebP 768px로 줄인다. 이 티켓이 없어도 첫 다운로드는 가벼워진다.

## 완료 조건

- Given 라이브러리 첫 화면을 한 번 본 뒤 앱을 껐다 켠다 / When 같은 화면을 연다 / Then 썸네일이 네트워크 요청 없이 즉시 뜬다(디스크 캐시)
- Given iOS 실기기, 20장 목록 / When 스크롤한다 / Then 타일이 하나씩 순서대로 뜨지 않고 화면 단위로 함께 뜬다
- Given `frontend/app.json` / When 읽는다 / Then runtimeVersion이 올라 있고 `_runtimeVersionNote`에 expo-image 추가가 적혀 있다

## 처리 기록

- 2026-09-19 발행.
- 2026-09-20 **코드 반영**(PR `feat(fe)/expo-image`) — 실기기 확인 대기라 `pending/`에 둔다.
  - `expo-image`(~57.0.5) 설치, **`runtimeVersion` 4** — 같은 날 KAN-80(개발계 소셜 키)이 먼저 3 → 4 로 올렸고, runtime 4 빌드가 나오기 전이라 같은 값에 함께 싣는다. `_runtimeVersionNote` 기록(완료 조건 3).
  - 공용 `shared/ui/RemoteImage.tsx`를 두고 **서버에서 받아 오는 이미지**를 전부 그쪽으로 옮겼다 — `LibraryItemTile`·`ExploreTile`·`ExploreFeaturedCard`·`ContentPickCard`·`PlayerQueuePanel`(이상 `recyclingKey` = 콘텐츠 id) · `MiniPlayer` · `PlayerScreen`(본 아트워크·열림 모션 아트워크) · 더보기 시트 3종 · `ContentDetailHeader`. `contentFit="cover"`, `cachePolicy="disk"`, 전환 효과 없음(플레이어 열림 모션이 로드 직후 프레임에 맞춰 출발한다).
  - **그대로 둔 것**: ① 번들 정적 자산(로고·주제 사진·튜토리얼·프로필) — 받아 올 것도 캐시할 것도 없다(요청 2). ② 플레이어의 **흐린 바탕** — expo-image 의 `blurRadius`는 세기 기준이 달라 맞춰 둔 톤이 바뀐다. 같은 URL 을 기본 `Image`가 한 번 더 받는다(768px WebP 라 작다).
  - 확인: tsc · eslint · jest(126건). 웹 mock 에서 라이브러리·플레이어·재생 목록이 종전과 같이 그려지고 열림 모션이 출발한다(onLoad 동작). **디스크 캐시·병렬 디코드(완료 조건 1·2)는 iOS 실기기에서만 확인된다.**
  - **남은 것**: runtime 4 새 빌드(개발계 iOS·Android, 운영 iOS·Android) → iOS 실기기에서 완료 조건 1·2 확인 → archive · KAN-78 완료.
