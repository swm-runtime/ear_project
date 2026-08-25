# AWS 배포 — 단일 EC2 + S3/CloudFront

```
[Expo 앱] ──JSON──▶ Caddy(TLS) ─▶ api(Nest) ─▶ postgres      ← EC2 t4g.small 한 대, docker compose
          ──오디오──▶ CloudFront(서명 검증 + /play/<id> 재작성) ─▶ S3(비공개)   ← 바이트는 이쪽으로만
```

핵심은 **API 서버가 오디오 바이트를 한 번도 나르지 않는다**는 것. 재생기는 CloudFront에 Range 요청을
보내고 듣는 만큼만 받는다. 서버가 하는 일은 허가 판정 + 서명 URL 발급(5분 만료)뿐.

## 0. 준비
- 도메인 하나 (`api.example.com`), AWS 계정, 로컬에 `aws` cli 로그인
- **Billing → Budgets**에서 월 $10 알림부터 걸어라. 첫 작업이다.

## 1. 오디오 CDN 만들기 (한 번)
```bash
AUDIO_BUCKET=ear-audio-prod BACKUP_BUCKET=ear-backup-prod AWS_REGION=ap-northeast-2 \
  deploy/aws/setup-audio-cdn.sh
```
마지막에 출력되는 `.env.prod` 네 줄을 보관. `deploy/aws/out/cf_private.pem`은 커밋 금지(.gitignore 됨).

오디오 올리기 (한 편씩):
```bash
AUDIO_BUCKET=ear-audio-prod KVS_ARN=<setup 출력값> deploy/upload-audio.sh <contentId> ./ep.mp3
# → audio/3f9c...a1.mp3   ← 이 값을 contents.audio_path 에 넣는다
```
S3 키는 무작위이고 URL에는 `/play/<contentId>`만 보인다. `contentId → 키` 매핑은 CloudFront
KeyValueStore에 있고, 뷰어 요청 단계의 CloudFront Function(`audio-rewrite.function.js`)이
재작성한다. 그래서 `audio_path`는 어떤 응답·URL에도 실리지 않는다(domain.md 5.1).

**콘텐츠 회수 시** KVS 키도 지워라: `aws cloudfront-keyvaluestore delete-key --kvs-arn $KVS_ARN --key <contentId> --if-match <ETag>`
— 서버가 발급을 막는 것과 별개로, 이미 나간 URL이 5분간 살아 있는 창을 닫는다.

**첫 배포 후 확인 1회**: 서명 URL로 재생되는지, 그리고 서명 없이 `/play/<id>`를 치면 403인지.
Function이 재작성한 뒤 서명을 검증하는지 순서가 문서에 명시돼 있지 않아 정책을 배포 전체
와일드카드(`/*`)로 잡았다 — 어느 순서든 통과한다. 검증되면 `buildPolicy`의 Resource를
`/play/*`로 좁혀도 되는지 같이 시험해 봐라(좁힐수록 URL 변조 창이 줄어든다).

## 2. EC2
- **t4g.small** (arm64, 프리티어 12개월 750h/월). 프리티어 끝나면 Lightsail $10 플랜으로 옮겨도 됨(고정 IP·대역폭 포함).
- Amazon Linux 2023 arm64, EBS gp3 20GB
- 보안그룹: 22(내 IP만), 80, 443. **그 외 전부 닫는다.** DB 포트는 열지 않는다(컨테이너 안에서만).
- 퍼블릭 서브넷에 둔다. **NAT Gateway·ALB·RDS 만들지 않는다** — 셋이 월 비용의 대부분이다.
- 인스턴스 롤: `s3:PutObject` on `ear-backup-prod/*` (백업용). 오디오 버킷 권한은 필요 없다(업로드는 로컬에서).

```bash
# 서버에서
sudo dnf install -y docker git && sudo systemctl enable --now docker && sudo usermod -aG docker $USER
sudo mkdir -p /opt/ear && sudo chown $USER /opt/ear && cd /opt/ear
git clone -b dev https://github.com/swm-runtime/ear_project.git . && cd backend
cp .env.example .env.prod   # 값 채우기 — 아래 참고
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`.env.prod`에서 바꿀 것:
```
NODE_ENV=production
API_DOMAIN=api.example.com          # Caddy가 TLS 발급에 씀
DB_PASSWORD=<openssl rand -hex 24>
JWT_SECRET / *_PEPPER / AUDIO_URL_SIGNING_KEY = 각각 다른 32자+ 랜덤
CORS_ORIGINS=https://api.example.com
AUDIO_DELIVERY=cloudfront
AUDIO_URL_BASE_URL=https://dxxxx.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=...
CLOUDFRONT_PRIVATE_KEY_BASE64=...
BACKUP_BUCKET=ear-backup-prod
```
DNS: `api.example.com` A 레코드 → EC2 퍼블릭 IP. Caddy가 인증서를 알아서 받는다.

## 3. 백업
```
crontab -e
0 19 * * * /opt/ear/backend/deploy/backup.sh >> /var/log/ear-backup.log 2>&1
```
30일 지난 덤프는 버킷 라이프사이클이 지운다.

## 4. 배포 갱신
```bash
cd /opt/ear && git pull && cd backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
```
마이그레이션은 컨테이너 기동 시 자동(`RUN_MIGRATIONS=true`). 실패하면 서버가 안 뜬다 — 그게 의도.

## 5. 월 비용이 3만원대에 머무는 조건
| 조건 | 깨지면 |
|---|---|
| 오디오는 **CloudFront로만** 나간다 (EC2·S3 직접 서빙 X) | EC2 egress GB당 과금. 72GB면 서버값만큼 추가 |
| CloudFront 전송 **월 1TB 이하** (영구 무료 구간) | MAU 1,000이면 ~72GB. 10,000까지도 대체로 안 넘음 |
| 서버 **1대**, ALB·NAT·RDS 없음 | ALB 2~3만, NAT 3~4만, RDS 1.5만+ 각각 그냥 샘 |
| t4g.small 또는 Lightsail $10 이하 | t4g.medium 가면 +1.5만 |
| S3 저장 **50GB 이하** (에피소드 ~5,000편) | 그 이상은 GB당 몇십 원이라 완만 |
| CloudWatch 로그 보관 7일, 상세 모니터링 끔 | 로그가 은근히 샌다 |
| CloudFront Functions 월 200만 호출 이하 (영구 무료) | MAU 1,000 = 수만 호출. KVS는 무료 |
| 퍼블릭 IPv4 1개 | 2024년부터 시간당 과금. Lightsail은 포함 |
| 유료 유저가 하루 10편씩 듣는 비율이 낮음 | 트래픽은 MAU가 아니라 재생 시간이 정한다 |

프리티어 12개월 안이면 위 조건에서 **거의 0원**, 이후 **월 2~3만원 + 도메인**. 정확한 원 단위는
Pricing Calculator에 서울 리전 넣고 확인 — 환율·시점 따라 움직인다.

## 하지 않은 것 (의도)
- **HLS 분할 없음.** 파일 하나 + Range 요청으로 "듣는 만큼만 전송"은 이미 달성된다. HLS는 세그먼트
  URL이 여럿이라 signed cookie가 필요한데, 네이티브 재생기가 세그먼트 요청에 쿠키를 넘긴다는 보장이
  없다. 필요해지면 그때 cookie 방식부터 검증.
- **Lambda 없음.** 크론(`@nestjs/schedule`)과 상태 테이블 폴링이 상주 프로세스를 전제한다.
