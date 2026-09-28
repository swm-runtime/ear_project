# [문서] 2026-09-26 감사 하 등급 10건 반영에 따른 문서 정리

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.6 · `backend/domain.md` 5.4·7.4·12.1 · `features/library.md`/`spec/api/library-api.md` 4.8(재담기) · `backend/architecture.md` 7.6(Sentry 릴리스) |
| 요청 파트 | 문서(구현은 백엔드 `fix(be)/audit-low-batch-2026-09-26`) |
| 발행 날짜 | 2026-09-26 |
| 발견 시점 | 감사 하 등급 처리 중 — #767에서 "코드가 아직 …"으로 적어 둔 문장들이 이 PR로 사실이 아니게 됐다 |
| 심각도 | 하 |

## 넣을 내용

- **admin-api.md 4.6** — "2026-09-26 현재 업로드 구현은 값을 조용히 버린다 — 하 등급 코드 항목으로 정렬 예정" 문장 삭제. 이제 업로드도 partner + `sources`면 400.
- **domain.md 7.4·12.1** — `first_drip_jobs` 행의 "(정정 2026-09-26 — 코드는 아직 `completed_at`만 봄, 하 등급 항목)" 괄호 삭제. 코드가 종착 상태 3종을 `updated_at` 기준으로 지운다.
- **domain.md 12.1 구현 상태 문단** — `FirstDripPurgeScheduler` 설명의 "단 `completed_at` 기준이라 … 안 지워짐" 삭제.
- **domain.md 5.4 "빠진 달 감지"** — 기준을 명시: "재생 기록(`play_records`)이 있는 달인데 month 행이 없는 달"을 결손으로 본다. 재생이 0인 조용한 달은 결손이 아니다(정정 2026-09-26 — 종전 구현은 발행월부터의 달 수와 비교해 조용한 달마다 경고했다).
- **library-api.md 4.8** — 재담기(explore 담기로 되살림) 규칙 한 줄: "삭제분을 다시 담으면 `queue_position`은 NULL로 돌아가 맨 위에 온다 — 재담기는 새 담기다. 자리를 유지하는 것은 복구(4.7)뿐이다(명시 2026-09-26)".
- **player-api.md 4.3 / library-api.md 4.5** — 완청 전이가 조건부 UPDATE라 동시 저장에서도 완청 신호는 1회, `completed_at`은 최초 값 유지가 코드로 보장됨(확인 2026-09-26).
- **architecture.md 7.6** — 릴리스 값의 원천: `SENTRY_RELEASE` env → 없으면 이미지의 `package.json` version(`npm_package_version`은 `node dist/cluster` 직접 실행이라 없다).

## 완료 조건
- Given admin-api 4.6 / When 읽는다 / Then "조용히 버린다" 서술이 없다
- Given domain.md 5.4 / When 읽는다 / Then 빠진 달 기준이 재생 기록 있는 달로 적혀 있다
