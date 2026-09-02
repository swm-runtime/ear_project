# pipeline/deploy — AI 서버 EC2 (M6 런북)

"AI 서버" = **EC2 1대 + compose 4컨테이너**: `caddy`(TLS) → `web`(Next.js 관리 UI) · `worker-io`(IO 전용 워커) · `ai-server`(FastAPI 임베딩, :8000 내부 전용). 판단 근거는 [spec/10 2장 "호스트"](../../docs/ai/spec/10-webapp.md) — 제품과 같은 ISB 계정·기본 VPC·퍼블릭 서브넷, **NAT·ALB·Fargate·RDS 없음**, 기존 리소스 무변경(제품 SG 는 8000 소스로 참조만).

| 파일 | 역할 |
|---|---|
| `aws/setup-ai-server.sh` | AWS 리소스 생성 (멱등) — 키페어·SG·역할/프로필(`ear-ai-ec2`)·EC2·EIP |
| `Dockerfile` | pipeline 모노레포 이미지 — web 과 worker 가 공유 (worker 는 command 로 전환) |
| `docker-compose.prod.yml` | 서버 구성. env 는 `deploy/env.prod`(점 없는 이름 — `.env*` 는 dockerignore 대상) |
| `caddy/Caddyfile` | `pipeline.<도메인>` → web:3000. TLS 자동(Let's Encrypt) |
| `env.prod.example` | `env.prod` 템플릿. `env.ai-server` 는 [`ai-server/.env.example`](../../ai-server/.env.example) 기준 |
| `push.sh` | 코드 반입 + 재배포 — 로컬 체크아웃을 rsync 로 밀고 서버에서 compose 빌드 (deploy key 금지 조직 설정 우회) |

## 0. 전제

- 로컬 `aws` CLI 로그인 (ISB 는 SSO — 만료 시 `aws sso login --profile isb`)
- 파이프라인 버킷·정책이 이미 있다 (`aws/setup-pipeline-bucket.sh`, 2026-09-01 완료)
- 관리자 IP (SSH 22 허용 대상)

## 1. AWS 리소스 (한 번, 멱등)

```bash
ADMIN_IP=<관리자IP> AWS_PROFILE=isb AWS_REGION=ap-northeast-2 bash pipeline/deploy/aws/setup-ai-server.sh
```

끝에 EIP·사설 IP 와 남은 절차가 출력된다. pem 은 `aws/out/ear-ai-isb.pem` (커밋 금지, **유일한 사본 — 백업**).

## 2. 코드 반입 — `push.sh` (rsync)

**조직 설정이 이 레포의 deploy key 를 막는다** (2026-09-02 실측: `Deploy keys are disabled for this repository`). 그래서 서버에는 git 자격증명을 아예 두지 않고, **노트북 체크아웃을 rsync 로 민다** — 비밀(`.env*`)·산출물·`deploy/aws/out`(pem)은 제외되고, 서버의 env 실값은 삭제 보호된다.

```bash
bash pipeline/deploy/push.sh          # rsync → (env 있으면) compose up -d --build
```

## 3. 서버 부트스트랩 (한 번)

user-data 가 docker·compose·buildx·git·스왑 2G·`/opt/ear` 를 이미 깔았다 (부팅 후 몇 분 소요 — `cloud-init status` 로 확인).

1. `bash pipeline/deploy/push.sh` — 최초 실행은 env 템플릿(`deploy/env.prod`·`deploy/env.ai-server`)만 만들고 멈춘다
2. 서버에서 비밀값 채우기 (팀 비밀 채널): `ssh -i pipeline/deploy/aws/out/ear-ai-isb.pem ec2-user@<EIP>` → `vi /opt/ear/ear_project/pipeline/deploy/env.prod` · `vi …/deploy/env.ai-server`
3. 다시 `bash pipeline/deploy/push.sh` — 이미지 빌드 + 4컨테이너 기동

`env.prod`·`env.ai-server` 는 push 의 rsync 가 보호한다 — 다시 밀어도 지워지지 않는다.

## 4. DNS·Auth (사람 몫)

1. 가비아: `pipeline.earcast.co.kr` A 레코드 → EIP. **함정**: 레코드 전에 Caddy 가 발급 실패하면 최대 20분 백오프 — 레코드 넣은 뒤 `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/env.prod restart caddy`
2. Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs 에 `https://pipeline.earcast.co.kr/**` 추가 (Site URL 은 기존 유지)
3. `docs/infra/inventory.md` 에 EC2·SG·역할·EIP·레코드 등재

## 5. 재배포 (코드가 바뀔 때마다)

```bash
git switch dev && git pull    # 배포는 dev 기준 — 로컬 수정분이 섞이면 rev 에 -dirty 가 붙는다
bash pipeline/deploy/push.sh
```

## 6. 확인 (완료 조건)

- `https://pipeline.earcast.co.kr` → 로그인 화면. 팀원 계정으로 로그인·백로그 승인 가능
- 제품 EC2 에서: `curl -s http://<사설IP>:8000/health` → `{"status":"ok",…}` (SG: 제품 SG 소스만 허용)
- 외부에서: `curl -m 3 http://<EIP>:8000/health` → 타임아웃 (8000 비공개 확인)
- 서버 워커 로그: `docker compose … logs worker-io | tail` → `storage=direct s3://…` (인스턴스 역할로 S3 접근)
- `aws ec2 describe-instances` 로 제품 인스턴스·SG 무변경 확인

## 7. 함정 (실측·계승)

- **IMDS hop limit 2** 필수 — 1이면 컨테이너가 인스턴스 역할을 못 읽는다 (스크립트가 설정함)
- **deploy key 금지(조직 룰셋)** — 서버에서 git clone/pull 을 시도하지 말 것. 코드는 push.sh 로만
- t4g.small 에서 `next build` OOM → user-data 의 스왑 2G 가 1차 방어. 그래도 죽으면 로컬 arm64 빌드 후 `docker save | ssh … docker load`, 다음이 t4g.medium (spec/10 2장)
- ai-server 를 노트북(메타 부여 스킬)에서 부를 땐 SSH 터널: `ssh -i … -L 8000:localhost:8000 ec2-user@<EIP>` — 공개 도메인을 만들지 않는다
- 팀원 노트북 워커는 이 서버가 뜬 뒤부터 web 모드로 동작: `PIPELINE_WEB_URL=https://pipeline.earcast.co.kr` + 토큰 (spec/10 3.3)
