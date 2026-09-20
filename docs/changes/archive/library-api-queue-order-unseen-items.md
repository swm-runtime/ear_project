# [문서] 재생 목록 순서 저장이 미지정 항목에도 맨 뒤 자리를 매긴다 — `library-api.md` 4.8 서버 처리 4 개정

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/library-api.md` 4.8 서버 처리 4 · `backend/domain.md` 6.1(`queue_position` 저장 규칙) · `features/player.md` 4.7-1 |
| 요청 파트 | 문서(구현은 백엔드 `fix(be)/queue-order-unseen-items`, KAN-75) |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | KAN-74(FE 서버 저장 전환) 검증 — 항목이 페이지 크기보다 많은 계정에서 첫 페이지만 저장하면, 보내지 않은 옛 항목이 `NULL`로 남아 `NULLS FIRST`에 걸려 맨 위로 올라왔다(`tickets/backend/archive/queue-order-unseen-items.md`) |
| 심각도 | 하 — 라이브러리가 페이지 크기(FE 완화 후 50개)를 넘는 계정에서만 보인다. 계약 문장 하나가 원인이라 코드와 문서를 같이 고친다 |

## 바꾸는 규칙

종전 4.8 서버 처리 4: "순서가 없던 항목은 이번 목록에 들어왔을 때만 순서를 얻는다." 이 규칙에서는 `NULL`이 ① 마지막 저장 뒤 새로 담긴 항목과 ② 저장 전부터 있었지만 보낸 목록에 없던 옛 항목을 한꺼번에 뜻했고, 조회 규칙 `NULLS FIRST`는 ①을 위해 만든 것인데 ②까지 맨 위로 올렸다.

개정: 저장은 **`NULL`을 남기지 않는다.**

- 이번 목록(1..n) → 이미 순서가 있던 나머지 항목(저장 순서대로, n+1…) → **순서도 없고 이번 목록에도 없는 살아 있는 항목**을 `added_at DESC, id DESC`로 맨 뒤에 이어 붙인다.
- 그러면 `NULL` = "마지막 저장 뒤에 담긴 것" 하나만 뜻하고, 조회 규칙(`queue_position ASC NULLS FIRST, added_at DESC, id DESC`)과 응답은 그대로다.
- 뒤에 붙는 항목 수에는 `item_ids` 상한(200)이 적용되지 않는다 — 상한은 요청 본문의 크기다.
- 클라이언트는 보이는 목록만 보내면 된다. 첫 페이지 밖까지 받아 보낼 필요가 없다.

## 완료 조건

- Given `library-api.md` 4.8 서버 처리 / When 읽는다 / Then 순서도 없고 이번 목록에도 없는 살아 있는 항목이 맨 뒤(`added_at DESC, id DESC`)에 붙는다는 문장과, 저장이 `NULL`을 남기지 않는다는 문장이 있다
- Given `backend/domain.md` 6.1 / When 읽는다 / Then `queue_position`의 `NULL`이 "마지막 저장 뒤에 담긴 것"을 뜻한다고 적혀 있다
- Given `features/player.md` 4.7-1 / When 읽는다 / Then "새로 담긴 항목"이 마지막 저장 뒤에 담긴 것만이라는 문장이 있고 `library-api.md` 4.8을 가리킨다

## 처리 기록

- **반영 날짜: 2026-09-19** — `library-api.md` 4.8 서버 처리 4 개정(미지정 항목 처리·상한 무관·종전 규칙의 결함), 이관 항목에 "보이는 목록만 보내면 된다" 추가. `domain.md` 6.1 저장 규칙 불릿에 미지정 항목 처리와 `NULL`의 뜻 추가. `player.md` 4.7-1 "새로 담긴 항목" 문장에 마지막 저장 뒤 담긴 것만이라는 한정 추가. 같은 PR(`fix(be)/queue-order-unseen-items`, KAN-75)에서 코드와 함께 반영해 바로 archive에 둔다.
