# [BE] 콘텐츠 영구 삭제 API — 회수된 콘텐츠를 행·파일까지 지운다

| 항목 | 값 |
|---|---|
| 대상 | `DELETE /admin/contents/:contentId` (신규) · `contents` · `content_topics` · `content_sources` · `library_items` · `playback_progresses` · 저장소 파일 · `audit_logs` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 2026-09-09 파이프라인 콘솔 "제품 발행 › 콘텐츠 상세"에 삭제를 붙이려다 — 관리자 API에 회수·복구(4.7·4.8)만 있고 삭제가 없다. 테스트·중복 업로드로 생긴 콘텐츠(예: 같은 에피소드를 두 번 올린 경우)를 정리할 방법이 회수뿐이라 목록에 영구히 남는다 |
| 근거 문서 | `spec/api/admin-api.md` 3장 엔드포인트 목록 · `features/admin.md` 4.4 회수·복구 · `backend/domain.md` 5.1 |
| 심각도 | **하** — 회수로 사용자 노출은 막을 수 있다. 운영 목록 정리·저장소 비용의 문제 |
| 상태 | 대기 |

## 문제

콘솔에서 잘못 올린 콘텐츠를 지울 수 없다. 회수(`withdrawn`)는 사용자에게서 숨기지만 행·오디오·썸네일이 남고,
목록에도 계속 보인다. 테스트 업로드·중복 업로드가 쌓이면 운영 목록과 저장소가 어지러워진다.

## 요청 내용 (제안 — 계약은 백엔드가 확정해 `admin-api.md`에 등재)

- `DELETE /admin/contents/:contentId` — **`status = withdrawn` 일 때만** 허용. `published`면 409 `CONFLICT`(회수가 먼저). 만료(`expired`)는 허용 여부 백엔드 판단.
- 지우는 것: `contents` 행, `content_topics`·`content_sources` 연결, 저장소의 오디오·썸네일 파일. `library_items`·`playback_progresses`는 회수 시 이미 정리되는 규약(`partner-control.md` 4.3)이면 그대로, 남아 있으면 함께.
- `content_stats`·`audit_logs`는 남긴다(집계·증적). `audit_logs`에 `delete` 행위로 행위자·content_id·제목을 기록.
- 응답 204. 파이프라인 콘솔은 성공 시 `backlog.published_content_ref`를 비우고 `publish_log`에 `delete` 사건을 남긴다(파이프라인 몫).

## 완료 조건

- Given `withdrawn` 콘텐츠 / When 관리자가 DELETE 한다 / Then 204, 행·연결·파일이 사라지고 목록에서 보이지 않으며 `audit_logs`에 `delete`가 남는다
- Given `published` 콘텐츠 / When DELETE 한다 / Then 409 `CONFLICT`, 아무것도 바뀌지 않는다
- Given 삭제된 `content_id` / When 사용자 앱이 4.1 상세를 요청한다 / Then 404 (기존 회수와 같은 처리)

## 처리 기록

- (반영 시 기입)
