# [FE] 검색 안내 2종 — "‘커리어’로 대신 검색했어요 / 혹시 ‘커리오’로 검색하고 싶나요?"(교정, 탭 → `exact=true`) · "‘OO’와 관련된 결과예요"(`match: "related"`)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/explore/api/explore.dto.ts`·`explore.types.ts`·`explore.mock.ts`·`explore.api.ts`(`exact` 파라미터, `query_used`·`corrected_from`·`match`·`engines`·`items[].matched_by`) · `hooks/useExploreSearchScreen.ts` · `screens/ExploreSearchScreen.tsx`·`.ios.tsx`(제자리·스택 두 갈래) · `explore.copy.ts` ko·en + `src/app/__snapshots__/copy-ko.snapshot.test.ts.snap` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 02:52 "오타는 대신 검색" · 02:56 문구 확정 |
| 담당 | 프론트엔드 |
| Jira | [KAN-239](https://runtime364.atlassian.net/browse/KAN-239) · 선행 BE [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — BE와 같은 날. 작업이 작아 BE 머지 당일 반영 가능. BE가 밀리면 사유를 처리 기록에 적는다) |
| 선행 | BE [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) `tickets/backend/archive/search-similar-fallback.md`(2026-10-22 반영) — 응답 필드·`exact` 파라미터(Jira is blocked by). mock으로 화면·카피는 먼저 만들 수 있다 |
| 근거 문서 | `changes/pending/search-similar-fallback.md` 1·2·4·5절 · `spec/uiux/explore-uiux.md` 4.5 |
| 중요도 | Medium |
| 상태 | **코드 반영(2026-10-22) — 개발계 실기기 확인은 BE KAN-238 머지 뒤** |

## 왜

검색이 두 가지로 바뀐다(KAN-238): 오타면 서버가 교정어로 **대신 검색**하고(`query_used`·`corrected_from`), 결과는 키워드 + 임베딩 의미 하이브리드다. 앱이 그대로 그리면 "커리오"를 쳤는데 "커리어" 결과가 말없이 나온다. 구글처럼 **무엇으로 검색했고 원문으로 되돌릴 수 있는지** 두 줄, 그리고 교정은 없었지만 키워드로 맞은 편이 하나도 없을 때(의미 결과만) **왜 이 결과인지** 한 줄 — 이 안내 2종이 이 티켓의 전부다.

## 무엇을 한다

1. **계약** — 요청 `exact?: boolean`(`explore.api.ts` 검색 호출·쿼리 키에 포함). 응답 `query_used`, `corrected_from: string | null`, `match: "keyword" | "related"`, `engines: string[]`, `items[].matched_by: string[]` 파싱(DTO·타입). 없으면 `corrected_from = null`·`match = "keyword"`·빈 배열(옛 서버 호환). `engines`·`matched_by`는 타입만, 화면 미사용. mock에 교정 응답·`related` 응답 각 1종.
2. **상태** (`useExploreSearchScreen`) — `exact` 플래그(검색어가 바뀌면 `false`로 리셋), 응답의 `correctedFrom`·`queryUsed`·`isRelatedResult`. 최신 질의의 응답만 반영하는 기존 규칙 그대로. 커서 2페이지 이상은 첫 응답의 값을 유지(서버가 응답마다 반복하지만 첫 페이지 기준으로 고정).
3. **교정 안내**(`corrected_from`가 있을 때, 격자 첫 행 위 두 줄) — 1줄 ko **"‘커리어’로 대신 검색했어요"**(보조 글자색) · 2줄 **"혹시 ‘커리오’로 검색하고 싶나요?"**(링크 색, 탭 영역 44pt 이상, 버튼 역할). en **"Showing results for “커리어”"** / **"Search instead for “커리오”?"**. 두 검색어는 응답의 `query_used`·`corrected_from`을 그대로 되비춘다. **2줄 탭 → `exact=true`로 같은 검색어 즉시 재검색**(디바운스 없이 [검색] 제출과 같은 경로) → 교정 없는 결과(의미만이면 관련 안내, 없으면 종전 빈 결과). 최근 검색어 저장은 변경 없음(입력 그대로 — 교정어를 저장하지 않는다).
4. **관련 결과 안내**(`match === "related"`, 한 줄) — ko **"‘커리오’와 관련된 결과예요"**, en **"Showing related results for “커리오”"**. 입력 검색어를 그대로 되비춘다(`noResult`와 같은 규칙). 교정 안내와 동시에 뜨는 경우는 없다(서버 규칙 — 교정된 응답은 항상 `keyword`).
5. **화면** — 격자·타일·⋯ 시트·커서 로딩·스켈레톤은 변경 없음. 제자리 검색(iOS 26·Android)·스택 검색(iOS 26 미만) 두 갈래 모두. `#` 질의는 교정·의미가 없어 안내가 올 일이 없다.
6. **접근성** — 결과 도착 때 안내를 **한 번** 낭독(`AccessibilityInfo.announceForAccessibility` — 커서로 격자가 늘어날 때 다시 읽지 않는다). 교정 2줄은 버튼 역할 + 낭독 "‘커리오’로 검색".
7. **카피** — `explore.copy.ts` `search.correctedTo(queryUsed)` · `search.searchInsteadFor(original)` · `search.relatedResult(query)` ko·en, ko 스냅샷 `-u`. `explore-uiux.md` 4.5 개정은 changes 문서 5절이 맡는다(BE PR에서 함께 반영).

## 범위 밖

- 교정어 선택·랭킹·AI 서버(BE) · 교정어 복수 제안 · 타일 '관련' 꼬리표(`matched_by`가 근거 — 다음 결정) · 초성 검색

## 완료 조건

- Given mock 교정 응답(`query_used: "커리어"`, `corrected_from: "커리오"`), 검색어 "커리오" / When 결과 표시 / Then 격자 위 "‘커리어’로 대신 검색했어요" + "혹시 ‘커리오’로 검색하고 싶나요?", 낭독 1회
- Given 그 2줄 탭 / Then `exact=true`로 즉시 재검색, 안내가 응답에 따라 바뀐다(관련 안내 또는 빈 결과), 최근 검색어는 "커리오" 그대로
- Given 검색어를 고쳐 다시 치면 / Then `exact`가 `false`로 돌아간다
- Given mock `match: "related"`, 검색어 "커리오" / Then 격자 위 "‘커리오’와 관련된 결과예요", 낭독 1회
- Given `corrected_from: null`·`match: "keyword"` 또는 필드 없음 / Then 종전 화면과 동일(안내 없음)
- Given 안내가 있는 결과에서 커서 2페이지 / Then 안내는 그대로 한 번, 격자만 늘어난다
- Given 영어 표시 언어 / Then "Showing results for “커리어”" / "Search instead for “커리오”?" / "Showing related results for “커리오”"
- Given 개발계(KAN-238 머지 뒤) 실기기 / When "커리오" 검색 / Then 교정 2줄 + 커리어 편. When "이직" 검색 / Then 제목에 '이직' 있는 편이 위, 안내 없음

## 처리 기록

- 2026-10-22 02:16 발행 → 02:48 하이브리드 → **02:52~02:56 PM: 교정 "대신 검색" 안내 2줄 + 관련 결과 안내 1줄로 확정.** 문구는 PM이 준 꼴 그대로.
- 2026-10-22 03시 **FE 코드 반영**(PM "ㄱ" 03:05) — 브랜치 `feat(fe)/search-correction-notice`. mock 기준으로 완료 조건 1~7 통과(jest). 반영 내용:
  - 계약: `exact` 요청 파라미터(true 일 때만 보냄 — 옛 서버에 모르는 키 안 보냄), 응답 `query_used`·`corrected_from`·`match`·`engines`·`items[].matched_by` 파싱, 없으면 종전 동작. 쿼리 키에 `exact` 포함(`exploreKeys.search(query, exact)`).
  - 훅: `exact` 상태(입력·제출·칩·태그 탭 모두 false 리셋), `searchInsteadExact`(exact=true 재조회 + 원문 최근 검색어 저장), `correctedFrom`·`queryUsed`·`isRelatedResult`(placeholder 결과에는 붙이지 않음). 낭독은 안내 문구 + 결과 수, exact 재검색은 한 번 더.
  - 화면(제자리·스택): 격자 `ListHeaderComponent` 로 안내 2종. 둘째 줄 버튼 44pt, 낭독 "‘OO’로 검색".
  - 카피: ko `correctedTo`·`searchInsteadFor`·`searchInsteadA11y`·`relatedResult` — **조사를 받침에 맞춘다**(`shared/i18n/korean-particle.ts` 로/으로·와/과. "‘면접’으로", "‘커리오’와"). en 4종. 분석 `search` 이벤트에 `corrected`·`related` 불리언(검색어 원문 없음).
  - mock(서버 대역): 자모 트라이그램 교정어(태그·주제명·시리즈·제목 토큰 어휘, 임계 0.5) → 교정어로 키워드 1건 이상일 때만 적용, `#`·`exact` 는 교정 없음, `search-related` 시나리오로 관련 결과 응답.
  - **남은 완료 조건**: 개발계 실기기("커리오"·"이직") — BE KAN-238 머지 뒤. 그때까지 pending 유지.
