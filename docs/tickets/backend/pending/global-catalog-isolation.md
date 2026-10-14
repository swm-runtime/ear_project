# [BE] 글로벌 2 — 카탈로그 격리: `contents`·`topics`·`notices` 시장 컬럼과 노출 쿼리 필터·e2e

| 항목 | 값 |
|---|---|
| 대상 | `contents.market/language` · `topics.market` · `notices.market` · `content.repository.ts` 가시성 조건 · 탐색·검색·상세·라이브러리·복원·재개·드립 후보·탐험·인기·공지·온보딩 주제·관심 주제 레포지토리 · `content_stats`·`search_query_logs` market 축 · `recommend-eval` |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | [KAN-187](https://runtime364.atlassian.net/browse/KAN-187) `global-market-users.md`(`users.market`) |
| 관련 | [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) 발행 계약(`contents.market` 기록) · [KAN-189](https://runtime364.atlassian.net/browse/KAN-189) 온보딩 · AI [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) 발행 |
| 근거 문서 | **`spec/api/global-api.md` 4.5(필터) · 4.7 · 4.8 · 7장 · 8장 `contents`·`topics`·`notices` 행** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 진행 중 (2026-10-14 구현 PR 올림 — KAN-187 PR 머지 뒤 리베이스·개발계 검증 대기) |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `contents.market`(DEFAULT `kr`) · `contents.language`(DEFAULT `ko`) · `topics.market` · `notices.market` 추가, 인덱스 `(market, status, published_at)`.
- **콘텐츠를 반환하는 모든 레포지토리 메서드**에 `users.market` 필터를 공통 가시성 조건(`CONTENT_VISIBILITY_CONDITION` + market)으로 — 탐색 피드·검색·상세(직접 접근은 404)·라이브러리 목록·복원·재개 대상·드립 후보(`findCandidates`·탐험)·인기·공지·온보딩 주제·관심 주제·온보딩 추천.
- 콘텐츠 DTO에 `language` 추가(표시용). 기존 필드 변경 없음.
- `content_stats`·`search_query_logs`·주간 지표에 `market` 축(집계 시각은 KST 그대로).
- 추천 평가(`recommend-eval`)에 GLOBAL 합성 카탈로그·페르소나 — 두 시장 불변식 통과.
- **e2e 신설**: GLOBAL 계정으로 위 모든 엔드포인트를 호출해 KR 콘텐츠·주제·공지가 **0건**, KR 계정은 종전 스냅샷과 동일.

## 범위 밖

요금제 필터(6번) · 발행 입구(4번) · 사용자별 서비스 날짜(2단계)

## 완료 조건

- Given GLOBAL 계정 / When 탐색·검색·상세·라이브러리·재개·공지·주제를 연다 / Then KR 행이 한 건도 없다(e2e 교차 접근 0건)
- Given GLOBAL 계정이 KR 콘텐츠 ID로 상세 호출 / Then 404
- Given KR 계정 / Then 종전 응답과 동일(회귀 e2e)
- Given `npm run eval:recommend` / Then 두 시장 불변식 전부 통과

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 구현 — PR `feat(be)/global-catalog-isolation`(dev 대상, KAN-187 PR #1519 위에 쌓음).
  - 완료: `contents.market/language`·`topics.market`·`notices.market` + 인덱스(마이그레이션 `1790000000000`, 기본값 kr/ko) · 노출 조건을 `CONTENT_SCOPE_CONDITION`(published + 라이선스 + market) 하나로 — 탐색 피드·목록·인기·검색·최신·드립 후보(배치·첫 드립·탐험)·온보딩 추천·라이브러리 목록·복원 대상·상세·재생 시작·오디오 URL 발급·대본·담기에 적용 · 주제 목록(온보딩·탐색 칩·검색 fallback)·공지 목록·상세 시장 필터 · 사용자 시장은 **access token 클레임 `market`**(가입 시 불변이라 안전, 옛 토큰은 kr) · 콘텐츠 객체 9종 응답에 `language` · 운영 배치(0건 주제 숨김)는 전 시장 조회로 분리 · 공개 주제(랜딩)는 KR 고정.
  - 테스트: 단위 1754건 통과(기존 spec의 market 인자 반영). e2e `test/global-catalog-isolation.e2e-spec.ts` 5건(온보딩 주제·탐색 목록·상세 404·공지·옛 토큰 KR) — 로컬 DB 없어 CI에서 확인.
  - 미완(이 티켓 범위): `content_stats`·`search_query_logs`·주간 지표의 market 축, `recommend-eval` GLOBAL 합성 카탈로그·페르소나 — 데이터가 생긴 뒤 별도 커밋. 관심 주제 저장의 시장 불일치 409는 KAN-189.
  - 문서: `changes/pending/global-catalog-market.md`.
