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

## 4. 코드 배포 (수동)

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
```bash
aws s3 cp s3://ear-backup-prod/pg/<최신>.sql.gz . && gunzip <최신>.sql.gz
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U ear -d ear < <최신>.sql
```
새 서버면 먼저 빈 DB로 기동(마이그레이션 적용) 후 복원.

### 5.4 서버 교체 (이미지 통째 재구축이 더 빠르다)
1.3~1.5 재실행 → Elastic IP를 새 인스턴스로 옮기면 DNS 변경 불필요 → 5.3 복원.

## 6. 정기 점검 (주 1회 권장)

- [ ] `ear-backup-prod/pg/`에 최근 덤프가 매일 쌓이는가
- [ ] Budgets 메일·CloudWatch 알람 상태 (SNS 구독 Confirm 됐는가)
- [ ] `df -h` 디스크 (20GB — docker 이미지가 쌓이면 `docker system prune -f`)
- [ ] 인증서는 Caddy 자동 — 만료 걱정 없음. `docker compose … logs caddy | grep -i renew`로 확인만
