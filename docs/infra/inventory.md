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
| CI 배포 롤 | `ear-ci-deploy` | GitHub OIDC(`token.actions.githubusercontent.com`)로 **`refs/heads/dev` 워크플로만 신뢰**. 인라인 정책 `sg-open-close`(AI SG)·`sg-open-close-api`(제품 SG + `/ear/api` 로그 읽기). 서버·버킷 접근 없음 — 배포 자체는 GitHub 시크릿의 CI 전용 SSH 키(`CI_SSH_KEY`·`CI_SSH_KEY_API`)로 한다. release 브랜치 배포를 만들려면 신뢰 조건에 그 브랜치를 추가해야 한다 |
| **AI 서버** EC2 | `i-0c414b676584733da` | **파이프라인** (2026-09-02 신설, `pipeline/deploy/aws/setup-ai-server.sh`) — t4g.small, AL2023 arm64, 2a 같은 서브넷, gp3 20GB, IMDSv2 hop 2, user-data(docker·compose·buildx·git·스왑 2G). compose 4컨테이너(caddy·web·worker-io·ai-server) — `pipeline/deploy/README.md` |
| AI 서버 Elastic IP | `54.116.31.183` (`eipalloc-01215fe9cc181f063`) | `pipeline.earcast.co.kr` A 레코드 등록됨(2026-09-02). 사설 IP `172.31.15.36` — 제품 서버가 `/embeddings` 호출 시 이쪽 |
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
| 외부 헬스체크 | **UptimeRobot**(무료 플랜, 5분 간격, 팀 공용 계정) — 모니터 `ear api health` = `https://api.earcast.co.kr/api/v1/health` 키워드 `"status":"ok"` | 서버가 죽었을 때 알릴 수 있는 유일한 바깥 시점. 알림 = 메일 + Slack. **Route 53 헬스체크(월 $0.5)는 지표가 us-east-1에만 생겨 토픽·메일 재인증이 더 필요해 채택하지 않음**(2026-09-15). 계정·연결은 사람 몫 — 설정값은 [`runbook.md`](runbook.md) 6장 |
| EBS 일일 스냅샷 | 운영 API 루트 볼륨 `vol-08a084b831f352dc3`(태그 `Backup=daily`) — 서버 크론 `40 19 * * *`(04:40 KST) `deploy/ebs-snapshot.sh` → 태그 `Source=ear-daily`, **7일 지난 것 자동 삭제**. 인스턴스 롤 `ear-prod-ec2` 인라인 `ebs-snapshot`(이 볼륨 생성·`ear-daily` 태그 스냅샷만 삭제). 첫 스냅샷 `snap-0490cb092c774d4a6`(2026-09-15) | DLM·AWS Backup이 SCP에 막혀 크론으로(위 계정 제약). 대상은 운영 API 한 대만 — AI 서버는 Supabase·S3가 실체, 개발계는 버려도 됨. 크래시 컨시스턴트 사본이라 DB 일관성 백업은 pg_dump(`backup.sh`)가 담당. 복구는 [`runbook.md`](runbook.md) 5.4. 비용 월 500~700원 예상 |
| CloudWatch Agent | API EC2에 설치(2026-09-11, `dnf amazon-cloudwatch-agent` 1.300069) — 네임스페이스 `CWAgent`, 60초 간격 `cpu_usage_active`(`cpu=cpu-total`) · `mem_used_percent` · `swap_used_percent` · `disk_used_percent`(sysfs·tmpfs·overlay 등 가상 FS 제외) | 지표 9개 = 상시 무료 한도(10개) 안. **EC2 세부 모니터링(월 ~$2.1)은 끄고 CPU도 에이전트로 1분 수집.** 설정 `/opt/aws/amazon-cloudwatch-agent/bin/config.json`, 재적용 `amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:<그 파일>`, 상태 `-a status`. systemd 자동 시작. 대시보드는 `CWAgent` + `InstanceId` 차원으로 구성 |
| SES | 도메인 identity `earcast.co.kr` — **DKIM 검증 완료 · 프로덕션 액세스 승인**(샌드박스 아님. 발송 상한 50,000통/일 · 14tps — 2026-09-09 `sesv2 get-account` 실측) | 서버 코드 `backend/src/modules/user/ses-mail.client.ts`(스펙 동반). 인증 메일이 Gmail에 `dkim=pass header.d=earcast.co.kr`로 도착 확인(2026-09-08) |
| Secrets Manager | `ear/prod/api` — ARN `...:secret:ear/prod/api-PyK5Ku` | 운영 API 비밀값 8종(2026-09-09 적재). 읽기는 인스턴스 롤 `ear-prod-ec2`의 인라인 정책 `secrets-read`(그 ARN만). **비밀값의 원천**(2026-09-09) — `push.sh`가 배포마다 내려받아 `.env.prod`의 비밀 항목을 덮어쓴다(`deploy/apply-secrets.py`). 앱은 여전히 `.env.prod` 파일을 읽지만 그 내용이 Secrets Manager에서 온다 |

## 5. AWS 밖 짝 리소스

| 것 | 위치 | 비고 |
|---|---|---|
| Google OAuth 웹 클라이언트 | GCP — `475643832949-q10v…snist` | 콘솔 로그인(GIS ID 토큰) + 서버 `GOOGLE_WEB_CLIENT_ID`. JS 원본에 `https://admin.earcast.co.kr` |
| 관리자 계정 | 승격 완료 — 콘솔로 콘텐츠 10편 발행 중(2026-09-15) | 추가 승격은 [`runbook.md`](runbook.md) 2장 |
| 로컬 비밀 묶음 | `backend/deploy/aws/out/` | `ear-prod-isb.pem`(SSH) · `cf_private.pem`(CDN 서명) · `.env.prod.isb` · `admin-config.js`. **유일한 사본 — 백업할 것** |

## 6. 계정 이관 절차 (실행 완료 — 재사용 가능한 기록)

2026-08-31 실제로 수행한 순서. 다음 이관이 생기면 그대로 쓴다.

1. 새 계정 CLI 연결(SSO면 `aws configure sso`) → `sts get-caller-identity`로 계정 확인 → **권한·SCP 탐침**(EC2 dry-run·IAM create-role·S3·CloudFront·SES) — *이번에 SCP 제약을 여기서 발견 못 하고 KVS는 실사용에서 발견했다. 탐침 목록에 실제 쓰는 API 전부를 넣어라*
2. [`runbook.md`](runbook.md) 1장 재실행 (버킷명 충돌 시 개명 → `.env.prod`의 `AUDIO_BUCKET`·`BACKUP_BUCKET` 일치)
3. 데이터: DB 덤프 복원(runbook 5.3) · 오디오 재업로드 (이번엔 0편이라 생략)
4. 가비아 A 레코드 교체 → `docker compose … restart caddy`(백오프 즉시 해제)
5. `.env.prod` CDN 4값 교체 후 재기동 → 업로드 스모크(runbook 3.3) → 관리자 재승격
6. **구계정 청소**: 배포 비활성화→대기→삭제 → Function/KVS/키그룹/공개키/OAC → 버킷 비우고 삭제 → EC2 종료 대기 → SG·키페어·롤 → 모니터링(알람·SNS·Budgets) → **IAM 유저·키 마지막**(그 키로 청소 중이므로). EIP 반납·EC2 종료가 과금 정지 핵심
