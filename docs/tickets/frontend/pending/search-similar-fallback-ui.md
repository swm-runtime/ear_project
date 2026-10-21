# [FE] 검색 유사 결과 표시 — `match: "similar"` 때 "‘OO’와 비슷한 결과예요" 안내 줄

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/explore/api/explore.dto.ts`·`explore.types.ts`·`explore.mock.ts`(`match`) · `hooks/useExploreSearchScreen.ts` · `screens/ExploreSearchScreen.tsx`·`.ios.tsx`(제자리·스택 두 갈래) · `explore.copy.ts` ko·en + `src/app/__snapshots__/copy-ko.snapshot.test.ts.snap` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 02:16 "A ㄱㄱ" |
| 담당 | 프론트엔드 |
| Jira | [KAN-239](https://runtime364.atlassian.net/browse/KAN-239) · 선행 BE [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — BE와 같은 날. 작업이 작아 BE 머지 당일 반영 가능. BE가 밀리면 사유를 처리 기록에 적는다) |
| 선행 | BE [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) `tickets/backend/pending/search-similar-fallback.md` — 응답 `match` 필드(Jira is blocked by). mock으로 화면·카피는 먼저 만들 수 있다 |
| 근거 문서 | `changes/pending/search-similar-fallback.md` 1·3·4절 · `spec/uiux/explore-uiux.md` 4.5 |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

BE가 부분 일치 0건일 때 자모 유사 결과를 `match: "similar"`로 내려준다(KAN-238). 앱이 그대로 그리면 오타 질의("커리오")에 결과가 **맞는 것처럼** 보인다. 왜 이 결과인지 한 줄은 알려야 하고, 그 한 줄이 이 티켓의 전부다. 교정어 되묻기("‘커리어’로 검색할까요?")는 없다 — 서버가 교정어를 만들지 않는다.

## 무엇을 한다

1. **계약** — `GET /explore/search` 응답 `match: "exact" | "similar"` 파싱(DTO·타입). 필드가 없으면 `"exact"`(옛 서버 호환). mock에 유사 응답 1종 추가.
2. **상태** — `useExploreSearchScreen`에 `isSimilarResult` 하나. 최신 질의의 응답만 반영하는 기존 규칙(응답 순서 뒤바뀜 무시) 그대로 — 안내 줄도 그 응답을 따른다. 커서 2페이지 이상은 첫 응답의 값을 유지한다(서버가 모드를 커서에 고정).
3. **화면** — `match === "similar"`이면 **결과 격자 첫 행 위에 안내 한 줄**: ko **"‘<검색어>’와 비슷한 결과예요"**(입력 검색어를 그대로 되비춤 — `noResult`와 같은 규칙, `#` 질의는 폴백이 없어 올 일이 없다), en **"Showing similar results for “<query>”"**. 보조 글자색, 격자와 같은 좌우 여백. 격자·타일·⋯ 시트·커서 로딩·스켈레톤은 변경 없음. 제자리 검색(iOS 26·Android)·스택 검색(iOS 26 미만) 두 갈래 모두.
4. **접근성** — 결과 도착 때 안내 줄을 **한 번** 낭독(`AccessibilityInfo.announceForAccessibility` — 커서로 격자가 늘어날 때 다시 읽지 않는다).
5. **카피** — `explore.copy.ts` `search.similarResult: (query) => …` ko·en, ko 스냅샷 `-u`. `explore-uiux.md` 4.5 개정은 changes 문서 4절이 맡는다(이 PR에서 함께 반영).
6. **최근 검색어** 저장 규칙 변경 없음(유사 결과 탭도 "검색이 행동으로 이어진 때").

## 범위 밖

- 유사 매칭 자체·임계값(BE) · 교정어 제안 UI · 초성 검색

## 완료 조건

- Given mock 응답 `match: "similar"`, 검색어 "커리오" / When 결과 표시 / Then 격자 위에 "‘커리오’와 비슷한 결과예요", 낭독 1회, 격자는 일반 결과와 같은 타일
- Given `match: "exact"` 또는 필드 없음 / Then 종전 화면과 픽셀 단위 동일(안내 줄 없음)
- Given 유사 결과에서 커서 2페이지 / Then 안내 줄은 그대로 한 번, 격자만 늘어난다
- Given 영어 표시 언어 / Then "Showing similar results for “커리오”"
- Given 개발계(KAN-238 머지 뒤) 실기기 / When "커리오" 검색 / Then 안내 줄 + "커리어" 편이 보인다

## 처리 기록

- 2026-10-22 발행(PM 결정 02:16).
