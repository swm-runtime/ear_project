# [BE] 시리즈째 담기 — 시리즈 담기·빼기·복구 API(`library_series`), 새 편 발행 시 담은 사용자에게 자동 적립

| 항목 | 값 |
|---|---|
| 대상 | 신규 테이블 `library_series` + 마이그레이션 · 신규 `POST`·`DELETE /series/:series_id/save` · `POST /series/:series_id/restore` · `GET /series/:series_id` 응답 `series.is_saved` · 발행 경로(새 편 → 시리즈째 담은 사용자에게 적립) · 탈퇴 파기 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 14:57 "새 편 따라 들어오게 하자" |
| 담당 | 백엔드 |
| Jira | [KAN-245](https://runtime364.atlassian.net/browse/KAN-245) · 뒤따르는 FE [KAN-246](https://runtime364.atlassian.net/browse/KAN-246)(blocks) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일) |
| 선행 | 없음(티켓). 문서 개정 기록 `changes/pending/series-follow-new-episodes.md`를 같은 PR에서 반영 |
| 반영 날짜 | 2026-10-22 |
| 근거 문서 | `changes/pending/series-follow-new-episodes.md` · `features/explore.md` 4.7 · `spec/api/explore-api.md` 4.3·4.7 · `backend/domain.md` 5.9·6.1 · `features/library.md` 4.5 |
| 중요도 | Medium |
| 상태 | 완료 |

## 왜

시리즈 화면 [+]는 지금 FE가 편 담기(`POST /contents/:id/save`)를 노출 편 수만큼 보내는 구현이다(#1835 · 다 담겼으면 🗑 전부 빼기 #1839). 서버는 "시리즈째 담았다"를 모르니, 연재 중 시리즈에 새 편이 공개돼도 라이브러리에 들어가지 않는다. PM 결정(2026-10-22 14:57): **시리즈째 담은 사용자에게는 새 편이 따라 들어온다.**

라이브러리는 **편 단위 그대로**다 — 시리즈 카드로 묶지 않는다(같은 날 14:55 철회 — `tickets/backend/archive/library-series-save.md`).

## 규칙

- **따라오기의 근거는 시리즈째 담기(`library_series` 행) 하나다.** 편 하나씩 담은 것·드립 적립은 따라오기가 아니다.
- 🗑(시리즈째 빼기) = 담긴 편 전부 + 시리즈 담기 기록을 함께 뺀다 → 더 따라오지 않는다.
- **편 하나를 라이브러리에서 따로 빼도 시리즈째 담기는 유지된다**(새 편은 계속 온다). 다만 사용자가 뺀 편은 다시 넣지 않는다.
- 새 편 적립은 `source = save`, `added_at` = 적립 시각 → 라이브러리 맨 위. 푸시 알림은 범위 밖.

## 무엇을 한다

1. **마이그레이션** — `library_series (id uuid PK, user_id FK → users ON DELETE CASCADE, series_id FK → series, added_at timestamptz NOT NULL, deleted_at timestamptz NULL)` · `uq_library_series_user_id_series_id (user_id, series_id)` · `idx_library_series_series_id_deleted_at (series_id, deleted_at)`. 탈퇴 즉시 파기·보존 표에 추가.
2. **`POST /series/:series_id/save`** (`{ client_seq }`) — 한 트랜잭션: `library_series` upsert(삭제분이면 되살리고 `added_at` 새로) + 노출 편(발행·사용자 시장·회수 아님) 중 라이브러리에 살아 있는 행이 없는 편을 편 담기 규칙 그대로 적립(재담기면 `added_at` 새로·`queue_position` NULL, `user_signals(save)`). 응답 `{ series_id, added_count, client_seq }`. 멱등. 404 = 없는 시리즈·다른 시장·노출 편 0.
3. **`DELETE /series/:series_id/save`** (`{ client_seq }`) — `library_series` 소프트 삭제 + 그 시리즈의 살아 있는 `library_items` 전부를 편 삭제 규칙 그대로 소프트 삭제(신호·영구 제외 동일). 응답 `{ series_id, removed_item_ids[], client_seq }`.
4. **`POST /series/:series_id/restore`** (`{ item_ids[] }`) — 실행 취소. `library_series` 되살림(`added_at` 그대로) + 넘긴 행만 복구(편 복구 `library-api.md` 4.7과 같다 — 자리·`added_at` 유지). 본인 행·그 시리즈 편이 아니면 무시.
5. **`GET /series/:series_id`** — `series.is_saved: boolean`(살아 있는 `library_series`).
6. **새 편 적립** — 시리즈 편이 처음 노출되는 시점(신규 발행·회수 복구 아님)에 그 시리즈의 살아 있는 `library_series` 사용자 중 **같은 시장**이고 그 편의 `library_items` 행이 **없는**(삭제 이력도 없는) 사용자에게 `INSERT … SELECT` 한 문장으로 적립. 유니크가 중복을 막는다. 실패해도 발행은 성공으로 두고 로그.
7. **테스트** — 담기 멱등·일부 담김 · 빼기 → 복구 자리 유지 · 새 편 발행 → 시리즈째 담은 사용자만 · 편을 따로 뺀 사용자는 그 편 재적립 안 됨 · 시리즈째 빼기 뒤 새 편 안 옴 · 다른 시장 제외 · 탈퇴 파기 · `is_saved`.
8. **문서** — changes 문서를 같은 PR에서 반영하고 `archive/`로.

## 범위 밖

- 라이브러리 시리즈 카드(철회) · 새 편 푸시 · 이 기능 전에 편 단위 루프로 담은 사용자의 소급(개발계뿐 — 소급하지 않는다)

## 완료 조건

- Given 연재 중 시리즈 5편, 라이브러리에 0편 / When `POST /series/:id/save` / Then `added_count: 5`, `library_series` 1행, `GET /series/:id`의 `is_saved: true`
- Given 시리즈째 담은 사용자 A, 편 하나만 담은 B / When 6화 발행 / Then A의 라이브러리에만 6화가 맨 위에 생긴다
- Given A가 3화만 따로 뺐다 / When 7화 발행 / Then 7화는 들어오고 3화는 돌아오지 않는다
- Given A가 `DELETE /series/:id/save` / When 8화 발행 / Then A에게 들어오지 않는다
- Given `DELETE` 응답의 `removed_item_ids`로 5초 안에 `POST /series/:id/restore` / Then 목록이 빼기 전과 같고 `is_saved: true`
- Given 마이그레이션 적용 / Then `library_series`가 `domain.md`와 같고 탈퇴 시 즉시 파기된다

## 처리 기록

- 2026-10-22 14:57 발행.
- 2026-10-22 반영(dev PR — `feat(be)/series-follow-new-episodes`). **운영은 다음 dev → main 릴리스와 함께 나간다.**
  - 마이그레이션 `1791400000000-AddLibrarySeries` · `LibrarySeries` 엔티티·저장소·`LibrarySeriesService`(library 모듈).
  - `POST`·`DELETE /series/:series_id/save` · `POST /series/:series_id/restore` · `GET /series/:series_id`의 `series.is_saved` — `series-detail` Orchestrator가 편 담기(`LibraryService.save`)·편 해제(소프트 삭제 + `drip_excluded_contents(unsave)` + `user_signals(unsave)`)·편 복구(`LibraryService.restore`) 규칙을 편마다 그대로 부른다. 빼기의 `client_seq`는 편 해제와 같이 쿼리. 담기·빼기·실행 취소 모두 200.
  - 새 편 적립 훅은 `AdminContentService.upload`(신규 발행)에만 — 발행 트랜잭션 커밋 뒤 `INSERT … SELECT` 한 문장(같은 시장 · `library_items` 행 없음(삭제 이력 포함) · 살아 있는 `library_series` · `ON CONFLICT DO NOTHING`), 실패는 로그만. 재발행·회수 복구는 부르지 않는다(단위 테스트로 고정). 예약 발행·라이선스 시작일은 없고(노출 조건 = `published` + 만료 전), 운영 → 개발계 동기화는 SQL upsert라 이 경로를 지나지 않는다(개발계 한정).
  - 탈퇴: `users` FK ON DELETE CASCADE — 탈퇴 서비스는 표마다 지우지 않고 사용자 행 삭제에 맡기므로(주석 목록에 추가) 별도 호출 없음. `deploy/sync-content-*.sh`의 표 목록에 `library_series`가 없음을 확인(사용자 데이터).
  - 테스트: e2e `test/series-follow.e2e-spec.ts`(완료 조건 6개 + 일부 담김·남의 항목 무시·시장 전환·회수 복구·404/400) · 단위(적립 SQL 조건 — 시장·삭제 이력 제외·시리즈째 뺀 사용자 제외, Orchestrator 담기·빼기·복구, 업로드 훅·재발행/회수 복구 미호출).
  - 문서: changes 문서 1~4 반영 — 5번(uiux)은 FE 몫이라 changes 문서는 `pending/`에 남겼다.
