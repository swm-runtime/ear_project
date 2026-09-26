# [BE] 복원 대상 응답에 `topic_ids` 를 넣는다 — 미니플레이어 카테고리 줄

| 항목 | 값 |
|---|---|
| 대상 | `GET /users/me/library-items/resume` — `backend/src/modules/library-screen/dto/get-library-resume-response.dto.ts`(`ResumeContentDto`) · `docs/spec/api/library-api.md` 4.3 응답 예시 |
| 요청 파트 | 백엔드 |
| 요청자 | FE(이주호) |
| 발행 날짜 | 2026-09-22 |
| 시작 날짜 | 2026-09-22 |
| 기한 | 2026-09-26 (Low — 이번 주 안) |
| 선행 | 없음 |
| Jira | [KAN-91](https://runtime364.atlassian.net/browse/KAN-91) |
| 근거 문서 | `library-api.md` 4.1 목록 응답의 `content.topic_ids`(이미 있음) · `player.md` 제목 아래 카테고리 줄 |
| 중요도 | **Low** — 앱 재실행 직후 복원 스냅샷 한 자리만 빠져 있다. 재생이 시작되면 세션 메타로 채워진다 |
| 상태 | 완료 |

## 배경

2026-09-22 PM 결정으로 미니플레이어에 **카테고리 줄**(주제 이름 앞 두 개, 전체 플레이어 제목 아래 줄과 같은 규칙)을 넣었다(FE PR). 재생 중에는 세션 메타의 `topicIds` 로 그린다. 그런데 **앱 재실행 직후의 복원 스냅샷**(`resume_target`)은 `content` 에 `topic_ids` 가 없어 제목만 그린다 — 같은 카드가 상황에 따라 한 줄/두 줄이 된다.

목록 응답(4.1)의 `content` 에는 이미 `topic_ids` 가 있으므로, 복원 응답의 `content` 도 같은 모양으로 맞추면 된다.

## 요청

1. `ResumeContentDto` 에 `topic_ids: string[]` 추가 — 목록 응답과 같은 출처(콘텐츠의 주제 연결).
2. `library-api.md` 4.3 응답 예시에 `"topic_ids": ["uuid", "uuid"]` 추가.

FE 는 `MiniPlayerResumeFallback.topicIds` 를 이미 옵션으로 열어 두었다 — 필드가 내려오면 `library.dto.ts` · `library.api.ts` 매핑 한 줄과 `LibraryScreen` 의 폴백 한 줄만 붙인다(FE 별건, 이 티켓 완료 뒤).

## 완료 조건

- Given 복원 대상이 있는 사용자 / When `GET /users/me/library-items/resume` / Then `resume_target.content.topic_ids` 가 목록 응답의 같은 콘텐츠 `topic_ids` 와 같은 배열로 내려온다
- Given 주제가 없는 콘텐츠 / When 같은 요청 / Then `topic_ids: []`(null 아님)
- Given `library-api.md` 4.3 / When 읽는다 / Then 응답 예시에 `topic_ids` 가 있다

## 처리 기록

- 2026-09-22 발행 — Jira KAN-91.
- **반영 날짜**: 2026-09-22 (박준현 · Claude) — PR `feat(be)/resume-target-topic-ids`.
- **데이터는 이미 있었다.** `getResumeTarget` 이 목록과 같은 `toItemViews` 를 쓰고 있어 `view.content.topicIds` 가 이미 채워져 있었고(주제 없으면 `[]`), **DTO 만 그 필드를 빼고 있었다.** 그래서 조회 경로·쿼리 변경 없이 `ResumeContentDto` 에 `topic_ids` 를 더하고 매핑 한 줄을 붙였다 — 목록 응답과 같은 출처라는 완료 조건이 구조적으로 보장된다.
- **테스트**: `get-library-resume-response.dto.spec.ts` 3건 — 값 전달 · 주제 없을 때 `[]`(null 아님) · 대상 없을 때 종전 동작. 전체 763건 + E2E 48건 통과.
- **문서**: `spec/api/library-api.md` 4.3 응답 예시에 `topic_ids` 추가하고 설명 한 줄을 덧붙였다(`null` 이 아니라 `[]`). 계약 문서라 `changes/archive/resume-target-topic-ids-spec.md` 에 기록을 남겼다.
- **FE 후속**: `MiniPlayerResumeFallback.topicIds` 매핑 연결은 FE 별건이다. 필드는 이제 내려간다.
- Jira KAN-91 → 완료로 전환.
