# 리소스 인벤토리 — 실체 목록과 계정 이력

| 항목 | 값 |
|---|---|
| 작성 | 2026-08-31 (이관 완료 반영) · **2026-09-15 실계정 대조로 전면 갱신** |
| **AWS 계정** | `639177726357` — **ISB-45** (SW마에스트로 지원 조직 계정, IAM Identity Center SSO) |
| CLI 접근 | `aws configure sso` 프로필(역할 `myisb_IsbUsersPS`). 세션 만료 시 `aws sso login` |
| 리전 | `ap-northeast-2` (서울) |
| ⚠️ 계정 제약 | **조직 SCP(`p-5soyo0ar`)가 거부하는 것**: CloudFront KeyValueStore 데이터 플레인(`/play` 재작성안 폐기 원인 — [`architecture.md`](architecture.md) 3.2) · **`dlm:*` 전부**(2026-09-15 — EBS 스냅샷 자동화를 DLM으로 못 함) · **AWS Backup 볼트 생성**(2026-09-15 — "backup-storage·KMS 권한 부족"). `ec2:CreateSnapshot`·AWS Backup 목록 조회는 허용. 다른 SCP 거부를 만나면 여기에 추가 기록할 것 |

> **이력**: 최초 구축(2026-08-30)은 개인 계정 `574748894595`에 이뤄졌으나 계정 착오로 확인되어
> 2026-08-31 이 계정으로 재구축했고, **구계정 리소스는 전부 삭제했다**(과금 요소 0. IAM 유저
> `earcast`와 노출됐던 액세스 키 포함). 당시 이관 절차는 이 문서의 git 이력(6장)과
> [`runbook.md`](runbook.md) 1장에 남아 있다.

## 1. 컴퓨트·네트워크

| 리소스 | ID/값 | 비고 |
|---|---|---|
| EC2 인스턴스 | `i-04f1f70f5484ffafd` | t4g.small, AL2023 arm64, ap-northeast-2a, EBS gp3 20GB |
| Elastic IP | `43.203.57.240` | 가비아 A 레코드 `api`가 가리킴 (`admin`은 2026-09-03 부터 AI 서버 — 3장) |
| 보안그룹 | `sg-048aaaf95e4d12b2e` (`ear-prod-sg`) | 80·443/tcp·443/udp 공개. **22는 `/32` 3개**(2026-09-15 실측: `125.130.96.174` · `211.105.23.163`(준현 데스크톱) · `175.198.222.109`) + CI가 배포 중 러너 IP 임시 추가·회수. ⚠️ 나머지 두 IP의 소유자를 확인해 여기 적을 것 — 모르는 IP는 닫는다 |
| 인스턴스 롤 | `ear-prod-ec2` | 인라인: `backup-put` · `content-upload`(S3 Put/Delete) · `ses-send` · 관리형 `CloudWatchAgentServerPolicy`(2026-09-11 — 아래 4장 에이전트) |
| IAM 정책 (고객 관리형) | `ear-pipeline-bucket-rw` | **파이프라인** (2026-09-01 신설) — `earcast-pipeline-prod`의 `episodes/*`·`sweeps/*`·`datasets/*` Get/Put/List(삭제 없음). AI 서버 롤 `ear-ai-ec2`에 부착됨(2026-09-02). IAM 사용자·액세스 키는 만들지 않음. 생성: `pipeline/deploy/aws/setup-pipeline-bucket.sh` |
| AI 서버 롤 인라인 | `cw-put-ops-metric` | **2026-09-20 신설** — `cloudwatch:PutMetricData` 를 네임스페이스 `ear/ops` 로만 한정. 워커의 백엔드 ERROR 감시가 틱마다 생존 신호(`CronSuccess{Job=log-watch}`)를 찍는 데 쓴다. 이 감시가 죽으면 500 이 나도 Slack 이 조용해지는데 그 조용함이 정상과 구분되지 않아 별도 신호를 둔다 |
| CI 배포 롤 | `ear-ci-deploy` | GitHub OIDC(`token.actions.githubusercontent.com`)로 신뢰. **신뢰 sub 8줄**(2026-09-16): `refs/heads/dev`·`refs/heads/main`·`environment:api-dev`·`environment:api-prod` × 평문 접두사 `repo:swm-runtime/ear_project` + 불변 주체 접두사 `repo:swm-runtime@310554093/ear_project@1315970250`(저장소 OIDC가 immutable subject 모드 — 실제 토큰은 후자다. 갱신은 `deploy/aws/setup-ci-envs.sh`). 인라인 정책 `sg-open-close`(AI SG)·`sg-open-close-api`(제품 SG + `/ear/api` 로그 읽기)·`sg-open-close-api-dev`(개발계 SG + `/ear-dev/*` 로그)·`ecr-push`(`ear/api`). 서버·버킷 접근 없음 — 배포 자체는 GitHub 시크릿의 CI 전용 SSH 키(`CI_SSH_KEY`·`CI_SSH_KEY_API`)로 한다. release 브랜치 배포를 만들려면 신뢰 조건에 그 브랜치를 추가해야 한다 |
| **개발계** EC2 | `i-0a22112e947856a71` (`ear-dev`) | **사설 IP `172.31.14.86`**(운영이 콘텐츠 발행 알림을 보내는 주소 — `api-prod` 환경 변수 `DEV_PRIVATE_IP`, KAN-84. AI 서버 `172.31.15.36` 과 헷갈리지 말 것). **2026-09-15 신설**(`backend/deploy/aws/setup-dev-server.sh`) — t4g.small, AL2023 arm64, 2a 같은 서브넷, gp3 20GB(`vol-007fd6c7b6855cb4f`), user-data(docker·compose·cronie·python3·스왑 2G). compose 3컨테이너(caddy·api·postgres — 프로젝트명이 `ear-prod`라 컨테이너 이름도 `ear-prod-*`, 이름만 그렇다). **API 컨테이너는 ECR 이미지**(`push.sh`의 `API_IMAGE`). 크론 `30 19 * * *` 콘텐츠 들여오기(`sync-content-import.sh`) — **2026-09-20부터 안전망이다**: 운영이 발행 직후 SSH 로 이 스크립트를 부른다(알림 전용 키가 `authorized_keys` 에서 그 명령 하나로 묶여 있다, KAN-84). CloudWatch Agent CPU·메모리 2지표(2026-09-16). 사용자 데이터 없음(빈 DB + 운영 콘텐츠 사본) **콘텐츠 가져오기 크론(`30 19 * * *` `sync-content-import.sh`)도 2026-09-15부터 실행 권한 없이(644) 들어가 `Permission denied`로 돌지 않았을 가능성이 높다** — 운영의 export·EBS 스냅샷과 같은 원인. 개발계는 심장박동 알람이 없어 알림이 없었다. 2026-09-17 git 모드 수정분이 dev에 배포되면 풀린다 — 배포 뒤 `/var/log`의 import 로그로 확인할 것 |
| 개발계 Elastic IP | `54.116.155.248` | 가비아 A 레코드 `api-dev` → `https://api-dev.earcast.co.kr` |
| 개발계 보안그룹 | `sg-0f8f793be74bd58e4` (`ear-dev-sg`) | 80·443 공개 · 22는 준현 IP `/32` + CI 임시 개방 + **운영 SG(`sg-048aaaf95e4d12b2e`) 22**(콘텐츠 반영 알림 — 사설 IP·같은 VPC, KAN-84). 개발계에서 운영·AI 쪽으로 여는 규칙은 없다 |
| 개발계 인스턴스 롤 | `ear-dev-ec2` | 인라인 `secrets-read`(`ear/dev/api-*`만) · `ear-logs-write`(`/ear-dev/*`) · `ses-send` · `content-sync-read`(`earcast-backup-prod/content-sync/*` GetObject) · `ecr-pull`(`ear/api`) · 관리형 `CloudWatchAgentServerPolicy`. 오디오 버킷 쓰기·삭제 없음(운영 파일 보호). 키페어 `ear-dev` — pem `backend/deploy/aws/out/ear-dev-isb.pem`. CI SSH 키 `out/ear-ci-deploy-api-dev`(공개키는 서버 `authorized_keys`, 개인키는 GitHub 환경 시크릿) |
| **AI 서버** EC2 | `i-0c414b676584733da` | **파이프라인** (2026-09-02 신설, `pipeline/deploy/aws/setup-ai-server.sh`) — t4g.small, AL2023 arm64, 2a 같은 서브넷, gp3 20GB, IMDSv2 hop 2, user-data(docker·compose·buildx·git·스왑 2G). compose 4컨테이너(caddy·web·worker-io·ai-server) — `pipeline/deploy/README.md` |
| AI 서버 Elastic IP | `54.116.31.183` (`eipalloc-01215fe9cc181f063`) | `admin.earcast.co.kr` A 레코드(2026-09-03 `pipeline.`에서 통합 — 3장). 사설 IP `172.31.15.36` — 제품 서버가 `/embeddings` 호출 시 이쪽 |
| AI 서버 보안그룹 | `sg-0dfc05389c325b537` (`ear-ai-ec2`) | 80·443/tcp·443/udp 공개 · **22는 `/32` 4개**(2026-09-15 실측: `121.162.157.81` · `118.221.56.129` · `59.187.206.45` · `118.235.93.178` — 소유자 확인 필요) · **8000은 소스=제품 SG만**(공개 아님). 제품 SG 는 참조만 — 무변경 |
| AI 서버 인스턴스 롤 | `ear-ai-ec2` | 부착: `ear-pipeline-bucket-rw` 뿐 (제품 롤 재사용 금지 원칙). 키페어 `ear-ai` — pem `pipeline/deploy/aws/out/ear-ai-isb.pem` (로컬 전용, 유일한 사본) |
| IMDS | v2 강제, hop limit **2** | 컨테이너가 롤 자격증명을 읽기 위해 2 필요 |
| VPC | `vpc-07bfc7f134e639989` (기본 VPC `172.31.0.0/16` — 계정이 비어 있어 `create-default-vpc`로 생성) | **계정에 VPC는 이것 하나.** 서브넷 4개 전부 퍼블릭(2a `subnet-0343791d0f49bcaa8` 172.31.0.0/20 · 2b · 2c · 2d, 공인 IP 자동 부여 on), 라우트 테이블 1개 → IGW `igw-0b9572c00e25eeeca`. **NAT·프라이빗 서브넷·ALB·WAF 없음.** 두 EC2 모두 2a 서브넷(2026-09-15 실측) |

서버 안: `/opt/ear/backend` 코드 · `.env.prod` · docker compose 3컨테이너(caddy/api/postgres) · crond 백업(`0 19 * * *` UTC = 04시 KST).

## 2. 스토리지·CDN

| 리소스 | ID/값 | 비고 |
|---|---|---|
| S3 오디오 | `earcast-audio-prod` | 비공개. `audio/*`(서명 재생)·`thumb/*`(공개 썸네일). 구명 `ear-audio-prod`는 글로벌 유니크 잠금 해제 대기(구계정 삭제 직후라 재사용 가능해졌지만 바꿀 이유 없음) |
| S3 백업 | `earcast-backup-prod` | `pg/` 30일 라이프사이클 |
| S3 파이프라인 | `earcast-pipeline-prod` | **파이프라인** (2026-09-01 신설, 제품과 분리) — 비공개·Block Public Access·버저닝 ON·SSE-S3·TLS 강제. `episodes/{id}/` 대본·발췌·리포트·audio, `sweeps/`(180일 만료), `datasets/`. 이전 버전 90일 정리. 제품 서빙 경로 아님 — 발행 mp3는 관리자 업로드로만 제품 버킷에. 계정 이관 시 `aws s3 sync` 대상 (`docs/ai/spec/08-infra.md` 2장) |
| CloudFront 배포 | `ETLYPIXXR2K7A` → `dp04jswjfphd3.cloudfront.net` | 기본 동작: **서명 필수, Function 없음**(키 직접 서명). `thumb/*` 동작: 무서명 |
| 서명 공개키 | `K1IY9F02SJUF5I` (Key Group `ear-audio-keygroup`) | 개인키: `backend/deploy/aws/out/cf_private.pem` (로컬 전용) |
| 서명 공개키 — **개발계** | `K3CJ80YUPY9I0V` (`ear-audio-key-dev`, 같은 Key Group에 추가 — 2026-09-15 `setup-dev-cdn-key.sh`) | 개인키 `out/cf_private_dev.pem` + 개발계 Secrets `CLOUDFRONT_PRIVATE_KEY_BASE64`. 개발계는 운영 CloudFront·오디오 버킷을 **읽기만** 공유하고 자기 키로 서명. 회수 = 키 그룹에서 이 키 제거 |
| ECR | `ear/api`(비공개, push 시 스캔, 수명주기: 태그 최근 10개·태그 없는 레이어 1일) — 2026-09-15 `setup-ecr.sh` | CI `build-push` job이 arm64 이미지를 `<commit sha>`·`<branch>-latest` 태그로 푸시. 개발계·운영 모두 이 이미지를 pull(2026-09-16 전환). 롤백 = 이전 SHA 태그로 `push.sh`. 월 ~0.4GB |
| OAC | `ear-audio-oac` | S3는 이 배포에서만 읽힘 |
| ~~Function·KVS~~ | 삭제됨 (2026-08-31) | SCP 제약으로 설계에서 제외 — architecture.md 3.2 |

## 3. 도메인·DNS (가비아 — AWS 밖)

| 레코드 | 값 | 용도 |
|---|---|---|
| `api.earcast.co.kr` A | `43.203.57.240` | API (Caddy가 LE 인증서 자동) |
| `admin.earcast.co.kr` A | `54.116.31.183` (**AI 서버**) | 관리자 콘솔 = 파이프라인 웹(`/publish` 제품 발행·주제·회수 + 백엔드 로그 콘솔). 2026-09-03 통합(PR #86) — `pipeline.earcast.co.kr` 레코드는 삭제됨. 2026-09-15 실측 |
| `<token>._domainkey` CNAME ×3 | SES DKIM — **검증 완료**(값은 SES 콘솔·memory 참조) | 이메일 인증 발송 |
| `@` TXT | `v=spf1 include:amazonses.com ~all` (2026-09-07) | SPF |
| `_dmarc` TXT | `v=DMARC1; p=none; rua=mailto:runtime364@gmail.com` (2026-09-07) | DMARC — **`p=none`은 관찰 단계 값**. 2주 리포트 확인 후 상향(`tickets/backend/pending/email-spf-dmarc-records.md`, KAN-31) |
| `earcast.co.kr` (루트) | Vercel | 랜딩 — 이 문서 범위 밖 |

> **TXT 저장 후 값을 `repr()`로 확인하라.** 2026-09-07 SPF 첫 저장이 **앞 공백 하나** 때문에 무효였다(RFC 7208 — 레코드는 `v=spf1`로 시작해야 한다). DNS 조회 결과를 눈으로 보면 공백이 안 보여 정상처럼 읽힌다.

## 4. 운영 보조

| 리소스 | 값 | 비고 |
|---|---|---|
| Budgets | `ear-monthly-10usd` ($10, 80% 실적·100% 예측 메일) | 조직 계정이라 결제 주체는 조직 — 알림은 참고용 |
| SNS 토픽 | `ear-prod-alerts` | 메일 구독 **4건 확정**(2026-09-15 실측 — gmail 3·naver 1) |
| CloudWatch 알람 | `ear-prod-ec2-status-check` | 상태 검사 실패 3분 연속 시 알림 |
| CloudWatch 알람 — 크론 심장박동 | `ear-prod-cron-backup-missing` · `ear-prod-cron-content-export-missing` · `ear-prod-cron-ebs-snapshot-missing` (2026-09-15, `deploy/aws/setup-cron-alarms.sh`) | 세 크론이 성공 시 `ear/ops CronSuccess{Job=…}=1`을 찍고, **25시간 연속 지표 없음**이면 SNS `ear-prod-alerts`(서울, 메일 4명)로. 실패 알림(Slack 웹훅)이 못 잡는 **미실행**을 잡는다. 복구 시 OK 알림 |
| 외부 헬스체크 — **주** | **Grafana Cloud 합성 모니터링** 체크 `ear-api-health`(2026-09-25, KAN-97) — `https://api.earcast.co.kr/api/v1/health` **3분** 간격, 프로브 **Seoul·Tokyo**, 조건 200 + 본문 `"status":"ok"`(Regexp validation·Invert match), 타임아웃 5초, 전체 지표 발행 끔 | 알림 2종은 체크에 붙어 있다 — **Failed Checks**(5분 창 2/2 실패 → Slack, 최대 6분) · **TLS Certificate**(만료 14일 미만 → Slack. Caddy 가 30일 전 갱신하므로 30일로 두면 정상 갱신마다 울린다). 대응은 [`incident-playbook.md`](incident-playbook.md) 3장 역색인 |
| 외부 헬스체크 — 예비 | **UptimeRobot**(무료 플랜, 5분 간격, 인프라 담당(준현) 계정 — 2026-09-15 등록) — 모니터 `ear api health` 키워드 `"status":"ok"` | **2026-09-26 부터 알림 끔, 모니터는 유지**(KAN-97 결정) — Grafana Cloud 자체가 죽었을 때 "우리 서버 문제인가"를 가르는 독립된 두 번째 시점. 서버 부하 0, 비용 0. Slack 연동은 유료라 애초에 메일만이었다. Route 53 헬스체크 미채택 사유(2026-09-15)는 종전과 같다. 재등록 시 설정값은 [`runbook.md`](runbook.md) 6장 |
| **Grafana Cloud** | 무료 티어 조직, 스택 `zealouswasp1316`(`https://zealouswasp1316.grafana.net`), 리전 **일본(AWS ap-northeast-1)** — 2026-09-25 생성(KAN-97). 한도 지표 1만 시리즈·사용자 3명·보존 14일 | **데이터소스 3종** — CloudWatch(아래 IAM 사용자 키) · Sentry(공식 플러그인, 아래 Internal Integration 토큰) · Prometheus `grafanacloud-zealouswasp1316-prom`(합성 체크 지표가 쌓이는 내장 저장소). **대시보드 "ear 운영"**(uid `ear-ops`) — JSON 원본 [`grafana/ear-ops-dashboard.json`](grafana/ear-ops-dashboard.json)(Import 로 복원, Sentry 패널 2개는 화면에서 추가). **알림 연락처** `slack-ear-alerts`(기존 에러 채널 웹훅) = 기본 알림 정책. **비밀값 3종(IAM 키·Sentry 토큰·Slack 웹훅)은 Grafana 설정 안에만 있다** — 저장소·Jira·문서에 값을 두지 않는다. 어드민 웹 콘솔은 그대로 병행(`features/backend-monitoring.md`). 2단계(백엔드 `/metrics`·Alloy)는 KAN-98(Lowest) |
| IAM 사용자 — Grafana | `grafana-cloudwatch-read`(2026-09-25) — 인라인 정책 `grafana-cloudwatch-readonly`: `cloudwatch:GetMetricData/ListMetrics/GetMetricStatistics/DescribeAlarms*`, `logs:StartQuery/GetQueryResults/StopQuery/FilterLogEvents/GetLogEvents/DescribeLogGroups/DescribeLogStreams/GetLogGroupFields`, `ec2:Describe{Instances,Tags,Regions}`, `tag:GetResources`. 액세스 키 1개(Grafana CloudWatch 데이터소스에만) | 쓰기 권한 없음(`simulate-principal-policy` 로 PutMetricData·PutLogEvents·CreateAccessKey·StopInstances·s3:GetObject 전부 거부 확인). `tag:GetResources` 는 상위(SCP) **명시 거부**로 안 된다 — Grafana 의 태그 필터만 안 되고 인스턴스 이름 표시는 `ec2:DescribeInstances` 로 된다. 회전은 분기 1회, 날짜를 이 행에 남긴다 |
| Sentry — 운영 API | 프로젝트 `ear-api`(org `runtime-gw`), **운영 켜짐 2026-09-26** — `.env.prod` `SENTRY_DSN`(개발계와 같은 DSN, SM `ear/prod/api` 에도 반영) + `SENTRY_ENVIRONMENT=production`. **성능 추적 변수는 없다**(KAN-93 — 0 도 계측을 켠다) | 에러 등급만 전송, 데이터 수집 옵션은 코드에서 전부 끔(`backend/src/instrument.ts`). 스모크 `docker exec ear-prod-api-1 node -e "…captureMessage…flush"` → `flush true`(2026-09-26). 개발계는 `development` 환경으로 같은 프로젝트에 섞이니 Grafana Sentry 패널은 환경 필터 없이 둘 다 보인다 |
| Sentry — Grafana 읽기 토큰 | Internal Integration `grafana-read`(2026-09-26) — Project·Issue & Event·Organization **Read** 만 | 조직 토큰(`sntrys_…`)은 `org:ci`(소스맵 업로드)만 줄 수 있어 읽기 용도로 못 쓴다. 사람 계정에 묶이지 않아 팀원이 나가도 끊기지 않는다. 값은 Grafana Sentry 데이터소스에만 |
| EBS 일일 스냅샷 | 운영 API 루트 볼륨 `vol-08a084b831f352dc3`(태그 `Backup=daily`) — 서버 크론 `40 19 * * *`(04:40 KST) `deploy/ebs-snapshot.sh` → 태그 `Source=ear-daily`, **7일 지난 것 자동 삭제**. 인스턴스 롤 `ear-prod-ec2` 인라인 `ebs-snapshot`(이 볼륨 생성·`ear-daily` 태그 스냅샷만 삭제). 첫 스냅샷 `snap-0490cb092c774d4a6`(2026-09-15, 수동). **2026-09-15~09-17 크론이 한 번도 돌지 않았다** — 스크립트가 git에 실행 권한 없이(644) 들어가 크론이 `Permission denied`로 막혔다(같은 원인으로 `sync-content-export.sh`도). 2026-09-17 수정·재실행(`snap-01c538e5445ffe475`), CI가 재발을 막는다(`deploy-api.yml` 검증 job) | DLM·AWS Backup이 SCP에 막혀 크론으로(위 계정 제약). 대상은 운영 API 한 대만 — AI 서버는 Supabase·S3가 실체, 개발계는 버려도 됨. 크래시 컨시스턴트 사본이라 DB 일관성 백업은 pg_dump(`backup.sh`)가 담당. 복구는 [`runbook.md`](runbook.md) 5.4. 비용 월 500~700원 예상 |
| journald 상한 (운영 EC2) | `/etc/systemd/journald.conf.d/10-ear-cap.conf` — `SystemMaxUse=500M` · `MaxRetentionSec=14day` (2026-09-26) | 기본 상한(파일시스템 10% ≈ 2GB)이 디스크를 하루 약 50MB 씩 잠식하던 것을 잡는다(원인: AL2023 `refresh-policy-routes@ens5` 10초 주기 시작·종료 줄 + audit 중복). 하루 50MB → 약 10일치 보존. 넘치면 오래된 파일부터 자동 삭제, 기록은 멈추지 않는다. 적용 직후 540M → 484M. API·Caddy 로그는 awslogs 로 CloudWatch 에 가므로 여기 영향 없음. 재적용은 같은 파일 수정 뒤 `systemctl restart systemd-journald` |
| CloudWatch Agent | API EC2에 설치(2026-09-11, `dnf amazon-cloudwatch-agent` 1.300069) — 네임스페이스 `CWAgent`, 60초 간격 `cpu_usage_active`(`cpu=cpu-total`) · `mem_used_percent` · `swap_used_percent` · `disk_used_percent`(sysfs·tmpfs·overlay 등 가상 FS 제외) | 지표 9개 = 상시 무료 한도(10개) 안. **EC2 세부 모니터링(월 ~$2.1)은 끄고 CPU도 에이전트로 1분 수집.** 설정 `/opt/aws/amazon-cloudwatch-agent/bin/config.json`, 재적용 `amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:<그 파일>`, 상태 `-a status`. systemd 자동 시작. 대시보드는 `CWAgent` + `InstanceId` 차원으로 구성 |
| CloudWatch 대시보드 | `ear`(서울) — 위젯: CWAgent CPU·메모리·스왑·디스크(1분) · **알람 상태**(크론 심장박동 3개 + EC2 상태 검사) · **크론 심장박동** `ear/ops CronSuccess`(Job=backup·content-export·ebs-snapshot, 1시간 Sum — 하루 한 칸씩 1이 찍혀야 정상) · **백업 경과** | 대시보드 3개·지표 50개까지 무료. 위젯은 콘솔에서 직접 편집(코드 관리 안 함, 2026-09-15 구성). 알람 위젯이 빨개지면 [`runbook.md`](runbook.md) 6장 순서로 확인 |
| SES | 도메인 identity `earcast.co.kr` — **DKIM 검증 완료 · 프로덕션 액세스 승인**(샌드박스 아님. 발송 상한 50,000통/일 · 14tps — 2026-09-09 `sesv2 get-account` 실측) | 서버 코드 `backend/src/modules/user/ses-mail.client.ts`(스펙 동반). 인증 메일이 Gmail에 `dkim=pass header.d=earcast.co.kr`로 도착 확인(2026-09-08) |
| Secrets Manager | `ear/prod/api` — ARN `...:secret:ear/prod/api-PyK5Ku` | 운영 API 비밀값 **9종**(2026-09-09 8종 적재 + 2026-09-26 `SENTRY_DSN`). 읽기는 인스턴스 롤 `ear-prod-ec2`의 인라인 정책 `secrets-read`(그 ARN만). **비밀값의 원천**(2026-09-09) — `push.sh`가 배포마다 내려받아 `.env.prod`의 비밀 항목을 덮어쓴다(`deploy/apply-secrets.py`). 앱은 여전히 `.env.prod` 파일을 읽지만 그 내용이 Secrets Manager에서 온다 |
| Secrets Manager — 개발계 | `ear/dev/api` (2026-09-15) | 같은 8키. 랜덤 신규값(운영과 다름 — 운영 토큰이 개발계에서 안 통함) + 개발 CloudFront 개인키 + 소셜 앱 ID는 운영과 동일. 읽기는 `ear-dev-ec2`의 `secrets-read`만 |

## 5. AWS 밖 짝 리소스

| 것 | 위치 | 비고 |
|---|---|---|
| Google OAuth 웹 클라이언트 | GCP — `475643832949-q10v…snist` | 콘솔 로그인(GIS ID 토큰) + 서버 `GOOGLE_WEB_CLIENT_ID`. JS 원본에 `https://admin.earcast.co.kr` |
| 관리자 계정 | 승격 완료 — 콘솔로 콘텐츠 10편 발행 중(2026-09-15) | 추가 승격은 [`runbook.md`](runbook.md) 2장 |
| GitHub Environments | `api-dev`(브랜치 dev만) · `api-prod`(main만) — 2026-09-16 | 변수 `API_HOST`·`API_SG_ID`·`API_SECRET_ID`·`API_HEALTH_URL`·`LOG_GROUP_PREFIX`. 시크릿 `CI_SSH_KEY_API`는 `api-dev`에만(운영은 레포 시크릿). `Preview`·`Production`은 Expo(EAS) 것 — 백엔드와 무관. 생성·갱신 `deploy/aws/setup-ci-envs.sh` |
| GitHub 브랜치 보호 `main` | 필수 체크 `검증 (lint · build · 유닛 · e2e)`·`원본 브랜치 확인 (dev)` · 리뷰 1 · 관리자 포함 · force push·삭제 금지 · **strict 꺼짐** — 2026-09-16 `setup-main-protection.sh` | dev 보호는 검증 체크만(리뷰 없음). main 머지 = 운영 배포 + `v<앱 버전>[+배포 순번]` 태그(첫 태그 `v1.0.0` = `808e526`). 기준은 `frontend/app.json` 버전(2026-09-17 개정 — `docs/backend/convention.md` 6.3) |
| 로컬 비밀 묶음 | `backend/deploy/aws/out/` | `ear-prod-isb.pem`(SSH) · `cf_private.pem`(CDN 서명) · `.env.prod.isb` · `admin-config.js` · **개발계**: `ear-dev-isb.pem` · `cf_private_dev.pem` · `ear-ci-deploy-api-dev`(CI 개인키) · `ear-dev.env.prod`. **유일한 사본 — 백업할 것** |

## 6. 계정 이관 절차 (실행 완료 — 재사용 가능한 기록)

2026-08-31 실제로 수행한 순서. 다음 이관이 생기면 그대로 쓴다.

1. 새 계정 CLI 연결(SSO면 `aws configure sso`) → `sts get-caller-identity`로 계정 확인 → **권한·SCP 탐침**(EC2 dry-run·IAM create-role·S3·CloudFront·SES) — *이번에 SCP 제약을 여기서 발견 못 하고 KVS는 실사용에서 발견했다. 탐침 목록에 실제 쓰는 API 전부를 넣어라*
2. [`runbook.md`](runbook.md) 1장 재실행 (버킷명 충돌 시 개명 → `.env.prod`의 `AUDIO_BUCKET`·`BACKUP_BUCKET` 일치)
3. 데이터: DB 덤프 복원(runbook 5.3) · 오디오 재업로드 (이번엔 0편이라 생략)
4. 가비아 A 레코드 교체 → `docker compose … restart caddy`(백오프 즉시 해제)
5. `.env.prod` CDN 4값 교체 후 재기동 → 업로드 스모크(runbook 3.3) → 관리자 재승격
6. **구계정 청소**: 배포 비활성화→대기→삭제 → Function/KVS/키그룹/공개키/OAC → 버킷 비우고 삭제 → EC2 종료 대기 → SG·키페어·롤 → 모니터링(알람·SNS·Budgets) → **IAM 유저·키 마지막**(그 키로 청소 중이므로). EIP 반납·EC2 종료가 과금 정지 핵심
