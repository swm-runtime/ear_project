# [FE] 랜딩 공개 에피소드 페이지 — 검색 유입(SEO·GEO)

| 항목 | 값 |
|---|---|
| 대상 | `landing-page/` 에피소드별 정적 페이지 + 주제 묶음 페이지 |
| 요청 파트 | 프론트엔드(랜딩) |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-309](https://runtime364.atlassian.net/browse/KAN-309) |
| 발행 날짜 | 2026-11-12 |
| 시작 날짜 | 2026-11-12 |
| 기한 | 2026-11-15 (Medium — +3일) — 선행이 늦어지면 이 기한도 밀린다. 그때는 사유를 적는다 |
| 선행 | `changes/pending/public-episode-pages.md` PM 확정(사람 손 — 대기) · `backend/pending/public-episodes-api.md`(KAN-308) |
| 중요도 | Medium |
| 상태 | 대기 |

## 요청

에피소드가 검색어를 받을 면을 만든다. 빌드 때 `GET /public/episodes`를 받아 편마다 정적 페이지를 굽는다(홈 주제 섹션과 같은 방식 — 실패해도 빌드는 멈추지 않는다).

- **에피소드 페이지**(주소는 변경안 결정 1 — 추천 A `/contents/<id>/`): 제목(h1) · 요약 · 챕터 · 주제 · 길이 · 발행일 · 출처 · [앱에서 듣기]/[앱 받기](`/app/?src=episode`). 지금의 `OpenInApp`·`StoreRedirect`는 그대로 쓴다.
- **구조화 데이터**: `PodcastEpisode`(name · description · datePublished · timeRequired · partOfSeries · `citation`=출처) + BreadcrumbList.
- **주제 묶음 페이지** `/topics/<주제>/`: 그 주제의 공개 편 목록. 홈 "고를 수 있는 주제"에서 링크.
- **사이트맵·robots**: 공개 편·주제 페이지를 사이트맵에 넣는다. A안이면 robots의 `/contents/` 차단과 페이지 noindex를 공개 편에 한해 푼다(공개 대상이 아닌 편 = 정적 파일 없음 → rewrite로 기존 리다이렉트 페이지, 계속 noindex).
- **`llms.txt`**: 주제별 최근 편 몇 개를 링크로 덧붙인다(PR #2234에서 만든 `src/app/llms.txt/route.ts`).
- 문구는 API 값만 쓴다 — 페이지에 요약을 새로 쓰지 않는다(앱과 웹이 다른 말을 하지 않게).
- 동적 경로가 0개면 `output: "export"` 빌드가 실패한다(`blog.ts` 주석). 목록이 비면 경로를 만들지 않는 처리 필요.

## 완료 조건

- Given 공개 대상 편 / When 빌드 / Then 편마다 페이지가 생기고 `PodcastEpisode` 구조화 데이터·canonical·사이트맵 항목이 있다
- Given 공개 대상이 아닌 편의 공유 링크 / When 연다 / Then 종전 리다이렉트 페이지(noindex)가 뜬다
- Given API 실패·0건 / When 빌드 / Then 빌드는 성공하고 에피소드 경로만 빠진다
- Given 구글 리치 결과 테스트 / When 에피소드 페이지 URL을 넣는다 / Then 구조화 데이터 오류가 없다
