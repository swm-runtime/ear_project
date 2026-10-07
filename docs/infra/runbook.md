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
AUDIO_BUCKET=earcast-audio-prod BACKUP_BUCKET=earcast-backup-prod AWS_REGION=ap-northeast-2 \
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
- **크론이 부르는 스크립트는 반드시 실행 권한(git `100755`)으로 커밋한다.** 크론은 경로로 직접 실행하므로 644면 `Permission denied`로 아예 안 돈다. 서버에서 `chmod +x`해도 배포(`git archive | tar -x`)가 git 모드대로 되돌린다. 손으로 `bash x.sh`로 테스트하면 권한이 필요 없어 **테스트로는 안 잡힌다** — 새 스크립트는 `git update-index --chmod=+x`로 올리고, 확인은 `env -i HOME=$HOME PATH=/usr/bin:/bin /bin/sh -c /opt/ear/backend/deploy/x.sh`(크론과 같은 환경 — HOME 이 없으면 aws CLI 가 크론에선 안 나는 오류를 낸다)로 한다. 등록된 크론 전체: 운영 `0 19` backup · **`*/1` sync-content-export**(2026-09-20 개정 — 바뀐 게 없으면 지문 조회 한 번으로 끝난다) · `40 19` ebs-snapshot, 개발계 `30 19` sync-content-import(**안전망** — 평소에는 운영이 발행 직후 알려서 바로 받는다) (전부 UTC). `backend/deploy/*.sh`가 `100755`가 아니면 CI 검증이 막는다.

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
AUDIO_BUCKET=earcast-audio-prod KVS_ARN=<값> deploy/upload-audio.sh <contentId(uuid)> ./ep.mp3
# 출력 키를 contents.audio_path에 직접 INSERT — 콘솔 경로와 달리 검증·감사로그가 없다
```

### 3.3 업로드 스모크 (배포 검증)

콘솔에서 테스트 주제·3초 mp3 업로드 → 목록 노출 확인 → 10초 후 서명 URL 재생 200 → **테스트 데이터 삭제**(콘텐츠 행·KVS 키·S3 오브젝트·주제).

### 3.3-1 개발계에 콘텐츠 반영 (KAN-84, 2026-09-20)

운영에서 발행·회수·주제 변경을 하면 **1분 안에 개발계로 넘어간다.** 손으로 할 일은 없다.

| 단계 | 무엇이 도는가 |
|---|---|
| 운영 크론 `*/1` | `sync-content-export.sh` — 콘텐츠 표의 지문(행 수 + 최종 수정 시각)을 재고, **지난번과 같으면 즉시 끝난다**(로그 `content export skip`) |
| 바뀐 경우 | 덤프 + 표별 행 수 매니페스트를 S3 에 올리고, **개발계에 SSH 로 알린다**(로그 `notify ok`) |
| 개발계 | 알림을 받은 `sync-content-import.sh` 가 덤프를 받아 upsert 하고, 매니페스트 행 수와 대조한다(로그 `import ok`) |
| 안전망 | 개발계 크론 `30 19 * * *`(04:30 KST). 알림이 유실돼도 하루 안에 맞춰진다 |

- 알림 키는 개발계 `authorized_keys` 에서 `command="…/sync-content-import.sh"` 로 묶여 있다 — 그 키로 다른 명령은 실행되지 않는다. 개발계 SG 22 는 **운영 SG 에서만** 열려 있다.
- 경로를 새로 깔거나 키를 바꿀 때: `bash backend/deploy/aws/setup-content-sync-notify.sh` (SSO 로그인·운영/개발계 pem 필요).
- 확인·문제 해결
  - 로그: 양쪽 `/var/log/ear-content-sync.log`
  - 즉시 반영이 필요하면 개발계에서 `bash /opt/ear/backend/deploy/sync-content-import.sh`
  - `import skip` 만 반복되면 S3 덤프가 안 바뀐 것이다 — 운영 로그에서 `export skip`/`export ok` 를 먼저 본다
  - 검증 실패(`검증 실패: <표> 운영 N행 / 개발계 M행`)면 ETag 를 적지 않으므로 다음 알림·크론이 같은 덤프로 다시 시도한다

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
| `dev` 머지 | `eas-update.yml` | **앱 `preview` 채널 OTA** — 개발계 API(`api-dev`)를 보는 개발계 앱(`dev.runtime.ear`) | JS·에셋만. 채널이 API 주소를 정한다(`docs/frontend/architecture.md` 2.1) |
| `main` 머지 | `eas-update.yml` | **앱 `production` 채널 OTA** — 운영 API를 보는 스토어 앱 | 같은 워크플로, 운영 주소 명시 |

- 배포의 원본은 `backend/deploy/push.sh`·`pipeline/deploy/push.sh`이며 로컬에서도 같은 것을 쓴다. 환경별 값은 GitHub Environment 변수(`API_HOST`·`API_SG_ID`·`API_SECRET_ID`·`API_HEALTH_URL`)에 있다 — `backend/deploy/aws/setup-ci-envs.sh`가 넣는다.
- **운영 반영 절차**: dev에서 검증(개발계 헬스·앱 확인) → GitHub에서 `dev` → `main` PR → 팀원 1명 승인 → 머지 → Actions `deploy-api` 런 성공·`https://api.earcast.co.kr/api/v1/health` 200·태그 확인. main으로의 PR은 dev 브랜치에서만 열 수 있다(필수 체크 "원본 브랜치 확인 (dev)").
- **버전**(2026-09-17 개정): 기준은 **앱 버전**(`frontend/app.json` `expo.version`)이다. 백엔드만 배포할 때는 버전을 올리지 않는다 — 태그가 `v1.0.0` → `v1.0.0+2` → `v1.0.0+3`으로 배포 순번만 는다. 앱이 스토어 버전을 올리면 같은 PR에서 `backend/package.json`도 맞추고, 그 뒤 첫 배포가 `v1.1.0`이 된다. 두 값이 다르면 `dev → main` PR의 "원본 브랜치 확인 (dev)" 체크가 실패한다. 규칙 원본은 `docs/backend/convention.md` 6.3.
- **앱 업데이트 안내·강제 업데이트 스위치**(2026-09-26, KAN-99): 서버 `.env.prod`의 `LATEST_APP_VERSION_IOS/ANDROID`(권장 안내 기준)·`MIN_SUPPORTED_APP_VERSION_IOS/ANDROID`(이 미만은 강제 업데이트) 두 값이 스위치다. 앱은 켤 때마다 `GET /app/version`으로 서버에 묻는다. 코드 배포 없이 값을 바꾸고 `API_IMAGE=$(cat .api-image)`로 api를 재생성하면(10초) 다음 실행부터 적용된다. **순서**: 새 버전이 스토어에 실제로 올라온 뒤 `LATEST`를 올리고, 옛 버전을 끊어야 할 때만 `MIN_SUPPORTED`를 올린다 — 먼저 올리면 사용자가 스토어에 갔는데 받을 게 없다. 플랫폼별로 따로 올릴 수 있다(심사 시차). 되돌리기도 같은 방법.
- **가입 체험 스위치**(2026-10-03): 서버 `.env.prod`의 `SIGNUP_TRIAL_ENABLED`(`true`일 때만 새 가입자에게 지급 — 비어 있거나 `false`면 꺼짐)·`SIGNUP_TRIAL_DAYS`(1~30, 비우면 7). 코드 배포 없이 값을 바꾸고 `API_IMAGE=$(cat .api-image)`로 api를 재생성하면 그 뒤 가입부터 적용된다. **끄면 새 지급만 멈춘다** — 이미 받은 계정은 `users.trial_ends_at`까지 무제한이 유지된다(거두려면 그 컬럼을 직접 고쳐야 하고, 사용자에게 약속한 날짜라 하지 않는다). 지급 확인: api 로그 `signup trial granted` 또는 `SELECT count(*) FROM users WHERE trial_ends_at > now()`. 지급 로그의 `source`가 `signup`(가입 시) / `existing_user`(기존 가입자)를 가른다. **기존 가입자 지급**(2026-10-05): `SIGNUP_TRIAL_EXISTING_USERS_BEFORE`(`YYYY-MM-DD`)를 넣으면 그 서비스 날짜보다 먼저 가입했고 체험을 받은 적 없는 계정이 **앱을 여는 날**부터 같은 기간을 받는다(비우면 안 준다, `SIGNUP_TRIAL_ENABLED`가 꺼지면 같이 멈춘다). **값은 스위치를 켜는 날의 다음 날짜** — 늦는 것은 해가 없고(켠 뒤 가입자는 가입 때 받는다) 이르면 그 사이 가입자가 어느 쪽에서도 못 받는다. **기존 가입자용 팝업이 들어간 앱(KAN-121)이 나간 뒤에 넣는다** — 먼저 넣으면 안내 없이 7일이 시작된다. 규칙은 `features/subscription.md` 4.8.
- **Sentry → Slack 릴레이**(2026-10-07): Sentry Business 체험 종료로 2026-10-14 부터 Sentry 의 Slack 공식 연동이 멈춘다(무료 플랜). 대신 플랜 제한이 없는 **레거시 WebHooks** 를 서버가 받아 Slack 으로 흘린다(`backend-monitoring.md` 3-2). 켜는 법: ① 토큰 생성 `openssl rand -hex 24` → 서버 `.env.prod` `SENTRY_WEBHOOK_TOKEN=<값>`(SM `ear/prod/api` 에도 같은 키) → `API_IMAGE=$(cat .api-image)` 로 api 재생성 → 기동 로그 `sentry-relay=on`. ② Sentry **Settings → Developer Settings → Custom Integrations → Create New Integration → Internal Integration**(조직에 하나 — 두 프로젝트가 함께 쓴다): 이름 `slack-relay`, **Webhook URL** `https://api.earcast.co.kr/api/v1/webhooks/sentry/<토큰>`, **Alert Rule Action 켬**, Permissions 는 Issue & Event **Read**, Webhooks 체크박스(issue·error 등)는 **전부 끔**(켜면 해결·배정까지 다 온다) → Save. (레거시 WebHooks 플러그인은 2026-10-07 실측에서 새 알림 빌더에 액션으로 뜨지 않아 쓰지 않는다 — 서버는 두 모양 다 받는다.) ③ **Alerts → Alert Rules** 의 "high priority issues" 규칙(프로젝트별 2개)에 액션 **"Send a notification via slack-relay"** 추가 → Save(통합만 만들고 규칙에 안 넣으면 아무것도 안 온다). ④ 종전 **"Notify #ops-alerts via Slack" 규칙 2개 삭제**(중복·14일 뒤 어차피 멈춤). ⑤ 규칙 화면 "Send Test Notification" 으로 #ops-alerts 도착 확인(테스트 알림은 `data.event.title` 이 들어 있어 그대로 온다. 통합을 만들 때 오는 `installation` 웹훅은 제목이 없어 조용히 버려진다 — 정상). **개발계에는 Slack 웹훅 env 가 없어**(알림 끔 결정) 개발계 URL 로는 Caddy 로그의 204 까지만 확인되고 Slack 도착은 운영에서 본다. 토큰은 저장소·Jira·문서에 적지 않는다. 바꿀 때는 env 와 Sentry 양쪽을 같이 바꾼다.
- **서비스 날짜 경계 05:00 전환**(2026-10-07, KAN-149 — 코드는 들어가 있고 **운영 전환은 PM 결정(KAN-148 약관) 뒤**): 전환 시각이 정해지면 ① 서버 `.env.prod`에 `SERVICE_DAY_BOUNDARY_05_FROM=<전환일>T05:00:00+09:00`을 넣고 `API_IMAGE=$(cat .api-image)`로 api를 재생성한다(기동 로그 `service-day=05:00@…` 확인. 값은 미리 넣어 둬도 되고 경계는 그 시각에 바뀐다. KST 04시대 값은 기동이 거부한다). ② **전환일 04:00~05:00 사이에**(그 전이면 그 사이 가입자 값이 빠지고, 뒤면 한 시간 동안 체험자가 한도에 잡힌다) 이미 쓴 체험 종료 시각을 한 시간 옮긴다 — `UPDATE users SET trial_ends_at = trial_ends_at + interval '1 hour' WHERE trial_ends_at >= '<전환일>T05:00:00+09:00' AND trial_ends_at IS NOT NULL;` (`domain.md` 1.2 예외. 먼저 `SELECT count(*)`로 대상 수를 보고, 실행 결과 건수가 같은지 확인한다). ③ 다음 날 아침 통계 집계가 `content-stat-aggregation-0530`으로 돌았는지, 드립이 05:00에 나갔는지 로그로 본다. ④ 문서의 "04시"를 "05시"로 고친다(`docs/changes/pending/service-day-boundary-0500.md`). 앱 문구(KAN-150) OTA도 같은 시각에 맞춘다.
- **롤백**: 이전 커밋 SHA 이미지를 그대로 다시 띄운다 — PC에서 `API_IMAGE=639177726357.dkr.ecr.ap-northeast-2.amazonaws.com/ear/api:<이전 SHA> bash backend/deploy/push.sh`(운영 pem·SG 22 개방 필요). 이미지 목록: `aws ecr describe-images --repository-name ear/api --query 'sort_by(imageDetails,&imagePushedAt)[-10:].[imagePushedAt,imageTags[0]]' --output table`. 마이그레이션이 포함된 배포는 스키마가 앞서 있을 수 있어 롤백 전에 5.3 덤프 유무를 확인한다. **2026-09-17 이전 커밋으로 롤백하면 크론 스크립트 실행 권한이 다시 사라진다**(그 커밋의 git 모드가 644라 배포가 덮어쓴다) — 롤백 뒤 서버에서 `chmod +x /opt/ear/backend/deploy/*.sh`를 다시 하거나, 그 이후 커밋으로만 롤백한다. 크론 알람은 약 25시간 뒤에야 울린다.
- **env만 바꾸고 api 컨테이너를 재생성할 때는 반드시 `API_IMAGE`를 준다**(2026-09-23 개발계에서 실제 발생). `docker-compose.prod.yml`의 이미지가 `${API_IMAGE:-ear-prod-api}`라, `.env.prod`만 고치고 `docker compose … up -d --no-build api`를 치면 **서버에 남아 있는 옛 로컬 빌드 이미지 `ear-prod-api`로 조용히 바뀐다**(개발계는 2026-09-15 빌드 — `dist/cluster`·Sentry 없음). 에러가 나지 않아 알아채기 어렵다. 올바른 명령: `cd /opt/ear/backend && API_IMAGE=$(cat .api-image) docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build api` — `.api-image`는 push.sh가 마지막 배포 이미지를 적어 둔 파일이다. 재생성 뒤 `docker inspect -f '{{.Config.Image}}' ear-prod-api-1`가 ECR 태그인지 확인한다. 운영은 2026-09-23 image prune으로 옛 로컬 이미지가 없어 이 함정이 사라졌다(대신 `API_IMAGE` 없이 치면 빌드로 빠진다 — 그것도 안 된다).
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

### 4-1. 운영 모니터링 체계 — 누가 · 언제 · 무엇을 보는가 (개정 2026-10-06, KAN-132)

**먼저 Grafana 대시보드 "ear 운영"을 연다**(`https://zealouswasp1316.grafana.net`, [`inventory.md`](inventory.md) Grafana Cloud 행). 헬스체크·EC2 4지표·API 에러 로그·caddy 상태코드·Sentry 가 한 화면에 모여 있다. 아래 표는 **울리는 것**(알림)과 **들여다보는 것**(점검)을 나눠 적는다 — 알림은 사람이 보지 않아도 오고, 점검은 주기가 왔을 때 사람이 연다.

**담당**: 전부 **박준현**(백엔드·인프라). 부재 시 Slack 알림 채널은 팀 전원이 보고, SNS 메일은 4명에게 간다([`inventory.md`](inventory.md) SNS 행). 수신 채널은 **Slack 알림 채널 하나**(가입·탈퇴·리뷰·삭제·일일 보고와 같은 채널 — 2026-10-06 채널 분리는 하지 않기로 함)와 **SNS 메일**(CloudWatch 알람) 둘이다.

#### 알림 — 임계값을 넘으면 사람을 부른다

| 대상 | 원천 | 임계값 · 조건 | 채널 | 지연 | 받으면 |
|---|---|---|---|---|---|
| 인스턴스 다운 | CloudWatch `ear-prod-ec2-status-check` | 상태 검사 실패 **3분 연속** | SNS 메일 | ~3분 | 5.1 |
| API 응답 불가 | Grafana 합성 체크 `ear-api-health`(서울·도쿄, 3분) | 5분 창 **2/2 실패**(200 + `"status":"ok"` 아님) | Slack | 최대 6분 | 5.1 |
| 인증서 갱신 실패 | Grafana 합성 체크 TLS | 만료 **14일 미만** | Slack | — | 5.1(Caddy 로그) |
| API 5xx·예외 | AI 서버 워커 `log-watch`(백엔드 `ERROR`/`FATAL` 로그) | ERROR 1건 이상 | Slack | ≤5분 | Sentry 이슈·`/ear/api` 로그 |
| **감시자 자신** | CloudWatch `ear-prod-cron-log-watch-missing` | 워커 생존 신호 **30분** 없음 | SNS 메일 | 30분 | AI 서버 워커 재기동 |
| CPU · 메모리 | 백엔드 `ResourceAlertService`(60초 틱) + Grafana Alerting(같은 임계, 5분 지속) | **CPU 70% · 메모리 80%**, 백엔드는 3틱(≈3분) 연속 | Slack | 3~5분 | 콘솔 서버 상태 → 원인 프로세스 → 필요시 5.4 |
| 디스크 | CloudWatch `ear-prod-disk-high` | **80%** 초과 | SNS 메일 | 5분 | `docker system prune -f`, 6장 |
| 백업·콘텐츠 내보내기·EBS 스냅샷 미실행 | CloudWatch `ear-prod-cron-*-missing` | 성공 지표 **25시간** 없음 | SNS 메일 | ≤25h | 크론 로그(`/var/log/ear-*.log`) |
| 서버 크래시(처리되지 않은 예외) | Sentry `ear-api` | 고우선 신규 이슈 | **Slack**(백엔드 릴레이 `webhooks/sentry` — 2026-10-07, Sentry 무료 플랜 전환으로 공식 Slack 연동 종료) + Sentry 메일(+Grafana 패널) | 즉시 | 이슈 → 수정 PR |
| 앱 크래시 | Sentry 앱 프로젝트(FE 소관) | 고우선 신규 이슈 | **Slack**(같은 릴레이) + Sentry 메일 | 즉시 | FE 담당 |
| 결제 검증 거부 | 백엔드 `BillingAlertService` — 영수증·구매 토큰 검증 실패(App Store·Play) | 1건 이상(종류별 10분 묶음) | Slack | 즉시 | 사유 코드 확인 — 위조 시도면 무시, 설정(번들 ID·키)이면 Secrets 점검 |
| 스토어 알림(S2S·RTDN) 거부 | 백엔드 `BillingAlertService` — 서명·OIDC 검증 실패 | 1건 이상(종류별 10분 묶음) | Slack | 즉시 | 키·주소·Pub/Sub 설정 점검(`subscription-api.md` 7장) |
| 구독 보정 실패 | 백엔드 `BillingAlertService` — 04:45 `subscription-reconcile` 작업 실패 또는 구독별 보정 실패 | 1건 이상 | Slack | 다음 날 04:45 | 스토어 API 키 만료 여부 → 수동 보정 |
| 파이프라인 워커 실패 | AI 서버 워커 자체 Slack 알림(AI 파트 소관 — `pipeline/`) | 작업 실패 | Slack | 즉시 | AI 담당 |
| 비용 | Budgets `ear-monthly-10usd` | **$10** 실적 80% · 예측 100% | 메일 | 일 1회 | 조직 계정이라 참고용 — 전송량이면 CloudFront 사용량 확인 |

사용자 신호(가입·탈퇴·스토어 리뷰·앱 삭제)와 일일 지표 보고도 같은 Slack 채널로 온다 — 알림이 아니라 **정보**다([`backend-monitoring.md`](../features/backend-monitoring.md) 3-2~3-5). 임계값이 없고 받으면 할 일도 없다.

**겹침은 의도다**: CPU·메모리는 백엔드 자체 경보와 Grafana Alerting 둘 다 울린다(KAN-97 5번 — 몇 주 겹쳐 보고 하나로 정리). API 다운은 Grafana 합성 체크가 주, EC2 상태 검사가 뒤를 받는다. 백엔드 프로세스 안에서 도는 경보(자원·결제·배치)는 그 프로세스가 죽으면 같이 멈춘다 — 그 경우를 합성 체크·EC2 상태 검사·워커 생존 알람이 받는다. **감시가 감시를 덮는 구조**를 이 표로 확인한다.

#### 점검 — 주기가 오면 사람이 연다

| 주기 | 무엇을 | 어디서 | 기준 |
|---|---|---|---|
| **매일** 17:00 Slack 보고 받을 때 | 일일 지표(활성·신규·가입 대조·재생·리텐션) | Slack 일일 보고([`backend-monitoring.md`](../features/backend-monitoring.md) 3-3) | 가입 GA4 ↔ 서버 대조 차이 **10% 이내**, 활성 사용자 전일 대비 **-30% 이하**면 원인 확인(배포·장애 여부) |
| **매일** 아침 | 어젯밤 04~05시 배치 7개 결과 | `/ear/api` 로그 `[Startup]`·배치 완료 로그, Slack ERROR 없음 | 드립 편성 `daily-drip-batch` 완료 로그 1건, ERROR 0건 |
| **매주** 월요일 | 6장 정기 점검 체크리스트 + **주간 지표 정리**(아래) | 6장 · 운영 DB 집계 | 전부 체크, 지표는 회고 문서에 |
| **매주** 회고 | 주간 지표 표를 `retrospective/YYYY-Wn.md`에 붙인다 | 아래 "주간 지표" | 빠진 주가 없다 |
| **매월** 1일 | Budgets·CloudFront 전송량·S3 저장량 | AWS 콘솔 Billing · CloudFront 보고서 | CloudFront 월 전송량 **700GB**(무료 1TB의 70%) 넘으면 사용량 예산 추가(KAN-141 처리 기록) |
| **분기** | Grafana IAM 키 회전 · App Store Connect 키 유효 · Play 서비스 계정 권한 | `inventory.md` IAM 행 · App Store Connect · Play Console | 회전 날짜를 inventory 행에 |

#### 주간 지표 — 회고에 붙이는 표

매주 월요일, **지난주 월~일(KST)** 기준으로 아래 표를 만들어 그 주 `retrospective/YYYY-Wn.md`의 "지난 주 지표" 절에 붙인다. 숫자의 출처를 바꾸지 않는다 — 주마다 같은 쿼리여야 비교가 된다. **운영 DB 조회는 집계만**(이름·이메일을 세션·문서에 꺼내지 않는다 — CLAUDE.md 2026-10-04).

| 지표 | 출처 | 정의 |
|---|---|---|
| 가입 | 운영 DB `users.created_at` | 주간 합 + 일별. 관리자·테스트 계정 제외(`role = 'admin' OR tier = 'pro'`인 수동 계정) |
| 누적 가입자 | 운영 DB `users` | 주 마지막 날 기준 행 수(같은 제외) |
| 활성 | 운영 DB `audio_access_logs` | 주간 **재생 URL 을 1회 이상 발급받은** distinct `user_id`(= 들으려 한 사람). GA4 활성과 정의가 달라 둘 다 적는다 |
| 재생 | 운영 DB `play_records` | 주간 재생 시작 건수 · 완청(서버 90% 판정) 건수 |
| 이탈 | 운영 DB `withdrawal_*`/탈퇴 알림 수 + Slack 앱 삭제 알림 합 | 탈퇴 N · 앱 삭제 N(Android 실측 + iOS 추정) |
| 구독 | 운영 DB `subscriptions` | 활성 구독 수 · 신규 · 해지 예약 · 환불 |
| 서비스 | 위 알림 표 | ERROR 알림 건수 · 합성 체크 가동률(Grafana 7d) · 배포 횟수(main 태그) |

쿼리는 `backend/deploy/weekly-metrics.sql`로 두고 서버에서 `docker compose … exec -T postgres psql -U ear -d ear -v week_start=YYYY-MM-DD -f -` 로 돈다(파일을 stdin 으로 넘긴다) — 손으로 다시 쓰지 않는다. 결과는 집계 숫자만이다.

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

> **리허설 기록 (2026-09-20)** — 최신 덤프(`ear-20260919T190002Z.sql.gz`)를 **노트북의 임시 컨테이너**
> (`pgvector/pgvector:pg16`)에 복원했다. psql `ON_ERROR_STOP=1` 종료코드 0, 에러 0건. 운영 DB 는
> 대조를 위한 읽기만 했고 서버에는 아무것도 올리지 않았다.
>
> | 항목 | 덤프 | 운영(당시) | 차이의 원인 |
> |---|---|---|---|
> | 테이블 | 32 | 33 | 덤프 이후 `AddContentScripts` 적용 |
> | 인덱스 | 89 | 92 | 위 + `AddLibraryItemQueuePosition` |
> | FK | 31 | 32 | `fk_content_scripts_contents` |
> | users | 28 | 28 | 일치 |
> | library_items | 135 | 138 | 덤프 이후 사용자 활동 |
> | contents | 15 | 16 | 덤프 이후 발행 1편 |
>
> **차이는 전부 설명된다** — 덤프(04:00 KST) 뒤에 마이그레이션 2건이 운영에 나갔다. 복원 후
> 현재 이미지를 띄우면 진입점이 마이그레이션을 돌려 스키마가 따라잡으므로 그대로 복구해도 된다.
> `vector` 확장이 0.8.3 으로 뜬 것은 노트북 이미지가 서버(0.8.6)보다 낮아서이고 덤프 문제가 아니다.

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

- [ ] `earcast-backup-prod/pg/`에 최근 덤프가 매일 쌓이는가 · `/var/log/ear-content-sync.log`에 내보내기가 매일 찍히는가
- [ ] 스냅샷이 매일 1개 늘고 8일째 것이 지워지는가: `aws ec2 describe-snapshots --owner-ids 639177726357 --filters Name=tag:Source,Values=ear-daily --query 'length(Snapshots)'` = 7 안팎
- [ ] Budgets 메일·CloudWatch 알람 상태: `aws cloudwatch describe-alarms --alarm-name-prefix ear-prod --query 'MetricAlarms[].[AlarmName,StateValue]' --output table` — 전부 `OK`. `INSUFFICIENT_DATA`면 크론이 지표를 못 찍는 것(권한·네트워크), `ALARM`이면 25시간 미실행. **새로 만든 알람은 첫 1시간 안에 오탐 ALARM 메일이 한 번 올 수 있다** — 첫 평가가 지표를 찍기 직전의 빈 1시간 구간을 보기 때문(2026-09-15 backup 알람 실측). 다음 크론 성공 뒤 OK 메일이 오면 정상이고, 그 뒤에도 ALARM이면 진짜 미실행이다
- [ ] Grafana 대시보드 "ear 운영" 1행 헬스체크가 서울·도쿄 **UP**, 가동률 24h 가 99.9% 이상인가. 합성 체크가 없어졌으면 [`inventory.md`](inventory.md) 외부 헬스체크 행의 값으로 다시 만든다(3분·서울·도쿄·본문 `"status":"ok"` Invert match·타임아웃 5초·Failed Checks 2/2·TLS 14일)
- [ ] (예비) UptimeRobot 모니터 `ear api health`가 Up 인가 — **알림은 꺼 둔 상태가 정상**(2026-09-26). **설정값(재등록 시)**: 유형 Keyword · URL `https://api.earcast.co.kr/api/v1/health` · 키워드 `"status":"ok"` · 존재하면 Up · 간격 5분 · 알림 연락처 = 메일(무료 플랜은 Slack 연동이 잠겨 있다 — 메일만). 키워드 방식이라 DB가 죽어 `/health`가 503 `degraded`를 내는 경우도 Down으로 잡힌다
- [ ] `df -h` 디스크 (20GB — docker 이미지가 쌓이면 `docker system prune -f`)
- [ ] 인증서는 Caddy 자동 — 만료 걱정 없음. `docker compose … logs caddy | grep -i renew`로 확인만
