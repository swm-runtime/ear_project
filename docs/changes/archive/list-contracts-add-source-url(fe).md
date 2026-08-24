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

---

## 처리 기록 (반영 날짜 2026-08-24 — 브랜치 `integration/content-detail`)

**반영 완료**

- `library-api.md` 4.1 · `explore-api.md` 4.1에 `source_url` 추가(예시 JSON + 필드 규칙 — null이면 [원문 보기] 미노출, partner 항상 값). explore 4.2·4.2-1·4.5는 "4.1과 같은 모양" 참조라 자동 승계, `library-api.md` 4.3(미니플레이어 복원)은 더보기 시트가 없어 제외
- 백엔드 목록 응답에 `source_url` 실장 — explore(`ExploreContentView`·orchestrator·`ExploreItemDto`) · library-screen(`LibraryContentView`·orchestrator·`LibraryItemDto`). 검색(explore 4.5)은 미구현이라 구현 시 같은 행 타입을 그대로 쓴다
- null 규칙은 `domain.md` 5.1 기준으로 서술했다 — `ai_generated`는 "항상 null"이 아니라 **선택 필드라 null일 수 있다**(값이 있으면 [원문 보기]가 노출된다 — 판정 축은 origin이 아니라 값 유무)

**~~보류~~ → 해소 (2026-08-24 — 백엔드 승인)** — 완료 조건 3(ai_generated 행의 `source_url = null`)의 전제였던 스키마 어긋남을 함께 반영했다

- 마이그레이션 `AllowNullContentsDisclosure`: `author_name` · `source_url` nullable 전환 + `chk_contents_partner_disclosure` CHECK 추가(`NOT VALID` — 기존 시드 DB의 파트너 행이 partner_id·license 없이 들어가 있어 즉시 검증하면 팀원 DB에서 실패한다. 신규 쓰기부터 강제, 운영 전 VALIDATE 후속)
- 시드: ai_generated의 `sourceUrl` null(신규 삽입 + 기존 행 백필 `normalized=33`), 파트너 행은 CHECK가 요구하는 `partner_id` · `license_expires_at`을 목 값으로 채움. 재실행 멱등 확인(`normalized=0`)
- 응답 DTO의 `author_name`도 `string | null`로 정합화(explore·library-screen·onboarding·player 발급 — domain.md 5.1의 ai_generated 선택 필드. 시드는 저자 값을 유지하므로 지금 null이 내려가지는 않는다)
- 실측: ai_generated 15편 전부 `source_url = null`, partner 18편 전부 값 보유 — 완료 조건 2·3의 서버 측 성립 확인. 화면 노출(L4·E12)은 FE 확인 몫
