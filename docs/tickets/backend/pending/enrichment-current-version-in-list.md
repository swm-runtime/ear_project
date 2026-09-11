# [BE] `GET /admin/contents` 응답에 현재 추천 메타 형식 버전(`current_enrichment_schema_version`)을 싣는다

| 항목 | 값 |
|---|---|
| 대상 | `admin-content-list-response.dto.ts` · `docs/spec/api/admin-api.md` 3장·8장 |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌 |
| 발행 날짜 | 2026-09-11 |
| Jira | [KAN-55](https://runtime364.atlassian.net/browse/KAN-55) |
| 발견 시점 | KAN-54(구형 메타 표시·필터) 구현 중 — 콘솔이 "구형인가"를 판정하려면 현재 형식 번호가 필요한데 응답에 없어 콘솔 상수(2)로 임시 처리 |
| 심각도 | 하 — 형식 버전이 3으로 오를 때 콘솔 상수를 같이 바꾸면 되지만, 두 곳이 어긋나면 구형 콘텐츠를 놓친다 |
| 상태 | 대기 |

## 요지 (Jira 본문용)

콘솔의 추천 메타 배지·필터(KAN-54)는 "이 콘텐츠의 `enrichment_schema_version` 이 현재 형식보다 낮은가"로 구형을 판정한다. 현재 형식 번호(`CURRENT_ENRICHMENT_SCHEMA_VERSION`, 지금 2)는 서버만 알고 목록 응답에 없어, 콘솔이 같은 값을 상수로 들고 있다. 티켓 KAN-54 의 조건("현재 버전은 서버가 아는 값을 기준으로")대로 `GET /admin/contents` 응답 최상위에 `current_enrichment_schema_version` 정수를 실어 달라. 콘솔은 그 값이 있으면 상수 대신 쓴다.

## 완료 조건

- Given `GET /admin/contents` / When 호출하면 / Then 응답에 `current_enrichment_schema_version: 2` 가 있고 `admin-api.md` 3장·8장에 적혀 있다.
