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

## 처리 기록 (반영 날짜: 2026-09-09)

**요청과 다르게 구현했다 — `contents` 행을 지우지 않는다.** 계약은 `admin-api.md` **4.11**로 등재했다.

### 왜 행을 남기는가

구현 중 `contents` 삭제가 **`fk_play_records_contents`에 막혔다**(로컬 실측). 행을 지우려면 그것을 참조하는 사용자 활동을 함께 지워야 하는데, 거기에 **`play_records` — 파트너 정산의 원본 근거**가 들어 있다(FR-34 `total_listen_sec`).

집계(`content_stats`)만 남기고 원본을 없애면 **정산 수치를 되짚을 수 없다.** 티켓은 `library_items`·`playback_progresses`까지만 다뤘고 재생 기록·신호·접근 로그는 범위 밖이었다.

사용자 확정(2026-09-09): **파일만 지우고 행은 남긴다.**

- 티켓의 목적 둘 중 **저장소 비용은 해결된다.**
- **운영 목록 정리는 해결되지 않는다** — 회수 목록에 계속 남는다. 필요하면 목록 필터(예: "파일 정리됨" 구분)로 별도 처리한다.

### 반영

- `DELETE /admin/contents/:contentId/storage` — 204. `withdrawn`이 아니면 409
- `AdminContentService.purgeStorage` — 상태 판정을 트랜잭션 앞뒤로 두 번(파일을 지우는 동안 복구됐을 수 있다), **감사 로그를 같은 트랜잭션에서 먼저** 남기고 성공 후 파일 삭제
- `audit_logs`에 `content.purge_storage` — 파일이 사라진 뒤 **왜 재생되지 않는지의 유일한 설명**
- `admin-api.md` 4.11 등재 + 3장 표 + 5장 에러 표
- 단위 테스트 4건

### 실 서버 대조

| | 결과 |
|---|---|
| 회수된 콘텐츠에 DELETE | ✅ 204 · 파일 삭제 |
| 같은 시점 DB | `contents` 1 · `play_records` 1 · `content_stats` 3 **전부 유지** |
| `audit_logs` | `content.purge_storage` 1건 |
| `published`에 시도 | ❌ 409 `CONFLICT` |

### 남은 것

- **완료 조건 1·3은 이 구현으로 충족되지 않는다** — "행이 사라진다", "상세가 404". 행이 남으므로 상세는 종전대로 403 `CONTENT_WITHDRAWN`이다. 회수 상태의 계약이 그대로 적용된다.
- 파이프라인 콘솔의 `backlog.published_content_ref` 정리는 파이프라인 몫으로 남는다.
