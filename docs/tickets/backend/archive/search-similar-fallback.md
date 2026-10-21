# [BE] 검색 0건 때 자모 트라이그램 유사 결과 폴백 — `hangul_to_jamo`·`search_jamo` 인덱스·응답 `match`·로그 `similar_count`

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/content/repositories/content.repository.ts`(검색 쿼리) · `modules/explore/explore.orchestrator.ts` `search`·`explore.cursor.ts`(모드) · `modules/content/services/search-query-log.service.ts`·엔티티 · 마이그레이션(함수·생성 컬럼·GIN 인덱스·로그 컬럼) · `search-query-log-admin.controller.ts`(요약) |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 02:16 "A ㄱㄱ" |
| 담당 | 백엔드 |
| Jira | [KAN-238](https://runtime364.atlassian.net/browse/KAN-238) · 뒤따르는 FE [KAN-239](https://runtime364.atlassian.net/browse/KAN-239)(blocks) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일) |
| 선행 | 없음. 문서 개정 기록 `changes/pending/search-similar-fallback.md`를 같은 PR에서 반영한다 |
| 근거 문서 | `changes/pending/search-similar-fallback.md`(개정 내용 전부) · `features/explore.md` 4.5-5 · `backend/domain.md` 5.1·5.7 |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

검색은 `ILIKE` 부분 일치다. 오타·받침 오류("커리오"→"커리어", "면졉"→"면접")는 0건으로 끝나고, 한글은 자모 하나가 틀리면 음절이 통째로 바뀌어 **음절 단위 트라이그램으로는 유사도가 안 나온다.** PM이 2026-10-22에 **방안 A — 자모 단위 `pg_trgm` 유사 결과 폴백**을 택했다(B 임베딩 의미 검색은 로그 보고 뒤로). 교정어를 만들어 되묻지 않는다 — 부분 일치가 0건일 때만 글자가 비슷한 결과를 그대로 내고 응답에 `match: "similar"`를 붙인다. 화면 안내는 FE KAN-239.

## 무엇을 한다 (순서대로)

1. **마이그레이션 1 — 함수·컬럼·인덱스**
   - `CREATE FUNCTION hangul_to_jamo(text) RETURNS text IMMUTABLE` — U+AC00~U+D7A3 음절을 초·중·종성으로 풀고(겹모음 ㅘ=ㅗ+ㅏ·겹받침 ㄺ=ㄹ+ㄱ는 **치는 순서대로** — `search-text.util.ts`의 로그 묶음용 분해와 같은 규칙), 그 외 문자는 그대로. plpgsql 또는 SQL 함수, 반드시 IMMUTABLE(생성 컬럼·인덱스 조건).
   - `ALTER TABLE contents ADD COLUMN search_jamo text GENERATED ALWAYS AS (hangul_to_jamo(lower(title) || ' ' || coalesce(tags::text, ''))) STORED`.
   - `CREATE INDEX idx_contents_search_jamo_trgm ON contents USING GIN (search_jamo gin_trgm_ops)`.
   - `ALTER TABLE search_query_logs ADD COLUMN similar_count smallint NULL`.
   - 운영 콘텐츠 규모(수십~수백 편)라 STORED 생성 컬럼 추가는 즉시 끝난다. `domain.md` 5.1·5.7에 같은 정의를 적는다(changes 문서 5·6절).
2. **검색 쿼리 — 유사 모드** (`content.repository.ts`)
   - 조건: 질의가 **태그 전용(`#`)이 아니고**, 부분 일치 **첫 페이지가 0건**일 때만.
   - 매칭: `word_similarity(hangul_to_jamo(:searchQuery), content.search_jamo) >= :threshold` OR 주제명(`hangul_to_jamo(matched_topic.name)`) OR 시리즈 제목(`SERIES_EXPLORE_CARDS_ENABLED` 켜짐일 때 — 부분 일치와 같은 조건). 주제·시리즈는 행이 적어 인덱스 없이 함수 호출. 설명·저자는 대상이 아니다.
   - 점수: 위 유사도의 최대값(`double precision` — 커서 재비교 타입을 기존 `search_title_similarity`와 같게). 동점: 인기(직전 확정 구간) → `published_at` DESC → id. 커서 모양은 기존 `SearchRow`를 재사용하되 **모드 플래그**를 넣어 다음 페이지가 같은 모드로 이어지고, 모드가 다르면 `EXPLORE_CURSOR_INVALID`.
   - 임계값은 상수(`content.constant.ts`, 시작 **0.5**)로 두고 계약에 적지 않는다 — 가중 계수와 같은 소유 원칙. 로그(`similar_count`·반응)로 조정한다.
   - 질의 정규화는 종전(NFC·소문자·트림)을 거친 뒤 **SQL 함수로** 자모를 푼다 — TS 쪽에 두 번째 분해 구현을 만들지 않는다(양쪽 규칙이 갈라지는 것을 막는다).
3. **오케스트레이터·응답** (`explore.orchestrator.ts` `search`)
   - 부분 일치 0건 → 유사 모드 1회 재조회 → 결과 있으면 `items` + `match: "similar"`, `fallback: null`. 유사도 0건이면 종전 빈 결과(`fallback`) + `match: "exact"`.
   - **모든 200 응답에 `match`를 싣는다**(`items` 있으면 `"exact"`). 덧붙이는 필드라 옛 앱은 무시한다.
   - 회수·시장 제외·시리즈 카드 접기는 부분 일치와 같은 단계에서 같은 규칙.
4. **로그** (`search-query-log.service.ts`)
   - `result_count`는 **부분 일치 첫 페이지 건수 그대로**(0) — 미스율 정의 불변. `similar_count`에 유사 모드 첫 페이지 건수(폴백이 돌지 않았으면 NULL). 묶음 덮어쓰기 때 함께 덮는다. 커서 페이지는 종전처럼 기록하지 않는다.
   - 관리자 요약 4.21: `totals.rescued`(misses 중 `similar_count > 0`), `missed[].similar_count`.
5. **테스트** — 함수 단위(겹모음·겹받침·비한글 통과), 레포 쿼리(오타 질의가 유사 모드에서 잡힘·임계값 아래는 제외·`#` 질의는 폴백 없음), 커서 모드 왕복, 로그 두 컬럼.

## 범위 밖

- 초성 검색(별도 초성 컬럼) · 임베딩 의미 검색(방안 B — 로그의 0건 질의가 정상 단어로 남을 때) · 설명·저자 유사 매칭 · 교정어 제안 UI
- 화면 안내 줄(FE KAN-239)

## 완료 조건

- Given 제목 "커리어를 바꾸는 법" 발행 콘텐츠 / When `GET /explore/search?query=커리오` / Then `items`에 그 편이 있고 `match: "similar"`, `fallback: null`, 로그 행 `result_count 0`·`similar_count ≥ 1`
- Given 부분 일치 결과가 있는 질의 / When 검색 / Then 결과·순서가 종전과 같고 `match: "exact"`, `similar_count NULL`
- Given `query=#커리오` / Then 유사 폴백 없이 `items: []` + `fallback`, `match: "exact"`
- Given 유사 결과 `next_cursor` / When 커서 조회 / Then 같은 모드의 다음 페이지. 부분 일치 커서를 유사 모드 질의에 섞으면 `EXPLORE_CURSOR_INVALID`
- Given `GET /admin/search-query-logs/summary` / Then `totals.rescued`·`missed[].similar_count`가 있다
- Given 마이그레이션 적용 / Then `\d contents`에 `search_jamo`(generated)·`idx_contents_search_jamo_trgm`, `search_query_logs.similar_count`가 있고 `domain.md` 5.1·5.7과 같다

## 처리 기록

- 2026-10-22 발행(PM 결정 02:16). 미스율 실제 값은 미확인 — 관리자 요약 4.21을 보고 임계값을 정하는 것이 맞으나, 도입 자체는 PM 결정으로 확정.
