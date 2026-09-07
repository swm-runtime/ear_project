# [BE] 콘텐츠 재발행 API — 같은 `content_id`에 오디오 교체, `content_version` 증가

| 항목 | 값 |
|---|---|
| 대상 | `PATCH /admin/contents/:contentId` (신규) · `contents.content_version` · `audit_logs` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 2026-09-07 파이프라인 TTS 규격 변경(콜드오픈 폐지·앞뒤 무음 2초·윤아 1.2배속, PR #155) — 이미 발행된 편의 오디오를 갈아끼울 경로가 없었다 |
| 근거 문서 | `features/admin.md` 4.3 재발행 · `backend/domain.md` 5.1 `content_version` · `features/player.md` 7 · `spec/api/admin-api.md` **4.10** (계약 등재, 2026-09-07) |
| 심각도 | **중** — 지금은 회수 후 재업로드뿐인데 그러면 `content_id`가 바뀌어 사용자 라이브러리·재생 기록이 끊긴다 |
| 상태 | 반영 완료 (2026-09-07) |

## 문제

`admin.md` 4.3과 `domain.md` 5.1은 재발행을 "새 행을 만들지 않고 같은 행의 `content_version`을 올린다"로 정의했고,
`player-api.md` 4.1·4.2는 클라이언트가 그 버전으로 저장 위치·오프라인 파일을 폐기하도록 정해 두었다.
그런데 **버전을 올리는 서버 경로가 없다.** admin 컨트롤러의 콘텐츠 라우트는 목록·업로드·회수·복구 넷뿐이고
`admin-api.md` 1장도 이를 미구현으로 적어 두었다.

파이프라인은 배속·무음 같은 오디오 규격을 바꾸면 발행된 편의 오디오를 재생성하는데, 제품에 반영할 방법이
"회수 → 새로 업로드"뿐이라 `content_id`가 바뀌고 사용자 데이터가 끊긴다.

## 요청 내용

`spec/api/admin-api.md` 4.10의 계약대로 구현한다. 요지:

1. `PATCH /admin/contents/:contentId` — `multipart/form-data`, 파트 `audio` · `thumbnail` · `payload`(4.6 payload 의
   부분집합: `title` `description` `source_name` `topic_ids` `sources`) 전부 선택, 최소 1개.
2. 오디오를 받으면 `duration_sec` 재추출(4.6과 동일). 새 파일 저장(트랜잭션 밖) → 트랜잭션(행 갱신 + `content_version + 1`
   + 주제·출처 교체) → 성공 시 이전 파일 삭제, 실패 시 새 파일 삭제.
3. `content_version`은 파트가 무엇이든 **1 증가** — 메타만 바뀌어도 올린다(클라이언트 재발행 판정이 버전 하나로 동작).
4. `status != published` → 409 `CONFLICT`. 파트 없음 → 400 `VALIDATION_FAILED`(`details.field = "audio"`).
   `origin` · `partner_id` · `series_*` · `license_expires_at`은 바꾸지 않는다.
5. `audit_logs`에 `republish` 기록 — 행위자·이전/이후 버전·바뀐 파트.
6. 200으로 갱신된 `AdminContentItem` 반환.

파이프라인 쪽은 준비돼 있다: 발행 시 `content_id`·`content_version`을 자동 기록하고, 발행 후 재합성된 에피소드 상세에
[재발행 — 오디오 교체] 버튼이 이 엔드포인트를 호출한다(백엔드가 404를 주면 "구현 대기"로 안내). 엔드포인트가 열리면 코드 변경 없이 동작한다.

## 프론트 확인 항목 (FE 몫 — 같이 처리)

- 앱 플레이어가 `content_version` 증가를 감지해 저장 위치·오프라인 파일을 폐기하는지(`player.md` 7). 현재 타입에는 필드가 있으나 판정 코드는 확인 필요.

## 완료 조건

- Given 발행된 콘텐츠 / When `PATCH /admin/contents/:id`에 `audio`만 보낸다 / Then 200, 같은 `id`, `content_version`이 1 증가, `duration_sec`이 새 파일 기준으로 바뀌고, 이전 오디오 파일은 저장소에서 사라진다
- Given 같은 요청 / When 사용자의 `library_items` · `playback_progresses`를 본다 / Then 행이 그대로 남아 있다
- Given 회수된 콘텐츠 / When 재발행을 요청한다 / Then 409 `CONFLICT`
- Given 파트 없는 요청 / When 보낸다 / Then 400 `VALIDATION_FAILED`, `details.field = "audio"`
- Given 재발행 성공 / When `audit_logs`를 조회한다 / Then `republish` 행에 행위자·이전/이후 버전이 있다
- Given 파이프라인 에피소드 상세 / When [재발행 — 오디오 교체]를 누른다 / Then 제품 `content_version`이 올라가고 파이프라인 `backlog.published_version`이 같은 값으로 갱신된다

## 처리 기록 (반영 날짜: 2026-09-07)

`PATCH /admin/contents/:contentId` 구현. `admin-api.md` 4.10 계약 그대로이고, **마이그레이션은 없다** —
`contents.content_version`은 이미 있었고 비어 있던 것은 그 값을 올리는 경로뿐이었다.

- **`ContentService.republish`** — 넘어온 키만 갈아끼우고 `content_version`을 1 올린다.
  주제·출처는 넘기면 **전체 교체**(지우고 다시 넣는다). `ContentTopicRepository` ·
  `ContentSourceRepository`에 `deleteAllByContentId`를 추가했다.
- **`AdminContentService.republish`** — 흐름은 업로드와 같되 **지우는 순서가 반대다**:
  새 파일 저장(트랜잭션 밖) → 트랜잭션 → **성공 시 이전 파일 삭제 / 실패 시 새 파일 삭제.**
  이전 파일을 트랜잭션 전에 지우면 롤백됐을 때 행은 옛 경로를 가리키는데 파일이 없다.
- **`published` 판정을 두 번 한다.** 파일을 올리기 전(200MB를 다 받고 409를 주지 않으려고)과
  트랜잭션 안(올리는 동안 회수됐을 수 있어서).
- **`ContentStorageClient.resolveKey`** 신설 — 이전 썸네일을 지우려면 공개 URL에서 키를
  되짚어야 하는데(`contents`에는 URL만 있다), 호출부에서 경로를 파싱하면 `AUDIO_URL_BASE_URL`이
  경로 접두어를 갖는 배포(local 모드의 `/api/v1/audio`)에서 조용히 어긋난다. **로컬 실행에서
  실제로 재현했다.** URL을 만든 쪽이 되짚도록 저장소 클라이언트로 옮겼다.
- **계약에 없던 판정 하나를 넣었다** — 출처 교체는 업로드(4.6)의 공시 규칙을 그대로 지킨다.
  `ai_generated`의 `sources`를 빈 배열로 비우거나 `partner`에 붙이면 400이다. 그러지 않으면
  **업로드로는 만들 수 없는 행이 재발행으로만 생긴다**(`admin.md` 3.1). 파이프라인은 `audio`만
  보내므로 영향 없다. 문서 등재는 `changes/archive/admin-api-republish-implemented.md`로 발행·반영했다(2026-09-07).
- 단위 테스트 11건 추가(`admin-content.service.spec.ts`), 전체 491건 통과.

### 완료 조건 검증 — 로컬 서버 실행 대조 (`AUDIO_DELIVERY=local`)

빌드·테스트 통과로 끝내지 않고 실제로 띄워서 요청을 보냈다.

| 완료 조건 | 결과 |
|---|---|
| `audio`만 → 200 · 같은 `id` · 버전 1 증가 · `duration_sec` 재추출 · 이전 파일 삭제 | ✅ v1→v2, 8초→18초, 저장소에 새 키만 남음 |
| `library_items` · `playback_progresses` 유지 | ✅ 두 행 그대로, `position_sec` 42 유지 |
| 회수된 콘텐츠 → 409 `CONFLICT` | ✅ 파일을 올리기 전에 막힘 |
| 파트 없음 → 400, `details.field = "audio"` | ✅ 빈 `payload`·빈 본문 모두 |
| `audit_logs`에 `republish` + 행위자 + 이전/이후 버전 | ✅ `before {content_version:1}` / `after {content_version:2, changed_parts:["audio"]}` |
| 파이프라인 [재발행 — 오디오 교체] 왕복 | ⏳ **배포 후 확인** — 서버 코드는 준비됐고, 파이프라인은 이미 이 엔드포인트를 호출한다(404 안내 분기 포함) |

추가로 확인한 것: 메타만 바꿔도 버전이 오른다 · 썸네일 교체 시 이전 썸네일 삭제 ·
주제·출처 전체 교체 · `origin`·`partner_id` 등 정체성 필드는 `forbidNonWhitelisted`로 400 ·
`topic_ids: []` 400 · 없는 주제 `ADMIN_TOPIC_NOT_FOUND`.

### 남은 것

- **배포 후 파이프라인 왕복 1회** (마지막 완료 조건). 그때 `backlog.published_version`이 같이 오르는지 본다.
- **FE 확인 항목 → 티켓 2건 발행.** `tickets/backend/pending/republish-stale-playback-position.md`(해결) ·
  `tickets/frontend/pending/republish-version-gate-not-implemented.md`(죽은 분기·주석 정리). 아래 참조.

### FE 확인 항목 결과 — "앱이 `content_version` 증가를 감지해 저장 위치를 폐기하는가"

**FE 코드는 폐기하지 않는다. 그리고 폐기할 수 없다.** 프론트는 재생 위치를 로컬에 저장하지
않는다(`playback.store.ts`에 persist 미들웨어가 없고, `storage-keys.ts`에 위치 키가 없다).
매 진입마다 서버(4.1 `progress.position_sec`)에서 받아 쓰므로 **버리고 말고가 서버 몫이다.**
`playback.service.ts:566`의 버전 비교는 같은 세션 안의 서버 값 둘을 비교하는 것이라 무의미하고,
분기 내용도 로그뿐이다. 오프라인 저장분은 기능 자체가 없다(P1 이연 — `offline-download.md`).

**FE 코드 수정은 필요 없다.** 대신 서버 쪽에 구멍이 하나 남는다 —

- **저장은 이미 막혀 있다.** `playback-progress.service.ts:64`가 `content_version` 불일치 저장을
  버린다(`player-api.md` 4.3 서버 처리 2). 낡은 `max_reached_sec`으로 가짜 완청이 나는 것은 막힌다.
- **읽기는 막혀 있지 않다.** 재발행해도 `playback_progresses` 행은 남고(이 티켓의 완료 조건),
  다음 진입의 4.1 응답이 **재발행 이전 위치를 그대로 내려준다.** 클라이언트는 그게 낡은 값인지
  알 방법이 없다 — 보관한 버전이 없기 때문이다. 새 오디오의 엉뚱한 지점에서 재생이 시작된다.
- 유일한 방어는 `playback.service.ts:221`의 길이 초과 폴백이라 **길이가 짧아진 재발행만** 걸린다.
  콜드오픈 폐지·무음 추가 같은 이번 규격 변경은 길이가 늘 수도 줄 수도 있다.

이 티켓의 범위(엔드포인트 구현)를 넘고, 완료 조건 "`playback_progresses` 행이 그대로 남아 있다"와
정면으로 부딪히는 판단이라 **여기서 임의로 바꾸지 않고 티켓으로 분리했다.**
