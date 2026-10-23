# domain·runbook — 경제 상식·서양 철학·동양 철학 시리즈 데이터 마이그레이션 기재 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 5.9 끝 "CS 키워드 시리즈(데이터)" 항목 다음 · `infra/runbook.md` 119행(운영 → 개발계 동기화의 `series` 항목) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-20 |
| 관련 | [KAN-235](https://runtime364.atlassian.net/browse/KAN-235) (`tickets/backend/pending/series-binding-econ-philosophy.md`) · 브랜치 `feat(be)/series-binding-econ-philosophy` · 마이그레이션 `1791100000000-SeedEconPhilosophySeries` |

## 배경

CS 16편 일회성 마이그레이션(`1790700100000-SeedCsKeywordSeries`)은 `domain.md` 5.9에 데이터 항목으로 적혀 있다(고정 시리즈 id·편수·상태). 같은 방식으로 세 시리즈를 묶는 마이그레이션 `1791100000000-SeedEconPhilosophySeries`를 더했다. 시리즈 id를 고정한 이유(운영 → 개발계 동기화가 행을 id로 맞춘다)도 같다. 문서에 없으면 개발계·운영에 생긴 시리즈 행 세 개의 출처를 코드에서만 알 수 있다.

## 수정 내용

1. `domain.md` 5.9 "CS 키워드 시리즈(데이터)" 항목 다음에 한 항목을 더한다.
   > - **경제 상식·서양 철학·동양 철학 시리즈(데이터, 2026-10-20 — KAN-235)** — 마이그레이션 `1791100000000-SeedEconPhilosophySeries`가 시리즈 행 세 개를 고정 id로 만들고 해당 콘텐츠에 `series_id`·`episode_no`·`total_episodes`를 채웠다: "키워드로 훑어보는 경제 상식"(**`cd37aa05-df98-4b21-849b-4f92f387a21d`**, 12편, `ongoing` — 10화는 재발행 예정이라 11편만 묶었다. 10화는 업로드가 시리즈 칸을 싣는다) · "시대별로 보는 서양 철학"(**`197f4991-789d-439c-80df-258e444ca5fd`**, 10편, `completed`) · "시대별로 보는 동양 철학"(**`bf07634b-b399-4bff-8c9c-04d2cae59e4c`**, 8편, `completed`). `content_id`·`content_version`·제목·오디오는 그대로다. 없는 콘텐츠는 건너뛰고 편이 하나도 없는 시리즈는 만들지 않는다. 대상 편이 다른 시리즈에 묶여 있거나 표 밖 콘텐츠가 같은 번호로 발행돼 있으면 멈춘다. 멱등이고 시리즈 행은 덮지 않는다(경제 상식을 `completed`로 바꾼 뒤 다시 돌려도 되돌리지 않는다).
2. `runbook.md` 119행의 "다시 맞추려면 개발계에서 마이그레이션 `1790700100000`을 다시 돌린다" 뒤에 "(경제 상식·철학 시리즈는 `1791100000000` — 멱등)"을 덧붙인다. 운영 반영 전까지는 이 세 시리즈의 개발계 연결도 동기화마다 풀린다.

## 완료 조건 (Given/When/Then)

- Given `domain.md` 5.9 / When 시리즈 데이터 항목을 본다 / Then 세 시리즈의 고정 id·편수·상태·마이그레이션 이름과 경제 상식 10화 처리가 적혀 있다
- Given `runbook.md` 동기화 절 / When 개발계 시리즈 연결이 풀렸을 때의 복구를 본다 / Then `1791100000000`도 다시 돌릴 수 있다고 적혀 있다

## 처리 기록

- 2026-10-20 발행(BE — 마이그레이션과 같은 PR).
- **2026-10-23 반영**(통합 브랜치 `docs(be)/apply-pending-changes`) — 대상 문서 전부 반영, 코드와 대조. 반영 날짜 2026-10-23.
