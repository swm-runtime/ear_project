# 인프라 런북 — 손으로 하는 절차 전부

| 항목 | 값 |
|---|---|
| 작성 | 2026-08-31 (2026-08-30 실배포에서 검증된 절차) |
| 전제 | 로컬에 `aws` CLI 로그인, 저장소 체크아웃, Git Bash(Windows) 또는 POSIX 셸 |

> 명령의 원본은 `backend/deploy/aws/README.md`다. 이 문서는 그 절차에 **실측에서 걸렸던 함정**을 덧붙인 판이다. 두 문서가 어긋나면 README(코드 옆)가 기준.

## 1. 처음부터 재구축 (새 계정 포함, 실측 2~3시간)

### 1.1 IAM 준비 (콘솔)

1. 루트 로그인 → IAM → Users → Create user (예: `earcast`), 콘솔 액세스 없음
2. 정책: `AmazonS3FullAccess` + `CloudFrontFullAccess` + `AmazonEC2FullAccess` + (롤 만들 동안만) `IAMFullAccess`
3. Security credentials → Create access key(CLI) → 로컬 `aws configure` (리전 `ap-northeast-2`)
4. **키를 채팅·문서에 붙여넣지 않는다.** 노출되면 즉시 Deactivate→Delete→재발급

### 1.2 오디오 CDN (한 번, 멱등 아님 — 재실행 금지)

```bash
cd backend
AUDIO_BUCKET=ear-audio-prod BACKUP_BUCKET=ear-backup-prod AWS_REGION=ap-northeast-2 \
  bash deploy/aws/setup-audio-cdn.sh
```
- 출력되는 `.env.prod` 4줄 + `AUDIO_BUCKET`/`KVS_ARN`을 보관. `deploy/aws/out/cf_private.pem` 커밋 금지
- 배포 전파 5~10분 (`aws cloudfront get-distribution --id <ID> --query 'Distribution.Status'`가 `Deployed`)
- **함정(Windows)**: Git Bash가 `/dev/…` 인자를 경로 변환한다 → `export MSYS_NO_PATHCONV=1` 후 실행
- **thumb 공개 동작은 스크립트에 없다** — 배포 생성 후 `thumb/*` cache behavior(서명·Function 없음, CachingOptimized)를 추가한다(2026-08-30에는 CLI `update-distribution`으로 수행)

### 1.3 EC2

```bash
export MSYS_NO_PATHCONV=1
# 키페어 (내려받은 pem은 CRLF 제거: sed -i 's/\r$//' out/ear-prod.pem)
aws ec2 create-key-pair --key-name ear-prod --key-type ed25519 --query KeyMaterial --output text > deploy/aws/out/ear-prod.pem
# 보안그룹: 22는 반드시 <관리자IP>/32, 80·443/tcp·443/udp는 0.0.0.0/0
# 인스턴스 롤 ear-prod-ec2: backup PutObject + 오디오버킷 Put/Delete + KVS Describe/Put/DeleteKey
# 실행: t4g.small, AL2023 arm64 최신 AMI(describe-images), gp3 20GB,
#       user-data로 docker·git 설치, --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2
# Elastic IP 할당·연결
```
정확한 명령 전문은 git 이력(2026-08-30, infra 브랜치) 참고. **함정**: IMDS hop limit 기본 1이면 컨테이너 안에서 인스턴스 롤을 못 읽는다 — 반드시 2.

### 1.4 서버 셋업

```bash
# AL2023에는 compose·buildx·cronie가 없다
sudo dnf install -y docker git cronie && sudo systemctl enable --now docker crond
sudo mkdir -p /usr/local/lib/docker/cli-plugins && cd /usr/local/lib/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 -o docker-compose
sudo curl -fsSL "https://github.com/docker/buildx/releases/latest/download/buildx-$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 tag_name | cut -d'"' -f4).linux-arm64" -o docker-buildx
sudo chmod +x docker-compose docker-buildx
sudo mkdir -p /opt/ear && sudo chown ec2-user /opt/ear
```
- 코드 반입은 4장(배포)과 동일
- `.env.prod`: `backend/.env.example` 기준으로 채움. 랜덤 비밀(`openssl rand -hex 32`)은 값마다 다르게. CDN 값은 1.2 출력. `ADMIN_DOMAIN`·`CORS_ORIGINS=https://admin.<도메인>`
- 관리자 콘솔: `deploy/admin/config.example.js` → 서버 `/opt/ear/backend/deploy/admin/config.js` (API 주소 + Google 웹 클라이언트 ID)
- 기동: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (마이그레이션 자동)
- 백업 크론: `(crontab -l; echo "0 19 * * * /opt/ear/backend/deploy/backup.sh >> /var/log/ear-backup.log 2>&1") | crontab -`

### 1.5 DNS·확인

1. 가비아: `api`·`admin` A 레코드 → Elastic IP
2. **함정**: DNS가 없을 때 Caddy가 발급 실패하면 최대 20분 백오프 — 레코드 넣은 뒤 `docker compose … restart caddy`로 즉시 재시도
3. 확인: `https://api.<도메인>/api/v1/health` 200 · `https://admin.<도메인>/` 200 · 3.3 업로드 스모크

## 2. 관리자 계정

1. 콘솔(`admin.<도메인>`)에서 구글 로그인 → 화면에 뜨는 `users.id` 확보
2. 서버에서 승격 (앱에는 승격 경로가 없다 — admin.md 4.1):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U ear -d ear -c "UPDATE users SET role='admin' WHERE id='<uuid>'"
```
3. 재로그인(토큰에 role이 박혀 있어 필수)

## 3. 콘텐츠 운영

### 3.1 업로드 — 관리자 콘솔이 기본 경로

주제 관리 탭에서 주제 생성(숨김으로 생김) → 업로드 탭. 발행 직후 `/play`는 KVS 전파(수 초~10초) 뒤에 열린다.

### 3.2 수동 업로드 (콘솔 불가 시 비상용)

```bash
AUDIO_BUCKET=ear-audio-prod KVS_ARN=<값> deploy/upload-audio.sh <contentId(uuid)> ./ep.mp3
# 출력 키를 contents.audio_path에 직접 INSERT — 콘솔 경로와 달리 검증·감사로그가 없다
```

### 3.3 업로드 스모크 (배포 검증)

콘솔에서 테스트 주제·3초 mp3 업로드 → 목록 노출 확인 → 10초 후 서명 URL 재생 200 → **테스트 데이터 삭제**(콘텐츠 행·KVS 키·S3 오브젝트·주제).

### 3.4 회수 (API 미구현 — 현재 SQL 수동)

```sql
UPDATE contents SET status='withdrawn', withdrawn_at=now() WHERE id='<uuid>';
```
+ KVS 키 삭제(발급된 URL 5분 창 닫기):
```bash
ET=$(aws cloudfront-keyvaluestore describe-key-value-store --kvs-arn $KVS_ARN --query ETag --output text)
aws cloudfront-keyvaluestore delete-key --kvs-arn $KVS_ARN --key <contentId> --if-match $ET
```
`library_items` 일괄 삭제 등 노출면 전체 반영은 `partner-control.md` 4.3 — 회수 API 구현 시 함께.

## 4. 코드 배포

**기본 경로는 CI다(2026-09-04~). 2026-09-16 전환 후 브랜치가 환경을 정한다.**

| 브랜치 | 워크플로 | 가는 곳 | 방식 |
|---|---|---|---|
| `dev` 머지 | `deploy-api.yml` | **개발계** `api-dev.earcast.co.kr` (Environment `api-dev`) | CI가 arm64 이미지를 빌드해 ECR에 올리고, 서버는 그 이미지를 pull(서버 빌드 없음) |
| `main` 머지(dev→main PR, 리뷰 1) | `deploy-api.yml` | **운영** `api.earcast.co.kr` (Environment `api-prod`) | 같은 이미지(커밋 SHA 태그)를 pull. 성공 시 태그 `v<앱 버전>[+배포 순번]` 자동 |
| `dev` 머지 | `deploy-pipeline.yml` | AI 서버(파이프라인 웹·워커) | 종전대로(AI 파트 동의) |

- 배포의 원본은 `backend/deploy/push.sh`·`pipeline/deploy/push.sh`이며 로컬에서도 같은 것을 쓴다. 환경별 값은 GitHub Environment 변수(`API_HOST`·`API_SG_ID`·`API_SECRET_ID`·`API_HEALTH_URL`)에 있다 — `backend/deploy/aws/setup-ci-envs.sh`가 넣는다.
- **운영 반영 절차**: dev에서 검증(개발계 헬스·앱 확인) → GitHub에서 `dev` → `main` PR → 팀원 1명 승인 → 머지 → Actions `deploy-api` 런 성공·`https://api.earcast.co.kr/api/v1/health` 200·태그 확인. main으로의 PR은 dev 브랜치에서만 열 수 있다(필수 체크 "원본 브랜치 확인 (dev)").
- **버전**(2026-09-17 개정): 기준은 **앱 버전**(`frontend/app.json` `expo.version`)이다. 백엔드만 배포할 때는 버전을 올리지 않는다 — 태그가 `v1.0.0` → `v1.0.0+2` → `v1.0.0+3`으로 배포 순번만 는다. 앱이 스토어 버전을 올리면 같은 PR에서 `backend/package.json`도 맞추고, 그 뒤 첫 배포가 `v1.1.0`이 된다. 두 값이 다르면 `dev → main` PR의 "원본 브랜치 확인 (dev)" 체크가 실패한다. 규칙 원본은 `docs/backend/convention.md` 6.3.
- **롤백**: 이전 커밋 SHA 이미지를 그대로 다시 띄운다 — PC에서 `API_IMAGE=639177726357.dkr.ecr.ap-northeast-2.amazonaws.com/ear/api:<이전 SHA> bash backend/deploy/push.sh`(운영 pem·SG 22 개방 필요). 이미지 목록: `aws ecr describe-images --repository-name ear/api --query 'sort_by(imageDetails,&imagePushedAt)[-10:].[imagePushedAt,imageTags[0]]' --output table`. 마이그레이션이 포함된 배포는 스키마가 앞서 있을 수 있어 롤백 전에 5.3 덤프 유무를 확인한다.
- 아래 4.1은 CI·push.sh가 모두 막혔을 때의 최후 수단이다.

### 4.1 수동 배포 (비상용)

```bash
# 로컬(Windows)에서 — 워킹트리 기준 반입. dist·node_modules 제외
git ls-files -co --exclude-standard backend | grep -v "^backend/dist/\|^backend/node_modules/" \
  | tar -cf - -T - | ssh -i backend/deploy/aws/out/ear-prod.pem ec2-user@<IP> "tar -xf - -C /opt/ear"
ssh -i … ec2-user@<IP> 'cd /opt/ear/backend \
  && grep -rlIZ $'"'"'\r'"'"' . --exclude-dir=node_modules --exclude-dir=dist | xargs -0 -r sed -i "s/\r$//" \
  && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api'
```
- **함정 1(CRLF)**: `.gitattributes`가 LF를 강제하지만, 반입 후 위 sed 한 줄로 이중 확인한다. 셰뱅에 `\r`이 남으면 컨테이너가 `no such file or directory`로 죽는다
- **함정 2**: `git archive HEAD`는 미커밋 파일을 빼먹는다 — 위처럼 `ls-files -co` 사용
- 마이그레이션은 기동 시 자동, 실패하면 api가 안 뜬다(의도). 상태: `docker compose … ps`, 로그: `… logs api --tail 50`

## 5. 장애·복구

### 5.1 api가 안 뜬다
`docker compose … logs api --tail 100` — env 검증 실패(빠진 변수 이름이 그대로 찍힘) / 마이그레이션 실패 / CRLF(4장 함정 1) 순으로 의심.

### 5.2 재생이 403/404
403 = 서명 문제(서버 `CLOUDFRONT_*` env vs CloudFront 키페어 불일치) · 404 = KVS 매핑 없음(전파 10초 대기 → 그래도면 `get-key`로 존재 확인) · 썸네일 403 = `thumb/*` behavior 누락(1.2 함정).

### 5.3 DB 복원

**덤프를 서버에서 직접 받을 수 없다.** 인스턴스 롤 `ear-prod-ec2`는 `s3:PutObject`만 갖고 있어
`aws s3 cp s3://…` 가 **403**으로 막힌다(2026-09-12 실측). 자기 노트북(SSO 프로필)이나 콘솔에서
받아 서버로 올린다.

```bash
# 1) 노트북에서 — 최신 덤프 확인 후 내려받아 서버로
aws s3 ls s3://earcast-backup-prod/pg/ | tail -5
aws s3 cp s3://earcast-backup-prod/pg/<최신>.sql.gz .
scp -i deploy/aws/out/ear-prod-isb.pem <최신>.sql.gz ec2-user@<EIP>:/tmp/

# 2) 서버에서 — 반드시 ON_ERROR_STOP. 없으면 psql 이 에러를 지나치고 exit 0 을 내
#    "복원된 것처럼 보이는 반쪽짜리 DB"가 남는다
zcat /tmp/<최신>.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U ear -d ear -v ON_ERROR_STOP=1

# 3) 대조 — 테이블 수·주요 행 수가 덤프 시점과 맞는지 본다
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U ear -d ear -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
```

**새 서버라면 마이그레이션을 돌리지 않은 빈 DB에 넣는다.** 덤프에 `CREATE TABLE`·`CREATE INDEX`·
`CREATE EXTENSION vector`가 모두 들어 있어, 마이그레이션을 먼저 적용하면 전부 "이미 존재한다"로
충돌한다. 컨테이너를 처음 띄우면 postgres가 빈 DB를 만들어 주므로 **api 컨테이너를 멈춘 채**
복원한 뒤 기동하면 된다.

> **리허설 기록 (2026-09-12)** — 운영 덤프를 서버의 **임시 컨테이너**(`pgvector/pgvector:pg16`,
> 운영과 분리)에 복원해 전 항목이 일치함을 확인했다: 테이블 31/31 · users 21/21 ·
> library_items 92/92 · 인덱스 87/87 · FK 31/31 · `vector` 확장 0.8.6. psql 에러 0건.
> **운영 DB는 읽기만 했다.** 같은 방식으로 언제든 안전하게 다시 연습할 수 있다.

### 5.4 서버 교체

**A. 스냅샷에서 복구(2026-09-15 이후 — 가장 빠르다, 10분).** 운영 API 루트 볼륨은 매일 04:40 KST 스냅샷이 7일 보존된다(`deploy/ebs-snapshot.sh`, 태그 `Source=ear-daily`). 볼륨·인증서·`.env.prod`·도커 이미지가 통째로 돌아온다. 스냅샷 시점 이후의 DB 변경은 5.3 덤프로 덧씌운다.
```bash
aws ec2 describe-snapshots --owner-ids 639177726357 --filters Name=tag:Source,Values=ear-daily --query 'sort_by(Snapshots,&StartTime)[-3:].[StartTime,SnapshotId,State]' --output table
# 1) 스냅샷 → 볼륨 (같은 AZ ap-northeast-2a, gp3)
aws ec2 create-volume --snapshot-id <snap> --availability-zone ap-northeast-2a --volume-type gp3 --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=ear-prod},{Key=Backup,Value=daily},{Key=Project,Value=ear}]'
# 2) 새 인스턴스를 그 볼륨으로 띄우거나(run-instances --block-device-mappings 로 스냅샷 지정), 기존 인스턴스를 stop → 루트 볼륨 detach → 새 볼륨을 /dev/xvda 로 attach → start
# 3) Elastic IP 를 새 인스턴스로 옮기면 DNS 변경 불필요. 기동 후 헬스 200 확인, 필요하면 5.3 으로 최신 덤프 덧씌우기
```
- 스냅샷은 크래시 컨시스턴트다(전원이 끊긴 순간의 디스크). postgres 는 WAL 로 스스로 복구하지만, 정합성이 중요한 복구는 5.3 덤프를 우선한다.
- 새 볼륨에서 부팅한 인스턴스에도 인스턴스 롤·SG·키페어를 같은 것으로 준다(1.3).

**B. 처음부터 재구축(스냅샷이 없거나 못 믿을 때, 2~3시간).** 1.3~1.5 재실행 → Elastic IP를 새 인스턴스로 옮기면 DNS 변경 불필요 → 5.3 복원.

## 6. 정기 점검 (주 1회 권장)

- [ ] `ear-backup-prod/pg/`에 최근 덤프가 매일 쌓이는가 · `/var/log/ear-content-sync.log`에 내보내기가 매일 찍히는가
- [ ] 스냅샷이 매일 1개 늘고 8일째 것이 지워지는가: `aws ec2 describe-snapshots --owner-ids 639177726357 --filters Name=tag:Source,Values=ear-daily --query 'length(Snapshots)'` = 7 안팎
- [ ] Budgets 메일·CloudWatch 알람 상태: `aws cloudwatch describe-alarms --alarm-name-prefix ear-prod --query 'MetricAlarms[].[AlarmName,StateValue]' --output table` — 전부 `OK`. `INSUFFICIENT_DATA`면 크론이 지표를 못 찍는 것(권한·네트워크), `ALARM`이면 25시간 미실행. **새로 만든 알람은 첫 1시간 안에 오탐 ALARM 메일이 한 번 올 수 있다** — 첫 평가가 지표를 찍기 직전의 빈 1시간 구간을 보기 때문(2026-09-15 backup 알람 실측). 다음 크론 성공 뒤 OK 메일이 오면 정상이고, 그 뒤에도 ALARM이면 진짜 미실행이다
- [ ] UptimeRobot 모니터 `ear api health`가 Up 인가. **설정값(재등록 시)**: 유형 Keyword · URL `https://api.earcast.co.kr/api/v1/health` · 키워드 `"status":"ok"` · 존재하면 Up · 간격 5분 · 알림 연락처 = 메일(무료 플랜은 Slack 연동이 잠겨 있다 — 메일만). 키워드 방식이라 DB가 죽어 `/health`가 503 `degraded`를 내는 경우도 Down으로 잡힌다
- [ ] `df -h` 디스크 (20GB — docker 이미지가 쌓이면 `docker system prune -f`)
- [ ] 인증서는 Caddy 자동 — 만료 걱정 없음. `docker compose … logs caddy | grep -i renew`로 확인만
