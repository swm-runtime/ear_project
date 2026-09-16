# 콘텐츠 0건 주제의 노출 켜기 — "콘솔 확인 UX"에서 "서버 409 거부"로

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/admin.md` 4.5·완료 조건 · `docs/spec/api/admin-api.md` 4.3·5장 에러 표 · `docs/features/common-error-handling.md` 9장 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-17 |
| 근거 | `tickets/backend/pending/topic-visibility-requires-content.md`(KAN-58, 사용자 결정 2026-09-15) · 백엔드 반영 2026-09-17 |

## 수정 내용

1. **`admin.md` 4.5** — "콘텐츠 0건인 주제의 노출을 켜려 하면 경고 확인을 거친다 … 이 확인은 콘솔이 수행하고 서버는 기록만 남긴다 … 서버가 막으면 오히려 곤란하다"(구현 확인 2026-08-30) 항목을 다음으로 교체:
   > **콘텐츠 0건인 주제는 노출을 켤 수 없다 — 서버가 409 `ADMIN_TOPIC_HAS_NO_CONTENTS`로 거부한다**(2026-09-15 결정, 2026-08-30 결정 번복). 판정은 `is_visible` **false → true 전이**에만 걸고, 이미 노출 중인 주제의 다른 필드 수정과 노출 끄기는 건수와 무관하게 통과한다. 건수는 삭제 판정과 같은 집계(주제에 배정된 콘텐츠 수, 상태 무관).
   > **번복 사유**: 0건 주제가 노출되면 사용자가 그 주제를 고를 수 있고, 그 뒤 주제를 지우면 `user_interests` FK로 500이 난다. "발행 직전 준비" 운영은 순서를 **콘텐츠 발행 → 주제 노출**로 고정하면 성립한다(콘텐츠 업로드는 숨김 주제에도 배정 가능).
2. **`admin.md` 완료 조건** — "Given 콘텐츠가 0건인 주제 / When 노출 토글을 켠다 / Then 경고 확인을 거쳐야 켜지며…"를 "… / Then **409로 거부되고 주제는 숨김 그대로**다. 콘솔은 0건·숨김 주제의 토글을 비활성으로 그린다"로 교체.
3. **`admin-api.md` 4.3** — "콘텐츠 0건인 주제의 `is_visible: true`를 서버가 거부하지 않는다" 문장을 "409 `ADMIN_TOPIC_HAS_NO_CONTENTS` — 콘텐츠 0건인 주제의 `is_visible: true` 전이. `details.content_count = 0`. 콘솔은 체크박스를 원복하고 서버 `message`를 표시한 뒤 목록을 재조회한다"로 교체. **5장 에러 표**에 `| ADMIN_TOPIC_HAS_NO_CONTENTS | 409 | false | 4.3 — details.content_count = 0 |` 추가(`ADMIN_TOPIC_HAS_CONTENTS` 옆).
4. **`common-error-handling.md` 9장** — `| ADMIN_TOPIC_HAS_NO_CONTENTS | 409 | false | 콘텐츠 0건인 주제의 노출 켜기 (admin.md 4.5). 콘텐츠를 먼저 발행하라고 안내 |` 추가.

## 완료 조건

- Given `admin.md` 4.5 / When 읽는다 / Then "서버가 409로 거부한다"와 번복 사유·순서 규칙이 적혀 있고 2026-08-30 문장은 없다
- Given `admin-api.md` 5장·`common-error-handling.md` 9장 / When `ADMIN_TOPIC_HAS_NO_CONTENTS`를 찾는다 / Then 409·retryable=false·`details.content_count`가 적혀 있다
