# 관리자 주제 목록 `market` 칸·`?market=` 필터(KAN-237) — 계약 문서 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.1(`GET /admin/topics` — "요청 파라미터 없다" · 응답 예시 · `slug` 항목의 "항목에 `market`은 싣지 않는다") · `spec/api/global-api.md` 3장 표 11행 · 4.9 주제 생성 줄("목록·응답 항목에 `slug`가 실린다") |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-21 |
| 시작 날짜 | 2026-10-21 |
| 기한 | 다음 통합 때 |
| 선행 | 없음 — 코드 반영 PR `feat(be)/admin-topics-market` |
| 관련 | [KAN-237](https://runtime364.atlassian.net/browse/KAN-237) · 티켓 `tickets/backend/pending/admin-topics-market.md` · 파이프라인 콘솔 #1779(`pipeline/apps/web/lib/ear.ts` `splitConsoleTopics`) |

## 배경

관리자 주제 목록(`GET /admin/topics`)은 두 시장 주제를 함께 주는데, 항목에 `market`이 없었다(admin-api 4.1 "항목에 `market`은 싣지 않는다"). 그래서 파이프라인 콘솔(국내·글로벌 두 인스턴스)의 주제 화면에 두 시장 주제가 섞여 보였다. 콘솔은 시장 칸이 없어 중분류 이름으로 임시로 갈랐다(#1779).

KAN-237 코드 PR이 두 가지를 더했다. 하나는 항목의 `market` 칸이고, 다른 하나는 `GET /admin/contents`(4.5)와 같은 방식의 `?market=` 필터다. 둘 다 더하기만 한 변경이다 — 필터가 없으면 종전처럼 전 시장을 준다. `POST`·`PATCH /admin/topics`는 같은 항목 DTO(`AdminTopicItemDto`)를 돌려주므로 그 응답에도 `market`이 실린다.

## 수정 내용

- `admin-api.md` 4.1
  - "요청 파라미터 없다."를 다음으로 바꾼다. "쿼리 `market`(선택, `kr` \| `global`) — 그 시장 주제만 준다. 없으면 전 시장(종전과 같음). 그 밖의 값은 400 `VALIDATION_FAILED`(추가 2026-10-21 — KAN-237, 4.5 `market` 필터와 같은 방식)."
  - 응답 예시 항목에 `"market": "kr"`을 넣는다(`slug` 뒤).
  - `slug` 항목 끝의 "항목에 `market`은 싣지 않는다."를 지우고 항목을 하나 더한다. "**`market`**(`kr` \| `global`)은 주제의 시장이다(4.2 — 생성 후 바뀌지 않는다). 콘솔은 이 값으로 국내·글로벌 주제를 가른다(추가 2026-10-21 — KAN-237). 4.2·4.3 응답 항목에도 같은 값이 실린다."
- `global-api.md` 3장 표 11행 "메서드·경로" 칸에 `GET /admin/topics`를 더한다(`GET /admin/contents` · `GET /admin/topics` · `POST /admin/topics` · `GET /admin/insights/summary`). 상태는 ✅ 그대로다(코드 반영 2026-10-21).
- `global-api.md` 4.9 주제 생성 줄의 "목록·응답 항목에 `slug`가 실린다"를 "목록·응답 항목에 `slug`·`market`이 실린다. 목록은 `?market=`로 거른다(2026-10-21 — KAN-237)"로 바꾼다.

## 완료 조건

- Given `admin-api.md` 4.1 / When 요청·응답을 읽는다 / Then 쿼리 `market`(선택, 없으면 전 시장, 그 밖의 값 400)과 항목의 `market`이 적혀 있고 "항목에 `market`은 싣지 않는다"가 없다
- Given `global-api.md` 3장 11행 / When 경로 칸을 본다 / Then `GET /admin/topics`가 있다
- Given `global-api.md` 4.9 주제 생성 줄 / Then 목록·응답 항목에 `market`이 실리고 `?market=`로 거른다고 적혀 있다

## 처리 기록

- 2026-10-21 발행. 코드: `AdminTopicItemDto`에 `market`을 더했고, `AdminTopicQueryRequestDto`(`@IsOptional` `@IsEnum(UserMarket)`)를 새로 만들었다. 필터는 `TopicRepository.findAll({ market })`에서 DB 조건으로 건다. 단위 테스트(`admin-topic.service.spec.ts`)와 E2E(`test/topic-exposure.e2e-spec.ts` "주제 시장 칸·필터" — 항목 `market` · `?market=global`/`kr` · 틀린 값 400 `VALIDATION_FAILED`)를 붙였다(BE — 브랜치 `feat(be)/admin-topics-market`).
