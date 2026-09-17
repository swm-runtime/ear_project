# [BE] 공지사항 조회 API 2건 + 관리자 공지 관리 4건 + `notices` 테이블

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/notice/`(신설) · `backend/src/modules/admin/`(공지 관리) · 마이그레이션 `notices` · `spec/api/settings-api.md` 4.4·4.5 · `spec/api/admin-api.md` 4.12~4.15 · `backend/domain.md` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM·FE) |
| 발행 날짜 | 2026-09-17 |
| Jira | [KAN-67](https://runtime364.atlassian.net/browse/KAN-67) |
| 발견 시점 | PM 결정 — 공지사항 인앱 화면을 만든다(2026-09-17). 2026-08-06 합의로 인앱 화면은 확정됐으나 목록 API 는 미결로 남아 있었다(`settings-api.md` 9장) |
| 근거 문서 | **`changes/pending/notice-screen-spec.md`**(화면·계약·스키마 전체 — 이 티켓은 그 문서의 BE 몫이다) · `features/settings.md` 4.1 · `backend/domain.md` 1.1(공통 컬럼)·13.3(점검 공지와 별개) |
| 심각도 | 중 — FE 화면은 mock 으로 먼저 나가고, 실서버에서는 이 API 가 있어야 열린다 |
| 우선순위 | Medium(3일 안) |

## 요청 내용

`changes/pending/notice-screen-spec.md` C·D 절 그대로다. 요약:

1. **테이블 `notices`** — `id, title varchar(100), body text, is_pinned bool default false, published_at timestamptz null, created_at, updated_at, deleted_at`. 인덱스 `(is_pinned DESC, published_at DESC) WHERE deleted_at IS NULL`. `published_at` NULL = 초안, 미래 = 예약 발행.
2. **`GET /notices?cursor&limit`**(인증 필요) — `published_at <= now()` 이고 삭제 안 된 것만. 정렬 `is_pinned DESC, published_at DESC, id DESC`. 응답 `{ items: [{ id, title, is_pinned, published_at }], next_cursor }`. `body` 는 싣지 않는다. `limit` 기본 20·최대 50.
3. **`GET /notices/:notice_id`**(인증 필요) — `{ id, title, body, is_pinned, published_at, updated_at }`. 미발행·삭제·없음 → `404 NOTICE_NOT_FOUND`.
4. **관리자 4건** — `GET /admin/notices`(초안 포함, 최신순, 커서) · `POST /admin/notices { title, body, is_pinned, published_at? }` · `PATCH /admin/notices/:id`(부분, `published_at: null` 로 발행 취소) · `DELETE /admin/notices/:id`(soft). 검증 `title` 1~100자, `body` 1~5000자. 인증은 admin-api 2장 규약.
5. **판정은 서버가 한다** — "발행됨"은 서버 시각 기준. 클라이언트는 받은 목록을 그대로 그린다.
6. 관리자 **콘솔 화면**(파이프라인 웹)은 이 티켓 범위 밖 — API 가 열리면 후속 티켓. 그 전까지는 API 직접 호출로 공지를 등록한다.

## FE 쪽 상태

`frontend/src/features/notice/` 가 mock(`IS_NOTICE_API_MOCKED`, `EXPO_PUBLIC_NOTICE_API=real` 로 끔)으로 먼저 구현된다. DTO 는 위 응답 그대로 선언하므로 필드명이 바뀌면 FE 에 알려 달라.

## 완료 조건

- Given 발행 공지 3건(고정 1) + 초안 1건 / When `GET /notices` / Then 3건, 고정이 첫 번째, 나머지 최신순, 초안 없음
- Given 21건 발행 / When `limit=20` 으로 두 번 조회 / Then `next_cursor` 로 이어지고 중복·누락 없음
- Given 초안 또는 삭제된 id / When `GET /notices/:id` / Then `404 NOTICE_NOT_FOUND`
- Given 관리자가 `POST /admin/notices` 에 `published_at` 없이 보낸다 / When 사용자 목록 조회 / Then 보이지 않는다(초안)
- Given `PATCH` 로 `published_at` 을 과거 시각으로 준다 / When 사용자 목록 조회 / Then 보인다
- Given `title` 101자 / When POST / Then 400 검증 오류
- Given `settings-api.md`·`admin-api.md`·`domain.md` / When 읽는다 / Then 위 계약·스키마가 반영돼 있다

## 처리 기록

- 2026-09-17 발행.

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-17 |
| 코드 | 신규 `notice` 모듈(`Notice` 엔티티 · `NoticeRepository` · `NoticeService` · `NoticeController` · `notice.cursor.ts`) · admin `AdminNoticeService` + 컨트롤러 4개 라우트 · 마이그레이션 `1787500000000-AddNotices` · 에러 코드 `NOTICE_NOT_FOUND` · `NOTICE_CURSOR_INVALID` |
| 요청 대비 결정 | ① 커서 오류는 400 `NOTICE_CURSOR_INVALID`(신설 — 라이브러리·탐색과 같은 계약) ② 관리자 목록은 `created_at DESC, id DESC`, **본문 포함**, 커서를 사용자 목록과 섞으면 거절 ③ `created_at`은 밀리초로 잘라 정렬·비교(DB 마이크로초 vs 커서 밀리초 경계 누락 방지) ④ 공백만 있는 제목·본문 거부 ⑤ 쓰기는 `audit_logs`(`notice.create/update/delete`)와 한 트랜잭션 — 본문 원문 대신 길이만 기록 ⑥ `is_pinned`는 선택(기본 false) |
| 문서 | `changes/pending/notice-screen-spec.md` C·D·관리자 부분 반영(처리 기록 참고). FE 소유 A·B·E는 남음 |
| 범위 밖 | 관리자 콘솔 화면(후속), 삭제 30일 뒤 hard delete 배치(정책만 `domain.md` 12.1) |
| 검증 반영 | 교차 검토에서 **관리자 입력이 500이 되는 경로 4가지**를 막았다 — PATCH `null`(NOT NULL 컬럼) · `IsISO8601`이 통과시키는 비표준 형식(`2026-W38-4`)·오프셋 없는 시각 · 2000년 이전 발행 시각(목록 커서가 거절해 앱 페이징이 멈춤) · 조합 이모지 제목(검증기 1자 vs DB 2자). 빈 PATCH 400, uuid 아닌 id 404, 수정·삭제 행 잠금 |
| FE 영향 | 응답 필드명은 티켓 그대로다 — 변경 없음 |
| 검증 | 단위(커서·관리자 서비스) · e2e `test/notice.e2e-spec.ts` 8건(정렬·초안/예약 제외 · 21건 커서 이어받기 · 상세 404 · 발행/발행 취소 · 관리자 목록 초안·감사 로그 · 관리자 커서 · 검증 400/403 · 깨진 커서) |
