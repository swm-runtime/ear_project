# [BE] architecture.md — 4.5 의존 표에 ContentDetail 모듈 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/architecture.md` |
| 위치 | 4.5 의존 방향 기록 (표) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-08-24 |
| 관련 작업 | 콘텐츠 상세 조회 구현 (`feat(be)/content-detail` — FR-40, `content-detail-api.md` 4.1) |

## 어긋난 지점

콘텐츠 상세 조회(`GET /contents/:content_id`) 구현으로 **`content-detail` 유스케이스 모듈이 신설**됐는데, architecture.md 4.5의 의존 방향 표에 이 모듈의 행이 없다. 4.5는 "모듈이 늘어나면 아래 표를 갱신한다. 표에 없는 의존이 코드에 생기면 리뷰에서 반려한다"고 정하고 있으므로, 표가 갱신될 때까지 코드의 의존이 문서상 반려 대상인 상태다.

## 요청 내용

4.5 표에 아래 행을 추가한다.

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| ContentDetail | Content, Library, Playback | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |

그리고 유스케이스 모듈 해설 단락(`LibraryScreen` · `Explore` 등과 같은 형식)에 다음 요지를 덧붙인다.

- **ContentDetail도 Entity를 갖지 않는다.** 상세 한 화면에 콘텐츠 메타·주제·소스 목록(`content` 소유 — `contents` · `content_topics` · `content_sources`), 담김 여부(`library` 소유), 재청취 창 힌트(`playback` 소유)가 함께 나간다. 어느 한 모듈의 Entity로 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `GET /contents/:content_id` 하나가 여기에 속한다.
- **`content` 모듈에 넣을 수 없다.** `library` · `playback`이 이미 `→ content` 방향을 갖고 있어 반대 방향을 더하면 순환이 된다.
- **`user` · `subscription`을 의존하지 않는다.** 상세 응답에는 잔여 재생 표시값이 없다(`content-detail-api.md` 2장 — 상세 화면에 잔여 표시가 없고, [재생] 허용은 재생 시작 시점에 서버가 판정한다).
- **쓰기 경로가 없다.** 상세 화면의 액션([재생]·[담기]/[삭제]·[원문 보기])은 전부 기존 계약의 재사용이라(`content-detail-api.md` 1장) 소유 모듈(playback·explore·library-screen)에 그대로 남는다.

## 완료 조건

- Given `architecture.md` 4.5의 의존 표를 읽는다 / When 모듈 목록을 확인한다 / Then `ContentDetail | Content, Library, Playback` 행이 있고, Entity 없는 유스케이스 모듈임이 해설 단락에 적혀 있다
- Given 표의 행과 코드(`content-detail.module.ts`의 imports)를 대조한다 / When 의존 목록을 비교한다 / Then 두 목록이 일치한다 (Content · Library · Playback 셋뿐)

---

## 처리 기록 (반영 날짜 2026-08-24 — 브랜치 `integration/content-detail`)

- `architecture.md` 4.5 표에 `ContentDetail | Content, Library, Playback` 행 추가, 유스케이스 모듈 해설 단락("ContentDetail도 Entity를 갖지 않는다") 신설 — 요청 요지 그대로 반영
