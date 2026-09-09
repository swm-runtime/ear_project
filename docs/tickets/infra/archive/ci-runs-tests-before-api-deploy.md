# [INFRA] API EC2 자동 배포가 테스트를 거치지 않는다 — 배포 전 검증 단계를 둔다

| 항목 | 값 |
|---|---|
| 대상 | `.github/workflows/deploy-api.yml` (API EC2 자동 배포) |
| 요청 파트 | 백엔드 → 인프라 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | 2026-09-08 백엔드 전수 점검 마무리 — e2e를 돌려 보니 **21건 중 15건이 이틀째 실패**하고 있었고, 그동안 dev는 계속 초록이었다 |
| 근거 문서 | `backend/convention.md` 7장(테스트) · `backend/deploy/aws/README.md` CI 장 · `docs/infra/runbook.md` |
| 심각도 | **중** — 지금도 깨진 코드가 운영에 그대로 나간다. 이번에는 테스트 픽스처만 깨져 사고로 이어지지 않았을 뿐이다 |
| 상태 | **반영 완료 2026-09-09** (PR #255) — 설계 확정 2026-09-08(러너 실행 · `pull_request` 트리거) |

## 문제

`deploy-api.yml`은 `dev`에 `backend/**` 변경이 머지되면 **바로 EC2에 배포한다.** 워크플로가 하는 일은 이것뿐이다.

```
설정 여부 확인 → SG에 러너 IP 개방 → push.sh(서버 git pull + compose 빌드·재기동 + 헬스 확인) → SG 폐쇄
```

**`npm run lint` · `npm test` · `npm run test:e2e` 를 실행하는 단계가 없다.** 저장소의 세 워크플로(`deploy-api` · `deploy-pipeline` · `eas-update`) 전부 배포·업데이트 전용이고, 테스트를 도는 워크플로가 하나도 없다.

`push.sh`의 헬스 확인은 **기동 여부**만 본다. 서버가 뜨기만 하면 통과하므로, 로직이 깨져 있어도 배포는 초록이다.

### 실제로 일어난 일

`age_confirmation`이 필수 동의가 된 2026-09-06 이후 **e2e 가입이 400으로 막혀 21건 중 15건이 실패**하고 있었다. 두 스펙이 그 동의를 보내지 않아서였다.

그 이틀 동안 `backend/**` 머지는 계속 있었고 전부 정상 배포됐다. **누가 로컬에서 e2e를 돌리기 전까지 아무 신호도 없었다.** 이번에는 픽스처 문제라 운영에 영향이 없었지만, 같은 구멍으로 실제 로직 회귀가 나가는 것을 막을 장치가 없다.

## 요청 내용

**배포 전에 검증을 통과해야 한다.** `deploy-api.yml`에 배포보다 앞서는 단계(또는 선행 job)를 두고, 실패하면 배포하지 않는다.

돌려야 할 것:

| 명령 | 필요 조건 |
|---|---|
| `npm ci` | — |
| `npm run lint` | — |
| `npm run build` | — |
| `npm test` (유닛 542건) | — |
| `npm run test:e2e` (21건) | **PostgreSQL 필요** |

### 확정 — GitHub Actions 러너에서 돌린다 (2026-09-08)

검증은 **배포 대상 환경이 아니라 배포 전에** 끝난다. 운영 인스턴스에서 테스트 DB를 띄웠다 지우는 위험을 지지 않는다.

- **e2e용 PostgreSQL은 러너의 서비스 컨테이너로 띄운다.** 로컬 `docker-compose.yml`과 같은 이미지면 된다.
- **운영 시크릿이 필요 없다.** env는 `.env.example` 기준 + 테스트용 더미 값으로 충분하다. 예제를 그대로 복사해도 기동되도록 고쳐 뒀다(2026-09-08).
- **e2e 전에 마이그레이션이 선행돼야 한다** — 로컬과 같은 순서다(`npm run migration:run`).
- 검증이 실패하면 **SSH·SG 개폐 자체가 일어나지 않는다.** 배포 경로가 그만큼 짧아진다.
- 대가는 러너에서 `npm ci` + 빌드 + e2e가 도는 시간(체감 수 분)만큼 배포가 늦어지는 것이다. **깨진 코드가 나가는 것보다 낫다.**

**기각한 안 — EC2에서 배포 직전에 돌린다.** 실제 배포 대상 환경에서 검증된다는 이점이 있으나, 운영 인스턴스에 테스트 DB를 다뤄야 하고(운영 DB를 건드리는 사고 여지) 실패 시 이미 `git pull`이 끝난 상태라 롤백 절차가 필요하다.

### 확정 — `pull_request`를 트리거에 넣는다 (2026-09-08)

지금 트리거는 `push: branches: [dev]`뿐이라 **머지된 뒤에야** 안다. `pull_request`를 함께 넣어 **머지 전에** 막는다.

```yaml
on:
  pull_request:
    paths: ['backend/**', '.github/workflows/deploy-api.yml']
  push:
    branches: [dev]
    paths: ['backend/**', '.github/workflows/deploy-api.yml']
  workflow_dispatch:
```

- **검증 job은 두 트리거 모두에서 돈다.** 배포 job은 종전대로 `dev` push에서만 돌고, 검증을 통과했을 때만 이어진다(`needs`).
- **`paths` 필터는 배포와 같게 둔다** — `backend/**` 변경일 때만. 검증 대상이 그 범위이기 때문이다.
- **PR 이벤트에서는 SG 개폐·SSH가 일어나지 않아야 한다.** 지금 워크플로에는 그 단계들이 job 하나에 섞여 있으므로, 검증과 배포를 **별도 job으로 나누는 것이 전제**다.

### 남은 것 — 구현 시 확인

- **`CI_SSH_KEY_API` guard는 배포 job에만 남긴다.** 현재 guard는 키가 없으면 배포를 조용히 건너뛴다. 검증 job은 그 guard와 무관하게 **항상 돌아야 한다** — 배포하지 않는 저장소에서도 테스트는 의미가 있다. job을 나누면 자연히 갈리는 부분이라 별도 결정 사항은 아니다.
- **러너의 e2e env 값.** `.env.example`을 복사해 쓰되, `AUDIO_DELIVERY=local`처럼 로컬 검증용으로 바꿔야 하는 값이 있는지 첫 구현에서 확인한다.

## 참고 — 현재 상태

- e2e 실패 자체는 `fix(be)/e2e-age-confirmation-consent`에서 고쳤다(21건 통과). **이 티켓은 그 회귀를 이틀간 아무도 몰랐던 구조를 다룬다.**
- 로컬에서 e2e를 돌리려면 `docker compose up -d` + `npm run migration:run`이 선행돼야 한다. 러너에서도 같은 순서가 필요하다.
- `.env.example`을 그대로 복사해도 기동된다(2026-09-08 수정). 러너의 env 준비가 그만큼 단순해졌다.

## 완료 조건

- Given `backend/**`를 바꾼 PR / When CI가 돌면 / Then **머지 전에** lint·build·유닛·e2e 결과가 PR에 보인다
- Given 같은 PR / When 워크플로 로그를 본다 / Then SG 개폐·SSH 단계는 실행되지 않는다
- Given 테스트가 실패하는 커밋이 `dev`에 머지된다 / When 배포 워크플로가 돌면 / Then **EC2에 배포되지 않고** 실패로 끝난다
- Given 테스트가 통과하는 커밋 / When 머지된다 / Then 종전과 같이 자동 배포되고 헬스 확인까지 간다
- Given e2e 실행 / When 로그를 본다 / Then **러너의 서비스 컨테이너** PostgreSQL에 붙고, 운영 DB·운영 시크릿을 쓰지 않는다

## 처리 기록

- **반영 날짜: 2026-09-09** — PR [#255](https://github.com/swm-runtime/ear_project/pull/255) (`ci(infra)/api-deploy-runs-tests`), 커밋 `ci(infra): run backend tests before deploying api to ec2`.

### 반영 내용

`deploy-api.yml`을 job 둘로 나눴다 — `verify`(검증) → `deploy`(배포, `needs: verify`).

- `verify`: `npm ci` → `.env.example` 복사 → `npm run lint` → `npm run build` → `npm test` → `npm run migration:run` → `npm run test:e2e`.
  - PostgreSQL은 러너의 **서비스 컨테이너**(`pgvector/pgvector:pg16`, `5433:5432`) — 로컬 `docker-compose.yml`과 같은 이미지·같은 포트라 `.env.example`의 `DB_HOST=localhost` `DB_PORT=5433`이 그대로 맞는다.
  - `CI_SSH_KEY_API` guard와 무관하게 항상 돈다(guard는 `deploy` job에만 남겼다).
- `deploy`: 단계(guard·OIDC·SG 개폐·`push.sh`·실패 로그·SG 폐쇄)는 **종전 그대로**다. `if: github.event_name != 'pull_request'`로 PR 이벤트에서만 건너뛴다 — `dev` push와 `workflow_dispatch`의 종전 동작은 유지된다.
- 트리거에 `pull_request` 추가(`paths`는 배포와 동일).
- `concurrency` group을 ref별로 갈랐다(`deploy-api-${{ github.event.pull_request.number || github.ref }}`) — `dev` push 배포는 종전대로 한 group에 직렬화되고, PR 검증이 배포 큐를 막지 않는다. `cancel-in-progress`는 PR 이벤트에서만 켠다(배포는 중간에 끊지 않는다).
- `id-token: write`를 top-level에서 **`deploy` job으로 내렸다.** 검증 job은 `contents: read`만 갖는다 — 테스트 코드가 OIDC 토큰을 발급받을 수 있는 자리를 없앤다.

### 러너 e2e env — 확인 결과

**`.env.example`을 그대로 복사하면 된다. 바꿔야 하는 값이 없었다.** 예제의 기본값이 이미 로컬 검증용이다 — `AUDIO_DELIVERY=local` · `MAIL_DELIVERY=logging` · `TRUST_PROXY_HOPS=0` · `PIPELINE_SSO_SECRET=`(비움 → 엔드포인트 비활성). 외부 자원(S3·CloudFront·SES)에 붙는 경로가 하나도 켜지지 않는다. 서비스 컨테이너의 `POSTGRES_USER/PASSWORD/DB`를 예제 기본값(`ear`/`change-me`/`runtime`)에 맞춰 두었으므로 env를 손댈 이유가 없다.

`pgvector` 이미지는 필수다 — 표준 `postgres` 이미지에는 vector 확장이 없어 `AddEmbeddingVectors` 마이그레이션이 실패한다(로컬 `docker-compose.yml` 주석과 같은 이유).

### 완료 조건 확인

| 완료 조건 | 결과 | 근거 |
|---|---|---|
| `backend/**` PR → 머지 전에 lint·build·유닛·e2e 결과가 보인다 | **확인** | PR #255의 `pull_request` 런에서 `verify` job 전 단계 success (run [34309194866](https://github.com/swm-runtime/ear_project/actions/runs/34309194866)). 유닛 **550건**·e2e **21건** 통과. `backend/**` 변경으로도 걸리는지는 아래 실패 실증 런(`backend/src/`에 임시 스펙 추가)에서 확인 |
| 같은 PR에서 SG 개폐·SSH 단계가 실행되지 않는다 | **확인** | 두 PR 런 모두 `배포 (EC2)` job이 `Skipped`. 런 로그 전체에 `authorize-security-group`·`ci_deploy_api`·`push.sh` 출현 0건 |
| 테스트가 실패하면 배포되지 않는다 | **확인(부분 실증)** | 임시로 실패하는 유닛 스펙을 `backend/src/`에 넣어 푸시 → run [34309425577](https://github.com/swm-runtime/ear_project/actions/runs/34309425577)에서 `verify` **failure**, `deploy` **skipped**, SG·SSH 흔적 0건. 임시 커밋은 되돌렸다. `dev` push에서의 배포 차단은 `needs: verify`가 같은 구조로 보장하지만, 운영 배포를 일부러 깨뜨리지 않고는 실증할 수 없어 **구조로만 확인**했다 |
| 테스트가 통과하면 종전과 같이 자동 배포된다 | **미실증(구조 확인)** | `deploy` job의 단계·조건·시크릿 사용이 종전과 동일하고 `needs: verify`만 앞에 붙었다. 실제 배포는 이 PR이 `dev`에 머지될 때 처음 돈다 — **머지 후 첫 런의 `deploy` job 성공과 헬스 확인을 반드시 확인할 것** |
| e2e가 서비스 컨테이너 PostgreSQL에 붙고 운영 DB·시크릿을 쓰지 않는다 | **확인** | `verify` job에 `services.postgres`만 있고 AWS 자격·시크릿을 참조하는 단계가 없다. env는 `.env.example` 복사본뿐. `synchronize: false`(`data-source.ts`)이므로 e2e 21건 통과 자체가 마이그레이션이 그 컨테이너에 적용됐다는 증거다 |

### 남는 것

- 티켓의 "유닛 542건"은 **550건**으로 늘었다(2026-09-09 기준). 수치를 문서에 박아두는 자리가 아니므로 별도 반영은 하지 않는다.
- `npm run lint`는 `--fix`가 붙어 있어 **자동 수정 가능한 위반을 고쳐 놓고 통과시킨다.** CI에서는 검사만 하는 편이 맞지만 `package.json`은 백엔드 파트 소유라 이 티켓에서 건드리지 않았다. 필요하면 별도 티켓으로 낸다.
- **브랜치 보호에 `verify`를 필수 체크로 걸어야** 검증 실패가 실제로 머지를 막는다. 지금은 PR에 빨간 X가 보일 뿐 머지 자체는 가능하다 — 저장소 설정이라 코드로 반영할 수 없다(infra 담당 확인 필요).
