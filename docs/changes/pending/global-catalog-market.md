# [문서] 글로벌 2 — `contents.market/language` · `topics.market` · `notices.market`와 콘텐츠 응답의 `language`

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 5.1·4.1·9.2 · `docs/spec/api/explore-api.md` · `library-api.md` · `player-api.md` · `onboarding-api.md` 4.2·4.5 · `settings-api.md` 4.4·4.5(공지) · `features/explore.md`·`library.md`·`player.md`(콘텐츠 객체 필드) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-14 |
| 발견 시점 | KAN-188(글로벌 2 — 카탈로그 격리) 구현. 확정 계약은 `docs/spec/api/global-api.md` 4.5·4.7·4.8·8장이며 이 요청은 그 내용을 원 문서에 옮겨 적는 것 |
| 관련 | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) `tickets/backend/pending/global-catalog-isolation.md` · 에픽 KAN-186 |

## 수정 내용

### `domain.md` 5.1 `contents`

```
  market                    enum            kr | global   DEFAULT 'kr'   ★노출 쿼리 전부가 users.market과 대조 — 시장이 다른 콘텐츠는 어떤 응답에도 나오지 않는다 (global-api.md 4.7, 2026-10-14)
  language                  varchar(8)      DEFAULT 'ko'  콘텐츠 언어(ko | en). 표시용으로 응답에 싣는다. 필터는 market이 한다

idx_contents_market_status_published_at (market, status, published_at)
```

- 설명 항목: **노출 조건은 "published + 라이선스 유효 + `market = users.market`" 세 조건을 한 곳(`content.visibility.ts` `CONTENT_SCOPE_CONDITION`)에서만 조립한다.** 탐색·검색·인기·최신·드립 후보·온보딩 추천·라이브러리 목록·복원·상세·재생·대본·담기가 전부 이 하나를 쓴다. 격리 누락은 데이터 유출로 본다(`global-api.md` 7장). 기존 행은 전부 `kr`/`ko`.
- 사용자 시장은 요청마다 `users`를 읽지 않고 **access token 클레임 `market`** 으로 전달한다(가입 시 1회 정해져 불변이므로). 클레임이 없는 옛 토큰은 `kr`.

### `domain.md` 4.1 `topics`

```
  market                    enum            kr | global   DEFAULT 'kr'   ★주제는 번역 테이블이 아니라 시장별 별도 행 (global-api.md 4.5)

idx_topics_market_is_visible_display_order (market, is_visible, display_order)
```

- 온보딩 주제 목록·탐색 칩·검색 fallback 관련 주제는 사용자 시장의 노출 주제만. 운영 배치(0건 자동 숨김)만 모든 시장을 본다.
- 공개 주제(`GET /public/topics`, 랜딩)는 KR 고정 — 영어 랜딩은 FE 글로벌 6 뒤 별도.

### `domain.md` 9.2 `notices`

```
  market                    enum            kr | global   DEFAULT 'kr'   공지는 시장별로 따로 쓴다 (global-api.md 4.8)
```

### 콘텐츠 객체를 담는 응답 — `language` 추가

`explore-api.md`(피드·목록·인기·검색 항목) · `library-api.md`(목록·복원 대상 `content`) · `player-api.md` 4.1(발급 응답 `content`) · `onboarding-api.md` 4.5(추천 항목) · `content-detail`(상세) · 드립 별점 팝업 항목 · 공개 샘플 · 관리자 콘텐츠 목록의 콘텐츠 객체에 `language`(`ko` | `en`) 추가. **표시 전용** — 클라이언트는 이 값으로 목록을 거르지 않는다(필터는 서버). 기존 필드 변화 없음.

### `settings-api.md` 4.4·4.5 공지

목록·상세가 사용자 시장의 공지만 돌려준다. 다른 시장 공지 ID는 404. 필드 변화 없음.

### `explore-api.md`·`library-api.md`·`player-api.md`·`content-detail` 공통

**다른 시장 콘텐츠 ID로 직접 접근하면 404 `CONTENT_NOT_FOUND`** — 회수·만료와 같은 코드다(존재 여부를 구분해 알려주지 않는다).

## 완료 조건

- Given `domain.md` 5.1·4.1·9.2 / Then `market`(·`language`) 컬럼과 인덱스, 노출 조건 3항 조립 규칙이 적혀 있다
- Given 콘텐츠 객체를 담는 각 API 문서 / Then `language` 필드와 "표시 전용" 규칙이 있다
- Given 공지 API / Then 시장 필터·404 규칙이 있다

## 처리 기록
- 2026-10-14 발행. 코드는 KAN-188 PR에 반영 완료(계약은 `global-api.md`가 먼저 확정).
