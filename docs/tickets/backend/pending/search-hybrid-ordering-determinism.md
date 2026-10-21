# [BE] 하이브리드(질의 벡터 없음) 검색이 레거시 키워드와 페이지 순서가 갈린다 — tie-break 결정성

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/content/services/content.service.ts`(`findHybridSearchPage`) · 회귀 테스트 `backend/test/search-correction-hybrid.e2e-spec.ts` |
| 요청 파트 | 백엔드(검색) |
| 요청자 | 이주호(PM) — 시리즈 카테고리(KAN 시리즈 앨범화) 통합 중 CI에서 발견 |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — 3일 안. 관리자 우회가 있어 즉시는 아니나 백엔드 PR 게이트를 매번 막는다) |
| 선행 | 없음 |
| Jira | KAN-242 (라벨 `be`) |
| 발견 시점 | 2026-10-22 시리즈 카테고리 BE PR #1828 CI. 재실행 2회 모두 같은 지점 실패. 변경(series-detail)은 search와 무관해 PR은 관리자 머지로 우회 |
| 중요도 | **Medium** |

## 증상

`search-correction-hybrid.e2e-spec.ts:856` — "하위 호환 — 의미 엔진 없고 교정 없으면 종전 키워드 결과·순서 그대로 › 로컬 DB 전체에 흔한 말: 하이브리드(질의 벡터 없음)와 종전 키워드가 페이지를 넘겨도 같은 순서다"가 **dev에서 꾸준히 실패**한다.

```
expect(hybridIds).toEqual(legacyIds)   // :856
- Expected  - 0
+ Received  + 1   (하이브리드가 맨 앞에 행 하나를 더 낸다)
```

## 원인(가설)

`ContentService.findHybridSearchPage`에 `queryVector = null`이면 의미 엔진이 없는 상태 — 이때 하이브리드는 **레거시 키워드 결과·순서로 그대로 degrade** 되어야 한다(테스트가 보장하려는 불변식). 그런데 "로컬 DB 전체에 흔한 말"처럼 **거의 모든 행이 동점**일 때, RRF 커서의 tie-break가 레거시 키워드 커서(`score · title_similarity · play_count · published_at · id`)와 갈려 페이지 경계에서 한 행이 더 들어온다. 정렬·커서 tie-break의 결정성 문제로 보인다. 벡터가 있을 때의 RRF 정렬이 아니라, **벡터가 없을 때 레거시와 바이트 단위로 같은 순서를 내는지**가 핵심이다.

## 영향

검색팀 코드(KAN-238/239 — 커밋 `15d82228 feat(search): add correction and hybrid search` · `03cbde43 fix(search): improve typo correction picking`). 이 테스트 하나가 **백엔드를 건드리는 모든 PR의 필수 체크 "검증(lint·build·유닛·e2e)"를 빨갛게** 만들어, search와 무관한 PR도 막는다. FE 전용 PR은 백엔드 e2e가 경로 필터로 안 돌아 영향 없다. 당분간은 무관한 백엔드 PR을 관리자 머지로 우회해야 한다(세션 기억 `flaky-search-hybrid-e2e`).

## 완료 조건 (G/W/T)

- **Given** 의미 엔진/질의 벡터가 없는 상태(`queryVector = null`) · **When** "로컬 DB 전체에 흔한 말"로 하이브리드·레거시 키워드 페이지를 끝까지 넘긴다 · **Then** 두 결과의 content id 순서가 완전히 같다(`hybridIds == legacyIds`) — 커서 tie-break가 결정적이다.
- **Given** 이 수정 · **When** 백엔드 PR CI를 돌린다 · **Then** `search-correction-hybrid.e2e-spec.ts`가 재실행·관리자 우회 없이 통과하고 "검증"이 초록이다.
