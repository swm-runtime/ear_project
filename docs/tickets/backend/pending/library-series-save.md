# [BE] 라이브러리 시리즈 담기 — 시리즈 단위 담기·빼기 API, 새 편 자동 적립, 라이브러리 목록의 시리즈 묶음(`group=series`)

| 항목 | 값 |
|---|---|
| 대상 | 신규 테이블 `library_series` + 마이그레이션 · 신규 `POST`·`DELETE /series/:series_id/save` · `GET /series/:series_id` 응답 `series.is_saved` · `GET /users/me/library-items` 쿼리 `group=series`와 시리즈 묶음 항목 · 시리즈 묶음 삭제·복구(`DELETE`·`POST …/restore`) · 발행 훅(새 편 → 담은 사용자에게 적립) |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 14:46 "라이브러리에 시리즈가 카드 하나로 묶여 들어가야 한다" |
| 담당 | 백엔드 |
| Jira | [KAN-243](https://runtime364.atlassian.net/browse/KAN-243) · 뒤따르는 FE [KAN-244](https://runtime364.atlassian.net/browse/KAN-244)(blocks) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일) |
| 선행 | 없음(티켓). 아래 "결정 사항"의 PM 확인 — 상태: 제안값으로 발행, 미확인. 문서 개정 기록 `changes/pending/library-series-card.md`를 같은 PR에서 반영 |
| 근거 문서 | `changes/pending/library-series-card.md` · `features/library.md` 4.1·4.5 · `features/explore.md` 4.7 · `spec/api/library-api.md` 4.1·4.7 · `spec/api/explore-api.md` 4.3·4.7 · `backend/domain.md` 5.9·6.1 |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

지금 라이브러리는 편 단위다(`library-api.md` 4.1 "라이브러리는 시리즈로 묶지 않는다"). 시리즈 화면의 [+]는 FE가 편 담기(`POST /contents/:id/save`)를 편 수만큼 보내는 임시 구현이다(#1835·#1839). 그래서 16편 시리즈를 담으면 라이브러리 격자에 타일 16개가 깔리고, 나중에 공개되는 편은 따라 들어오지 않는다.

PM 결정(2026-10-22): **라이브러리에 시리즈가 카드 하나로 묶여 들어간다.** 서버가 시리즈 담기를 한 단위로 기록하고, 목록에서 묶어 내려 주고, 새 편이 공개되면 따라 넣어야 한다.

## 결정 사항 (제안값 — PM 확인 전, 바뀌면 이 표와 changes 문서를 같이 고친다)

| # | 질문 | 제안값 | 이유 |
|---|---|---|---|
| D1 | 무엇을 묶나 | **시리즈 편은 라이브러리 목록(`group=series`)에서 항상 시리즈 묶음 하나로 내린다** — 시리즈째 담았든, 편 하나만 담았든, 드립이 넣었든 | 같은 시리즈가 카드와 낱개 타일로 갈라지면 규칙을 설명할 수 없다. 탐색도 시리즈 편을 카드 하나로 접는다(`explore-api.md` 4.1-1) |
| D2 | 새 편 따라 들어오기 | **시리즈째 담은 사용자(`library_series` 행)에게만** 발행 시점에 그 편을 적립한다. `source = save` | 편 하나만 담은 사람에게 밀어 넣으면 원치 않는 적립이다. 출처 필터 값을 늘리지 않는다 |
| D3 | 시리즈 묶음 빼기 | 담긴 그 시리즈 편 전부 소프트 삭제 + `library_series` 소프트 삭제. 확인 팝업 없음 + [실행 취소] 5초(복구는 자리·`added_at` 그대로) | 라이브러리 삭제 규칙(`library.md` 4.5) 그대로. 영구 제외(`drip_excluded_contents`)·`user_signals(delete)`도 편마다 똑같이 |
| D4 | 묶음의 목록 위치 | 그 시리즈 담긴 편의 **가장 최근 `added_at`** | 새 편이 들어오면 묶음이 맨 위로 온다 — "새로 도착"이 보인다 |
| D5 | 필터(상태·출처·주제) | 묶음 안 편 중 **하나라도 맞으면** 묶음을 내린다. 묶음의 숫자는 필터와 무관하게 전체 | 필터로 묶음이 쪼개지지 않는다 |
| D6 | 옛 앱 | `group=series`를 보내지 않으면 **종전처럼 편 단위**. `sort=queue`(재생 목록 패널)는 언제나 편 단위 | 스토어에 깔린 앱은 묶음 항목을 그릴 줄 모른다 |

## 무엇을 한다 (순서대로)

1. **마이그레이션** — `library_series (id uuid PK, user_id FK → users ON DELETE CASCADE, series_id FK → series, added_at timestamptz, deleted_at timestamptz NULL)` · `uq_library_series_user_id_series_id (user_id, series_id)` · `idx_library_series_series_id_deleted_at (series_id, deleted_at)`. 탈퇴 즉시 파기 목록에 추가. `domain.md` 6.x에 같은 정의(changes 3절).
2. **`POST /series/:series_id/save`** (`{ client_seq }`) — 한 트랜잭션: `library_series` upsert(삭제분이면 되살림, `added_at` 새로) + 노출 편(발행·사용자 시장·회수 아님) 중 라이브러리에 살아 있는 행이 없는 편을 `library_items(source = save)`로 적립(삭제분이 있으면 재담기 규칙 — `added_at` 새로, `queue_position` NULL). 편 담기와 같은 `user_signals(save)`·영구 제외 해제 규칙. 응답 `{ series_id, saved_count, added_count, client_seq }`. 멱등(이미 담겨 있으면 200, `added_count: 0`). 404 = 없는 시리즈·다른 시장·노출 편 0.
3. **`DELETE /series/:series_id/save`** (`{ client_seq }`) — `library_series` 소프트 삭제 + 그 시리즈의 살아 있는 `library_items` 전부 소프트 삭제(편 삭제와 같은 신호·영구 제외). 응답 `{ series_id, removed_item_ids[], client_seq }` — 실행 취소용.
4. **복구** — `POST /series/:series_id/restore` (`{ item_ids[] }`) — `library_series` 되살림 + 넘긴 행만 `deleted_at` NULL(자리·`added_at` 그대로 — 편 복구 4.7과 같다). 실행 취소 창은 클라이언트 5초.
5. **`GET /series/:series_id`** — `series.is_saved: boolean`(살아 있는 `library_series` 행). 편 목록의 `library`는 종전 그대로.
6. **`GET /users/me/library-items?group=series`** — 항목에 `kind: "content" | "series"`. `kind = series` 항목: `series { id, title, thumbnail_url, total_episodes, status }` · `saved_count`(살아 있는 담긴 편 수) · `completed_count` · `in_progress_count` · `added_at`(D4) · `is_saved`(시리즈째 담김) · `resume_episode`(아직 다 듣지 않은 가장 앞 담긴 편 `{ item_id, content_id, episode_no }`, 전부 완청이면 null). 정렬·커서는 묶음 키(D4) 기준 keyset — 묶음과 낱개가 한 순서로 섞인다. 필터는 D5. **`group`이 없거나 `sort=queue`면 종전 응답과 바이트 단위로 같다**(D6).
7. **새 편 적립 훅** — 시리즈 편이 발행(신규·재발행으로 처음 노출)되면 그 시리즈에 살아 있는 `library_series`가 있는 사용자마다 `library_items(source = save)`를 적립(유니크가 중복을 막는다, 삭제 이력이 있는 편은 넣지 않는다 — 사용자가 뺀 편). 사용자 수만큼 한 문장 `INSERT … SELECT`. 푸시 알림은 범위 밖.
8. **테스트** — 담기 멱등·부분 담김(편 일부만 있던 시리즈) · 빼기 후 복구가 자리 유지 · 빼기 후 다시 담기는 새 담기 · 목록 묶음(낱개 담은 편도 묶임 — D1 · 묶음 위치 D4 · 필터 D5 · 커서 왕복) · `group` 없음/`sort=queue` 종전과 같음 · 새 편 발행 → 시리즈째 담은 사용자만 적립 · 다른 시장·회수 편 제외 · 탈퇴 파기.
9. **문서** — changes 문서를 같은 PR에서 반영하고 `archive/`로.

## 범위 밖

- 새 편 공개 푸시 알림 · 시리즈 단위 진행률 저장(편 단위 파생으로 충분) · 드립이 시리즈 편을 고르는 규칙 변경 · 재생 목록 패널의 시리즈 묶음
- 화면(FE `library-series-card.md`)

## 완료 조건

- Given 16편 시리즈, 라이브러리에 그 편 0개 / When `POST /series/:id/save` / Then 200, `added_count: 16`, `library_series` 1행, `library_items` 16행(`source = save`)
- Given 그중 3편이 이미 담김 / When 같은 요청 / Then `added_count: 13`, 기존 3행은 그대로(`added_at` 불변)
- Given 시리즈째 담김 / When `GET /users/me/library-items?group=series` / Then 그 시리즈는 `kind: "series"` 항목 하나(`saved_count: 16`, `is_saved: true`)이고 편 낱개 항목은 없다
- Given 편 하나만 담은 시리즈 / When 같은 목록 / Then `kind: "series"`, `saved_count: 1`, `is_saved: false`(D1)
- Given 같은 사용자 / When `group` 없이 목록 / Then 종전처럼 편 단위 응답(D6)
- Given 시리즈째 담김 / When `DELETE /series/:id/save` → `POST /series/:id/restore`(받은 `removed_item_ids`) / Then 목록이 빼기 전과 같다(자리·`added_at` 그대로)
- Given 시리즈째 담은 사용자 A, 1편만 담은 사용자 B / When 그 시리즈 17화 발행 / Then A의 라이브러리에만 17화가 생기고 묶음이 목록 맨 위로 온다
- Given A가 17화를 편 단위로 뺀 이력 / When 17화 재발행 / Then 다시 넣지 않는다
- Given `GET /series/:id` / Then `series.is_saved`가 `library_series` 상태와 같다
- Given 마이그레이션 적용 / Then `library_series`가 `domain.md`와 같고 탈퇴 시 즉시 파기된다

## 처리 기록

- 2026-10-22 14:46 발행. 결정 D1~D6은 제안값 — PM 확인 전.
