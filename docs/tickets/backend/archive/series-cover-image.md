# [BE] 시리즈 표지 이미지 받기 — 1화 썸네일 대신 시리즈 표지

| 항목 | 값 |
|---|---|
| 대상 | `POST·PATCH /admin/series`(admin-api 4.24) · `series` 표(`domain.md` 5.9) · 시리즈 표지를 내는 응답(탐색 시리즈 카드 · `GET /series/:id`) |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI) — 시리즈 썸네일 개편(2026-10-20) |
| 발행 날짜 | 2026-10-20 |
| Jira | [KAN-234](https://runtime364.atlassian.net/browse/KAN-234) |
| 시작 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일) |
| 선행 | 없음. 앱 노출은 KAN-229(1.3.0 운영 스위치) 순서를 따른다 |
| 근거 문서 | `ai/spec/11-series.md` 7장(시리즈 썸네일) · `spec/api/admin-api.md` 4.24 |
| 중요도 | Low |
| 상태 | 반영 (2026-10-21) |

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

- 2026-10-20 발행(마크다운 + Jira KAN-234, 중요도 Low · 시작 10-20 · 기한 10-23). Slack 알림은 보내지 않았다(박수헌).
- 2026-10-21 반영(반영 날짜: 2026-10-21). 코드 PR `feat(be): accept series cover image`(브랜치 `feat(be)/series-cover-image` → `dev`).
  - **스키마** — `series.cover_url text NULL`(마이그레이션 `1791200000000-AddSeriesCoverUrl`, 백필 없음). 값은 `contents.thumbnail_url` 과 같은 종류(공개 URL).
  - **API** — 요청 1의 두 방식 중 **별도 `PUT /admin/series/:id/cover`**(multipart, 필드 `cover`)를 골랐다. `POST`·`PATCH /admin/series` 는 JSON 이고 파이프라인(`pipeline/apps/web/lib/ear.ts`)이 이미 JSON 으로 부르므로 그대로 둔다. 검증은 콘텐츠 `thumbnail` 과 **같은 함수**(`upload-file.validation.ts` — jpg/jpeg/png/webp ≤5MB, 400 `VALIDATION_FAILED` `details.field = "cover"`)이고 저장도 같은 길(WebP 768px 변환 → `putThumbnail`)이다. 교체 시 옛 표지 객체는 커밋 뒤 지운다(4.10 썸네일 재발행과 같다). 감사 로그 `series.cover`. 본문 파서는 건드리지 않았다(기존 `FileFieldsInterceptor` + `UploadCleanupInterceptor` 패턴).
  - **읽기** — 탐색 시리즈 카드(피드·주제별·인기·검색 공통 `SeriesService.findCards`)와 `GET /series/:id` 가 `resolveSeriesCover`(표지 있으면 그것, 없으면 가장 앞 편 썸네일)를 쓴다. 응답 필드 이름(`thumbnail_url`)이 그대로라 **FE 변경 없음**(요청 4). 라이브러리·상세의 `series` 객체에는 표지가 없어 손댈 곳이 없었다. `AdminSeriesItem.cover_url`(없으면 null) 추가(요청 3).
  - **확인** — 완료 조건 1·4: E2E `backend/test/series.e2e-spec.ts`(표지 올림 → 시리즈 화면·관리자 목록이 새 표지, 편 썸네일 그대로, 재업로드 교체, 감사 로그) · `backend/test/series-explore-cards.e2e-spec.ts`(표지 있으면 주제별·인기·검색 카드가 그것). 완료 조건 2: 같은 두 E2E 의 표지 없음 경우(1화 썸네일). 완료 조건 3: E2E(6MB·gif·파일 없음 → 400 `cover`)와 단위 테스트 `admin-series.service.spec.ts`.
  - **문서** — `domain.md` 5.9 · `admin-api.md` 4.24 · `explore-api.md` 4.1-1·4.7 · `features/explore.md` 의 표지 서술은 `changes/pending/series-cover-image.md` 로 넘겼다(통합 때 반영).
  - **운영에서 쓸 수 있는 시점** — `series` 표가 운영에 처음 나가는 릴리스 #1688 을 따른다(그 전에는 운영에 표가 없다). 파이프라인이 실제로 표지를 올리는 연동은 KAN-136 몫이다. 운영 → 개발계 콘텐츠 동기화는 열 목록을 정보 스키마에서 뽑아 새 열을 따로 다룰 것이 없다 — 단, 운영에 이 열이 생기기 전까지는 동기화가 돌 때마다 개발계 `series.cover_url` 이 NULL 로 덮인다(운영이 원천이라는 동기화 규칙 그대로).
  - Jira KAN-234 완료 전환은 PR 머지 시점에.
