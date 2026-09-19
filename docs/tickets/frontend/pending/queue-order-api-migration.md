# [FE] 재생 목록 순서를 서버 저장으로 전환 — `sort=queue` · `PUT queue-order`, 기기 저장 이관

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/player/hooks/useQueueOrder.ts` · `frontend/src/features/player/services/queue-order.ts` · `PlayerQueuePanel.tsx` |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-09-19 |
| Jira | [KAN-74](https://runtime364.atlassian.net/browse/KAN-74) |
| 발견 시점 | KAN-70(`tickets/backend/archive/queue-order-sync.md`) 구현 완료 — 재생 목록 순서를 계정 단위로 저장·조회하는 계약이 확정됐다. FE는 아직 기기 저장(`player.queue_order`)이다 |
| 근거 문서 | `spec/api/library-api.md` 4.1(`sort=queue`) · 4.8(`PUT /users/me/library-items/queue-order`) · `backend/domain.md` 6.1(`queue_position`) |
| 중요도 | **Low**(이번 주 안) — 기기 저장으로 이미 동작한다. 기기 간 일관성만 빠져 있고, 백엔드가 운영에 나간 뒤 확인 가능 |
| 상태 | 대기 |

## 배경

재생 목록 패널의 순서는 2026-09-18 FE가 기기 로컬에 저장하기 시작했고(PR #470), 같은 날 BE에 계정 저장을 요청했다(KAN-70). BE는 **B안 — `library_items.queue_position` 정렬 키**로 구현했다. 서버가 FE의 로컬 규칙(`applyQueueOrder`)과 **같은 규칙**을 가진다:

- 순서를 정하지 않은(새로 담긴) 항목이 **최신순으로 맨 위**, 그 아래 저장한 순서(`queue_position ASC NULLS FIRST, added_at DESC, id DESC`).
- 저장은 목록을 통째로 받아 1..n을 다시 쓰고, 이번 목록에 없던 기존 순서 항목은 그 뒤에 저장 순서대로 이어 붙인다.
- 삭제·회수된 항목은 목록에서 빠지고, 복구하면 자리도 돌아온다.

## 요청

1. **조회** — 재생 목록 패널의 원천 호출에 `sort=queue`를 붙인다(필터 없는 라이브러리 첫 페이지 그대로). 서버가 순서를 입혀 주므로 `applyQueueOrder`의 로컬 정렬은 제거하거나 통과시킨다(둘을 겹치면 두 규칙이 어긋날 때 원인을 못 찾는다).
2. **저장** — 끌기 1회마다 `PUT /users/me/library-items/queue-order` `{ "item_ids": [...] }`에 현재 목록의 `library_items.id`를 **위에서부터** 보낸다. 1~200개, 중복 없이. 응답은 204(본문 없음).
   - **실패는 조용히** — 재생·목록에 영향 없이 다음 끌기 때 다시 보낸다. 서버도 남의 항목·삭제된 항목을 조용히 빼므로 그 사이 삭제된 항목 때문에 실패하지 않는다. 400은 형식 오류(빈 배열·중복·200 초과)뿐이다.
3. **이관** — 기기 저장 순서(`player.queue_order`)가 남아 있으면 업데이트 후 첫 실행 때 **한 번** `PUT`으로 올리고 로컬 값을 지운다. 그 뒤로는 로컬 저장을 쓰지 않는다.
4. 백엔드가 운영에 나간 뒤(`dev → main`) 실기기로 확인한다. 그 전에는 개발계(preview 빌드) 또는 로컬 Metro로 본다.

## 범위 밖

- 연속 재생(다음 편 자동 재생) — 여전히 비범위(`player.md` 8장). 들어오면 서버가 이 순서로 "다음 편"을 정한다.
- 라이브러리 화면의 정렬 — 종전 `added_desc` 그대로. 이 순서는 재생 목록 패널에만 쓴다.

## 완료 조건

- Given 기기 A에서 재생 목록 순서를 바꿨다 / When 같은 계정으로 기기 B에서 재생 목록을 연다 / Then 같은 순서다
- Given 순서를 저장한 뒤 새 콘텐츠가 담겼다 / When 재생 목록을 연다 / Then 새 항목이 맨 위, 나머지는 저장한 순서다
- Given 순서 저장 호출이 실패한다 / When 사용자가 계속 재생한다 / Then 재생·라이브러리 조회에 영향이 없고, 다음 끌기 때 다시 저장된다
- Given 기기 저장 순서가 남은 앱 / When 업데이트 후 첫 실행 / Then 그 순서가 서버에 한 번 올라가고 이후 로컬 저장을 쓰지 않는다
- Given 재생 목록 패널 코드 / When 읽는다 / Then 순서 규칙을 클라이언트가 다시 계산하지 않는다(서버 응답 순서를 그대로 쓴다)

## 처리 기록

- 2026-09-19 발행(BE KAN-70 구현과 같은 PR `feat(be)/queue-order-sync`).
- 2026-09-19 **코드 반영**(PR `feat(fe)/queue-order-server-sync`) — 실서버 확인 대기라 `pending/`에 둔다.
  - 조회: 브리지 `fetchQueue`가 `sort=queue`로 받는다. `applyQueueOrder`(로컬 정렬)는 **삭제**했다 — 클라이언트는 응답 순서를 그대로 그린다.
  - 저장: 끌기 1회 = `PUT queue-order` 1회(보이는 목록 통째, 중복 제거·200개 상한). 끈 직후 화면은 쿼리 캐시를 먼저 옮겨 반영한다. 실패는 로그만 남긴다. 연달아 끌면 앞 요청이 끝난 뒤 **마지막 상태만** 보낸다(두 PUT 이 뒤바뀌어 도착하면 옛 순서가 이긴다).
  - 이관: 재생 목록을 처음 열 때 조회 **전에** `player.queue_order`를 올리고 지운다. 실패하면 남겨 두고 다음에 다시, 400(형식 오류)만은 지운다.
  - 확인: tsc · eslint · jest. 웹 mock(계약대로 만든 `sort=queue`·`queue-order` 대역)에서 — 심어 둔 기기 순서가 올라간 뒤 로컬 값이 사라짐 / 끌고 → 접었다 열어도 같은 순서.
  - **발견한 계약 구멍** — 저장하면 보낸 목록에만 자리가 매겨져, 첫 페이지 밖의 옛 항목이 `NULL`로 남아 **맨 위로 올라온다**. BE 티켓 `tickets/backend/pending/queue-order-unseen-items.md`로 넘겼고, FE 는 상한(50개)까지 받아 보내도록 완화했다(50개 이하 계정에서는 안 보인다).
  - **남은 것**: BE 가 운영에 나간 뒤(릴리즈 PR #499) 두 기기로 완료 조건 1번 확인. 그 뒤 archive · KAN-74 완료.
