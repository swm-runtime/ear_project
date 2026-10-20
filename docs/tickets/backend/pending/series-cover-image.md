# [BE] 시리즈 표지 이미지 받기 — 1화 썸네일 대신 시리즈 표지

| 항목 | 값 |
|---|---|
| 대상 | `POST·PATCH /admin/series`(admin-api 4.24) · `series` 표(`domain.md` 5.9) · 시리즈 표지를 내는 응답(탐색 시리즈 카드 · `GET /series/:id`) |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI) — 시리즈 썸네일 개편(2026-10-20) |
| 발행 날짜 | 2026-10-20 |
| 시작 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일) |
| 선행 | 없음. 앱 노출은 KAN-229(1.3.0 운영 스위치) 순서를 따른다 |
| 근거 문서 | `ai/spec/11-series.md` 7장(시리즈 썸네일) · `spec/api/admin-api.md` 4.24 |
| 중요도 | Low |
| 상태 | 발행 |

## 문제

- 지금 시리즈 표지는 **노출 중인 가장 앞 편(보통 1화)의 썸네일**이다(`docs/changes/archive/series-explore-cards.md`). 시리즈 표지를 따로 받는 칸이 없다.
- 2026-10-20부터 시리즈 편 썸네일은 **같은 그림에 편 번호(01·02…)만 다르게** 만든다(팀원 레퍼런스 "이어 · KEYWORD SERIES · 경제편 · 01"). 그러면 1화 썸네일을 표지로 쓰면 시리즈 카드에 "01"이 찍힌다.
- 파이프라인은 표지를 따로 만든다 — 같은 그림에 번호 대신 편수("전 16편")를 오른쪽 위 라벨 아래에 둔다(앱 카드 아래 변의 "시리즈" 표식과 겹치지 않는 자리). 이걸 서버에 올릴 곳이 없다.

## 요청 내용

1. `POST /admin/series`·`PATCH /admin/series/:id` 가 표지 이미지를 받는다(콘텐츠 업로드 4.6 의 `thumbnail` 과 같은 형식·검증 — jpg/png/webp ≤5MB). 방식(multipart 전환 또는 별도 `PUT /admin/series/:id/cover`)은 BE 가 정한다.
2. 시리즈에 표지가 있으면 시리즈 표지를 내는 응답(탐색 시리즈 카드 `thumbnail_url` · `GET /series/:id`)이 그것을 쓴다. 없으면 지금처럼 가장 앞 편 썸네일(기존 CS 시리즈는 그대로).
3. `AdminSeriesItem` 에 표지 URL(없으면 null)을 싣는다 — 콘솔이 올렸는지 확인한다.
4. 응답 필드 이름이 그대로면 FE 변경은 없다(`thumbnail_url` 의 출처만 바뀐다). 이름이 바뀌면 FE 티켓을 따로 낸다.

파이프라인은 [시리즈 발행]에서 시리즈를 만든 직후 표지(`datasets/series/<id>/thumb-cover.png`)를 올리고, 기존 시리즈는 콘솔에서 따로 올린다(KAN-136).

## 완료 조건

- Given 표지 이미지를 올린 시리즈 / When 탐색 시리즈 카드와 `GET /series/:id` 를 본다 / Then 표지가 올린 이미지다
- Given 표지가 없는 시리즈(CS 키워드 16편) / When 같은 응답을 본다 / Then 지금처럼 가장 앞 편 썸네일이다
- Given 6MB 이미지·지원하지 않는 형식 / When 표지를 올린다 / Then 400 `VALIDATION_FAILED`(필드 표기)
- Given 표지를 올린 시리즈 / When `GET /admin/series` 를 본다 / Then 그 항목에 표지 URL 이 있다

## 처리 기록

- 2026-10-20 발행(마크다운). Jira 는 승인 뒤.
