# [BE] 설계 고도화 — 규모 확장 대비 3건(드립 배치 공유 적재 · 토큰 갱신 레이트 리밋 · 무중단 배포), 착수 조건 충족 시 진행

| 항목 | 값 |
|---|---|
| 대상 | 드립 배치(`drip-batch.orchestrator.ts`·`content.repository.ts` `findCandidates`) · 인증 레이트 리밋(`getTracker`·`architecture.md` 9.6) · 운영 배포(`push.sh`·compose·Caddy) |
| 요청 파트 | 백엔드(1·2) · 인프라(3) |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-233](https://runtime364.atlassian.net/browse/KAN-233) · 묶은 티켓 [KAN-48](https://runtime364.atlassian.net/browse/KAN-48) · [KAN-88](https://runtime364.atlassian.net/browse/KAN-88) · [KAN-166](https://runtime364.atlassian.net/browse/KAN-166)(셋 다 2026-10-19 완료 처리) |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 없음 (Lowest) |
| 선행 | 없음 — 아래 착수 조건이 곧 시작 신호다 |
| 근거 문서 | 묶은 원본 3개(archive) — `backend/archive/drip-batch-shared-pool-loading.md` · `backend/archive/auth-rate-limit-nat-sharing.md` · `infra/archive/zero-downtime-two-slot-deploy.md` |
| 중요도 | Lowest |
| 상태 | 대기(착수 조건 감시) |

## 왜

지금 규모(사용자 1,153명)에서는 세 건 모두 할 필요가 없다. 그런데 각각 따로 열려 있으면 "해야 할 일" 목록이 실제 할 일을 가린다. 그래서 하나로 묶고, **언제 꺼내는지(착수 조건)**만 남긴다. 문제 분석·구현안·완료 조건은 각 원본(archive)에 그대로 있다.

## 착수 조건과 실측

| # | 항목 | 착수 조건(하나라도) | 2026-10-19 실측 |
|---|---|---|---|
| 1 | 드립 배치 후보 풀 run 단위 공유 적재(KAN-48) | 05:00 배치 한 run 소요 **10분 초과** · 시간대 그룹(`DRIP_TIMEZONE_GROUPS_ENABLED`)을 켠 뒤 한 그룹 배치가 다음 그룹 시각과 겹침 | 대상 1,024명 **26초**(10-15 476명 12초 → 사용자당 약 0.025초). 종전 트리거 "사용자 1,000명"은 넘었지만 시간 여유가 커서 시간 기준으로 바꿨다 |
| 2 | 토큰 갱신 레이트 리밋을 리프레시 토큰 단위로(KAN-88) | 인증 경로(`/auth/token/refresh`·로그인·가입)에서 **429 실제 관측** · 전체 사용자 1만 명 초과 + 특정 조직·캠퍼스 단위 사용 | 사용자 1,153명. 한도는 한 IP 뒤 동시 활성 약 600명 |
| 3 | 운영 API 무중단 배포 — 슬롯 2개 롤링 + 마이그레이션 분리(KAN-166) | 가장 조용한 1시간이 피크의 **20% 이상** · 주간(09~24시) 긴급 배포가 주 2회 이상인 주가 2주 연속 · 배포 시각 ±1분 끊김이 Sentry·문의로 배포 2회 연속 | 배포 중 약 10초 502를 조용한 시간대 배포로 회피 중. 메모리: api 336MiB, 호스트 가용 636MB(1.8GB 중) — 2배 겹침은 빠듯하다 |

**실측 방법**
- 1번: `SELECT run_date, target_count, extract(epoch from finished_at - started_at) FROM drip_batch_runs ORDER BY run_date DESC LIMIT 7`
- 2번: CloudWatch `/ear/api`에서 인증 경로의 429 건수
- 3번: 원본의 시간대별 요청 수, `docker stats` 메모리

## 무엇을 한다

- 월 1회 또는 주간 회고 때 위 "실측" 칸만 갱신한다.
- 조건이 충족되면 **그 항목만** 떼어 새 티켓으로 발행한다. 원본(archive)의 "요청 내용·완료 조건"을 옮긴다. 이 표의 해당 줄에는 새 티켓 번호를 적는다.
- 조건 충족이 애매하면 회고 안건으로 올려 결정한다.

## 범위 밖

세 항목의 구현 자체. 착수 때 별도 티켓에서 한다.

## 완료 조건

- Given 세 항목 / When 각각 별도 티켓으로 떨어져 나갔다 / Then 이 티켓을 archive한다
- Given 회고 / When 실측을 갱신한다 / Then 처리 기록에 날짜와 값이 남는다

## 처리 기록

- 2026-10-19 발행(마크다운 + Jira KAN-233, Lowest·시작 날짜 10-19·relates KAN-48·88·166). 묶은 세 티켓은 같은 날 완료 처리하고 archive로 옮겼다(사용자 결정 "지금 할 필요 없는 것들 — 착수 조건일 때 진행").
