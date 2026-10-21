# 해시태그 탭 → 탐색 검색(`#태그`) — features·api 문서에 옮겨 적기

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/explore.md` 4.5-1(진입 경로) · 4.5-2(태그 탭 문장) · 4.5-4(저장 시점) · `features/content-detail.md` 4.2(헤더 해시태그) · `spec/api/explore-api.md` 4.1 `content.tags`(🟡 표기) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-10-17 |
| 반영 날짜 | 2026-10-17 |
| 시작 날짜 | 2026-10-17 |
| 기한 | 2026-10-23 (Low — 이번 주 안 · 통합 시 반영) |
| 선행 | 없음 — 코드·uiux 는 FE KAN-219 PR 로 먼저 반영됐고, 통합 시 features·api 문서에 옮겨 적는 요청 |
| 중요도 | Low — 동작은 이미 uiux 가 적었고, features·api 는 "KAN-219 에서 붙는다" 예고 문장만 남아 있다 |
| 관련 | FE 티켓 `tickets/frontend/archive/hashtag-tap-to-search.md`(KAN-219 · PR #1659) · BE `tickets/backend/archive/search-hashtag-matching.md`(KAN-218) |

## 배경

KAN-219(2026-10-17)로 인기 대표 카드·콘텐츠 상세 헤더의 `#태그`를 탭하면 탐색 탭의 검색이 열리고 `#태그`로 즉시 검색한다. 화면 규칙은 같은 PR 에서 `spec/uiux/explore-uiux.md`(4.1·4.6·4.10·5·6·7장)·`content-detail-uiux.md`(4.1·7·9장)·`frontend/design.md`(인기 대표 카드)에 적었다. features·api 문서에는 "탭하면 `#태그`로 검색을 여는 동작은 FE KAN-219에서 붙는다(그 전까지 태그는 표시만)" 예고 문장이 남아 있어, 개발 중 문서 수정 규칙(루트 CLAUDE.md `changes/`)대로 여기 기록하고 통합 때 반영한다.

## 바뀐 것 (코드 반영 완료)

- **태그 탭 → 검색** — 인기 대표 카드(콘텐츠 해시태그만, 주제 이름 대체 표기는 제외)·콘텐츠 상세 헤더의 태그 글자 버튼(44×44). 상세는 어느 탭 위에 있든 상세를 걷고 탐색 탭으로 전환한 뒤 연다(`toTab('Explore', { searchQuery })`). 제자리 검색 갈래(iOS 26·Android)는 피드 위에 검색을 덮고, 스택 검색 갈래는 검색 화면을 `initialQuery` 와 함께 쌓는다. 피드 상태는 유지.
- **즉시 검색** — 디바운스 없이 [검색] 제출과 같은 경로. 태그 탭은 최근 검색어 저장 시점이다(`#태그` 그대로).
- **검색창 `#` 입력** — 트림 외 가공 없이 그대로 보낸다. 클라이언트 검증은 서버와 같다 — 앞의 `#` 하나를 떼고 다시 트림한 값이 2자 미만이면(`#`·`#a`) 요청하지 않는다.
- **사각 타일의 태그는 탭 동작 없음**(FE 결정 — 근거 `explore-uiux.md` 4.1).

## 문서에 옮겨 적을 것

- `features/explore.md` 4.5-1: 진입 경로에 "태그 탭(인기 대표 카드·콘텐츠 상세 헤더) — `#태그`로 즉시 검색" 추가. 다른 탭 위의 상세에서는 탐색 탭으로 전환 후 연다.
- `features/explore.md` 4.5-2 마지막 문장: "카드·상세의 태그를 탭하면 `#태그`로 이 검색을 여는 동작은 FE KAN-219에서 붙는다(그 전까지 태그는 표시만 — `content-detail-uiux.md`)" → "인기 대표 카드·콘텐츠 상세 헤더의 태그를 탭하면 `#태그`로 이 검색을 즉시 연다(KAN-219, 2026-10-17). 사각 타일의 태그는 탭 동작이 없다(`explore-uiux.md` 4.1)".
- `features/explore.md` 4.5-4 저장 시점: "키보드 [검색] 제출, 또는 결과 행 탭" 에 "**태그 탭으로 연 검색**" 추가.
- `features/content-detail.md` 4.2 헤더 표: 콘텐츠 해시태그 행(없으면 신설) — "탭하면 탐색 탭의 `#태그` 검색(KAN-219)".
- `spec/api/explore-api.md` 4.1 `content.tags` 행: "탭하면 `#태그`로 검색을 여는 동작은 FE KAN-219에서 붙는다 🟡" → "탭하면 `#태그`로 검색을 연다(KAN-219 반영 2026-10-17)" — 🟡 제거. 계약 변경은 없다.

## 완료 조건

- Given 위 다섯 곳 / When 통합 반영 / Then "KAN-219에서 붙는다"·"그 전까지 태그는 표시만" 문장이 없고, 태그 탭 진입·저장 시점·타일 제외가 적혀 있다
- Given `explore-api.md` 4.1 `content.tags` / Then 🟡 표기가 없다

## 처리 기록

- 2026-10-17 발행 — FE KAN-219 PR 에서 코드·uiux 2종·design.md 반영과 함께 기록.
- 2026-10-17 반영 — `features/explore.md` 4.5-1(태그 탭 진입 — 인기 대표 카드·상세 헤더, 탭 전환·갈래별 동작·타일 제외) · 4.5-2 마지막 문장(KAN-219 반영, 검색창 `#` 입력 그대로·클라이언트 검증) · 4.5-4 저장 시점(태그 탭으로 연 검색) · `features/content-detail.md` 4.2 표(콘텐츠 해시태그 행 신설) · `spec/api/explore-api.md` 4.1 `content.tags`(🟡 제거). FE 코드(`useContentDetailScreen` `toTab('Explore', { searchQuery })`·`useExploreSearchRequest`(제자리/스택 갈래·`initialQuery`)·`useExploreSearchScreen` `runSearchNow` 최근 검색어 저장)와 대조함 — 일치.
- 대상 목록에는 없었지만 같은 예고 문장(🟡)이 남아 있던 `spec/api/content-detail-api.md` 4.1 `content.tags` 행도 함께 고쳤다(계약 변경 없음).
