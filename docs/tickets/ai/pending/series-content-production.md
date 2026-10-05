# [AI] 시리즈물 제작 — 파이프라인에서 한 주제를 여러 편으로 나눠 만들기

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/`(대본·QA·패키지 단계) · `docs/ai/`(시리즈 제작 절차) |
| 요청 파트 | AI(파이프라인) |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-136](https://runtime364.atlassian.net/browse/KAN-136) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 없음 (Lowest — 선행이 끝난 뒤 다시 잡는다) |
| 선행 | KAN-128(시리즈 도입 범위 확정 — `tickets/frontend/pending/series-content-introduction.md`) |
| 근거 문서 | `prd/ear_root_prd.md` FR-13 · `backend/domain.md` 5.1 · `ai/PIPELINE.md` |
| 중요도 | Lowest — 범위가 KAN-128에서 정해져야 착수할 수 있어 기한을 두지 않는다. 범위 확정 후 중요도·기한을 다시 잡는다 |
| 상태 | 대기 |

## 무엇을 한다

시리즈 콘텐츠의 제작 쪽 구현(PRD FR-13 "분할된 편은 시리즈로 묶어 순서를 유지한다").

- 한 주제를 몇 편으로 나눌지(분할 기준·편수 상한), 편 사이 연결(이전 화 요약·다음 화 예고)
- 대본·QA·패키지 단계에서 시리즈 메타(`series_id`·`episode_no`·`total_episodes`)를 싣고 발행
- `docs/ai/`에 시리즈 제작 절차 추가

## 완료 조건

- Given KAN-128 완료 / When 이 티켓을 다시 잡는다 / Then 중요도·기한이 범위에 맞게 갱신돼 있다
- Given 시리즈 주제 하나 / When 파이프라인을 돌린다 / Then 정해진 편수의 에피소드가 같은 `series_id`와 연속 `episode_no`로 발행된다
- Given `docs/ai/` / When 시리즈 제작을 찾는다 / Then 분할 기준과 절차가 적혀 있다
