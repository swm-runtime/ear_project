# 검색 질의 로그 요약 — 시장 필터 `market`

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-15 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 — KAN-188 남은 일 "검색 로그 시장 축") |
| 반영 대상 | `spec/api/admin-api.md` 4.21 Query 절 · `spec/api/global-api.md` 4.10 어드민 조회 목록 |
| 코드 반영 | PR `feat(be)/search-log-market-filter` |

## 수정 내용

- 4.21 Query에 `market`(선택, `kr` \| `global`)을 추가한다. 검색한 사용자의 시장(`users.market`)으로 거른다. 생략하면 전 시장(종전과 같음), 그 밖의 값은 400 `VALIDATION_FAILED`.
- global-api 4.10 어드민 조회 목록에 "`GET /admin/search-query-logs/summary?market=`"을 더한다.

## 사유

GLOBAL 사용자가 생기면 한국어·영어 질의가 한 순위와 미스율에 섞인다. 4.21의 미스율은 한국어 매칭 방식(`pg_trgm` 부분 일치)을 재검토할지 판단하는 근거라, 그 판단은 `market=kr`로 봐야 한다.

## 완료 조건

- Given `admin-api.md` 4.21 / When Query 절을 읽는다 / Then `market`(선택, 생략 = 전 시장, 그 밖의 값 400)이 적혀 있다
- Given `global-api.md` 4.10 / When 어드민 조회 목록을 읽는다 / Then 검색 로그 시장 필터가 있다
