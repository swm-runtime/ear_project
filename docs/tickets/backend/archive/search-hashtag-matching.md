# [BE] 검색이 콘텐츠 해시태그(`contents.tags`)도 매칭한다 — `#태그` 질의·랭킹·인덱스

| 항목 | 값 |
|---|---|
| 대상 | `GET /explore/search`(매칭 대상·질의 규칙·랭킹·`fallback`) · `contents.tags` 인덱스(`domain.md` 5.1) · `search_query_logs`(5.7) · `features/explore.md` 4.5-2·4.5-5 · `spec/api/explore-api.md` 4.1·4.5 · `content-detail-api.md` `content.tags` 행 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-218](https://runtime364.atlassian.net/browse/KAN-218) |
| 발행 날짜 | 2026-10-16 |
| 시작 날짜 | 2026-10-16 |
| 기한 | 2026-10-19 (Medium — 3일 안) |
| 선행 | 없음. 후행: FE `hashtag-tap-to-search.md`([KAN-219](https://runtime364.atlassian.net/browse/KAN-219)) — FE는 mock으로 선행 개발 가능 |
| 근거 문서 | `features/explore.md` 4.5-2(검색 대상)·4.5-5(매칭·랭킹) · `spec/api/explore-api.md` 4.5 · `domain.md` 5.1 `contents.tags`·5.7 `search_query_logs` · BE `archive/content-hashtags-enrichment-v3.md`(KAN-162) |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-16) |

## 배경

콘텐츠마다 화면 해시태그 `contents.tags`(2~4개, KAN-162)가 붙어 있지만 검색(`GET /explore/search`)의 매칭 대상은 **제목·설명·저자·주제명 4필드**뿐이다(`explore.md` 4.5-2). 카드에 `#뱅크런`이 보여도 검색창에 "뱅크런"을 치면 제목·설명에 그 말이 없으면 안 나온다. PM(이주호) 요청 2026-10-16: **해시태그로 검색할 수 있게 한다.** FE 쪽 태그 탭 → 검색 실행은 별도 FE 티켓(KAN-219, 이 티켓이 선행).

## 요청 내용

1. **검색 대상에 `tags`를 더한다** — 제목·설명·저자·주제명 + 해시태그.
2. **질의 규칙** — 트림 뒤 **앞의 `#` 하나**를 떼고 검색한다.
   - `#`으로 시작한 질의는 **태그 전용 모드**: 태그 항목과 **정확 일치**(NFC 정규화 + 소문자 통일, 안쪽 공백은 그대로)만 결과로 낸다.
   - `#` 없는 질의는 종전 4필드 + 태그 **부분 일치**(pg_trgm).
   - 2자 규칙(4.5-2)은 `#`을 뗀 뒤 적용한다 — `#`만 / `#a`는 `VALIDATION_FAILED`(400). 클라이언트도 같은 기준으로 요청을 보내지 않는다(KAN-219).
3. **랭킹** — 가중 순위에 태그를 넣는다: **제목 > 태그 > 저자 > 주제명 > 설명**. 태그는 내용을 요약해 붙인 값이라 저자보다 관련도 신호가 강하다. 계수 값은 종전대로 서버 소유(문서에 박지 않는다). 태그 전용 모드는 매칭 자체가 정확 일치라 동점 규칙(제목 유사도 → 인기 → `published_at`)만 쓴다.
4. **인덱스** — `contents.tags`는 jsonb다. 태그 전용 모드는 jsonb 포함 연산(소문자 정규화가 필요하면 표현식 인덱스 또는 정규화 컬럼), 부분 일치는 `array_to_string` 표현식 + `gin_trgm_ops`. 어느 쪽을 쓰든 **정의는 `domain.md` 5.1에 적는다** — 안 만들기로 해도 "초기 풀 규모라 생략" 결정을 적는다(4.5-5의 2자 질의 순차 탐색과 같은 논리).
5. **빈 결과 `fallback`** — 태그 전용 모드도 같은 응답 모양. `related_topics`는 `#`을 뗀 질의로 찾는다.
6. **`search_query_logs`**(5.7) — 정규화 질의에 `#`을 **남겨** 태그 검색 비율을 나중에 셀 수 있게 한다. 컬럼 추가 없음.
7. **문서** — `features/explore.md` 4.5-2(검색 대상에 해시태그)·4.5-5(랭킹 순위·`#` 규칙), `spec/api/explore-api.md` 4.5(`query` 비고·정렬 문장·에러 표) + 4.1 `content.tags` 행의 "탭 동작·필터 연결은 없다" 삭제, `content-detail-api.md` 같은 행("탭 동작은 없다" 삭제 — 탭은 FE 티켓이 정한다), `domain.md` 5.1 인덱스. 개발 중이면 `changes/pending/`에 기록하고 통합 시 반영.

## 완료 조건

- Given 태그 `뱅크런`이 있고 제목·설명에 그 말이 없는 콘텐츠 / When `query=뱅크런` / Then 결과에 나온다
- Given 같은 콘텐츠 / When `query=#뱅크런` · `#뱅크런 `(뒤 공백) · 영문 태그의 대소문자 다른 입력 / Then 정확 일치 태그만 나오고, 제목에 "뱅크런"만 있는 콘텐츠는 안 나온다
- Given `query=#` 또는 `#a` / When 호출 / Then `VALIDATION_FAILED` 400
- Given 제목 매칭 콘텐츠 A · 태그 매칭 콘텐츠 B · 저자 매칭 콘텐츠 C / When 같은 질의 / Then 순서 A → B → C
- Given 태그 전용 질의에 결과 없음 / When 호출 / Then `fallback.related_topics`·`popular_items`가 내려온다
- Given 첫 페이지 태그 검색 / Then `search_query_logs.query`에 `#`이 남아 있다
- Given 위 문서 / Then 태그 매칭·랭킹·인덱스 결정이 기록돼 있고 "탭 동작 없음" 문장이 없다

## 처리 기록

- 2026-10-16 발행(마크다운 + Jira KAN-218). 후행 FE KAN-219에 `blocks` 링크.
- 2026-10-16 구현 — PR `feat(be)/search-hashtag-matching`(dev 대상).
  - 질의 해석 `parseSearchQuery`(`common/utils/search-text.util.ts`): 앞의 `#` 하나를 떼고 다시 트림. 2자 규칙은 뗀 값에 적용(`#`·`#a` → 400).
  - 부분 일치: 종전 4필드 + 태그(`jsonb_array_elements_text` + `ILIKE`). 저장 태그는 적재 검증(`CONTENT_TAG_PATTERN`)이 완성형·ASCII만 받아 NFC가 보장돼 정규화하지 않는다. 가중 16·8·4·2·1(제목 > 태그 > 저자 > 주제명 > 설명).
  - 태그 전용(`#태그`): 태그 정확 일치(`lower(tag) =`)만, 1순위 상수(`0::integer` — 맨 리터럴은 ORDER BY 열 번호로 읽혀 500이 났다)·동점 규칙만.
  - 커서 지문·검색 로그는 `#` + 검색어(`#  뱅크런` → `#뱅크런`), 매칭·관련 주제는 뗀 값. 다른 모드의 커서는 400 `EXPLORE_CURSOR_INVALID`.
  - 인덱스는 두지 않는다(운영 71편·태그 4개 이하) — 결정과 다시 볼 조건을 `changes/archive/search-hashtag-matching.md`에 적었다.
  - 리뷰 반영(필수 0 · 권장 3): 태그 전용 커서 e2e, 불필요한 `normalize` 제거·근거 주석, 로그 정규형.
  - 테스트: 단위 1860 · e2e 133 통과(새 `search-hashtag.e2e-spec.ts` 6건 — 태그 전용 커서 이어 읽기·다른 모드 커서 400 포함 — 태그 부분 일치·순서 A→B→C·`#` 정확 일치(뒤 공백·대소문자)·`#`/`#a` 400·빈 결과 대체·로그 `#`). 태그 가중을 저자 아래(3)로 내리면 순서 e2e가 실패함을 확인.
- 2026-10-16 완료 — 반영 날짜 2026-10-16. PR #1616 dev 머지·CI(lint·build·단위·e2e) 통과, 개발계 배포 확인(배포 성공·컨테이너에 태그 매칭 코드·에러 0건). 완료 조건 6개(코드)는 e2e `search-hashtag.e2e-spec.ts`로, 문서 조건은 #1619(changes 반영 — `explore.md`·`explore-api.md`·`content-detail-api.md`·`domain.md`)로 충족. 태그 탭 → 검색은 후행 FE KAN-219. `archive/`로 이동, Jira 완료.
