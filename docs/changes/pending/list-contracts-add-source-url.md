# library-api·explore-api — 목록 행 content에 source_url 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/library-api.md` 4.1 · `docs/spec/api/explore-api.md` 4.1·4.2·4.2-1·4.5(검색 결과 행 — 같은 행 문법) |
| 발행 날짜 | 2026-08-24 |
| 발견 시점 | 콘텐츠 상세(FR-40) 구현 검수 중 — 같은 콘텐츠의 [원문 보기] 유무가 화면(PL7 vs L4·E12)마다 어긋나는 문제의 원인 추적 |
| 요청 파트 | 프론트엔드 (계약 개정은 백엔드 목록 API 구현에 파급 — 백엔드 확인 필요) |

## 수정 내용

목록 응답의 행 `content` 객체에 `source_url: string | null`을 추가한다.

```json
"content": {
  "id": "uuid", "title": "...", "author_name": "...", "source_name": "...",
  "source_url": "https://... | null",
  "duration_sec": 872, "thumbnail_url": "...", "content_version": 1, "topic_ids": ["..."]
}
```

- `origin = partner`는 항상 값이 있고(`chk_contents_partner_disclosure` — `domain.md` 5.1), `ai_generated`는 `null`이다.
- **`null`이면 더보기 시트에 [원문 보기]를 노출하지 않는다** — 행 자체를 그리지 않는다(발급 응답 `player-api.md` 4.1과 같은 규칙).

## 사유

**features가 확정한 동작(2026-08-10 — 세 화면 더보기 통일)이 목록 계약에 반영되지 않아 구현이 불가능했다.**

- `library.md` 3장·`explore.md` 4.3: L4·E12 더보기 시트에 [원문 보기]를 둔다 — `source_url` 있는 콘텐츠만 노출, 탭 시 인앱 브라우저 + `source_link_clicks` 기록. `library-uiux.md` 4.7·`explore-uiux.md` 4.4도 같은 구성이다.
- 그러나 `library-api.md`·`explore-api.md`의 목록 행 `content`에는 `source_url`이 없다. 플레이어(PL7)는 발급 응답(`player-api.md` 4.1)에 `source_url`이 있어 [원문 보기]가 동작하는데, 같은 콘텐츠를 라이브러리·탐색 시트에서 열면 행이 없는 **화면 간 불일치**가 발생했다(2026-08-24 실기 확인).
- 문서 충돌 시 동작 규칙은 features가 기준이다(CLAUDE.md) — api 계약이 features를 따라온다.

## 처리 방식

- FE는 mock에 `source_url`을 실어 L4·E12 [원문 보기]를 **선행 구현했다**(2026-08-24 — DTO에 "계약 제안" TODO 주석). 계약 반영 시 주석만 걷어낸다.
- 백엔드 목록 API가 이미 구현됐다면 응답 필드 추가가 필요하다 — 통합 시 백엔드 담당과 확인한다.

## 완료 조건

- Given `library-api.md` 4.1·`explore-api.md` 4.1·4.2·4.2-1·4.5의 행 예시를 본다 / When `content`를 확인한다 / Then `source_url`(null 허용)이 포함되어 있고 null 규칙(partner 항상 값·ai_generated null)이 서술되어 있다
- Given 실서버 목록 응답 / When `origin = partner` 행을 본다 / Then `source_url`이 실려 오고, L4·E12 더보기 시트에 [원문 보기]가 노출된다
- Given 실서버 목록 응답 / When `origin = ai_generated` 행을 본다 / Then `source_url = null`이고 [원문 보기] 행이 그려지지 않는다
