# 리소스 인벤토리 — 실체 목록과 계정 이력

| 항목 | 값 |
|---|---|
| 작성 | 2026-08-31 (이관 완료 반영) |
| **AWS 계정** | `639177726357` — **ISB-45** (SW마에스트로 지원 조직 계정, IAM Identity Center SSO) |
| CLI 접근 | `aws configure sso` 프로필(역할 `myisb_IsbUsersPS`). 세션 만료 시 `aws sso login` |
| 리전 | `ap-northeast-2` (서울) |
| ⚠️ 계정 제약 | **조직 SCP(`p-5soyo0ar`)가 CloudFront KeyValueStore 데이터 플레인을 전면 거부** — `/play` 재작성안 폐기의 원인([`architecture.md`](architecture.md) 3.2). 다른 SCP 거부를 만나면 여기에 추가 기록할 것 |

> **이력**: 최초 구축(2026-08-30)은 개인 계정 `574748894595`에 이뤄졌으나 계정 착오로 확인되어
> 2026-08-31 이 계정으로 재구축했고, **구계정 리소스는 전부 삭제했다**(과금 요소 0. IAM 유저
> `earcast`와 노출됐던 액세스 키 포함). 당시 이관 절차는 이 문서의 git 이력(6장)과
> [`runbook.md`](runbook.md) 1장에 남아 있다.

## 1. 컴퓨트·네트워크

| 리소스 | ID/값 | 비고 |
|---|---|---|
| EC2 인스턴스 | `i-04f1f70f5484ffafd` | t4g.small, AL2023 arm64, ap-northeast-2a, EBS gp3 20GB |
| Elastic IP | `43.203.57.240` | 가비아 A 레코드 2개(api·admin)가 가리킴 |
| 보안그룹 | `sg-048aaaf95e4d12b2e` | 22(관리자 IP/32)·80·443/tcp·443/udp |
| 인스턴스 롤 | `ear-prod-ec2` | 인라인: `backup-put` · `content-upload`(S3 Put/Delete) · `ses-send` |
| IAM 정책 (고객 관리형) | `ear-pipeline-bucket-rw` | **파이프라인** (2026-09-01 신설) — `earcast-pipeline-prod`의 `episodes/*`·`sweeps/*`·`datasets/*` Get/Put/List(삭제 없음). AI 서버 롤 `ear-ai-ec2`에 부착됨(2026-09-02). IAM 사용자·액세스 키는 만들지 않음. 생성: `pipeline/deploy/aws/setup-pipeline-bucket.sh` |
| **AI 서버** EC2 | `i-0c414b676584733da` | **파이프라인** (2026-09-02 신설, `pipeline/deploy/aws/setup-ai-server.sh`) — t4g.small, AL2023 arm64, 2a 같은 서브넷, gp3 20GB, IMDSv2 hop 2, user-data(docker·compose·buildx·git·스왑 2G). compose 4컨테이너(caddy·web·worker-io·ai-server) — `pipeline/deploy/README.md` |
| AI 서버 Elastic IP | `54.116.31.183` (`eipalloc-01215fe9cc181f063`) | `pipeline.earcast.co.kr` A 레코드 등록됨(2026-09-02). 사설 IP `172.31.15.36` — 제품 서버가 `/embeddings` 호출 시 이쪽 |
| AI 서버 보안그룹 | `sg-0dfc05389c325b537` (`ear-ai-ec2`) | 22(관리자 IP 2개/32) · 80·443/tcp·443/udp · **8000은 소스=제품 SG만**(공개 아님). 제품 SG 는 참조만 — 무변경 |
| AI 서버 인스턴스 롤 | `ear-ai-ec2` | 부착: `ear-pipeline-bucket-rw` 뿐 (제품 롤 재사용 금지 원칙). 키페어 `ear-ai` — pem `pipeline/deploy/aws/out/ear-ai-isb.pem` (로컬 전용, 유일한 사본) |
| IMDS | v2 강제, hop limit **2** | 컨테이너가 롤 자격증명을 읽기 위해 2 필요 |
| VPC | `vpc-07bfc7f134e639989` (기본 VPC — 계정이 비어 있어 `create-default-vpc`로 생성) | 서브넷 2a `subnet-0343791d0f49bcaa8` |

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
| `admin.earcast.co.kr` A | `43.203.57.240` | 관리자 콘솔 |
| `pipeline.earcast.co.kr` A | `54.116.31.183` | 파이프라인 관리 UI (AI 서버 — 2026-09-02 등록, TTL 1800) |
| `<token>._domainkey` CNAME ×3 | SES DKIM (⏳ 등록 대기 — 값은 SES 콘솔·memory 참조) | 이메일 인증 발송 |
| `earcast.co.kr` (루트) | Vercel | 랜딩 — 이 문서 범위 밖 |

## 4. 운영 보조

| 리소스 | 값 | 비고 |
|---|---|---|
| Budgets | `ear-monthly-10usd` ($10, 80% 실적·100% 예측 메일) | 조직 계정이라 결제 주체는 조직 — 알림은 참고용 |
| SNS 토픽 | `ear-prod-alerts` | 메일 구독 ⏳ 확인 대기 |
| CloudWatch 알람 | `ear-prod-ec2-status-check` | 상태 검사 실패 3분 연속 시 알림 |
| SES | 도메인 identity `earcast.co.kr` (DKIM ⏳ 대기) + 테스트 주소 2개, 프로덕션 액세스 ⏳ 심사 중 | 서버 코드(`SesMailClient`)는 미구현 — 별건 |

## 5. AWS 밖 짝 리소스

| 것 | 위치 | 비고 |
|---|---|---|
| Google OAuth 웹 클라이언트 | GCP — `475643832949-q10v…snist` | 콘솔 로그인(GIS ID 토큰) + 서버 `GOOGLE_WEB_CLIENT_ID`. JS 원본에 `https://admin.earcast.co.kr` |
| 관리자 계정 | ⏳ 새 DB라 재승격 필요 — 콘솔 로그인 후 `UPDATE users SET role='admin'` | [`runbook.md`](runbook.md) 2장 |
| 로컬 비밀 묶음 | `backend/deploy/aws/out/` | `ear-prod-isb.pem`(SSH) · `cf_private.pem`(CDN 서명) · `.env.prod.isb` · `admin-config.js`. **유일한 사본 — 백업할 것** |

## 6. 계정 이관 절차 (실행 완료 — 재사용 가능한 기록)

2026-08-31 실제로 수행한 순서. 다음 이관이 생기면 그대로 쓴다.

1. 새 계정 CLI 연결(SSO면 `aws configure sso`) → `sts get-caller-identity`로 계정 확인 → **권한·SCP 탐침**(EC2 dry-run·IAM create-role·S3·CloudFront·SES) — *이번에 SCP 제약을 여기서 발견 못 하고 KVS는 실사용에서 발견했다. 탐침 목록에 실제 쓰는 API 전부를 넣어라*
2. [`runbook.md`](runbook.md) 1장 재실행 (버킷명 충돌 시 개명 → `.env.prod`의 `AUDIO_BUCKET`·`BACKUP_BUCKET` 일치)
3. 데이터: DB 덤프 복원(runbook 5.3) · 오디오 재업로드 (이번엔 0편이라 생략)
4. 가비아 A 레코드 교체 → `docker compose … restart caddy`(백오프 즉시 해제)
5. `.env.prod` CDN 4값 교체 후 재기동 → 업로드 스모크(runbook 3.3) → 관리자 재승격
6. **구계정 청소**: 배포 비활성화→대기→삭제 → Function/KVS/키그룹/공개키/OAC → 버킷 비우고 삭제 → EC2 종료 대기 → SG·키페어·롤 → 모니터링(알람·SNS·Budgets) → **IAM 유저·키 마지막**(그 키로 청소 중이므로). EIP 반납·EC2 종료가 과금 정지 핵심
