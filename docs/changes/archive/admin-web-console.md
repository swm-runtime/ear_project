# 관리자 웹 콘솔 도입에 따른 문서 반영 요청

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-30 |
| 발행자 | BE (infra 브랜치) |
| 대상 문서 | `features/admin.md` · `spec/api/admin-api.md`(신규) · `features/common-error-handling.md` · `backend/architecture.md` |
| 관련 코드 | `backend/src/modules/admin/` · `backend/src/modules/partner/` · `backend/deploy/admin/` |

## 배경

콘텐츠 0편 상태에서 실제 오디오를 올릴 경로가 필요했다. `admin.md` 미결 사항 "관리자 화면의 형태 —
앱 내 화면으로 가정했으나 업로드 편의상 웹 콘솔이 나을 수 있다"를 **웹 콘솔**로 결정하고
`admin.earcast.co.kr`(정적 HTML 한 장, Caddy `file_server`)로 구현했다. **`spec/api/admin-api.md`가
없어** 계약을 코드에서 먼저 정했다 — `backend/CLAUDE.md` 6장 3항("없으면 만들지 말고 물어본다")에
어긋나므로 이 문서로 보고하고, 아래 계약을 api 문서로 승격해 달라.

## 수정 요청

### 1. `features/admin.md`

- 미결 "관리자 화면의 형태" → **웹 콘솔로 확정**(2026-08-30). 앱 내 [관리자] 진입점(2장·5장)은 P1로
  이연하거나 삭제. 서버 403 원칙(4.1)은 그대로.
- 3.1 표에 **`thumbnail` 저장 위치**: 오디오와 같은 비공개 버킷의 `thumb/*`에 두고 CloudFront에서
  **서명 없이** 공개한다(썸네일은 목록·탐색에 노출되는 값이라 서명 URL이 맞지 않는다).
- 4.2 "[저장] 오디오를 비공개 스토리지에 업로드" 단계에 **재생 경로 등록(KVS)** 추가 — CloudFront
  Function이 보는 `contentId → S3 키` 매핑을 DB 트랜잭션 안 마지막에 넣고, 실패하면 행과 함께 롤백.
- 4.2 발행 직후 **KVS 전파 지연(수 초~10초)** 동안 `/play/<id>`가 404일 수 있다 — "발행 즉시 재생 가능"이
  아니라 "발행 즉시 노출, 재생은 수 초 후"임을 명시(실측 2026-08-30: 첫 시도 404, 10초 뒤 200).
- 7 "업로드 중 네트워크 끊김" — 구현은 저장소 업로드를 트랜잭션 **밖에서 먼저** 하고 DB 실패 시
  올린 파일을 지운다. 문서 서술과 같은 결과이나 순서를 명시해 달라.
- 4.5 콘텐츠 0건 주제의 노출 켜기 경고 확인은 **콘솔(클라이언트)이 confirm으로** 수행하고 서버는
  기록만 남긴다. 서버 판정이 아님을 명시(판정이 아니라 확인 UX라서 "판정은 서버" 원칙과 충돌하지 않음).

### 2. `spec/api/admin-api.md` — 신규 작성 요청 (현재 구현 계약)

모든 라우트 `Authorization: Bearer` + `role == admin`, 아니면 401/403(`FORBIDDEN`).

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/admin/topics` | — | `{ items: [{ id, name, parent_category, is_visible, display_order, content_count }] }` |
| POST | `/admin/topics` | `{ name, parent_category, display_order? }` | 201 위 항목 (`is_visible=false` 고정) |
| PATCH | `/admin/topics/:topicId` | `{ name?, parent_category?, is_visible?, display_order? }` | 200 위 항목 |
| DELETE | `/admin/topics/:topicId` | — | 204 / 409 `ADMIN_TOPIC_HAS_CONTENTS` (`details.content_count`) |
| GET | `/admin/contents` | `?status=&offset=&limit=`(≤50) | `{ items: [AdminContentItem], total }` |
| POST | `/admin/contents` | multipart: `audio`(mp3/m4a ≤200MB) · `thumbnail`(jpg/png/webp ≤5MB) · `payload`(JSON 문자열) | 201 `AdminContentItem` |

`payload` JSON: `title, description, origin, author_name?, source_name, source_url?, partner_id?,
license_expires_at?(ISO), series_id?, episode_no?, total_episodes?, topic_ids[], sources?[{title, author?, url?}],
review_confirmed(true 필수)`. origin별 필수 분기는 `admin.md` 3.1 그대로.

`AdminContentItem`: `id, title, description, origin, status, author_name, source_name, source_url, partner_id,
series_id, episode_no, total_episodes, duration_sec, thumbnail_url, content_version, license_expires_at,
published_at, withdrawn_at, topics[{topic_id, name}]`. **`audio_path`는 싣지 않는다**(domain.md 5.1).

검증 실패(400 `VALIDATION_FAILED`)는 `details.field`로 **어느 필드가 문제인지** 싣는다(admin.md 5장
"필드별 인라인 에러").

### 3. `features/common-error-handling.md` 6장 — 신규 error_code

| 코드 | 상태 | 의미 |
|---|---|---|
| `ADMIN_AUDIO_UNREADABLE` | 400 | 오디오 길이 추출 실패·0초 (admin.md 7) |
| `ADMIN_TOPIC_NOT_FOUND` | 400 | 존재하지 않는 주제 포함 (숨김 주제는 허용) |
| `ADMIN_LICENSE_EXPIRED` | 400 | 만료일 지난 파트너 콘텐츠 업로드 (partner-control.md 4.4) |
| `ADMIN_TOPIC_HAS_CONTENTS` | 409 | 콘텐츠가 있는 주제 삭제 시도 (admin.md 4.5) |
| `ADMIN_STORAGE_FAILED` | 502 | S3·KVS 실패, `retryable: true` |

### 4. `backend/architecture.md`

- 9.4 오디오 서명 절 옆에 **썸네일 공개 경로(`/thumb/*`, 무서명)** 한 줄.
- `audit_logs`를 소유한 `partner` 모듈이 생겼다(엔티티 하나). 2장 모듈 표의 상태 갱신.

## 구현하지 않은 것 (범위 밖 — 별도 요청 필요)

- **회수·복구**(admin.md 4.4, FR-32): `partner-control.md` 4.3의 노출면 8종 반영(`library_items` 삭제 등)이
  함께 필요해 이번 범위에서 뺐다.
- **재발행**(4.3 `content_version` 증가), **운영 현황**(4.6), **스크립트 업로드**(P1).
- `partner_id`는 `partners` 테이블이 없어 **존재 검증 없이** uuid 형식만 본다.

## 완료 조건

- Given 위 1~4를 반영한 문서 / When `backend/src/modules/admin/`의 DTO·에러 코드와 대조한다 / Then
  필드명·상태 코드·error_code가 1:1로 일치한다
- Given `spec/api/admin-api.md` / When 콘솔(`deploy/admin/index.html`)의 요청을 대조한다 / Then
  문서에 없는 필드를 보내지 않는다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-03 |
| 상태 | **완료 — archive** |

반영 위치:

- **`features/admin.md`** — 2장에 웹 콘솔 확정(앱 내 진입점 제거), 3.1에 썸네일 `thumb/*` 무서명 공개, 4.2에 "저장소 먼저 DB 나중" 순서, 4.5에 0건 주제 경고 확인의 주체(콘솔), 7장 순서 명시, 미결 "관리자 화면의 형태" 해소 표시
- **`spec/api/admin-api.md`** — 신규 작성
- **`features/common-error-handling.md`** — **9.10**에 관리자 코드 5종 등재
- **`backend/architecture.md`** — 9.4에 썸네일 무서명 공개 경로

요청과 다르게 반영한 것 세 가지. **코드가 기준이다**(사용자 지시 2026-09-03).

1. **4.2의 KVS 등록·전파 지연은 넣지 않았다.** 요청 다음 날 `audio-url-drops-play-rewrite.md`(2026-08-31)가 조직 SCP 제약으로 KVS 방식 자체를 폐기했다. 이 요청대로 적었다면 하루 만에 틀린 문서가 된다. 4.2에는 반대로 **"재생 경로를 따로 등록하지 않는다 — 따라서 전파 지연도 없다"**를 적었다.
2. **에러 코드는 6장이 아니라 9장에 넣었다.** `common-error-handling.md` 6장은 `ApiError`의 필드 규격이고 코드 목록은 9장이다(해당 문서 머리말이 명시). 9.10으로 신설하고 기존 9.10(읽는 규칙)을 9.11로 밀었다.
3. **회수·복구를 "미구현"으로 적지 않았다.** 요청은 범위 밖이라 했으나 코드에 `POST /admin/contents/:contentId/withdraw`·`/restore`가 이미 있다. `admin-api.md` 4.7·4.8로 등재했다.

코드 대조로 보정한 것:

- `limit` 기본값 **20**(요청은 "구현 기준"으로만 적혀 있었다), 최대 50
- 409 `CONFLICT` 추가 — 이미 회수됨 / 회수 상태가 아님
- 에러 코드 5종은 **이미 `error-code.enum.ts`에 등재돼 있다.** enum 반영 대기 목록에 넣지 않았다
- `enrichment_file`(`admin.md` 3.1)은 업로드 폼에 파트가 없어 미구현으로 적었다
- `backend/architecture.md` 4.1의 모듈 목록에 `partner`가 **이미 있어** 갱신할 것이 없었다
