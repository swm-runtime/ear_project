# [BE] 검색 — 오타 "대신 검색"(자모 교정어) + 키워드·임베딩 의미 하이브리드(RRF, AI 서버 질의 임베딩), 응답 `query_used`·`corrected_from`·`match`·`engines`·`matched_by`, 요청 `exact`

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/content/repositories/content.repository.ts`(검색 쿼리·교정어 어휘 쿼리) · `modules/explore/explore.orchestrator.ts` `search`·`explore.cursor.ts`·검색 DTO(`exact`) · 신규 AI 서버 클라이언트(`POST /embeddings` + 인-프로세스 캐시) · `modules/content/services/search-query-log.service.ts`·엔티티 · 마이그레이션(함수·로그 컬럼) · `search-query-log-admin.controller.ts` · env `AI_SERVER_URL`·`AI_SERVER_INTERNAL_TOKEN` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 02:16 A → 02:48 하이브리드 → 02:52 "오타는 대신 검색, 그리고 의미 유사 검색" → 02:56 문구 확정 |
| 담당 | 백엔드 |
| Jira | [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) · 뒤따르는 FE [KAN-239](https://runtime364.atlassian.net/browse/KAN-239)(blocks) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일. 범위가 발행 뒤 커졌다(폴백→하이브리드+교정). 밀리면 사유를 처리 기록에 적는다) |
| 선행 | 없음(티켓). **사람 손**: 운영·개발계 백엔드 env `AI_SERVER_URL`·`AI_SERVER_INTERNAL_TOKEN`(Secrets Manager `ear/prod/api`·개발계 env) — 상태: 미등록. 백엔드 EC2 → AI 서버 EC2 네트워크(보안 그룹) — 상태: 미확인. 문서 개정 기록 `changes/pending/search-similar-fallback.md`를 같은 PR에서 반영 |
| 근거 문서 | `changes/pending/search-similar-fallback.md`(개정 내용 전부) · `features/explore.md` 4.5-5 · `backend/domain.md` 5.6·5.7 · `ai-server/README.md`(`POST /embeddings`) |
| 중요도 | Medium |
| 상태 | 반영 (2026-10-22 — dev 머지, 운영은 다음 dev→main 릴리스) |

## 왜

검색은 `ILIKE` 부분 일치 하나다. 오타("커리오")는 0건이고, 제목에 그 단어가 없는 편("이직" → '퇴사·연봉 협상')은 영영 안 나온다. PM 결정(2026-10-22):

1. **오타는 "대신 검색"** — 키워드 0건이면 자모 트라이그램으로 교정어 하나를 골라 그 말로 검색하고 `query_used`·`corrected_from`을 내린다. 화면은 "‘커리어’로 대신 검색했어요 / 혹시 ‘커리오’로 검색하고 싶나요?"(FE KAN-239). 뒤 문장 탭 = `exact=true` 재검색.
2. **의미 유사는 하이브리드(항상)** — 매 검색을 키워드 + 임베딩 코사인 두 엔진으로 돌려 RRF로 합산. 질의 임베딩은 AI 서버 `POST /embeddings` — **백엔드가 요청 시점에 AI 서버를 부르는 첫 경로**.

## 무엇을 한다 (순서대로)

1. **마이그레이션** — `CREATE FUNCTION hangul_to_jamo(text) RETURNS text IMMUTABLE`(U+AC00~U+D7A3 → 초·중·종성, 겹모음·겹받침은 치는 순서대로, 그 외 문자 통과) · `search_query_logs`에 `query_used varchar(100)`, `keyword_count smallint`, `engines text[]`. 컬럼·인덱스 신설 없음(교정어 어휘는 질의 시 전수 — 수백 편 규모). `domain.md` 5.1·5.7에 같은 정의(changes 6·7절).
2. **AI 서버 클라이언트** — `POST /embeddings`(`X-Internal-Token`), 입력은 `query_used`(정규화 질의), 응답 `vector`가 `EMBEDDING_MODEL_ID`·1536인지 검증(`dev-stub` 거부). **타임아웃 예산**(제안 400ms — 실측 조정) 초과·오류는 결손으로 처리하고 검색을 계속한다. **인-프로세스 LRU 캐시**(키 = 정규화 질의 + 모델, TTL ≥ 커서 수명 10분, 크기 상한) — 디바운스 타이핑·커서 페이지·교정 재검색이 재호출하지 않게. Redis는 없다 — 인스턴스 1대라 프로세스 캐시로 충분.
3. **하이브리드 쿼리** (`content.repository.ts`) — 공통 필터(발행·시장·`topic_ids`) 뒤 두 CTE: 키워드(종전 매칭·가중 점수로 엔진 내 순위 — 시리즈 제목은 스위치 켜짐일 때), 의미(`embedding <=> :qv` 코사인 ≥ 임계, 상위 K, `model = EMBEDDING_MODEL_ID` AND `content_version` 일치). 질의 벡터 없으면(결손) 의미 CTE 생략. `rrf = Σ 1/(k + rank)`, 동점 인기(직전 확정 구간) → `published_at` DESC → id. 상수(`content.constant.ts`): k=60 · 코사인 임계 · K=50 — 계약에 적지 않는다. 행에 `matched_by`(어느 CTE)·`rrf`(`double precision`).
4. **교정어 쿼리** — 어휘 = 사용자 시장 발행 콘텐츠의 태그 항목(`jsonb_array_elements_text`) ∪ 주제명 ∪ 시리즈 제목(스위치) ∪ 제목 토큰(`regexp_split_to_table` 공백·문장부호, 끝 조사 을/를/이/가/은/는/의/에/로/와/과/도 제거, 2자 이상). `word_similarity(hangul_to_jamo(:q), hangul_to_jamo(term)) ≥ 임계(시작 0.5)` 최대값 1건, 동점은 태그·주제명 우선 → 빈도. 원문과 같은 말(정규화 기준)은 제외. 상수 서버 소유.
5. **오케스트레이터 흐름** (`explore.orchestrator.ts` `search`) — ① 정규화 → `#` 질의는 종전 태그 정확 일치 경로(교정·의미 없음) → ② 하이브리드(원문) → ③ `exact`가 아니고 **키워드 CTE 0건**이면 교정어 탐색; 교정어가 있고 **교정어로 키워드 1건 이상**이면 교정어로 ② 재실행 → 그 결과 + `query_used`=교정어·`corrected_from`=원문. 아니면 원문 결과 그대로(`corrected_from: null`). 응답 최상위 `match: "keyword" | "related"`(첫 페이지에 `matched_by`에 `keyword`가 든 편이 하나라도 있으면 `keyword`; `items` 비면 `keyword`) · `engines` · `items[].matched_by`. 두 엔진 0건·교정어 없음이면 종전 `fallback`. 시리즈 카드 접기·회수·시장 제외는 종전 단계 그대로. **덧붙이는 필드만** — 옛 앱 호환.
6. **요청 DTO** — `exact` boolean 선택(기본 false). `#` 질의에서는 무시.
7. **커서** — `query_used`·`exact`·`(rrf, id)` 키셋·질의 벡터 캐시 키. 응답마다 `query_used`·`corrected_from` 반복. 캐시 미스면 재계산(미세 흔들림 감수 — 문서 명시). `query`·`topic_ids`·`exact` 불일치는 `EXPLORE_CURSOR_INVALID`.
8. **로그** — `query`(입력 정규화, 종전) · `query_used` · `result_count`(하이브리드 첫 페이지, 종전 의미 유지) · `keyword_count` · `engines`. 묶음 덮어쓰기 때 함께 덮는다. `exact=true` 재검색은 **새 행**(교정 거절 측정). 관리자 요약 4.21: `totals.corrected`·`correction_rejected`·`keyword_misses`·`rescued`·`semantic_unavailable`, `missed[]`·`top[]`에 `query_used`·`keyword_count`.
9. **테스트** — 함수 단위(겹모음·겹받침·비한글 통과) · 교정어 선택(태그 우선·조사 제거·임계 아래 없음·원문 동일 제외) · 흐름(키워드 0 → 교정 → 교정어 키워드 ≥1만 적용 / 교정어로도 0이면 원문 결과 / `exact=true`면 교정 없음 / `#`은 종전) · 의미 CTE가 제목 불일치 편을 올림 · AI 서버 결손 시 키워드만 + `engines` · 캐시 히트로 재호출 없음 · 커서 왕복 · 로그 컬럼.
10. **문서** — changes 문서 1~8절을 같은 PR에서 반영하고 `archive/`로.

## 범위 밖

- 초성 검색 · 형태소 어간 매칭 · ANN(HNSW) 인덱스(수천 편 상한까지 전수) · 교정어 복수 제안 · 타일 '관련' 꼬리표(FE, `matched_by`가 근거) · 자모 컬럼·인덱스(어휘가 수만 항목으로 커지면 `search_terms` 뷰로)
- 화면 안내(FE KAN-239) · env·보안 그룹 등록 자체(사람 손 — 선행 행)

## 완료 조건

- Given 제목 "커리어를 바꾸는 법"·태그 "커리어" / When `GET /explore/search?query=커리오` / Then `query_used: "커리어"`, `corrected_from: "커리오"`, `items`에 그 편(`matched_by`에 `keyword`), `match: "keyword"`
- Given 같은 질의 + `exact=true` / Then `corrected_from: null`, `query_used: "커리오"`, 키워드 0 — 의미 결과 있으면 `match: "related"`, 없으면 `items: []` + `fallback`
- Given 교정어 후보가 있으나 그 말로도 키워드 0건 / Then 교정하지 않는다(`corrected_from: null`)
- Given 제목에 '이직'이 없고 대본이 이직을 다루는 편(임베딩 있음) / When `query=이직` / Then 그 편이 `matched_by: ["semantic"]`으로 든다. 제목에 '이직'이 있는 편은 그보다 위
- Given 종전 질의 / Then 종전 결과가 전부 들어 있고(순서는 RRF) `match: "keyword"`, `corrected_from: null`
- Given `query=#커리오` / Then 종전 태그 정확 일치 경로 — 교정·의미 없음, `engines: ["keyword"]`
- Given AI 서버 다운 또는 예산 초과 / When 검색 / Then 200, 키워드 결과, `engines`에 `semantic` 없음, 교정 흐름은 정상 — 5xx·지연 실패 없음
- Given 같은 질의 연타(디바운스)·커서 2페이지 / Then AI 서버 호출 1회(캐시)
- Given 교정된 응답의 `next_cursor` / Then 교정어로 이어진 다음 페이지, `query_used`·`corrected_from` 반복. `exact` 다른 커서는 `EXPLORE_CURSOR_INVALID`
- Given `GET /admin/search-query-logs/summary` / Then `totals.corrected`·`correction_rejected`·`keyword_misses`·`rescued`·`semantic_unavailable`
- Given 마이그레이션 적용 / Then 함수 `hangul_to_jamo`, `search_query_logs.query_used`·`keyword_count`·`engines`가 있고 `domain.md`와 같다

## 처리 기록

- 2026-10-22 02:16 발행(A — 0건 자모 폴백).
- 2026-10-22 02:48 하이브리드(자모·의미를 랭킹 엔진으로) → **02:52~02:56 PM: 오타는 "대신 검색"(교정), 의미는 하이브리드. 문구 확정.** 자모 생성 컬럼·GIN은 걷음(어휘 전수 비교). 기한은 그대로 두고 밀리면 사유를 적는다. 미스율 실제 값은 미확인(요약 4.21) — 임계값·k 조정의 근거로 쓴다.
- **2026-10-22 반영**(BE PR — `feat(be): search correction and semantic hybrid`, 종전 #1804는 닫음). 마이그레이션 `1791300000000-AddSearchCorrectionHybrid`(함수 `hangul_to_jamo` + `search_query_logs.query_used`·`keyword_count`·`engines`), AI 서버 클라이언트 `QueryEmbeddingClient`(400ms 예산·LRU 500·TTL 30분·실패 뒤 30초 쉼), 하이브리드 쿼리(RRF k=60 · 코사인 하한 0.3 · K=50), 교정어 쿼리(자모 `word_similarity` ≥ 0.5), 커서(`v: 2` — 종전 커서는 종전 키워드 경로로 이어 받음), 로그·요약 4.21. 문서 개정 `changes/pending/search-similar-fallback.md` 1~4·6~8절을 같은 PR에서 반영(5절 uiux는 FE KAN-239 몫이라 그 문서는 pending 유지).
  - **의미 엔진은 env·보안 그룹 선행 뒤에야 켜진다** — 운영·개발계 백엔드 env `AI_SERVER_URL`·`AI_SERVER_INTERNAL_TOKEN`(Secrets Manager `ear/prod/api`·개발계) 미등록, 백엔드 EC2 → AI 서버 EC2 보안 그룹 미확인. 그 전까지는 `engines: ["keyword"]`로 키워드 + 교정만 돈다(부팅·검색 영향 없음).
  - 운영 반영은 다음 `dev → main` 릴리스에 함께 나간다. 하위 호환: 응답은 덧붙이는 필드만, `exact` 선택 — 의미 엔진·교정이 없으면 결과·순서가 종전과 같다(e2e로 대조).
