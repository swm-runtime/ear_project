# [BE] (나중에) 백엔드 `/metrics`·Alloy 로 자체 모니터링 지표를 Grafana 에도 보낸다 — 2단계

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/`(prom-client 지표 모듈·요청 히스토그램 인터셉터) · `backend/docker-compose.prod.yml`(api `expose` 9464 · Alloy 서비스) · `backend/deploy/`(Alloy 설정) · `docs/backend/architecture.md` · `docs/features/backend-monitoring.md` · `docs/infra/runbook.md`·`inventory.md` |
| 요청 파트 | 백엔드(코드) + 인프라(Alloy·compose) |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-25 |
| 시작 날짜 | 2026-09-25 |
| 기한 | 없음 (Lowest — 가장 나중에. 순서가 밀려도 된다) |
| 선행 | `tickets/infra/pending/grafana-cloud-stage1.md` — [KAN-97](https://runtime364.atlassian.net/browse/KAN-97) (Grafana Cloud 조직·remote write 주소가 있어야 한다) |
| Jira | [KAN-98](https://runtime364.atlassian.net/browse/KAN-98) (담당: 박준현) |
| 발견 시점 | 2026-09-25 — 모니터링 통합 검토. 넷 중 자체 모니터링만 시계열 저장소가 없어 Grafana 에 붙일 형태가 아니었다 |
| 근거 문서 | `features/backend-monitoring.md`(어드민 콘솔 데이터 경로) · `spec/api/admin-api.md` 4.9(`/admin/system-stats`) · `infra/scaling.md`(Sentry 추적 CPU 비용 실측) · `backend/architecture.md` 9장(보안) |
| 중요도 | **Lowest** — 아래 "왜 나중에" |

## 왜 "나중에"

2026-09-25 결정: **어드민 웹 "백엔드 로그" 콘솔(자체 모니터링)은 그대로 두고 Grafana 와 둘 다 운영한다.** 1단계(KAN-97)만으로 EC2·로그·에러·헬스체크는 Grafana 한 화면이 되고, 자체 도구가 보여주는 서버 상태·DB 접속·요청 통계는 어드민 콘솔에서 계속 본다. 두 도구를 유지하는 비용이 크지 않아서, 백엔드 지표를 Grafana 로 보내는 이 작업은 급하지 않다.

## 그래도 언젠가 하는 이유 — 자체 도구의 한계

| 한계 | 위치 |
|---|---|
| 서버 상태 이력이 API 프로세스 **메모리 6시간 링버퍼**(60초 × 360)라 재배포·재시작마다 지워진다. 클러스터에서는 응답한 워커의 버퍼만 보인다 | `admin/services/resource-alert.service.ts` |
| 요청 p50/p95 가 CloudWatch **로그 텍스트를 정규식으로 파싱**해 브라우저에서 계산한 값이다. 요청 1,500~5,000건 표본 상한 | `pipeline/apps/web/lib/backend-request-log.ts` |
| **pg 풀 카운터**(total/idle/waiting)·**이벤트 루프 지연**은 아무 데도 재지 않는다. DB 접속 수는 `pg_stat_activity` 서버 쪽 값만 있다 | — |
| `drip_batch_runs`·`first_drip_jobs` 는 쌓이지만 읽는 엔드포인트가 없다 | `drip/entities/drip-batch-run.entity.ts` |

## 할 일

### 1. `/metrics` 노출 (prom-client)
- 요청 지연 히스토그램 — 라벨은 **라우트 템플릿**(`/library/items/:id`)·메서드·상태코드. 원시 경로를 라벨에 넣으면 시리즈가 폭발한다. `/health` 는 제외.
- pg 풀 카운터(`totalCount`·`idleCount`·`waitingCount`), 이벤트 루프 지연(`perf_hooks.monitorEventLoopDelay`), 프로세스 메모리·CPU(prom-client 기본 수집기).
- 편성 배치·첫 드립 작업 카운터는 선택 — 넣으면 `drip_batch_runs` 를 읽는 게이지가 아니라 오케스트레이터가 올리는 카운터로.
- **별도 포트(9464)에 별도 HTTP 서버로 열고 compose 는 `expose` 만 한다.** Caddy 가 모든 경로를 `api:3000` 으로 넘기므로 3000 에 두면 `https://api.earcast.co.kr/metrics` 가 공개된다. 클러스터 모드는 워커별 포트 또는 `cluster` 집계 중 하나를 정한다.

### 2. Grafana Alloy 컨테이너 (운영 compose)
- 메모리 50~100MB. docker 네트워크 안에서 `api:9464` 를 15초 스크레이프 → Grafana Cloud Prometheus remote write. 자격은 `.env.prod` 가 아니라 별도 env 파일(`compose cp`·`git archive` 반입 밖).
- Postgres 통합 — `pg_stat` 읽기 전용 role 로 접속 수·캐시 히트·데드락·DB 크기. 자체 도구의 DB 블록과 같은 항목.
- 재생성 시 `API_IMAGE=$(cat .api-image)` 규칙 그대로(`infra/runbook.md` 4장).

### 3. 시리즈 예산
- 라우트 40 × 상태 6 × 버킷 12 ≈ 3천 + 기본 수집기 ≈ 3.5천. 무료 한도 1만. 라벨을 추가할 때마다 곱이 커지니 사용자·기기 같은 고카디널리티 라벨은 금지.

### 4. 부하 확인 — 켜기 전과 뒤를 잰다
- 개발계 온보딩 분당 600명 2분(`load-test/k6/scenarios/onboarding-signup-ramp.js`, `infra/scaling.md` 4-2 기준값 CPU 50~80%). Sentry 추적이 표본 0 으로도 CPU 1.5~1.8배를 먹었던 교훈(KAN-93) — prom-client 는 카운터 증가만 해서 가볍다고 알려져 있지만 재보지 않고 믿지 않는다.

### 5. 문서
- `backend/architecture.md` — 지표 노출 위치·포트·"공개 금지" 보안 규칙.
- `features/backend-monitoring.md` — 두 도구 병행, **같은 지표가 다르면 어느 숫자를 기준으로 보는가**(히스토그램이 들어오면 p95 는 Grafana 기준). changes/pending 경유.
- `infra/runbook.md`·`inventory.md` — Alloy 서비스·remote write 자격 위치.

## 범위 밖
- 어드민 콘솔 탭 제거 — **안 한다**(결정).
- 자체 Slack 경보(CPU 70·MEM 80)를 Grafana Alerting 으로 옮기기 — 1단계 뒤 몇 주 비교해 보고 따로 정한다.
- 로그 Loki 적재 — 안 한다.

## 완료 조건
- Given 운영 EC2 밖 / When `https://api.earcast.co.kr/metrics` / Then 404 다. Given Alloy 컨테이너 / When `api:9464/metrics` / Then 요청 히스토그램·풀 카운터·이벤트 루프 지연이 있다
- Given Grafana / When 요청 지연 p95 패널 / Then 어드민 콘솔 대시보드의 같은 시간대 p95 와 같은 자릿수다
- Given 배포 뒤 개발계 부하 테스트 / When 분당 600명 2분 / Then API CPU 가 배포 전 ±10%p 안이고 Alloy 메모리가 100MB 아래다
- Given Grafana 시리즈 사용량 / When 1주 뒤 / Then 5천 아래다

## 처리 기록

- 2026-09-25 발행. Jira KAN-98(담당 박준현·백엔드). Lowest 라 기한 없음. KAN-97 이 끝나야 시작할 수 있다(`is blocked by`).
