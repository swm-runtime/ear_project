# 검색이 해시태그도 매칭 · `#태그` 태그 전용 검색 — 서버 구현 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/explore.md` 4.5-2 · 4.5-5 · `spec/api/explore-api.md` 4.1(`content.tags` 행) · 4.5 · `spec/api/content-detail-api.md`(`content.tags` 행) · `backend/domain.md` 5.1 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | BE [KAN-218](https://runtime364.atlassian.net/browse/KAN-218) `tickets/backend/pending/search-hashtag-matching.md` · FE [KAN-219](https://runtime364.atlassian.net/browse/KAN-219) `tickets/frontend/pending/hashtag-tap-to-search.md` |

## 수정 내용

- **`features/explore.md` 4.5-2(검색 대상)** — "제목·설명·저자·주제명"에 **해시태그(`contents.tags`)**를 더한다.
  - 질의 규칙: 트림한 뒤 **앞의 `#` 하나**를 떼고 다시 트림한다. 2자 규칙은 뗀 값에 적용한다. `#`만이나 `#a`는 400 `VALIDATION_FAILED`다.
  - `##태그`는 앞의 `#`만 떼므로 남은 `#`이 검색어에 들어가 매칭되지 않는다. 태그에는 `#`이 없다.
- **4.5-5(매칭·랭킹)**
  - `#` 없는 질의는 종전 4개 필드에 **태그 부분 일치**(ILIKE)를 더한다. 태그 항목 하나라도 맞으면 된다.
  - `#`으로 시작한 질의는 **태그 전용 모드**다. 태그 항목과 **정확히 같은** 콘텐츠만 낸다(NFC + 소문자, 안쪽 공백은 그대로). 정렬은 동점 규칙(제목 유사도 → 직전 확정 월 재생 수 → `published_at`)만 쓴다.
  - 가중 순위는 **제목 > 태그 > 저자 > 주제명 > 설명**이다. 계수 값은 서버가 소유한다(`content.constant.ts` — 16·8·4·2·1).
  - 빈 결과의 `fallback`은 태그 전용 모드에서도 같은 모양이다. `related_topics`는 `#`을 뗀 검색어로 찾는다.
  - 커서는 `#`을 남긴 질의로 지문을 만든다. 같은 말이라도 태그 검색과 부분 일치 검색의 커서는 섞이지 않는다.
- **`explore-api.md` 4.5**
  - `query` 비고에 `#` 규칙을 적는다.
  - 정렬 문장을 "제목 > 태그 > 저자 > 주제명 > 설명"으로 바꾼다.
  - 에러 표의 `VALIDATION_FAILED`에 "`#`을 뗀 뒤 2자 미만"을 더한다.
- **`explore-api.md` 4.1 · `content-detail-api.md` `content.tags` 행** — "탭 동작·필터 연결은 없다" 문장을 지운다. 탭 동작은 FE KAN-219가 정한다.
- **`domain.md` 5.1 인덱스** — **태그 인덱스는 만들지 않는다**(2026-10-16 결정).
  - 태그는 콘텐츠당 4개 이하다. 운영 콘텐츠는 71편이고 그중 태그가 있는 것이 56편이다.
  - jsonb 배열 펼침 비교라 순차 탐색 비용이 무시할 만하다. 2자 질의 순차 탐색(4.5-5)과 같은 논리다.
  - 콘텐츠가 수천 편으로 늘면 정규화 컬럼 + `gin_trgm_ops`(부분 일치)와 jsonb 포함 인덱스(정확 일치)를 다시 본다.
  - 저장된 태그는 정규화하지 않고 비교한다. 적재 검증(`CONTENT_TAG_PATTERN`)이 완성형 한글·ASCII 영숫자·공백만 받아 NFC가 보장되고, 그 범위에서는 SQL `lower()`와 앱의 소문자 변환이 같다. 태그 문자 범위를 넓히면 이 가정을 다시 본다.
- **`domain.md` 5.7 `search_query_logs`** — 정규화 질의에 `#`을 **남긴다**(태그 검색 비율 집계용). 태그 검색은 `#` + 검색어로 맞춘다(`#  뱅크런` → `#뱅크런`). 컬럼은 추가하지 않는다.

## 완료 조건

- Given `explore.md`·`explore-api.md` / Then 검색 대상에 해시태그가, 랭킹에 "제목 > 태그 > 저자 > 주제명 > 설명"과 `#` 규칙이 있다
- Given `domain.md` 5.1 / Then 태그 인덱스를 두지 않는다는 결정과 다시 볼 조건이 있다
- Given `explore-api.md` 4.1 · `content-detail-api.md` / Then "탭 동작 없음" 문장이 없다

## 처리 기록

- 2026-10-16 발행(서버 구현 PR과 함께). 반영 전.
