# [문서] 관리자 공지 작성·목록에 `market`

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/admin-api.md` 4.12(공지 목록)·4.13(공지 작성)·4.14(공지 수정) · `docs/backend/domain.md` 9.2 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-15 |
| 관련 | [KAN-211](https://runtime364.atlassian.net/browse/KAN-211) `tickets/backend/pending/admin-notice-market.md` |

## 수정 내용
- 4.13 `POST /admin/notices`: 요청에 `market`(`kr` | `global`, 선택 — 없으면 `kr`). 모르는 값은 400 `VALIDATION_FAILED`.
- 4.14 `PATCH /admin/notices/:id`: `market`은 받지 않는다(생성 뒤 시장 불변 — 모르는 필드라 400).
- 4.12 `GET /admin/notices`: 항목에 `market`. 쿼리 `?market=` 필터(선택 — 없으면 전 시장).
- `domain.md` 9.2: `notices.market`은 관리자 작성 시 정한다는 문장 추가.

## 완료 조건
- Given 위 문서 / Then 각 항목이 적혀 있다

## 처리 기록
- 2026-10-15 발행. 코드는 KAN-211 PR에 반영.
