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
| 반영 날짜 | 2026-10-22 (`fix(be)/search-hybrid-determinism`) |
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

## 원인 분석(확정)

가설("동점 tie-break가 레거시와 갈린다")이 아니었다. **한 시점의 정렬은 두 경로가 같다**(RRF가 키워드 순위의 단조 함수) — 스위트 단독 실행에서는 통과했고, 실패는 **병렬 CI에서 다른 스위트가 콘텐츠를 넣고 지울 때만** 났다. 문제는 정렬이 아니라 **페이지를 잇는 키셋**이다.

- 하이브리드 키셋은 `(rrf, play_count, published_at, id) < 커서`이고, `rrf = 1/(k + 키워드 엔진 순위)`다. **순위는 행 자기 값이 아니라 그 순간 매칭 집합 안의 위치**라, 페이지 사이에 커서보다 앞에 오는 편이 발행되면 같은 행의 순위가 하나 밀려 `rrf`가 작아진다 → 1쪽 끝 행이 2쪽 키셋 조건에 다시 걸린다(**중복** — 증상의 "하이브리드가 행 하나를 더 낸다"). 앞쪽 편이 지워지면 순위가 당겨져 행을 건너뛴다(**누락**).
- 종전 키워드 키셋 `(가중 합, 제목 유사도, 재생 수, published_at, id)`는 전부 행 자기 값이라 남의 행이 끼고 빠져도 경계가 그대로다.
- **재현(수정 전 코드, 로컬)**: 질의 벡터 없는 검색(`boom` 스텁 500) limit 2 — ① 1쪽 뒤 맨 앞에 올 편 1건 발행 → 2쪽에 1쪽 끝 편이 다시 나옴(5편 중 6행, 중복 1) ② 1쪽 두 편(커서 편 포함) 삭제 → 3번째 편 누락. 수정 뒤 둘 다 통과.

## 처리 기록

- 2026-10-22 발행.
- **2026-10-22 반영** — 브랜치 `fix(be)/search-hybrid-determinism`(PR → `dev`).
  - `ContentService.findHybridSearchPage`: **질의 벡터가 없고 커서가 RRF 순서가 아니면 종전 키워드 쿼리(`ContentRepository.findSearchPage`)에 그대로 맡긴다** — 결과·순서·시리즈 대표 편 접기(`seriesAnchorsOnly`)·`matchSeriesTitle`이 구조적으로 같다. 행은 `matchedBy: ['keyword']`, 커서 위치는 종전 키워드 정렬 키 다섯(`order: 'keyword'`)으로 옮긴다. `keywordTotal`(건수) → `keywordMatched`(불리언 — 교정 판정이 쓰는 것은 0 여부뿐이고, 위임 경로에서 건수를 세려면 같은 조건을 한 번 더 스캔해야 한다).
  - 커서: 키워드 순서 하이브리드 커서 `v: 3`(`k` 가중 합 · `w` 제목 유사도, `s`는 반드시 거짓 — 참이면 `EXPLORE_CURSOR_INVALID`). RRF 커서 `v: 2`는 그대로. 버전이 달라 서로 섞여 해석되지 않는다.
  - 의미 엔진을 쓴 검색의 RRF 키셋은 그대로 두고 발행·삭제 흔들림을 감수한다 — 계약 문서 한 줄은 `changes/pending/search-hybrid-cursor-keyword-order.md`로 올렸다(통합 때 반영).
  - 하위 호환: 배포 전에 발급된 `v: 2` + `s: false` 커서는 종전처럼 RRF 쿼리(빈 의미 CTE)로 잇는다 — 오류 없음. 응답 모양·`engines: ["keyword"]` 그대로.
  - e2e: DB 전체에 흔한 말('e2e'·'이') 대조 복원 — 두 경로를 끝까지 넘겨 내 편끼리 순서 일치 + 한 스냅숏 안에서 DB 전체 목록 완전 일치, 페이지 사이 발행·삭제 시 중복·누락 없음(HTTP).
