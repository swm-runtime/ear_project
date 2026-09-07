# [BE] 콘텐츠 재발행 API — 같은 `content_id`에 오디오 교체, `content_version` 증가

| 항목 | 값 |
|---|---|
| 대상 | `PATCH /admin/contents/:contentId` (신규) · `contents.content_version` · `audit_logs` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 2026-09-07 파이프라인 TTS 규격 변경(콜드오픈 폐지·앞뒤 무음 2초·윤아 1.2배속, PR #155) — 이미 발행된 편의 오디오를 갈아끼울 경로가 없었다 |
| 근거 문서 | `features/admin.md` 4.3 재발행 · `backend/domain.md` 5.1 `content_version` · `features/player.md` 7 · `spec/api/admin-api.md` **4.10** (계약 등재, 2026-09-07) |
| 심각도 | **중** — 지금은 회수 후 재업로드뿐인데 그러면 `content_id`가 바뀌어 사용자 라이브러리·재생 기록이 끊긴다 |
| 상태 | 대기 |

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
