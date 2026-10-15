# 관리자 주제 `slug` 입력 — `POST`·`PATCH /admin/topics`

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-14 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 — KAN-189 남은 일) |
| 반영 대상 | `spec/api/admin-api.md` 4.1(응답 항목) · 4.2 · 4.3 · `features/admin.md` 주제 필드 표(67행 부근 — `slug`·`market` 추가) |
| 코드 반영 | PR `feat(be)/admin-topic-slug` |
| 근거 | `spec/api/global-api.md` 4.5 · 4.9 |

## 수정 내용

- 4.1 응답 항목에 `slug`(string | null)를 싣는다.
- 4.2·4.3 요청에 `slug`(선택). 형식은 소문자·숫자를 하이픈으로 이은 것(예 `k-pop`), 최대 64자. 형식이 틀리면 400 `VALIDATION_FAILED`.
- 같은 시장에 같은 `slug`가 있으면 409 `CONFLICT`(`uq_topics_market_slug`). 시장이 다르면 같은 값을 쓸 수 있다.
- 4.3에서 `slug: null`은 비운다. 키가 없으면 바꾸지 않는다.

## 사유

클라이언트의 주제 이미지 매핑 키가 `slug`로 바뀐다(`global-api.md` 4.5). KR 주제의 slug를 운영이 콘솔에서 채울 수 있어야 한다 — 지금은 마이그레이션 시드(GLOBAL 8개) 말고는 넣을 길이 없다.

## 완료 조건

- Given `admin-api.md` 4.1~4.3 / When 읽는다 / Then 위 항목이 적혀 있다

## 처리 기록

- 2026-10-15 반영 — `admin-api.md` 4.1·4.2·4.3 · `features/admin.md` 3.2 주제 필드 표(`market`·`slug`). 반영 전 코드와 대조함.
