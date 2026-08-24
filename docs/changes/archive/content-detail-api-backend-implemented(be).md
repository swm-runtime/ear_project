# [BE] content-detail-api.md — 9장 미결 "백엔드 미구현" 해소

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/content-detail-api.md` |
| 위치 | 9장 미결 사항 — "**백엔드 미구현**" 항목 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-08-24 |
| 관련 작업 | 콘텐츠 상세 조회 구현 (`feat(be)/content-detail` — FR-40) |

## 어긋난 지점

9장 미결에 "**백엔드 미구현** — `GET /contents/:content_id`는 아직 서버에 없다. 이 문서가 구현 요청의 기준 계약이다. FE는 `api/content-detail.mock.ts` 패턴으로 선행 개발한다"가 남아 있는데, **엔드포인트가 구현되어 서버에 있다**(2026-08-24, 브랜치 `feat(be)/content-detail`).

구현은 이 문서 4.1의 계약 그대로이며 계약 변경점이 없다 — origin 분기(`partner`의 `sources: null` / `ai_generated`의 소스 전수·`position` 순), `series` 3필드 묶음의 null 판정, `library_item` null 분기, `is_counted_today`(목록 행과 같은 조립 경로), 에러 3종(`CONTENT_WITHDRAWN` 403 · `CONTENT_NOT_FOUND` 404 · `VALIDATION_FAILED` 400)까지 실서버 호출로 대조 완료.

## 요청 내용

9장의 해당 항목을 해소 표기로 개정한다.

> ~~**백엔드 미구현**~~ → **구현 완료 (2026-08-24)**: `GET /contents/:content_id`가 서버에 있다(`content-detail` 모듈). 계약 변경점 없음 — 이 문서 4.1이 그대로 구현 결과다. FE는 mock 플래그를 해제하고 실서버 연동으로 전환할 수 있다.

## 완료 조건

- Given `content-detail-api.md` 9장을 읽는다 / When 미결 목록을 확인한다 / Then "백엔드 미구현"이 구현 완료(2026-08-24) 표기로 닫혀 있고, 계약 변경점이 없다는 사실이 적혀 있다
