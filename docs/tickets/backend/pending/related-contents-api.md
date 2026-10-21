# [BE] 관련 콘텐츠 API — `GET /contents/:content_id/related` (대본 임베딩 코사인, 플레이어 "다음에 들어볼 만한" 블록)

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/content/`(컨트롤러·서비스·레포 — `content_embeddings` 코사인 조회) · `player-api.md` 4.8 · `domain.md` 5.6 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 03:58 "ㄱㄱ 1,2 두개다" |
| 담당 | 백엔드 |
| Jira | [KAN-240](https://runtime364.atlassian.net/browse/KAN-240) · 관련 FE [KAN-241](https://runtime364.atlassian.net/browse/KAN-241)(relates — FE 는 interest 폴백으로 먼저 붙이고 이 API 는 나오면 연결) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일) |
| 선행 | 없음. 문서 개정 기록 `changes/pending/player-queue-context.md` 4·5절을 같은 PR에서 반영 |
| 근거 문서 | `changes/pending/player-queue-context.md` · `features/player.md` 4.2-2(신설) · `backend/domain.md` 5.6 · `spec/api/explore-api.md` 4.1(행 모양) |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

플레이어 재생 목록 패널이 **들어온 맥락**으로 바뀌고, 탐색 맥락에는 목록 아래 **"다음에 들어볼 만한" 3~5편** 추천 블록이 붙는다(FE KAN-241). 1차 소스는 **지금 듣는 편과 대본이 비슷한 편** — 추천 스코어링용으로 이미 있는 `content_embeddings`(text-embedding-3-small 1536, pgvector) 코사인이다. 서버에 그 조회 API가 없어 새로 둔다. 자동 재생은 없다(FR-24) — 목록일 뿐이라 추천 로직 변경 평가(`recommendation-evaluation.md`) 대상이 아니다(드립·탐색 랭킹을 건드리지 않는다).

## 무엇을 한다

1. **엔드포인트** `GET /contents/:content_id/related` — 인증 필요(사용자 시장·라이브러리 상태가 필요). 쿼리 `limit`(기본 5, 최대 10) · `exclude_ids`(uuid 콤마 구분, 최대 50).
2. **후보·정렬** — `contents` 발행 상태 · 사용자 시장 · 회수 아님 · 자기 자신 제외 · `exclude_ids` 제외 · `content_embeddings.model = EMBEDDING_MODEL_ID` AND `content_version = contents.content_version`. 기준 편 벡터와 `<=>` 코사인 거리 오름차순(유사도 내림차순), 임계값 이하 제외(상수 `content.constant.ts`, 시작 **0.3** — 계약에 적지 않는다). 전수 계산(ANN 없음 — `domain.md` 5.6).
3. **응답** — `{ items: ExploreItemDto[] }`: 탐색 4.1 콘텐츠 행과 같은 모양(`content`·`library`·`is_counted_today`). 시리즈 카드로 접지 않는다(편 단위). 기존 탐색 행 조립(라이브러리 상태·오늘 카운트)을 재사용한다.
4. **에지** — 기준 편에 임베딩이 없으면 200 `items: []`. 없는·다른 시장·회수 콘텐츠 404 `NOT_FOUND`. `limit`·`exclude_ids` 범위 밖 400 `VALIDATION_FAILED`.
5. **문서** — `player-api.md` 3장 목록 + 4.8 신설, `domain.md` 5.6 소비처(changes 문서 4·5절). 같은 PR.
6. **테스트** — 코사인 순서·임계값 제외·자기 자신·`exclude_ids`·시장·회수·임베딩 없음·404.

## 범위 밖

- 사용자 취향 벡터·드립 스코어링과의 통합 · 시리즈 다음 화 우선(KAN-225 보류) · 응답 캐시 · ANN 인덱스 · 탐색 `interest` 폴백(FE 몫)

## 완료 조건

- Given 임베딩 있는 편 A·같은 시장 편 다수 / When `GET /contents/A/related` / Then A 없음, 코사인 내림차순 ≤5건, 행 모양이 탐색 4.1 과 같다(`library`·`is_counted_today` 포함)
- Given `?limit=10&exclude_ids=B,C` / Then B·C 없음, ≤10건
- Given 임베딩 없는 편 / Then 200 `items: []`
- Given 다른 시장·회수·없는 id / Then 404 `NOT_FOUND`
- Given 후보에 회수 편·임베딩 버전 불일치 편 / Then 제외
- Given `player-api.md` 4.8 / Then 요청·응답·에러가 구현과 같다

## 처리 기록

- 2026-10-22 발행(PM 03:58).
