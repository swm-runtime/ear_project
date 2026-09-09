# [INFRA] 운영 시크릿 보관 방식 — `.env.prod` 파일 유지 vs 시크릿 매니저 이전

| 항목 | 값 |
|---|---|
| 대상 | API EC2의 `/opt/ear/backend/.env.prod`에 있는 비밀값 보관 방식 — `JWT_SECRET` · `ARCHIVE_HASH_PEPPER` · `WITHDRAWAL_HASH_PEPPER` · `SLACK_ERROR_WEBHOOK_URL` · DB 비밀번호 등 |
| 요청 파트 | 백엔드 → 인프라 (상의 후 결정) |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | `tickets/backend/archive/api-server-deployment.md`를 닫으며 — 시크릿 조건("시크릿 매니저에만 있다")을 **현 시점 `.env.prod` 보관 합격으로 판정**해 닫았고, 이전 여부는 별건으로 분리했다 |
| 근거 문서 | `backend/architecture.md` 9.5(비밀 관리) · `backend/domain.md` 11.2(pepper 보관) · `docs/infra/inventory.md` · `docs/infra/runbook.md` 3장 |
| 심각도 | **하** — 현 상태도 저장소·코드·로그에는 값이 없고(전부 환경변수 주입) 파일은 EC2 안에서만 접근된다. 다만 아래 한계가 있어 개선 여부를 정할 필요가 있다 |
| 상태 | 진행 중 — **B안(Secrets Manager) 확정**(2026-09-09). 적재·IAM 완료, **주입 배선은 백엔드 협조 대기** |

## 현재 상태

- 실값은 **EC2 로컬 파일** `/opt/ear/backend/.env.prod`에만 있다. 저장소·코드·이미지·로그에는 없다.
- CI 자동 배포(`deploy-api.yml` → `push.sh`)는 `git archive | tar` 반입이라 `.env.prod`를 건드리지 않는다 — 배포마다 보존된다.
- `env.validation.ts`가 기동 시 전수 검증하므로, 값이 빠지면 컨테이너가 뜨지 않는다.

## `.env.prod` 방식의 한계 (이전을 검토하는 이유)

1. **백업·복구가 없다.** 인스턴스가 사라지면 값도 사라진다 — 재구축 시 어디서 복원하는지가 사람 기억에 의존한다(runbook에 값 자체는 없다).
2. **접근 이력이 없다.** SSH 가능한 사람은 누구나 읽을 수 있고, 언제 누가 읽었는지 남지 않는다.
3. **회전(rotation)이 수동이다.** 값 교체 = SSH 접속 → 파일 수정 → 컨테이너 재기동, 절차가 문서화만으로 유지된다.
4. 서버가 늘어나면(스케일 아웃·재해 복구) 파일을 손으로 복제해야 한다.

## 선택지 (상의 대상)

| 안 | 내용 | 비용·부담 |
|---|---|---|
| A. 현행 유지 | `.env.prod` 파일 + runbook 절차 보강(복원 경로 명시) | 0원. 위 한계 감수 |
| B. AWS Secrets Manager | 시크릿 1건($0.40/월)에 JSON으로 묶고, 부팅 시 조회(entrypoint 또는 앱 기동 전 스크립트) 또는 배포 시 `.env.prod` 재생성 | 월 $0.5 미만. IAM 역할(`ear-prod-ec2`)에 읽기 권한 필요 — **조직 SCP가 Secrets Manager를 막지 않는지 사전 확인 필요**(KVS를 막았던 전례 — `infra/architecture.md` 3.2) |
| C. SSM Parameter Store (SecureString) | B와 같은 구조, 표준 파라미터는 무료 | 0원. 기능은 B의 부분집합(자동 회전 없음) |

백엔드 의견: **B(AWS Secrets Manager)를 제안한다** — 비용이 월 $0.5 미만으로 사실상 무시할 수준이고, 백업·IAM 통제·접근 이력에 더해 **자동 회전과 버전 관리**까지 확보된다. 노출 이력이 있는 값들(아래 참고)의 재발급·회전을 앞으로도 반복하게 될 것이라 회전 지원이 있는 쪽이 낫다. 단 SCP 확인이 선행이다.

## 요청 내용

1. infra 담당과 A/B/C 중 하나를 결정한다 (SCP에서 Secrets Manager·SSM 데이터 플레인이 허용되는지 확인 포함).
2. B/C 채택 시: 파라미터 적재, `ear-prod-ec2` 역할에 읽기 권한, 부팅/배포 경로에서 값 주입 방식 확정(백엔드가 `push.sh`·compose 수정 협조).
3. A 유지 시: runbook에 `.env.prod` 유실 대비 복원 절차(값의 원본 소재)를 명시한다.

## 완료 조건

- Given 결정된 안 / When 이 티켓을 본다 / Then 선택안과 근거(SCP 확인 결과 포함)가 기록되어 있다
- Given B/C 채택 시 운영 서버 재기동 / When 기동 로그를 본다 / Then 환경변수 검증을 통과해 정상 기동한다(시크릿 조회 실패 시 기동 실패가 명확히 드러난다)
- Given A 유지 시 / When `docs/infra/runbook.md`를 본다 / Then `.env.prod` 유실 시 복원 절차가 적혀 있다

## 참고 — 함께 처리하면 좋은 것

- `SLACK_ERROR_WEBHOOK_URL`과 심사 테스트 계정 비밀번호는 2026-09-06 작업 중 대화 로그에 노출된 적이 있어 **재발급 권고**가 나가 있는 상태다. 보관 방식을 옮기는 시점이 재발급의 자연스러운 타이밍이다.

## 진행 기록 (2026-09-09 — SCP 선행 확인 해소. **Secrets Manager·SSM 둘 다 막혀 있지 않다**)

요청 1의 선행 조건이었던 "조직 SCP가 Secrets Manager·SSM 데이터 플레인을 막지 않는지"를 실측했다.
KVS를 막았던 전례(`infra/architecture.md` 3.2) 때문에 걸어둔 확인이다.

계정 `639177726357` · 역할 `AWSReservedSSO_myisb_IsbUsersPS/ISB-30` · 리전 `ap-northeast-2`:

```
aws secretsmanager list-secrets   → {"SecretList": []}
aws ssm describe-parameters       → {"Parameters": []}
```

**둘 다 `AccessDenied`가 아니라 빈 목록을 반환했다.** SCP가 서비스를 통째로 차단하는 형태는 아니다.
"아직 아무것도 만들지 않았다"는 뜻이기도 하다(현재 시크릿은 EC2 로컬 `.env.prod`뿐이라는 위 서술과 일치).

### 이 확인의 한계 — 읽기만 검증했다

- 확인한 것은 **읽기(list) API가 호출된다**는 것뿐이다. SCP는 특정 액션 단위로도 걸리므로
  `CreateSecret`·`PutParameter` 같은 **쓰기가 허용되는지는 검증되지 않았다.**
- 쓰기 검증은 실제 시크릿·파라미터를 생성해야 하므로(Secrets Manager는 건당 과금) **사용자 승인 후에 한다.**
  SSM 표준 파라미터는 무료라 쓰기 프로브의 비용 부담이 없다 — **C안을 먼저 찔러보는 쪽이 비용 0이다.**
- 위에서 조회한 자격증명은 SSO 사용자 역할(`ISB-30`)이다. 운영 EC2가 쓰는 인스턴스 역할(`ear-prod-ec2`)에
  같은 권한이 있는지는 **별개 확인 대상**이다 — B/C 채택 시 그 역할에 읽기 권한을 붙이는 게 요청 2에 이미 들어 있다.

### 남은 것 (갱신)

- **A/B/C 결정 자체는 그대로 열려 있다.** 이 확인은 "B가 SCP 때문에 불가능하지는 않다"만 보탠 것이고,
  백엔드 의견(B 제안)을 뒤집을 근거도 지지할 근거도 새로 나오지 않았다.
- 결정 전에 쓰기 프로브를 원하면 **SSM 표준 파라미터(무료)로 먼저** 하는 것을 권한다 — 실패하면 B도 같이 막힌 것이고,
  성공하면 C는 확정, B는 과금 리소스 1건으로 따로 확인하면 된다.

## 처리 기록 (2026-09-09) — **B안 확정. 적재·IAM·검증 완료. 주입 배선은 백엔드 협조 대기라 `pending` 유지**

요청 1(결정)과 2의 앞부분(적재·읽기 권한)을 마쳤다. **아직 앱은 `.env.prod`를 읽는다** — 시크릿은
백업·통제 사본으로만 존재하고 원천이 아니다. 배선이 붙어야 요청 2가 닫히고 완료 조건 2가 찬다.

### 결정 — B(AWS Secrets Manager)

사용자 결정 2026-09-09. A(현행 유지)·C(SSM)는 재검토하지 않았다.

**SCP 쓰기 검증도 해소됐다.** 위 진행 기록이 "읽기(list)만 검증했다 — `CreateSecret`·`PutParameter`
같은 쓰기는 미검증"이라고 남겨 둔 한계다. 이번에 실제로 `CreateSecret`(SSO 역할)과
`PutSecretValue`(인스턴스 롤) 둘 다 성공했다 — **SCP는 Secrets Manager 쓰기도 막지 않는다.**
`infra/architecture.md` 3.2의 KVS 전례와 달리 이 서비스는 데이터 플레인이 열려 있다.

### 만든 것

| 리소스 | 값 |
|---|---|
| 시크릿 | `ear/prod/api` — `arn:aws:secretsmanager:ap-northeast-2:639177726357:secret:ear/prod/api-PyK5Ku` |
| 담긴 항목 | 8종 — `DB_PASSWORD` · `JWT_SECRET` · `ARCHIVE_HASH_PEPPER` · `WITHDRAWAL_HASH_PEPPER` · `AUDIO_URL_SIGNING_KEY` · `CLOUDFRONT_PRIVATE_KEY_BASE64` · `PIPELINE_SSO_SECRET` · `SLACK_ERROR_WEBHOOK_URL` |
| IAM | 역할 `ear-prod-ec2`의 인라인 정책 `secrets-read` — `GetSecretValue`·`DescribeSecret`, 리소스는 `...:secret:ear/prod/api-*` 하나 |
| 비용 | 시크릿 1건 $0.40/월 + API 호출 $0.05/10k. 배포당 1회 조회이므로 사실상 월 $0.40 |

**비밀값만 옮겼다.** `.env.prod`의 35개 키 중 비밀이 아닌 27개(도메인·앱 버전·클라이언트 ID·
버킷명 등)는 파일에 남겼다. 그것까지 시크릿에 넣으면 앱 버전 하나 올릴 때마다 시크릿을
고쳐야 해서 운영이 나빠진다 — 시크릿은 **회전 대상**만 담는다.

정책 리소스에 `-*` 를 쓴 이유: 시크릿 ARN 끝의 6자 접미사는 AWS가 붙이며 **삭제 후 재생성하면
바뀐다.** 정확한 ARN을 박으면 재생성 시 정책이 조용히 끊긴다. `ear/prod/api-*`는 여전히 그
이름 하나로 좁혀진다.

### 실측 결과

- **인스턴스 프로파일 부착** — `ear-prod-ec2`가 `i-04f1f70f5484ffafd`(43.203.57.240)에 붙어 있다.
  EC2에서 `sts get-caller-identity` → `assumed-role/ear-prod-ec2/i-04f1f70f5484ffafd`.
- **인스턴스 롤로 조회된다** — EC2에서 `get-secret-value` 성공(SecretString 2979자).
- **값이 정확히 옮겨졌다** — 8종 전부 `.env.prod` 값과 sha256 일치(EC2 안에서 대조). 값은
  어디에도 출력하지 않았고 **로컬로 내려받지 않았다** — `.env.prod` 읽기·JSON 생성·업로드를
  전부 EC2 안에서 했고 임시 파일은 `shred -u`로 지웠다.
- **최소 권한이 실제로 좁다** — 같은 롤로 `PutSecretValue` → `AccessDeniedException`,
  `ListSecrets` → `AccessDeniedException`. 적재에만 쓴 `PutSecretValue`는 적재 직후 회수했다.
- **IMDS 홉 제한 2** — 컨테이너 안에서도 인스턴스 롤 조회가 가능하다(주입 방식 선택에 영향).

### 건드리지 않은 것

- **`.env.prod` 그대로다.** 값·파일 모두 손대지 않았다 — 롤백 수단으로 남긴다. 이관은 복사다.
- **API를 재기동하지 않았다.** 지금 도는 컨테이너는 종전 그대로다.
- 시크릿 값 자체는 **재발급하지 않았다**(아래 "노출 이력" 참조).

## 주입 방식 — 설계와 실패 모드

### 권고: **안 1 (배포 시 `.env.prod`의 비밀 항목만 갱신)**

| | 안 1 — 배포 경로(호스트에서 조회) | 안 2 — 부팅 경로(entrypoint에서 조회) |
|---|---|---|
| 조회 주체 | `push.sh`가 EC2 호스트에서 | 컨테이너 안 entrypoint |
| 앱 이미지 변경 | **없음** | AWS CLI 또는 SDK 추가 필요(Dockerfile 변경) |
| 디스크의 비밀값 | 남는다(현행과 동일) | 남지 않는다 |
| 재부팅·수동 `compose up` | 옛 `.env.prod` 값으로 뜬다 | 항상 최신 값 |
| **조회 실패 시** | **컨테이너를 건드리기 전에 중단** — 돌던 API가 그대로 산다 | **재기동 루프**(`restart: unless-stopped`) — 서비스 중단 |

**안 1을 권한다.** 이 티켓의 목적은 백업·IAM 통제·회전이지 "디스크에서 비밀값 제거"가 아니다
(심각도 하 — 파일은 이미 `600`, EC2 안에서만 접근된다). 안 2는 없던 가용성 위험을 새로 만든다 —
지금은 단일 서버라 Secrets Manager 장애나 IAM 실수 한 번이 곧 전면 중단이다. 반면 안 1의
실패 모드는 "배포가 안 된다"이고, 그건 이미 우리가 감당하는 실패다.

안 2의 유일한 실질 이점(재부팅 시 최신 값)은 **회전 직후 재배포를 절차에 넣으면** 메워진다.

### 실패 모드 정리 (안 1 기준)

| 상황 | 결과 |
|---|---|
| 시크릿 조회 실패(권한·네트워크·시크릿 삭제) | `set -e`로 `push.sh`가 중단. `.env.prod`·컨테이너 둘 다 무변경. 돌던 API 유지 |
| 조회는 됐는데 키가 빠짐 | 갱신 스크립트가 종료 코드 1로 중단(아래 제안 스크립트가 누락 키를 검사한다). 배포 실패 |
| 값이 잘못 들어감(형식 오류) | 컨테이너 기동 시 `env.validation.ts`가 **기동 실패**시킨다 — 조용히 뜨지 않는다. `push.sh` 헬스 확인이 200을 못 받고 실패로 끝난다 |
| `.env.prod`가 서버에 없음 | 종전대로 `push.sh`가 먼저 막는다(최초 설치는 README 2장) |

## 백엔드에 넘길 변경 제안 — `backend/deploy/` 는 백엔드 파트 소유라 직접 고치지 않았다

### 1) 새 파일 `backend/deploy/apply-secrets.py`

```python
"""Secrets Manager 에서 받은 JSON 으로 .env.prod 의 비밀 항목만 덮어쓴다.

비밀이 아닌 설정(도메인·앱 버전 등)의 원천은 여전히 .env.prod 다 — 그래서 파일을 새로
만들지 않고 해당 키의 줄만 치환한다. 값은 출력하지 않는다.
"""
import json
import sys

secret_path, env_path = sys.argv[1], sys.argv[2]
with open(secret_path, encoding="utf-8") as f:
    secrets = json.load(f)
if not secrets:
    sys.exit("시크릿이 비어 있다 — .env.prod 를 건드리지 않는다")

with open(env_path, encoding="utf-8") as f:
    lines = f.read().splitlines()

seen = set()
for i, line in enumerate(lines):
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    key = line.split("=", 1)[0].strip()
    if key in secrets:
        lines[i] = "%s=%s" % (key, secrets[key])
        seen.add(key)

missing = sorted(set(secrets) - seen)
if missing:
    sys.exit("`.env.prod` 에 없는 키다 — 수동 확인 필요: %s" % ", ".join(missing))

with open(env_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("[secrets] %d 개 항목 갱신" % len(seen))
```

`.env.prod`에 키가 아예 없으면 **추가하지 않고 실패시킨다.** 파일에 없다는 것은 이 서버가
그 값을 안 쓴다는 뜻일 수도 있어서, 조용히 늘리는 쪽이 더 위험하다.

### 2) `backend/deploy/push.sh` — 재기동 블록 앞에 조회·갱신 삽입

현재 원격 블록:

```sh
  [ -f .env.prod ] || { echo '.env.prod 가 서버에 없다 — 최초 설치는 README 2장'; exit 1; }
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
```

제안:

```sh
  [ -f .env.prod ] || { echo '.env.prod 가 서버에 없다 — 최초 설치는 README 2장'; exit 1; }

  # 비밀값의 원천은 Secrets Manager 다(tickets/infra prod-secrets-storage). 배포마다 내려받아
  # .env.prod 의 비밀 항목만 덮어쓴다. 조회가 실패하면 set -e 로 여기서 멈춘다 —
  # .env.prod 도 컨테이너도 아직 건드리지 않은 상태라 돌던 API 가 그대로 산다.
  SECRET_TMP=$(mktemp /tmp/ear-secret.XXXXXX.json); chmod 600 "$SECRET_TMP"
  trap 'shred -u "$SECRET_TMP" 2>/dev/null || rm -f "$SECRET_TMP"' EXIT
  cp .env.prod .env.prod.bak          # 갱신 실패 시 되돌릴 자리
  aws secretsmanager get-secret-value --region ${AWS_REGION:-ap-northeast-2} \
    --secret-id ear/prod/api --query SecretString --output text > "$SECRET_TMP"
  python3 deploy/apply-secrets.py "$SECRET_TMP" .env.prod

  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
```

- `.env.prod.bak`은 **한 세대만** 남긴다(매 배포 덮어씀). 갱신이 깨졌을 때 SSH로 즉시 되돌릴 자리다.
- `AWS_REGION`은 `.env.prod`에 이미 있지만 `push.sh`의 원격 셸에는 로드되지 않으므로 기본값을 둔다.
- **`docker-compose.prod.yml`은 바꿀 것이 없다.** `env_file: .env.prod` 그대로 동작한다.

### 3) 백엔드가 확인해 줄 것

- 배포 후 첫 기동에서 `env.validation.ts`가 통과하는지(완료 조건 2). 실패하면 `.env.prod.bak`으로 롤백.
- `deploy/aws/README.md`에 "비밀값의 원천은 Secrets Manager, `.env.prod`는 파생물"을 명시할지.

## 회전(rotation) 판단 — **지금 켜지 않는다**

티켓이 회전 지원을 B 선택의 근거로 들었으므로 판단을 남긴다.

**자동 회전은 지금 켜면 예약된 시각에 서비스가 깨진다.** 담긴 8종의 성격 때문이다:

- `ARCHIVE_HASH_PEPPER`·`WITHDRAWAL_HASH_PEPPER`는 **이미 저장된 해시와 짝**이다
  (`domain.md` 11.2). 바꾸면 과거 레코드와의 대조가 깨진다 — 애초에 자동 회전 대상이 아니다.
- `JWT_SECRET`을 갈면 발급된 access token이 **전부 무효화**된다(전 사용자 재로그인).
  무중단 회전은 구·신 키를 동시에 수용하는 롤오버가 앱에 있어야 하는데 **없다.**
- `AUDIO_URL_SIGNING_KEY`도 같다 — 발급된 서명 URL이 즉시 깨진다.
- `DB_PASSWORD`는 Secrets Manager의 RDS 회전 템플릿이 있지만, **이 DB는 RDS가 아니라 compose
  안의 컨테이너**라 그 템플릿이 맞지 않는다. 직접 만든 Lambda가 필요하다.

**그럼에도 B를 고른 값은 지금 회수된다.** 자동 회전이 아니라 **버전 관리와 수동 회전 절차**에서다:

- 값 교체가 `put-secret-value` + 재배포로 끝난다. SSH로 파일을 손으로 고치는 절차가 사라진다.
- `AWSPREVIOUS` 버전이 자동 보존되므로 잘못 바꿔도 되돌릴 자리가 있다.
- 누가 언제 읽었는지 CloudTrail에 남는다(현행 `.env.prod`에는 없던 것).

**자동 회전은 앱에 키 롤오버가 생긴 뒤 별도 티켓으로 다룬다.** 그전까지 켜는 것은 위험만 늘린다.

### 노출 이력 값의 재발급 — 하지 않았다

`SLACK_ERROR_WEBHOOK_URL`과 심사 테스트 계정 비밀번호는 재발급 권고가 나가 있다(위 "참고").
**이번 이관에서는 값을 그대로 옮겼다** — 재발급은 슬랙 앱 설정에서 새 웹훅을 발급받는 등
AWS 밖 작업이 따르고, 값이 바뀌면 재배포가 필요해 "재기동 안 함" 범위를 넘는다.
이관이 끝났으니 **재발급 시 절차는 이제 `put-secret-value` + 재배포**다.

## 완료 조건 현황

| 완료 조건 | 상태 |
|---|---|
| 선택안과 근거(SCP 확인 결과 포함)가 기록돼 있다 | **충족** — B 확정, 읽기·쓰기 SCP 확인 결과 위에 기록 |
| B/C 채택 시 재기동에서 환경변수 검증을 통과해 정상 기동한다 | **미충족** — 주입 배선(백엔드 협조) + 재기동이 남았다. 승인 범위상 이번엔 재기동하지 않았다 |
| A 유지 시 runbook 복원 절차 | **해당 없음**(B 채택) |
