# [INFRA] 모니터링 4종을 Grafana Cloud 한 화면으로 — 1단계(코드 없음): CloudWatch·Sentry 연결, 합성 헬스체크, 대시보드

| 항목 | 값 |
|---|---|
| 대상 | Grafana Cloud(신규 조직) · AWS IAM(읽기 전용 사용자 신설) · Sentry 조직 토큰(읽기 전용 신규) · UptimeRobot 알림 설정 · `docs/infra/inventory.md` · `docs/infra/runbook.md` · `docs/infra/incident-playbook.md` · `docs/features/backend-monitoring.md`(changes/pending 경유) |
| 요청 파트 | 인프라 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-25 |
| 시작 날짜 | 2026-09-25 |
| 기한 | 2026-09-28 (Medium — 3일) |
| 선행 | 없음 |
| Jira | [KAN-97](https://runtime364.atlassian.net/browse/KAN-97) (담당: 박준현) |
| 발견 시점 | 2026-09-25 — Sentry 도입·부하 테스트 뒤 "모니터링이 CloudWatch·UptimeRobot·Sentry·어드민 콘솔 네 곳에 흩어져 한곳에서 볼 수 없다"는 문제 제기 |
| 근거 문서 | `infra/runbook.md` 모니터링 표 · `infra/inventory.md` CloudWatch Agent·알람·UptimeRobot 항목 · `features/backend-monitoring.md`(어드민 콘솔의 데이터 경로) · `infra/scaling.md`(Sentry 추적 비용 실측) |
| 중요도 | **Medium** — 장애가 아니라 운영 효율. 광고 집행 전에 장애 대응 화면을 한곳으로 모아 두는 것이 목적 |

## 결정 (2026-09-25 박준현)

| 결정 | 내용 | 이유 |
|---|---|---|
| 어디에 | **Grafana Cloud 무료 티어**(지표 1만 시리즈·사용자 3명·보존 14일·만료 없음). 자체 호스팅 안 함 | 운영 EC2 는 스왑 없는 1.8GB, AI 서버도 워커·웹·AI 서버가 이미 돌아 Prometheus 저장소를 얹을 자리와 관리 여력(백업·업데이트·인증서)이 없다. 모니터링 도구가 죽었을 때 그걸 볼 것이 없다 |
| UptimeRobot | **알림은 Grafana 합성 모니터링으로 옮기고, 계정과 모니터는 알림만 끄고 유지** | 무료 한도 API 테스트 월 10만 회, 3분 간격·프로브 2곳 헬스체크는 월 약 29,800회. 다운 알림이 다른 알림과 같은 Slack 채널로 나간다. 지금은 이메일 알림뿐이라 잘 안 보인다. 유지하는 이유는 Grafana Cloud 자체 장애 때 외부 감시가 함께 사라지지 않게 하려는 것 |
| 어드민 웹 콘솔 | **그대로 둔다.** 자체 도구와 Grafana 를 둘 다 운영한다 | 실시간 로그(5초 폴링)·에러 모아보기는 이미 편하고 우리 규칙이 들어 있다. 서버 상태·요청 통계도 팀이 익숙해서 유지 비용이 없다. 백엔드 지표를 Grafana 로 보내는 것은 2단계(`tickets/backend/pending/grafana-backend-metrics-later.md`, KAN-98, Lowest) |

## 할 일

### 1. Grafana Cloud 조직
- 무료 조직 생성, 스택 리전은 **일본(AWS `ap-northeast-1`, 도쿄)**. 우리 API 가 서울(`ap-northeast-2`)이라 가장 가깝고(왕복 30ms 대, 싱가포르는 70ms 대) 같은 AWS 백본이다. 한국 리전은 없다. 대시보드 조회는 어디든 차이가 없지만, 2단계 remote write 와 Logs Insights 왕복이 짧아진다. 팀 3명 초대 — 무료 한도가 정확히 3명이라 외부 계정을 추가로 넣을 수 없다.

### 2. CloudWatch 데이터소스 (가장 값어치 있는 연결)
- IAM 사용자 `grafana-cloudwatch-read` 신설, 인라인 정책 최소 권한: `cloudwatch:GetMetricData` · `ListMetrics` · `GetMetricStatistics` · `DescribeAlarms` · `DescribeAlarmHistory`, `logs:DescribeLogGroups` · `StartQuery` · `GetQueryResults` · `StopQuery` · `FilterLogEvents` · `GetLogEvents`, `tag:GetResources`, `ec2:DescribeInstances`(인스턴스 이름 표시용). 리전 `ap-northeast-2`.
- 액세스 키는 Grafana 데이터소스 설정에만 넣는다. 이걸로 들어오는 것: `CWAgent`(CPU·메모리·스왑·디스크, 60초), `ear/ops CronSuccess`(backup·content-export·ebs-snapshot·log-watch 하트비트), 알람 상태 5종, `/ear/api`·`/ear/caddy` 로그(Logs Insights 쿼리).

### 3. Sentry 데이터소스
- Grafana Labs 공식 플러그인(무료). Sentry 조직 설정에서 **읽기 전용 조직 토큰을 새로 발급**(`org:read` · `project:read` · `event:read`). FE 소스맵 업로드용 토큰을 재사용하지 않는다 — 용도가 다르고 유출 범위를 분리한다.
- 토큰은 Grafana 데이터소스 설정에만. 저장소·Jira·문서·메모리에 남기지 않는다.

### 4. 합성 모니터링 (UptimeRobot 대체)
- HTTP 체크 `https://api.earcast.co.kr/api/v1/health`, **3분 간격**(UptimeRobot 5분보다 촘촘하게 — 2026-09-25 결정), 조건: 200 + 본문에 `"status":"ok"` 포함(Regexp validation, Body, **Invert match** — 없으면 실패), 타임아웃 5초. 프로브는 **Seoul, KR · Tokyo, JP** 2곳(스택 리전과 별개. 서울은 사용자와 같은 위치라 실제 응답시간, 도쿄는 서울 프로브 문제일 때의 대조군. 미국 프로브는 뺀다). 한 프로브 실패는 프로브 문제일 수 있다. "Publish full set of metrics" 는 끈다(시리즈 예산).
- 알림 규칙: **2회 연속 실패 → Slack**. 3분 간격이라 최대 6분 안에 알린다(UptimeRobot 5분·최대 10분보다 빠르다).
- UptimeRobot: 알림 연락처(이메일) **끄기**. 모니터 `ear api health` 는 유지. inventory 에 "알림 끔·예비" 로 적는다.

### 5. 알림 (Slack 한 채널)
- 연락처: 기존 에러 채널(`SLACK_ERROR_WEBHOOK_URL` 이 보내는 채널)과 같은 곳. 웹훅 URL 은 Grafana 연락처 설정에만.
- 규칙 셋만 만든다: ① 합성 헬스체크 2회 연속 실패 ② `CWAgent mem_used_percent` > 80 이 5분 ③ `cpu_usage_active` > 70 이 5분.
- **만들지 않는 것**: 디스크 80%·크론 하트비트 누락·EC2 상태 검사 — CloudWatch 알람이 이미 SNS 메일로 보낸다. Grafana 에는 **알람 상태 패널로만** 표시한다. 같은 사건에 두 알림이 오면 하나를 끄게 되고 결국 둘 다 안 보게 된다.
- 자체 도구의 Slack 경보(API 프로세스가 보내는 CPU 70·MEM 80 3틱 지속)는 이번에 건드리지 않는다. ②③ 과 겹치지만 임계·지속 조건이 달라 초기 몇 주는 둘을 비교해 보고 2단계에서 정리한다.

### 6. 대시보드 "ear 운영" 1장
| 행 | 패널 | 소스 |
|---|---|---|
| 가용성 | 합성 체크 상태 · 응답시간 추이 · 최근 24h 가동률 | 합성 모니터링 |
| EC2 | CPU · 메모리 · 스왑 · 디스크 (운영 `i-04f1f70f5484ffafd`) | CloudWatch `CWAgent` |
| 로그 | `/ear/api` ERROR·FATAL 건수(5분 버킷) · `/ear/caddy` 상태코드 분포·요청 수 | CloudWatch Logs Insights |
| 에러 | 24h 신규 이슈 수 · 최근 이슈 10건 | Sentry |
| 운영 | 크론 하트비트 4종 마지막 시각 · CloudWatch 알람 상태 | CloudWatch |

- 기간 선택기 기본 6시간. 어드민 콘솔 대시보드 최대 범위(360분)와 맞춘다.

### 7. 문서
- `infra/inventory.md` — Grafana 조직 URL·데이터소스 3종·IAM 사용자·비밀값 "위치"(값 아님)·UptimeRobot "알림 끔·유지". 인프라 파트 소유라 PR 에서 직접 고친다.
- `infra/runbook.md` 모니터링 표 — 첫 줄을 "Grafana 대시보드에서 본다" 로, 각 소스는 그 아래 원천으로.
- `infra/incident-playbook.md` — 알림→절차 매핑에 Grafana 헬스체크 알림 추가(UptimeRobot 메일 항목 교체).
- `features/backend-monitoring.md` — "어드민 콘솔과 Grafana 를 병행한다, 서버 상태·요청 통계는 콘솔이 기준" 한 절. features/ 는 changes/pending 경유.

## 비밀값 규칙
IAM 액세스 키 · Sentry 읽기 토큰 · Slack 웹훅 URL 은 **Grafana 설정 안에만** 존재한다. 저장소·Jira·문서·세션 메모리에 값을 적지 않는다. 문서에는 "Grafana 데이터소스 설정에 있음" 과 발급 날짜만 적는다. 회전은 분기 1회, inventory 에 날짜를 남긴다.

## 범위 밖
- 백엔드 `/metrics` 노출·Alloy 설치 — 2단계(KAN-98).
- 어드민 웹 콘솔 탭 정리 — **안 한다**(결정).
- 로그를 Grafana Loki 로 적재 — 안 한다. 로그는 CloudWatch 에 두고 Logs Insights 로 읽는다(보존 7일 그대로).
- Sentry 성능 추적 — 운영에서 켜지 않는다(KAN-93).

## 완료 조건
- Given Grafana "ear 운영" 대시보드 / When 연다 / Then EC2 4지표·API ERROR 건수·caddy 상태코드·Sentry 이슈·합성 헬스체크·크론 하트비트가 한 화면에 있다
- Given 개발계 `api` 컨테이너를 10분 멈춘다 / When 합성 체크 2회 실패 / Then Slack 에 Grafana 알림이 오고, 복구 뒤 해소 알림이 온다. UptimeRobot 메일은 오지 않는다(운영은 실험하지 않는다 — 개발계 체크를 하나 더 만들어 검증한 뒤 지운다)
- Given IAM 사용자 `grafana-cloudwatch-read` / When 정책을 읽는다 / Then 쓰기 권한이 하나도 없다
- Given `infra/inventory.md` / When 읽는다 / Then Grafana 조직·데이터소스 3종·비밀값 위치·UptimeRobot "알림 끔·유지" 가 적혀 있고 값은 없다
- Given 팀원 3명 / When Grafana 로그인 / Then 셋 다 대시보드를 본다

## 처리 기록

- 2026-09-25 발행. Jira KAN-97(담당 박준현·인프라). 2단계 KAN-98 이 이 티켓에 `is blocked by` 로 걸려 있다.
- 2026-09-26 합성 체크 `ear-api-health` 생성 중(3분·서울·도쿄·2/2 실패·TLS 14일). 7번 문서 항목 중 `incident-playbook.md` 3장 경보 역색인은 이 PR(#726)에서 먼저 반영 — 알림의 Runbook URL 이 `#a001` 앵커를 가리키므로 표가 먼저 맞아야 했다. 나머지 문서(inventory·runbook·backend-monitoring)는 처리 시.
