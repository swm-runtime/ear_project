# [BE] 단기 실험 ② 시리즈 편별 완청률·이탈 조회(어드민 인사이트)

| 항목 | 값 |
|---|---|
| 대상 | `modules/admin` 인사이트 조회 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-293](https://runtime364.atlassian.net/browse/KAN-293) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | 없음 |
| 근거 문서 | `spec/api/admin-api.md` · `features/backend-monitoring.md` |
| 중요도 | High |
| 상태 | 완료(2026-10-29) |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

IT 특화 실험의 근거는 CS 시리즈 완청률이다. 편별 완청률(`/admin/insights/completion-by-length`)은 있지만 시리즈·편 번호로 묶은 조회가 없어 "몇 편에서 빠지는가"를 볼 수 없다.

## 무엇을 한다

- `contents.series_id`·`episode_no` 기준 편별 시작 수·완청 수·다음 편 진행률(완청 규칙은 기존 90% 규칙 그대로).
- IT 커뮤니티 홍보 유입은 커뮤니티별 초대 코드로 본다(`/admin/insights/invite-codes`, 코드 변경 없음). 코드 발급은 운영 작업으로 처리 기록에 남긴다.
- 문서 수정은 `changes/pending`에 기록.

## 범위 밖

- 콘솔 화면(필요하면 AI/파이프라인 콘솔 작업).
- A/B 그룹별 지표 탭(별도 정리 대상).

## 완료 조건

- Given CS 시리즈 / When 조회 / Then 편마다 시작·완청·다음 편 진행률이 나온다
- Given 시리즈가 아닌 콘텐츠 / Then 결과에 섞이지 않는다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-293).
- 2026-10-29 구현 — 이 PR(`feat(be)/exp-series-completion-insight`) · 반영 날짜 2026-10-29.
  - `GET /admin/insights/series-episodes?market=` 신설 — 시리즈 편마다 시작·완청·완청률·다음 편 진행(시작자 중·완청자 중). 시작·완청 정의는 길이별 완청률과 같다(0초 아닌 재생 · 첫 재생 24시간 전 · 완청 공용 정의 90%). 단일 콘텐츠는 나오지 않는다.
  - 문서 반영은 `changes/pending/exp-series-completion-insight.md`.
  - **하지 않음**: IT 커뮤니티별 초대 코드 발급은 운영 작업으로 남는다(코드 변경 없음 — 발급 뒤 `/admin/insights/invite-codes`로 본다).
