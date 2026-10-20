# [BE] 썸네일만 바꾸는 재발행은 재생 위치를 지우지 않게

| 항목 | 값 |
|---|---|
| 대상 | `PATCH /admin/contents/:contentId`(admin-api 4.10) — 재생 위치 폐기·`content_version` 증가 규칙 |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI) — 시리즈 썸네일 교체 준비(2026-10-20) |
| 발행 날짜 | 2026-10-20 |
| Jira | [KAN-236](https://runtime364.atlassian.net/browse/KAN-236) |
| 시작 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일) |
| 선행 | 없음. 이 티켓이 시리즈 썸네일 일괄 교체(파이프라인 — 운영 시리즈 스위치 시점)의 선행이다 |
| 근거 문서 | `spec/api/admin-api.md` 4.10 "재생 위치 폐기"·`content_version` 규칙 · `tickets/frontend/archive/republish-stale-playback-position.md`(안 A) · `player-api.md` 4.1·4.2 |
| 중요도 | Low |
| 상태 | 완료(2026-10-20) |

## 문제

- 지금은 재발행이 어떤 파트든(추천 메타·자막 단독 전송 제외) `content_version` 을 올리고 **그 콘텐츠의 `playback_progresses` 를 전부 지운다**(admin-api 4.10 — 2026-09-07 안 A). 오디오가 바뀌어 같은 초가 다른 내용을 가리키는 것을 막는 규칙인데, **썸네일만 바꿔도** 똑같이 지운다.
- 시리즈 썸네일을 새 디자인(같은 그림에 편 번호)으로 바꾸기로 했다 — 키워드 시리즈 두 개(CS 16편 · 경제 상식 12편)부터, 다른 시리즈도 디자인이 정해지는 대로. 운영 시리즈 스위치(KAN-229) 시점에 한꺼번에 바꾸면 **약 30~46편에서 듣던 위치가 전부 0으로 돌아간다.** 오디오는 그대로인데 사용자는 이어 듣기를 잃는다.

## 요청 내용

1. **오디오(`audio`·`audio_lossless`)를 바꾸지 않는 재발행은 재생 위치를 지우지 않는다** — 썸네일·제목·설명·출처·주제만 바꾸는 경우. 같은 초가 같은 내용이라 낡은 위치가 생기지 않는다.
2. `content_version` 을 올릴지는 BE 가 정한다. 올리면 클라이언트 재발행 판정(`player-api.md` 4.1·4.2)이 무엇을 하는지(위치 폐기를 클라이언트가 따로 하지는 않는다 — 서버가 주체)만 문서에 맞춰 적는다. 추천 메타·자막 단독 전송처럼 올리지 않는 쪽이 더 단순하면 그쪽으로.
3. 썸네일 단독 재발행에서 임베딩·대본은 지금처럼 유지된다(오디오를 안 바꾸면 승계 — admin-api 8장 `has_current_embedding`).
4. admin-api 4.10 의 "재생 위치 폐기" 절에 예외를 적는다.

## 완료 조건

- Given 재생 위치가 있는 콘텐츠 / When `thumbnail` 만 보내 재발행한다 / Then 그 사용자의 다음 진입에서 `progress` 가 그대로다
- Given 같은 콘텐츠 / When `audio` 를 보내 재발행한다 / Then 지금처럼 재생 위치가 지워진다
- Given 썸네일 단독 재발행 / When 상세·탐색 응답을 본다 / Then 새 `thumbnail_url` 이고 `has_script`·`has_current_embedding` 이 그대로다
- Given 4.10 문서 / When 읽는다 / Then 재생 위치 폐기의 예외(오디오 미변경)와 `content_version` 처리가 적혀 있다

## 처리 기록

- 2026-10-20 발행(마크다운 + Jira KAN-236, 중요도 Low · 시작 10-20 · 기한 10-23). Slack 알림은 보내지 않았다(박수헌).
- 2026-10-20 반영(반영 날짜: 2026-10-20). 코드 PR `fix(be): keep playback progress on non-audio republish`(브랜치 `fix(be)/republish-thumbnail-keeps-progress` → `dev`). **오디오를 바꾸지 않는 재발행은 재생 위치를 지우지 않고 `content_version`도 올리지 않는다** — 추천 메타·대본 단독 전송과 같은 규칙. 버전을 올리고 삭제만 건너뛰는 안은 버렸다: 앱(1.1.0·1.2.x 포함)이 재생 중 버전 변경을 감지하면 세션 위치를 0으로 폐기·시크해 이어 듣기가 어차피 끊긴다(`frontend/src/features/player/services/playback.service.ts`). 버전이 그대로라 임베딩도 일치한 채 남아 `carryVersionForward` 승계 코드를 지웠다(`has_current_embedding` 유지), 대본은 오디오를 안 바꾸면 원래 건드리지 않는다. 썸네일은 업로드마다 새 무작위 키라 버전 없이도 URL이 바뀐다. 단위 테스트(썸네일 단독·메타 단독·오디오+썸네일)와 E2E `backend/test/admin-republish-progress.e2e-spec.ts`(위치 120초 → 썸네일 재발행 → 위치·버전·`has_script`·`has_current_embedding` 그대로 + 새 `thumbnail_url` → 오디오 재발행 → 위치 삭제·버전 2)로 완료 조건 1~3을 확인했다. 완료 조건 4(4.10 문서)는 문서 수정 요청 `changes/pending/republish-keeps-progress-without-audio.md`로 넘겼다 — 통합 때 반영. Jira KAN-236 완료 전환은 PR 머지 시점에.
