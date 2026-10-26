# 검색 로그 탭 — 의미 검색 지표(살림 · 의미 검색으로 찾은 검색어 · 교정 목록)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.21(응답 `daily[].rescued` · `semantic[]` · `corrections[]`) · `features/backend-monitoring.md`(검색 로그 탭 행) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-27 |
| 시작 날짜 | 2026-10-27 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/search-semantic-insights` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

하이브리드 검색(KAN-238, 2026-10-22)이 잘 되는지 볼 화면이 없었다 — 서버는 `totals.keyword_misses`·`rescued`·`semantic_unavailable`·`corrected`·`correction_rejected`를 이미 셌지만 화면이 하나도 그리지 않았다. 결정(2026-10-27 박준현): 결과 없음 축에 의미 검색 몫을 얹고, 의미 검색이 무엇을 찾아 줬는지(예: "아리스토텔레스 → 철학") 사례로 보인다.

## 고칠 내용

1. `admin-api.md` 4.21 응답:
   - `totals.hybrid_searches` · `totals.hybrid_misses`(2026-10-27 정정) — 하이브리드 기록이 있는 검색(`keyword_count` 있음, 2026-10-22 뒤)과 그중 결과 없음. `keyword_misses`·`rescued`·`semantic_unavailable` 비율의 **분모**다 — 전체 `searches`로 나누면 옛 행만큼 작게 나온다(첫 화면이 "결과 없음 26.2% / 키워드만이었다면 6.5%"로 거꾸로 보였다). 화면은 "의미 검색 도입 뒤 N회: 키워드만이면 X% → 실제 Y%"로 같은 분모끼리 비교한다.
   - `daily[].rescued` — 그날 키워드 0건인데 결과가 있던 검색(의미 엔진이 살렸다).
   - `semantic[]` — **의미 검색만으로 결과가 나온 질의**(`keyword_count = 0`이고 `result_count > 0`)를 실제 쓴 질의(`coalesce(query_used, query)`)로 묶는다. 행: `query` · `searches` · `clicked`(10분 안 재생·담기 — 다른 표와 같은 정의) · `contents[]`(가장 최근 검색의 첫 페이지 앞 3편: `content_id` · `title` · `topics`(그 콘텐츠의 주제 이름) — 회수·만료 편도 싣는다) · `last_searched_at`. 검색 수 내림차순 50개. 키워드 0건이라 결과가 전부 의미 엔진 몫이다. 키워드·의미가 섞인 검색은 어느 편이 의미 몫인지 기록이 없어 넣지 않는다.
   - `corrections[]` — 교정된 입력(`query_used <> query`)을 (입력, 교정어)로 묶는다. 행: `query` · `query_used` · `searches` · `rejected`(교정 직후 10분 안 같은 입력의 원문 재검색 — `totals.correction_rejected`와 같은 판정) · `clicked` · `last_searched_at`. 50개.
2. `backend-monitoring.md` 검색 로그 탭 행 — "결과 없음 비율 카드에 '키워드만이었다면 X%' · 카드 '의미 검색이 살림'(살린 수 · 키워드 0건 수 · AI 서버 응답 실패 %(종전 이름 '의미 엔진 결손') — 5% 이상 빨강) · 일별 막대에 하늘색 '살림' 칸 · 표 '의미 검색으로 찾은 검색어'(검색어 → 주제 · 나온 콘텐츠 앞 3편 · 검색 · 클릭 — 없음은 주황) · 표 '오타 교정'(입력 → 교정 · 원문으로 다시). 옛 서버(필드 없음)는 두 표를 숨긴다" 추가.

## 완료 조건

- Given 위 두 문서 / Then `semantic`·`corrections`·`daily[].rescued`의 정의와 화면 구성이 적혀 있고 `SearchQueryLogRepository.summarize`와 같다

## 처리 기록

- 2026-10-27 발행(박준현).
