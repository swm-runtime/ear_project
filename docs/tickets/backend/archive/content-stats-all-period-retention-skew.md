# [BE] `content_stats` 전체 구간(`all`)이 보존 배치와 결합해 181일째부터 완청률이 왜곡된다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/playback/services/content-stat-aggregation.service.ts` · `repositories/content-stat-aggregation.repository.ts` · `backend/src/modules/retention/retention.constant.ts` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 백엔드 전체 검증(`refactor(be)/full-audit`) — 별도 검증 에이전트 REAL 판정 |
| 근거 문서 | `backend/domain.md` 5.4(`content_stats` 재집계 upsert) · 12.1(보존 기간) · `features/drip-scheduling.md` 4.2 ③·4.8-3 |
| 심각도 | **중(잠복형)** — 오늘 기준 증상 없음. 가장 오래된 `user_signals`가 180일을 넘기는 날부터 매일 조금씩 어긋난다 |
| 우선순위 | Low(이번 주 안) → 실제로는 **서비스 개시 + 150일 전까지** 반영하면 된다 |
| 상태 | **완료** — `all`을 `month` 행 합산으로 전환 (2026-09-22) |
| 반영 날짜 | 2026-09-22 |

## 문제

`all` 구간은 `is_final = false`라 **매일 원천에서 통째로 재집계**한다(5.4 "재집계 upsert"). 그런데 원천의 보존 기간이 서로 다르다.

| `all` 행의 컬럼 | 원천 | 보존 |
|---|---|---|
| `play_count` · `total_listen_sec` | `play_records` | 무기한(12.1 보류) |
| `complete_count` · `replay_count` · `save_count` | `user_signals` | **180일** |
| `source_link_click_count` | `source_link_clicks` | **180일** |

서비스 181일째부터 `all`은 "전체 기간"이 아니라 **분모(재생)는 전 기간, 분자(완청 등)는 최근 180일**인 비율이 된다. 12.1이 180일을 둔 근거("지나간 구간을 다시 셀 때")는 유한 구간(week/month)만 염두에 둔 것이고, 끝나지 않는 `all`에는 성립하지 않는다.

**영향 지점** — `DripBatchOrchestrator.buildScoringCandidates`가 `findAllTimeCounts`로 읽어 `DripScoringService.smoothedCompleteRate = (complete + C·avg) / (play + C)`에 넣는다.
- 정규 편성 인기도 축(가중 0.7) — 오래된 인기 콘텐츠일수록 완청률이 과소 → 감점.
- 탐험 품질 하한(4.8-3) — 예: 1년 전 발행, 재생 1,000·완청 850 콘텐츠가 6개월 뒤 완청 150만 남아 0.85 → 0.15로 떨어지면 하한(0.2) 아래로 **탐험 후보 탈락**.
- 탐색 랭킹은 `play_count`만 써서 영향 없음.

## 요청 내용

**`all`의 신호 기반 4개 카운트를 원천 재집계 대신 `month` 행의 합으로 만든다.**

- `recomputeAll`의 jobs 순서상 month(직전·진행 중)가 `all`보다 먼저 재집계되므로 같은 실행 안에서 합산해도 된다.
- 확정(`is_final = true`) month 행은 원천이 살아 있을 때(≤ 62일 전) 계산·잠금돼 정확하고 불변이다. 진행 중 month는 매일 다시 계산돼 합에도 그대로 반영된다 → 멱등·안정.
- 부수 이득: `play_records` 전 테이블 스캔이 매일 돌던 것이 사라진다(play 계열도 month 합으로 옮기면).
- **1회 백필** — 집계 배치가 도입되기 전 달의 month 행이 없다. 배포 시 그 달들의 month 행을 원천에서 한 번 만들어 두지 않으면 초기 `all` 수치가 오히려 줄어든다(원천이 아직 살아 있는 지금이 백필 가능한 시점이다 — 180일이 지나면 복원 불가).
- **주의(상속되는 갭)** — 배치가 한 달 넘게 멈추면 그 사이 달의 month 행이 생기지 않는다(`recomputeAll`이 직전·진행 중 두 달만 다룬다). 기존 week/month 리포팅에도 있는 갭이며 이 변경이 새로 만드는 것은 아니다.
- 문서: `domain.md` 5.4에 "`all`은 원천 재집계가 아니라 month 행의 합"을, 12.1에 그 이유를 한 줄 적는다(`changes/pending` 발행).

대안으로 검토했으나 비권장: 증분 갱신(5.4 "재집계 upsert" 원칙 위배), 보존 기간 연장(12.1 결정 번복·테이블 성장), 스코어링을 롤링 창으로 전환(정의 변경이 더 크다).

## 완료 조건

- Given `user_signals`에 181일 이전 신호가 있던 콘텐츠 / When 보존 배치가 그 신호를 지운 뒤 집계 배치가 돈다 / Then `content_stats(all).complete_count`는 줄어들지 않는다
- Given 집계 도입 전 달의 재생·완청 기록 / When 백필을 실행한다 / Then 그 달의 `month` 행이 `is_final = true`로 생기고 `all` 합계가 백필 전 원천 재집계 값과 같다
- Given `domain.md` 5.4 / When `all` 산출 방식을 읽는다 / Then month 행 합산과 그 이유가 적혀 있다

## 처리 기록 (2026-09-22 — PR `fix(be)/content-stats-all-from-months`)

- **제안대로 `all`을 `month` 행의 합으로 바꿨다.** `ContentStatAggregationRepository.recomputeAllFromMonths`를 신설하고, 서비스의 jobs 배열에서 `ALL`을 빼 month 재집계가 끝난 뒤에 부른다. `week`·`month`는 종전대로 원천에서 재집계한다.
- **재생 계열도 함께 합산했다.** 티켓은 "부수 이득"으로 적었지만 **필수**로 판단했다 — 재생만 원천에서 가져오면 분자와 분모의 출처가 갈려, 배치가 한 달 넘게 멈춰 그 달 행이 비었을 때 같은 왜곡이 다시 난다. 둘 다 월별 합이면 값은 줄어도 비율은 유지된다. 덤으로 매일 돌던 `play_records` 전 테이블 스캔이 사라졌다.
- **빠진 달 감지를 넣었다.** 합산 시 콘텐츠의 `month` 행 수가 발행월부터 이번 달까지의 기대 달 수보다 적으면 경고를 남긴다. 티켓이 "상속되는 갭"으로 언급만 한 부분인데, `all`이 month 합에 의존하게 되면 **그 갭이 영구 오차가 된다**(종전에는 매일 원천에서 다시 세어 저절로 메워졌다).
- **백필은 필요 없었다.** 운영 DB 확인 결과 원천이 2026-09-04 에 시작해 아직 9월이라 **달이 하나뿐**이고 그 `month` 행은 이미 있다. 빠진 과거 달이 존재하지 않는다. 첫 삭제는 2027년 3월 초라 시한도 없다.
- **검증**: 단위 760건(집계 서비스 스펙 5건 신설) · e2e 48건 · lint · build 통과. 추가로 **로컬 DB 실측** — 확정된 과거 달 행(3월, 완청 80)을 심고 원천을 통째로 지운 뒤 배치를 돌려 `all`이 줄지 않는 것을 확인했다(완료 조건 1). 종전 방식이면 0이 됐을 값이다.
- 문서: `domain.md` 5.4·12.1 반영, `changes/archive/content-stats-all-from-month-sums.md`.
