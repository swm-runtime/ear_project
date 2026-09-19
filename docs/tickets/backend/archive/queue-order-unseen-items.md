# [BE] 재생 목록 순서 저장 뒤, 한 번도 안 본 옛 항목이 맨 위로 올라온다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/library/`(`PUT /users/me/library-items/queue-order` 저장 규칙) · `docs/spec/api/library-api.md` 4.8 |
| 요청 파트 | 프론트엔드 → 백엔드 |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | KAN-74(FE 서버 저장 전환) 검증 — mock 을 계약(4.1·4.8)대로 만들어 돌리다 재현됐다 |
| 근거 문서 | `spec/api/library-api.md` 4.1(`queue_position ASC NULLS FIRST`) · 4.8 서버 처리 3·4 · `tickets/backend/archive/queue-order-sync.md` |
| 중요도 | **Low**(이번 주 안) — FE 가 상한(50개)까지 받아 보내도록 완화해 뒀다. 라이브러리가 50개를 넘는 계정에서만 보인다 |
| 상태 | **완료** — 저장 시 미지정 항목에 맨 뒤 자리를 매긴다 (2026-09-19) |
| Jira | [KAN-75](https://runtime364.atlassian.net/browse/KAN-75) |

## 문제

`NULL`(순서 없음)이 **두 가지를 한꺼번에 뜻한다**: ① 마지막 저장 **뒤에** 새로 담긴 항목, ② 저장 **전부터** 있었지만 보낸 목록에 없던(다음 페이지의) 옛 항목. 조회 규칙 `NULLS FIRST`는 ①을 위해 만든 것인데 ②까지 맨 위로 올린다.

재현(계약대로면 서버도 같다):

1. 라이브러리에 항목이 페이지 크기보다 많다(예: 25개, `limit` 기본 20).
2. 재생 목록에서 한 번 끈다 → FE 가 보이는 20개를 `PUT` → 그 20개만 `queue_position` 1..20.
3. 다시 조회(`sort=queue`) → **21~25번째(가장 오래된 항목들)가 `NULL` 이라 맨 위로 온다.** 사용자가 방금 정리한 순서가 아래로 밀린다.

기기 저장 시절(FE `applyQueueOrder`)에는 없던 현상이다 — 그때는 정렬 전에 첫 페이지가 정해졌고, 지금은 정렬이 첫 페이지를 정한다.

## 요청(제안)

저장할 때 **"순서 없음"을 남기지 않는다.** 4.8 서버 처리 4를 바꾼다:

- 이번 목록에도 없고 기존 순서도 없던 살아 있는 항목에 **맨 뒤 자리**를 매긴다(기존 순서 항목 뒤, `added_at DESC, id DESC`).

그러면 `NULL` = "마지막 저장 뒤에 담긴 것" 하나만 뜻하게 되고, `NULLS FIRST`가 의도대로 동작한다. 조회 규칙·응답은 그대로다. 다른 방법(예: 마지막 저장 시각과 `added_at` 비교)이 낫다면 BE 판단.

## 범위 밖

- FE 의 조회 개수 — 이미 상한(50)으로 받는다(`frontend/src/app/bootstrap/index.ts`). BE 가 고쳐지면 FE 는 그대로 둬도 된다.

## 완료 조건

- Given 항목이 페이지 크기보다 많은 계정 / When 첫 페이지만 담아 순서를 저장한 뒤 `sort=queue`로 조회한다 / Then 첫 페이지는 방금 저장한 순서 그대로이고, 보내지 않았던 옛 항목은 그 **뒤**에 온다
- Given 순서를 저장한 뒤 새 콘텐츠가 담겼다 / When 조회한다 / Then 새 항목만 맨 위에 온다(종전 그대로)
- Given `library-api.md` 4.8 / When 읽는다 / Then 저장 시 미지정 항목의 처리가 적혀 있다

## 처리 기록 (2026-09-19 — PR `fix(be)/queue-order-unseen-items`)

- **제안대로 저장이 `NULL`을 남기지 않게 했다.** `LibraryService.reorderQueue`가 이번 목록(1..n) → 기존 순서 항목(저장 순서대로) → **순서도 없고 이번 목록에도 없는 살아 있는 항목**(`added_at DESC, id DESC`) 순으로 자리를 매긴다. 세 번째 묶음은 `LibraryItemRepository.findUnpositionedIdsByUserIdExcluding`(신설 — `deleted_at IS NULL AND queue_position IS NULL`, 이번 목록 제외)이 조회 규칙이 그 항목들에 보여 주던 순서로 돌려준다. 쓰기는 종전대로 한 트랜잭션·한 UPDATE 문장이다.
- 다른 방법(마지막 저장 시각과 `added_at` 비교)은 택하지 않았다 — 컬럼이 하나 더 필요하고(`domain.md` 개정), 조회 규칙까지 바뀐다. 제안대로 하면 조회 규칙·응답·인덱스가 그대로다.
- 요청 본문 상한(`MAX_QUEUE_ORDER_SIZE`=200)은 뒤에 붙는 항목 수에 적용하지 않는다 — 상한은 본문 크기다.
- 단위 테스트(`library.service.spec.ts`): 미지정 항목이 기존 순서 항목 뒤에 최신순으로 붙는 것(완료 조건 1), 저장 시점에 없던 항목은 건드리지 않아 `NULL`이 "마지막 저장 뒤 담긴 것"만 뜻하는 것(완료 조건 2). lint·build·전체 단위 테스트 통과. 로컬 DB 실측은 하지 않았다(이 환경에서 Docker 사용 불가).
- 문서: `library-api.md` 4.8 서버 처리 4 개정(완료 조건 3), `domain.md` 6.1·`player.md` 4.7-1 정합 — `changes/archive/library-api-queue-order-unseen-items.md`.
- FE: 바꿀 것 없다. 상한(50개)까지 받아 보내는 완화는 그대로 둬도 된다 — `tickets/frontend/pending/queue-order-api-migration.md` 처리 기록에 적었다.
- 반영 날짜: 2026-09-19. Jira KAN-75는 PR 머지 시 완료로 넘긴다.
