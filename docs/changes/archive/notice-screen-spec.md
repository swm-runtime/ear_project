# [문서] 공지사항 화면 명세 — 인앱 목록·상세, 조회 API, `notices` 테이블, 관리자 작성

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/settings.md` 4.1(정보 행)·미결 / `spec/uiux/settings-uiux.md` 2·3·4.6·9장 / `spec/api/settings-api.md` 3·4·9장 / `backend/domain.md` 2장(소유권)·신설 절 / `features/admin.md` 4장(공지 관리) / `spec/api/admin-api.md` 3·4장 |
| 요청 파트 | 문서 · **백엔드**(조회 2건 + 관리자 4건 — 티켓 `tickets/backend/pending/notice-api.md`) · 프론트엔드(FE는 `feat(fe)/notice-screen`에서 mock 으로 선반영) |
| 발행 날짜 | 2026-09-17 |
| 발견 시점 | PM 결정 "공지사항 페이지도 우리가 만들자"(2026-09-17). 2026-08-06 합의로 **인앱 화면**은 확정됐으나 화면 명세·목록 API 는 "추후 작성"으로 남아 있었다(설정 문서 3곳 미결) |
| 심각도 | 중 — 설정의 [공지사항] 행이 플레이스홀더 화면으로 열린다. 운영 공지 수단이 없다 |

## 현재 규칙

- `settings.md` 4.1: 정보 · 공지사항 — "인앱 화면(합의 2026-08-06). 화면 명세는 추후 작성한다."
- `settings-uiux.md` 4.6·9장, `settings-api.md` 9장: 같은 내용. 목록 API 는 "화면 명세 확정 후 정의".
- FE: `Notice` 라우트가 `PlaceholderScreen` 으로 등록돼 있다.
- `domain.md` 13.3 `AppConfig`: **점검 공지**는 배포 설정으로 관리한다(테이블 없음). 이 문서의 "공지사항"은 그것과 별개인 **운영 공지 게시판**이다 — 점검 공지 규칙은 건드리지 않는다.

## 수정 내용

### A. 동작 규칙 — `features/settings.md` 4.1 정보 행 + 신설 4.7 "공지사항"

**목적** — 운영이 사용자에게 알릴 것(업데이트 안내·이벤트·정책 변경·장애 사후 안내)을 앱 안에서 읽게 한다. 푸시가 아니라 **당겨서 보는** 채널이다 — 푸시 발송은 `notification.md` 소관이며 이 화면과 묶지 않는다.

**규칙**
1. 설정 > 정보 > [공지사항] 탭 → **공지 목록(N1)**. 목록 행 탭 → **공지 상세(N2)**.
2. 목록은 **발행된 공지만**(`published_at <= now`, 삭제 안 됨). **고정 공지가 먼저**(`is_pinned` 내림차순), 그다음 `published_at` 내림차순. 고정끼리도 최신순.
3. 페이지 크기 **20**, 커서 페이지네이션. 끝에 닿으면 다음 페이지. 당겨서 새로고침.
4. 상세는 목록에서 받은 제목·날짜를 **즉시** 보이고 본문만 조회한다(빈 화면 뒤 로딩이 아니다).
5. 본문은 **줄바꿈을 보존한 일반 텍스트**다. 마크다운·이미지·링크 자동 인식은 이번 범위 밖(미결). URL 을 넣으면 텍스트로 보인다.
6. 목록이 비면 안내 문구만(N3). 조회 실패는 전면 오류 + [다시 시도](N4, `common-error-handling.md` 4장). 상세 404(삭제·미발행)는 "삭제된 공지예요" 안내 + 뒤로.
7. **읽음 표시·새 공지 배지는 두지 않는다**(미결). 설정 행에 점을 찍으려면 "마지막으로 본 시각"을 기기에 저장해야 하는데, 지금은 공지 빈도가 낮아 값이 없다.
8. 캐시: 목록 5분 stale. 상세는 id 별 캐시, 목록 새로고침 시 함께 무효화.
9. 서버 판정: 무엇이 "발행됨"인지는 서버가 `published_at` 으로 판정한다. 클라이언트는 받은 목록을 그대로 그린다(기기 시각으로 거르지 않는다).

**완료 조건**
- Given 발행 공지 3건(그중 1건 고정) / When 목록을 연다 / Then 고정 공지가 맨 위, 나머지는 최신순
- Given 목록에서 행을 탭한다 / When 상세가 열린다 / Then 제목·날짜가 즉시 보이고 본문이 이어서 보인다
- Given 발행 공지 0건 / When 목록을 연다 / Then "아직 공지가 없어요"
- Given 조회 실패 / When [다시 시도] / Then 재조회한다
- Given 상세를 보는 중 운영이 그 공지를 삭제했다 / When 다시 열거나 새로고침한다 / Then 삭제 안내 후 목록으로 돌아간다

### B. 화면 — `settings-uiux.md` 2장 화면 목록·3장 흐름·4.7 신설

| ID | 화면 | 상태 |
|---|---|---|
| S8 | 공지 목록 | 정상 |
| S9 | 공지 상세 | 정상 |
| S10 | 공지 목록 — 빈 상태 | 발행 공지 0건 |
| S11 | 공지 목록·상세 — 조회 실패 | 전면 오류 + [다시 시도] |

**S8 공지 목록**
- 앱바: [‹ 뒤로] + 타이틀 **"공지사항"**(설정과 같은 앱바 문법 — 화면이 직접 그린다).
- 행: 제목(최대 2줄 말줄임) / 날짜 **`YYYY.MM.DD`**. 고정 공지는 제목 앞에 **"중요"** 배지 — 색 + 텍스트, 색만으로 구분하지 않는다(7장).
- 행 전체가 탭 대상, 44pt 이상. 낭독: "중요, 제목, 날짜" 또는 "제목, 날짜".
- 첫 로딩 0.3초 미만은 표시 없음, 이상이면 행 스켈레톤 3개. 다음 페이지 로딩은 목록 끝 인디케이터.
- 당겨서 새로고침(RefreshControl).

**S9 공지 상세**
- 앱바: [‹ 뒤로] + 타이틀 없음(제목은 본문에 크게 한 번만 — 설정 4.1 "앱바에 제목을 두지 않는다"와 같은 이유).
- 본문 영역: [중요 배지] 제목(xl, 굵게) / 날짜(sm, 보조색) / 구분선 / 본문(md, 줄간격 1.6, 줄바꿈 보존, **텍스트 선택 가능** — 공지는 재배포 방지 대상이 아니다).
- 본문 로딩 중에는 본문 자리만 스켈레톤(제목·날짜는 목록 값으로 즉시).

**카피(확정)**

| 키 | 문구 |
|---|---|
| 타이틀 | 공지사항 |
| 고정 배지 | 중요 |
| 빈 상태 | 아직 공지가 없어요 |
| 조회 실패 | 공지를 불러오지 못했어요 / [다시 시도] |
| 삭제된 공지 | 삭제된 공지예요 |
| 뒤로 낭독 | 뒤로 가기 |

**금지** — 공지 안에 결제·구독 유도 문구를 싣지 않는다(MVP 바이너리 구독 비노출 — `changes/archive/subscription-ui-hidden-mvp.md`). 공지는 운영 문서라 심사 대상 화면에 곧바로 노출된다.

### C. 계약 — `settings-api.md` 3장 목록에 2건 추가, 4.4·4.5 신설, 9장 미결 해소

공통 규약(2장)은 그대로: Bearer 인증 필요, snake_case, ISO 8601 UTC.

**4.4 `GET /notices`** — 발행 공지 목록

| 쿼리 | 타입 | 설명 |
|---|---|---|
| `cursor` | string | 선택. 이전 응답의 `next_cursor` |
| `limit` | int | 선택, 기본 20, 최대 50 |

```json
{
  "items": [
    { "id": "uuid", "title": "9월 업데이트 안내", "is_pinned": true, "published_at": "2026-09-17T09:00:00Z" }
  ],
  "next_cursor": "opaque-or-null"
}
```
- 정렬: `is_pinned DESC, published_at DESC, id DESC`. 커서는 이 정렬의 불투명 토큰.
- 본문(`body`)은 목록에 싣지 않는다 — 목록은 가볍게, 본문은 상세에서.

**4.5 `GET /notices/:notice_id`** — 공지 상세

```json
{ "id": "uuid", "title": "…", "body": "줄바꿈은\n그대로", "is_pinned": false, "published_at": "…", "updated_at": "…" }
```
- 미발행·삭제 → `404 NOTICE_NOT_FOUND`(5장 에러 코드 표에 추가).

**관리자 — `admin-api.md` 3장 목록·4.12~4.15 신설, `admin.md` 4장 "공지 관리"**

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/notices` | 초안 포함 전체(최신순), 커서 |
| POST | `/admin/notices` | `{ title, body, is_pinned, published_at? }` — `published_at` 없으면 초안 |
| PATCH | `/admin/notices/:notice_id` | 부분 수정. `published_at: null` 로 발행 취소 |
| DELETE | `/admin/notices/:notice_id` | soft delete(`deleted_at`) |

- 검증: `title` 1~100자, `body` 1~5000자. 관리자 인증은 admin-api 2장 규약 그대로.
- 관리자 콘솔 UI(파이프라인 웹 `publish/` 아래)는 별도 — BE 티켓에 "콘솔 화면은 후속"으로 적는다. 그 전까지는 API 직접 호출로 등록한다.

### D. 스키마 — `domain.md` 2장 소유권 표에 `notices` 추가(소유 모듈 `notice`), 신설 절

```
notices
  id             uuid          PK
  title          varchar(100)  NOT NULL
  body           text          NOT NULL              (줄바꿈 보존 plain text)
  is_pinned      boolean       DEFAULT false
  published_at   timestamptz   NULL                  (NULL = 초안. 미래 시각이면 예약 발행)
  created_at / updated_at / deleted_at              (1.1 공통)

idx_notices_list (is_pinned DESC, published_at DESC) WHERE deleted_at IS NULL
```
- 작성자 컬럼은 두지 않는다 — 관리자 계정이 하나다(`admin.md`). 필요해지면 `audit_logs`(10.3)로 잡는다.
- 보존 정책(12장): 삭제된 공지는 30일 뒤 물리 삭제 대상에 넣는다(사용자 데이터가 아니라 법적 보존 없음).

### E. FE 구조 메모 — `frontend/architecture.md` 4.4 의존 표

`notice` feature 를 신설한다. **settings 는 notice 를 import 하지 않는다** — 라우트 이름(`Notice`·`NoticeDetail`)으로 이동만 하고 화면 등록은 `app/navigation` 이 한다(content-detail 과 같은 방식, 역방향 의존 없음). 표에 `notice | (없음) | 조회 전용 화면` 행을 추가한다.

## 완료 조건

- Given `settings.md` 4.1·4.7 / When 공지사항을 읽는다 / Then "추후 작성"이 없고 정렬·페이지·본문 형식·빈/실패 상태 규칙이 있다
- Given `settings-uiux.md` / When 화면 목록을 본다 / Then S8~S11 이 있고 4.7 에 카피 표가 있다
- Given `settings-api.md` / When 엔드포인트 목록을 본다 / Then `GET /notices`·`GET /notices/:notice_id` 가 있고 9장의 공지 미결이 해소돼 있다
- Given `domain.md` / When `notices` 를 찾는다 / Then 위 스키마와 소유 모듈이 있다
- Given `admin-api.md` / When 공지 관리 4건을 찾는다 / Then 요청·검증·에러가 있다
- Given `frontend/architecture.md` 4.4 / When notice 행을 본다 / Then settings → notice 의존이 없다고 적혀 있다

## 처리 기록

| 항목 | 값 |
|---|---|
| 부분 반영 | 2026-09-17 — **C(계약)·D(스키마)·관리자 부분**을 KAN-67 BE PR에서 반영: `spec/api/settings-api.md` 3·4.4·4.5·5·9장 · `spec/api/admin-api.md` 3·4.12~4.15·5장 · `features/admin.md` 4.5-1 · `backend/domain.md` 2장·9.2·12.1 · `features/common-error-handling.md` 9.10-1 · `backend/architecture.md` 4.5 |
| 계약 구체화 | 관리자 목록 응답 형태(본문 포함, `created_at DESC` 정렬), 커서 오류 코드 `NOTICE_CURSOR_INVALID` 신설, 공백만 있는 제목·본문 거부, 감사 로그 `notice.*` — 요청서에 없던 부분을 BE가 정해 문서에 적었다 |
| 남은 것 | **A(`features/settings.md` 4.1·4.7) · B(`spec/uiux/settings-uiux.md`) · E(`frontend/architecture.md` 4.4)** — FE 소유 문서라 FE 통합 때 반영. 반영되면 archive로 옮긴다 |
| 보류 | 삭제 30일 뒤 hard delete 배치 — `domain.md` 12.1에 정책만 적고 구현하지 않았다(공지는 수십 건 규모) |
| **반영 날짜** | **2026-09-23** — 남은 A·B·E 반영 — `settings.md` 4.1 정보 행·4.5 신설(번호는 문서 순서상 4.5, 요청서의 4.7)·미결, `settings-uiux.md` 2장 S8~S11·3장 흐름·4.1·4.6·4.7 신설(카피 표)·9장 미결, `frontend/architecture.md` 4.4 notice 행. C·D·관리자 부분은 2026-09-17 KAN-67에서 반영됨. PR `docs/changes-integration-2026-09-23` |
