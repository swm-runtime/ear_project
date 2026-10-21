# domain·admin-api·explore-api — 시리즈 표지 칸(`series.cover_url`)과 표지 올리기 API 기재 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 5.9 `series` · `spec/api/admin-api.md` 1장 엔드포인트 표 · 4.24 · 5장 에러 표 · `spec/api/explore-api.md` 4.1-1(시리즈 카드 `thumbnail_url`) · 4.7(시리즈 화면 `series.thumbnail_url`·끝 목록 "1화가 회수돼 있으면…") · `features/explore.md` 72·75·212·334행(표지 서술) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-21 |
| 기한 | 다음 문서 통합 때(코드와 같은 PR로 dev 에 들어간다 — 문서가 늦으면 "표지 칸이 없다"는 서술이 코드와 어긋난 채 남는다) |
| 선행 | 없음 |
| 관련 | [KAN-234](https://runtime364.atlassian.net/browse/KAN-234) (`tickets/backend/archive/series-cover-image.md`) · 브랜치 `feat(be)/series-cover-image` · 마이그레이션 `1791200000000-AddSeriesCoverUrl` |

## 배경

2026-10-20부터 파이프라인은 시리즈 편 썸네일을 **같은 그림에 편 번호(01·02…)만 다르게** 만든다. 지금 시리즈 표지는 "노출 중인 가장 앞 편(보통 1화)의 썸네일"이라(결정 2026-10-09 — `changes/archive/series-explore-cards.md`), 그대로 두면 탐색 시리즈 카드와 시리즈 화면 머리에 "01"이 찍힌다. 파이프라인은 번호 대신 "전 N편"을 넣은 표지를 따로 만들지만 서버에 올릴 곳이 없었다(KAN-234).

BE 는 `series` 에 NULL 허용 칸 `cover_url` 을 더하고, 표지를 받는 별도 엔드포인트 `PUT /admin/series/:id/cover` 를 열었다. 표지가 있으면 그것을, 없으면 종전대로 가장 앞 편 썸네일을 낸다. **응답 필드 이름은 그대로**(`thumbnail_url`)라 FE 변경은 없다.

- **별도 경로로 둔 이유** — `POST`·`PATCH /admin/series` 는 JSON 이고 파이프라인(`pipeline/apps/web/lib/ear.ts` `createEarSeries`·`patchEarSeries`)이 이미 JSON 으로 부른다. 둘을 multipart 로 바꾸면 배포된 파이프라인이 깨진다.
- **값의 종류** — `contents.thumbnail_url` 과 같다(저장 규격 WebP 768px 로 다시 써서 올린 뒤 받은 공개 URL). 키 접두사도 같은 `thumb/` 라 교체 때 옛 객체를 되짚어 지운다(콘텐츠 썸네일 재발행 4.10 과 같은 방식).

## 수정 내용

1. **`domain.md` 5.9** — 표 정의에 한 줄을 더하고, "표지 칸이 없다" 항목을 바꾼다.
   ```
     status          varchar(20)   NOT NULL   CHECK IN ('ongoing','completed')
     cover_url       text          NULL       ★신설 2026-10-21 (KAN-234) — 올린 표지의 공개 URL. contents.thumbnail_url 과 같은 종류
     created_at · updated_at
   ```
   > - **표지** — `cover_url` 이 있으면 그것, 없으면(NULL·빈 문자열) 노출 중인 가장 앞 편(보통 1화)의 썸네일이다(결정 2026-10-09 → 표지 칸 신설 2026-10-21 — KAN-234). 관리자 `PUT /admin/series/:id/cover`(`admin-api.md` 4.24)로만 채운다. 백필 없음 — 기존 CS·경제·철학 시리즈는 올리기 전까지 종전 그대로다. 마이그레이션 `1791200000000-AddSeriesCoverUrl`.
2. **`admin-api.md` 1장 엔드포인트 표** — 4.24 행 아래에 더한다.
   > | PUT | `/admin/series/:seriesId/cover` | 시리즈 표지 올리기·교체 — multipart `cover` (4.24, 2026-10-21 — KAN-234) |
3. **`admin-api.md` 4.24**
   - `AdminSeriesItem` 에 `"cover_url": "https://…/thumb/….webp" | null   // 올린 표지(없으면 null). null 이어도 앱에는 가장 앞 편 썸네일이 표지로 나간다` 를 `max_published_episode_no` 다음에 더한다.
   - 감사 로그 액션에 `series.cover` 를 더한다(before/after 에 `cover_url`, after 에 변환 뒤 `width`·`height`).
   - 절을 하나 더한다.
     > **`PUT /admin/series/:seriesId/cover`** → 200 `AdminSeriesItem` — multipart/form-data, 파일 필드 `cover` 하나(다른 파일 필드는 400). 형식·크기·저장 규격은 4.6 `thumbnail` 과 같다 — jpg/jpeg/png/webp, ≤5MB, 서버가 WebP 긴 변 768px 로 다시 쓴다. 다시 올리면 교체되고 옛 표지 객체는 커밋 뒤 지운다(4.10 썸네일 재발행과 같다). 표지만 따로 지우는 API 는 없다.
     > - 400 `VALIDATION_FAILED`(`details.field = "cover"`) — 파일 없음("표지 이미지가 필요해요") · 허용되지 않는 형식 · 5MB 초과 · 읽을 수 없는 이미지. 20MB 를 넘는 본문은 수신 단계에서 413(서버 보호 상한, 필드 표기 없음).
     > - 404 `NOT_FOUND` 없는 시리즈 · 400 uuid 가 아님 · 403 일반 계정 · 502 `ADMIN_STORAGE_FAILED`(retryable) 저장소 실패.
     > - 파이프라인 [시리즈 발행]은 시리즈를 만든 직후(`POST /admin/series`) 이것으로 `datasets/series/<id>/thumb-cover.png` 를 올린다. 기존 시리즈는 콘솔에서 올린다(KAN-136).
4. **`admin-api.md` 5장 에러 표** — `ADMIN_STORAGE_FAILED` 행의 발생 지점에 "4.24 표지"를 더한다. `VALIDATION_FAILED`·`NOT_FOUND` 행에 "4.24 표지(`cover`)"를 더한다. 새 코드 없음.
5. **`explore-api.md` 4.1-1·4.7** — 두 `thumbnail_url` 주석을 `// 표지 = 시리즈 표지(관리자가 올린 것)가 있으면 그것, 없으면 노출 중인 가장 앞 편(보통 1화)의 썸네일` 로 바꾼다. 4.7 끝의 "1화가 회수돼 있으면 표지도 그다음 노출 편이다"는 "표지를 올리지 않은 시리즈는 …"으로 한정한다. 필드 이름·모양은 그대로임을 한 줄 적는다(설치된 앱은 바꿀 것이 없다).
6. **`features/explore.md`** — 72행 "표지는 노출 중인 가장 앞 편(보통 1화)의 썸네일이다", 75행 "표지(1화 썸네일)", 212행 "따로 표지가 없다", 334행 완료 조건 "표지는 1화 썸네일이다"를 "시리즈 표지가 있으면 그것, 없으면 노출 중인 가장 앞 편의 썸네일"로 고친다(FE·기획 소유 문서 — 통합 때 반영).

## 완료 조건 (Given/When/Then)

- Given `domain.md` 5.9 / When `series` 정의를 본다 / Then `cover_url text NULL` 과 "있으면 그것, 없으면 가장 앞 편 썸네일" 규칙·마이그레이션 이름이 적혀 있고 "표지 칸이 없다"는 서술이 남아 있지 않다
- Given `admin-api.md` 4.24 / When 시리즈 API 를 본다 / Then `PUT /admin/series/:seriesId/cover` 의 형식·검증(4.6 `thumbnail` 과 같음)·에러(`details.field = "cover"`)·교체 시 옛 객체 삭제와 `AdminSeriesItem.cover_url` 이 적혀 있다
- Given `explore-api.md` 4.1-1·4.7 과 `features/explore.md` / When 시리즈 표지의 출처를 본다 / Then 둘 다 "시리즈 표지가 있으면 그것, 없으면 가장 앞 편 썸네일"이고 응답 필드 이름이 그대로라고 적혀 있다

## 처리 기록

- 2026-10-21 발행(BE — 코드와 같은 PR `feat(be): accept series cover image`).
