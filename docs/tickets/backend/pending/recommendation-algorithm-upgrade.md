# [BE] 추천 알고리즘 검색 및 도입(고도화)

| 항목 | 값 |
|---|---|
| 대상 | 추천(드립 편성·탐색 추천) 점수식 — `features/drip-scheduling.md` · 서버 추천 모듈 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-175](https://runtime364.atlassian.net/browse/KAN-175) |
| 발행 날짜 | 2026-10-12 |
| 시작 날짜 | 2026-10-12 |
| 기한 | 2026-10-15 (Medium — 3일 안) |
| 선행 | 없음 |
| 관련 | `frontend/pending/recommendation-algorithm-research.md`(KAN-104 — 추천 알고리즘 조사·테스트 적용, 이주호) — 조사 결과가 있으면 이어받는다 |
| 근거 문서 | `features/drip-scheduling.md` · `backend/recommendation-evaluation.md`(배포 전 평가 — 7장 체크리스트) |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 요청

추천 알고리즘을 **찾아보고 도입해 고도화**한다(PM 2026-10-12). 지금 점수식(신호·메타·임베딩 축) 대비 나은 방식을 조사하고, 고른 방식을 서버에 넣는다.

- 도입은 추천 로직 변경이므로 `recommendation-evaluation.md` 7장 체크리스트와 `npm run eval:recommend` 를 통과해야 운영에 나간다
- 규칙(점수식)이 바뀌면 `features/drip-scheduling.md` 를 먼저 고친다(문서 우선)

## 완료 조건

- Given 조사 기록, When 후보를 보면, Then 후보별 방식·장단점·도입 비용과 고른 이유가 적혀 있다
- Given 도입 PR, When `npm run eval:recommend` 를 돌리면, Then 통과 기준을 만족하고 결과가 PR 에 붙어 있다
- Given `features/drip-scheduling.md`, When 점수식 절을 보면, Then 도입한 방식이 반영돼 있다

## 처리 기록

