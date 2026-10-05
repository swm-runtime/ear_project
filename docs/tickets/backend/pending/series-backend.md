# [BE] 시리즈물 백엔드 — 편성(다음 화)·조회 API

| 항목 | 값 |
|---|---|
| 대상 | 드립 편성(`drip-scheduling.md`) · 시리즈 조회 API · 탐색 필터 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-134](https://runtime364.atlassian.net/browse/KAN-134) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 없음 (Lowest — 선행이 끝난 뒤 다시 잡는다) |
| 선행 | KAN-128(시리즈 도입 범위 확정 — `tickets/frontend/pending/series-content-introduction.md`) |
| 근거 문서 | `prd/ear_root_prd.md` FR-13 · `backend/domain.md` 5.1(`series_id`·`episode_no`·`total_episodes`) · `features/drip-scheduling.md` · `features/content-detail.md` 4.3-1 |
| 중요도 | Lowest — 범위가 KAN-128에서 정해져야 착수할 수 있어 기한을 두지 않는다. 범위 확정 후 중요도·기한을 다시 잡는다 |
| 상태 | 대기 |

## 무엇을 한다

시리즈 콘텐츠의 서버 쪽 구현. 스키마(`series_id`·`episode_no`·`total_episodes`)는 이미 있다.

- **드립 편성**: 시리즈 1화를 받은 사용자에게 다음 화를 순서대로 편성, 건너뛴 화 처리
- **조회 API**: 시리즈 묶음·다음 화 정보(라이브러리·플레이어 연속 재생용)
- **탐색 필터**: "시리즈 여부"(PRD 탐색 확장 필터)

세부는 KAN-128이 `features/`에 적는 규칙을 따른다.

## 완료 조건

- Given KAN-128 완료 / When 이 티켓을 다시 잡는다 / Then 중요도·기한이 범위에 맞게 갱신돼 있다
- Given 시리즈 1화를 들은 사용자 / When 다음 드립 편성이 돈다 / Then 같은 시리즈의 다음 화가 편성된다
- Given 시리즈 콘텐츠 / When 조회 API를 부른다 / Then 묶음·다음 화 정보가 `spec/api/`에 적힌 계약대로 온다
