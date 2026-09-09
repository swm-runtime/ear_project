# 관리자 API 명세서

> 기준 문서: [`docs/features/admin.md`](../../features/admin.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md) 9.10
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 4.1 · 5.1 · 5.5
> 연관: [`features/partner-control.md`](../../features/partner-control.md) 4.4(라이선스 만료 거부)

작성: 2026-09-03 (구현 계약 등재 — `changes/archive/admin-web-console.md`) · 2026-09-07 4.10 재발행 등재·구현(`tickets/backend/archive/content-republish-audio.md`)

## 1. 범위

`admin.md`가 정의한 운영 동작 중 **현재 구현된 것**을 HTTP 계약으로 옮긴 문서다.

- 주제 관리 — 목록·생성·수정·삭제 (FR-38, `admin.md` 4.5)
- 콘텐츠 목록 조회
- 콘텐츠 업로드 → 즉시 발행 (FR-37, `admin.md` 4.2)
- 콘텐츠 **회수·복구** (FR-32, `admin.md` 4.4)
- 콘텐츠 **재발행** — 오디오·메타 교체, `content_version` 증가 (`admin.md` 4.3)

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `admin.md`가 기준이며, 스키마는 `domain.md`가 유일한 기준이다.

**이 문서는 구현이 먼저 나온 뒤 작성됐다.** `backend/CLAUDE.md` 6장 3항("api 문서가 없으면 만들지 말고 물어본다")에 어긋난 경로였고, 그 사실을 `changes/`로 보고한 뒤 이 문서로 등재했다. 이후 계약 변경은 이 문서가 먼저다.

**다루지 않는 것** — 아직 구현되지 않았다. 필요해지면 이 문서에 절을 더한다.

| 미구현 | 사유 |
|---|---|
| 운영 현황 조회 (`admin.md` 4.6) | |
| 스크립트 업로드 | FR-25가 P1이다 |

> **회수·복구는 발행 요청서가 "범위 밖"으로 적었으나 그 뒤 구현됐다**(코드 대조 2026-09-03). 4.7·4.8로 등재한다.

## 2. 공통 규약

- 모든 라우트에 `Authorization: Bearer <access_token>`이 필요하고, **`users.role == 'admin'`이어야 한다.** 아니면 401(토큰 문제) 또는 403 `FORBIDDEN`(권한 문제)다.
- **UI 은닉에 의존하지 않는다**(`admin.md` 2장·4.1). 콘솔이 버튼을 감추는 것과 무관하게 서버가 매 요청 판정한다.
- 응답 본문·오류 규격은 `common-error-handling.md` 6장의 `ApiError`를 따른다.
- 검증 실패(400 `VALIDATION_FAILED`)는 **`details.field`에 문제 필드명을 싣는다.** 콘솔이 필드별 인라인 오류로 표시하기 때문이다(`admin.md` 5장).

## 3. 엔드포인트 목록

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/admin/topics` | 주제 목록 (콘텐츠 건수 포함) |
| POST | `/admin/topics` | 주제 생성 |
| PATCH | `/admin/topics/:topicId` | 주제 수정 |
| DELETE | `/admin/topics/:topicId` | 주제 삭제 |
| GET | `/admin/contents` | 콘텐츠 목록 |
| POST | `/admin/contents` | 콘텐츠 업로드 → 즉시 발행 |
| POST | `/admin/contents/:contentId/withdraw` | 콘텐츠 회수 |
| POST | `/admin/contents/:contentId/restore` | 회수 복구 |
| PATCH | `/admin/contents/:contentId` | 재발행 — 오디오·메타 교체, `content_version` 증가 (4.10) |
| DELETE | `/admin/contents/:contentId/storage` | 저장소 파일 회수 — 회수된 콘텐츠의 오디오·썸네일 삭제 (4.11) |
| GET | `/admin/system-stats` | 서버 자원·DB 부하 스냅샷 (로그 콘솔 상태 탭) |

## 4. 엔드포인트 상세

### 4.1 `GET /admin/topics`

요청 파라미터 없다.

```jsonc
// 200
{ "items": [
  { "id": "...", "name": "생산성", "parent_category": "자기계발",
    "is_visible": true, "display_order": 1, "content_count": 12 }
] }
```

- **`content_count`는 조회 시 집계한다.** `topics`에 컬럼을 두지 않는다 — 파생값이라 컬럼과 집계가 어긋날 수 있다(`admin.md` 4.5).

### 4.2 `POST /admin/topics`

```jsonc
{ "name": "생산성", "parent_category": "자기계발", "display_order": 1 }  // display_order 선택
```

201로 4.1의 항목 한 건을 반환한다. **`is_visible`은 `false`로 고정 생성된다** — 요청으로 받지 않는다(`admin.md` 4.5 — 콘텐츠 수급 후 노출을 시작한다).

### 4.3 `PATCH /admin/topics/:topicId`

```jsonc
{ "name": "...", "parent_category": "...", "is_visible": true, "display_order": 2 }  // 전부 선택
```

200으로 갱신된 항목을 반환한다.

- **콘텐츠 0건인 주제의 `is_visible: true`를 서버가 거부하지 않는다.** 경고 확인은 콘솔이 수행하고 서버는 기록만 남긴다(`admin.md` 4.5 — 판정이 아니라 확인 UX다).

### 4.4 `DELETE /admin/topics/:topicId`

- 204 — 삭제됨
- 409 `ADMIN_TOPIC_HAS_CONTENTS` — 연결된 콘텐츠가 있다. `details.content_count`에 건수를 싣는다. 콘솔은 삭제 대신 `is_visible = false`를 안내한다(`admin.md` 4.5 — FK 위반 방지)

### 4.5 `GET /admin/contents`

| 파라미터 | 규격 |
|---|---|
| `status` | 선택. `domain.md` 5.1의 3값 |
| `offset` | 선택, 기본 0 |
| `limit` | 선택, **기본 20 · 최대 50** (`convention.md` 3.3) |

```jsonc
// 200
{ "items": [ /* AdminContentItem — 8장 */ ], "total": 137 }
```

### 4.6 `POST /admin/contents`

`multipart/form-data`.

| 파트 | 규격 | 필수 |
|---|---|---|
| `audio` | mp3 / m4a, **≤200MB** | 필수 |
| `thumbnail` | jpg / png / webp, **≤5MB** | 필수 |
| `payload` | JSON **문자열** | 필수 |
| `enrichment_file` | `enrichment.json`(`ai/metadata-pipeline.md` 4.4), **≤1MB** | 선택 (등재 2026-09-08 — 구현 완료) |

`payload` 필드:

```jsonc
{
  "title": "...", "description": "...",
  "origin": "partner" | "ai_generated",
  "author_name": "...",        // partner 필수 / ai_generated 선택
  "source_name": "...",        // 필수
  "source_url": "...",         // partner 필수 / ai_generated 선택
  "partner_id": "uuid",        // partner 필수
  "license_expires_at": "2027-01-01T00:00:00Z",  // partner 필수
  "series_id": "...", "episode_no": 1, "total_episodes": 5,  // 선택 (series_id 있으면 나머지 필수)
  "topic_ids": ["..."],        // 필수, 최소 1개
  "sources": [{ "title": "...", "author": "...", "url": "..." }],  // ai_generated 필수, 최소 1개
  "review_confirmed": true     // 필수, true여야 한다
}
```

- **origin별 필수 분기는 `admin.md` 3.1 그대로다.** 이 문서가 분기를 새로 정하지 않는다.
- `sources[]`의 **입력 순서가 곧 표시 순서**다(`content_sources.position` — `domain.md` 5.5).
- `duration_sec`은 받지 않는다. **서버가 오디오에서 추출한다**(`admin.md` 3.1).
- `review_confirmed`는 **저장 컬럼이 없다.** 미체크 업로드를 막는 게 목적이고 증적은 `audit_logs`가 담당한다(`domain.md` 5.1, 확정 2026-08-06).
- `partner_id`는 **존재 검증을 하지 않는다.** `partners` 테이블이 아직 없어 uuid 형식만 본다 — 9장 미결.

**`enrichment_file` — 추천 메타 파일** (`admin.md` 3.1의 계약 표현, 등재 2026-09-08)

- 저장 대상: `difficulty` · `format` · `is_evergreen` · `keywords` → `contents` 메타 4종,
  `embedding.vector` → `content_embeddings` upsert(콘텐츠당 1행). 생략된 키는 저장하지 않는다
  (결손 = 스코어링 중립 — `domain.md` 5.1·5.6).
- 검증: enum은 `domain.md` 5.1과 글자 일치, 벡터는 1536차원, `embedding.model`은 현재 모델
  (`text-embedding-3-small`)과 일치해야 한다. **모르는 최상위 키는 거부한다**(오타가 결손으로
  둔갑하는 것을 막는다 — 명세의 `source` 폴백 표식은 허용).
- **검증 실패는 파일만 거부하고 업로드는 진행한다** — 추천 메타는 발행 요건이 아니다.
- 응답에 처리 결과가 실린다(**파일이 있었을 때만** 존재): `enrichment_applied: boolean`,
  거부 시 `enrichment_rejected_reason: string`(콘솔이 그대로 노출하는 사유).

201로 `AdminContentItem`을 반환한다.

### 4.7 `POST /admin/contents/:contentId/withdraw`

```jsonc
{ "reason": "..." }   // 선택, 500자 이내
```

200으로 `AdminContentItem`을 반환한다(`status`가 `withdrawn`, `withdrawn_at` 설정됨).

- **회수 사유는 감사 로그에만 남고 사용자에게 노출되지 않는다**(`admin.md` 3.3).
- 이미 회수된 콘텐츠면 **409 `CONFLICT`**.
- 노출면 반영은 `partner-control.md` 4.3을 따른다.

### 4.8 `POST /admin/contents/:contentId/restore`

본문 없다. 200으로 `AdminContentItem`을 반환한다.

- 회수 상태가 아니면 **409 `CONFLICT`**.
- **삭제된 `library_items`는 되살리지 않는다.** 복구는 콘텐츠를 다시 노출시킬 뿐 사용자 보관함의 과거 상태를 복원하지 않는다.

### 4.9 `GET /admin/system-stats`

서버 자원과 DB 부하의 읽기 전용 스냅샷 (2026-09-06 등재). 어드민 로그 콘솔 서버 상태 탭이 15초 폴링한다 — `features/backend-monitoring.md` 참조.

**Response 200**

```json
{
  "host": {
    "load_1m": 0.42, "load_5m": 0.31, "load_15m": 0.28,
    "cpu_count": 2, "cpu_used_percent": 23.5,
    "mem_total_bytes": 4294967296, "mem_available_bytes": 1717986918,
    "uptime_sec": 1036800
  },
  "db": {
    "connections": { "total": 12, "active": 2, "idle": 9, "idle_in_transaction": 1, "waiting": 0, "longest_active_sec": 0.8, "max": 100 },
    "slow_queries": [ { "pid": 4211, "state": "active", "duration_sec": 0.8, "query": "SELECT ... $1" } ],
    "cache_hit_ratio": 0.997,
    "xact_commit": 182340, "xact_rollback": 214, "deadlocks": 0, "size_bytes": 327155712
  },
  "history": [
    { "t": 1788678000000, "cpu_used_percent": 23.5, "mem_used_percent": 61.2, "db_conn_total": 12 }
  ],
  "measured_at": "2026-09-06T06:00:00.000Z"
}
```

- `host.*`는 `/proc` 기준 **호스트 전체** 값(컨테이너가 커널을 공유) — API·DB가 같은 EC2인 현 구성에서 서버 자원 그 자체다. `cpu_used_percent`는 300ms 구간 샘플이며 못 읽는 환경(비 Linux)이면 null.
- `history`는 서버가 60초마다 쌓는 자원 샘플(최대 6시간, 오래된 것부터) — **프로세스 메모리 링 버퍼라 재기동(배포) 시 비워진다.** 대시보드 시간축 그래프의 원천이다. 못 읽은 값은 null.
- `db.*`는 pg 통계 뷰(current_database 한정) 읽기 전용. `slow_queries.query`는 150자 제한이며 바인딩 파라미터(`$1`) 형태라 사용자 데이터 원문이 없다. `cache_hit_ratio`는 통계 누적 기준(집계 전이면 null).

### 4.10 `PATCH /admin/contents/:contentId` — 재발행

`admin.md` 4.3의 계약이다 (2026-09-07 등재·구현). 발행된 콘텐츠의 **오디오(또는 메타)를 같은 행에서 교체**하고
`content_version`을 1 올린다. `content_id`가 유지되므로 `library_items` · `content_stats` 참조가 끊기지 않는다(재생 위치는 아래 "재생 위치 폐기" — 서버가 지운다).
발생 경위: 파이프라인이 TTS 규격(배속·무음 등)을 바꿔 오디오를 재생성했을 때 발행본을 갈아끼우는 경로가 없었다.

`multipart/form-data`. **모든 파트가 선택**이되 최소 1개는 있어야 한다.

| 파트 | 규격 | 필수 |
|---|---|---|
| `audio` | mp3 / m4a, ≤200MB — 4.6과 같다 | 선택 |
| `thumbnail` | jpg / png / webp, ≤5MB | 선택 |
| `payload` | JSON 문자열 — 4.6 `payload`의 부분집합(`title` `description` `source_name` `topic_ids` `sources`). 넘긴 키만 바꾼다 | 선택 |
| `enrichment_file` | `enrichment.json` — 규격·검증·응답 필드는 4.6과 같다 | 선택 (등재 2026-09-08) |

- **오디오를 교체하면 `duration_sec`을 다시 추출**한다(4.6과 동일 — 클라이언트 값을 받지 않는다). 이전 파일은 새 파일 저장·트랜잭션 성공 후 지운다.
- **`content_version`은 파트가 무엇이든 1 증가**한다. 메타만 바뀌어도 올린다 — 클라이언트의 재발행 판정(`player-api.md` 4.1·4.2)이 버전 하나로 동작해야 한다. **단 하나의 예외가 `enrichment_file` 단독 전송이다**(2026-09-08): 추천 메타만 반영하고 **버전을 올리지 않으며** 아래 재생 위치 폐기도 일어나지 않는다 — 오디오가 그대로인데 버전이 오르면 전 사용자의 재생 위치가 헛되이 폐기된다. 기존 발행분 소급 부여가 이 경로를 쓰고, 감사 로그는 `content.enrich`로 남는다(`republish`와 구분).
- `origin` · `partner_id` · `series_id` · `episode_no` · `total_episodes` · `license_expires_at`은 **바꾸지 않는다** — 발행 단위의 정체성이라 필요하면 회수 후 새로 올린다.
- `status`가 `published`가 아니면 **409 `CONFLICT`** (회수·만료 상태에서는 재발행하지 않는다 — `admin.md` 4.6 "만료 상태에서는 재발행을 막는다").
- `topic_ids`를 넘기면 전체 교체다(빈 배열 불가 — 최소 1개, 4.6과 동일).
- **`sources`도 전체 교체이고, 비울 수 있는지는 `origin`이 정한다** — 4.6과 같은 공시 규칙이다(`admin.md` 3.1).
  `ai_generated`면 최소 1개(빈 배열은 400 `VALIDATION_FAILED`, `details.field = "sources"`),
  `partner`면 넣지 않는다(넣으면 같은 400). **`origin`은 재발행이 바꾸지 못하므로 기존 행의 값으로 판정한다.**
  이 조건이 없으면 업로드로는 만들 수 없는 행이 재발행으로만 생긴다.
- `audit_logs`에 `republish` 행위로 기록한다 — 행위자·이전/이후 `content_version`·바뀐 파트 목록.

200으로 갱신된 `AdminContentItem`(증가한 `content_version` 포함)을 반환한다.

**흐름** — 4.6과 같은 순서: 검증 → 새 파일 저장(트랜잭션 밖) → 트랜잭션(행 갱신 + `content_version + 1` + 주제·출처 교체) → 성공 시 이전 파일 삭제 / 실패 시 새 파일 삭제.

**재생 위치 폐기** (확정·구현 2026-09-07 — `republish-stale-playback-position.md` 안 A): 재발행
트랜잭션에서 그 콘텐츠의 `playback_progresses`를 **전부 삭제한다.** 다음 진입의
`player-api.md` 4.1 응답이 `progress: null`이 되어 0부터 재생된다 — 콜드오픈 폐지처럼 같은
초가 다른 내용을 가리키게 되는 재발행에서 낡은 위치가 내려가는 것을 막는다.
라이브러리(`library_items`)·재생 기록(`play_records`)은 유지된다. **폐기 주체는 서버다** —
앱은 위치를 로컬에 보관하지 않으므로 클라이언트 측 폐기 동작은 없다(`player.md` 7).

### 4.11 `DELETE /admin/contents/:contentId/storage` — 저장소 파일 회수

`admin.md` 4.4의 회수 **다음 단계**다(등재 2026-09-09). 회수(`withdrawn`)된 콘텐츠의 오디오·썸네일을 저장소에서 지워 **보관 비용을 끊는다.** 본문 없다. 204를 반환한다.

- **`status`가 `withdrawn`이 아니면 409 `CONFLICT`.** 노출 중인 콘텐츠의 파일을 지우면 재생이 그 자리에서 깨진다 — 회수가 먼저다.
- **되돌릴 수 없다.** 복구(4.8)로 상태를 되돌려도 **파일이 없어 재생이 실패한다.** 다시 쓰려면 재발행(4.10)으로 오디오를 올려야 한다.
- **`contents` 행은 지우지 않는다**(결정 2026-09-09). 행을 지우면 그것을 참조하는 `play_records`가 함께 사라져야 하는데, 그 값이 **파트너 정산의 원본 근거**다(FR-34 — `total_listen_sec`). 집계(`content_stats`)만 남기고 원본을 없애면 정산 수치를 되짚을 수 없다.
- 사용자에게 보이는 차이는 없다 — 노출은 회수가 이미 막고 있다.
- `audit_logs`에 `content.purge_storage`로 기록한다. **파일이 사라진 뒤 그 콘텐츠가 왜 재생되지 않는지를 이 기록으로만 설명할 수 있다.**

## 5. 에러 코드 표

| error_code | HTTP | retryable | 발생 지점 |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | false | 필수값 누락·형식 위반. `details.field` 포함 |
| `ADMIN_AUDIO_UNREADABLE` | 400 | false | 4.6·4.10 — 오디오 길이 추출 실패·0초 |
| `ADMIN_TOPIC_NOT_FOUND` | 400 | false | 4.6 — 존재하지 않는 `topic_ids`. **숨김 주제는 허용된다** |
| `ADMIN_LICENSE_EXPIRED` | 400 | false | 4.6 — 만료된 파트너 라이선스 |
| `FORBIDDEN` | 403 | false | 전 라우트 — `role != admin` |
| `ADMIN_TOPIC_HAS_CONTENTS` | 409 | false | 4.4 — `details.content_count` |
| `CONFLICT` | 409 | false | 4.7 — 이미 회수됨 / 4.8 — 회수 상태가 아님 / 4.10 · 4.11 — `withdrawn`이 아님 |
| `VALIDATION_FAILED` | 400 | false | 4.10 — 파트가 하나도 없음(`details.field = "audio"`) / `sources` 교체가 `origin`의 공시 규칙에 어긋남(`details.field = "sources"`) |
| `ADMIN_STORAGE_FAILED` | 502 | **true** | 4.6·4.10 — 저장소 실패 |

전체 목록·클라이언트 동작은 `common-error-handling.md` 9.10이 기준이다.

## 6. 흐름 — 업로드(4.6)

```
[검증]  필수값 · 파일 형식 · 라이선스 기간 · 주제 유효성
   ↓
[저장]  오디오·썸네일을 저장소에 업로드 → audio_path 확보   ← 트랜잭션 밖
   ↓
[트랜잭션]  contents(status=published, published_at=now)
            + content_topics + content_sources(ai_generated)
   ↓ 실패 시
[정리]  올린 파일을 지운다
```

- **저장소 먼저, DB 나중이다**(`admin.md` 4.2). 반대로 하면 수백 MB 전송 동안 트랜잭션이 열려 있게 된다.
- **`draft`가 없다. 업로드 = 발행이다**(`domain.md` 5.1). 별도 발행 버튼이 없다.
- **재생 경로 등록 단계가 없다.** `audio_path`를 직접 서명하므로 매핑 계층이 없고, 따라서 발행 직후 전파 지연도 없다(`backend/architecture.md` 9.4 — 개정 2026-08-31).

## 7. 보안·검증 규칙

- **`audio_path`를 응답에 싣지 않는다**(`domain.md` 5.1). `AdminContentItem`에도 없다 — 관리자라고 예외를 두지 않는다.
- 썸네일은 `thumbnail_url`(무서명 공개 경로)로 내려간다. 오디오와 취급이 다르다(`architecture.md` 9.4).
- 파일 크기·MIME 검증은 서버에서 한다. 콘솔의 `accept` 속성은 편의일 뿐 판정이 아니다.

## 8. 데이터 모델 — `AdminContentItem`

```
id, title, description, origin, status,
author_name, source_name, source_url, partner_id,
series_id, episode_no, total_episodes,
duration_sec, thumbnail_url, content_version,
license_expires_at, published_at, withdrawn_at,
topics[{ topic_id, name }]
```

**`audio_path`는 싣지 않는다**(7장).

## 9. 미결 사항

- **`partner_id` 존재 검증** — `partners` 테이블이 없어 형식만 본다. 테이블 도입 시 FK와 함께 검증을 넣는다
- **업로드 파일 규격** — 비트레이트·샘플레이트 상한 미정(`admin.md` 미결과 공유). 현재는 용량·MIME만 본다
- **중복 업로드 방지 키** — 현재는 운영 책임(`admin.md` 미결). `(partner_id, source_url)` 유니크 도입 여부 미정
- **파일 규격 상한은 서버 보호용 임시값이다** — `admin.constant.ts`가 그렇게 명시한다. `admin.md` 미결 "업로드 대상 파일 규격"이 확정되면 상수만 바꾼다

> 에러 코드 5종은 **이미 `error-code.enum.ts`에 등재돼 있다**(코드 대조 2026-09-03). `common-error-handling.md` 9.11의 enum 동기화 대기 목록에 넣지 않는다.
