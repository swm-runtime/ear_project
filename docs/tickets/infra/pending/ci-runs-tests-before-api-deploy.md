# [INFRA] API EC2 자동 배포가 테스트를 거치지 않는다 — 배포 전 검증 단계를 둔다

| 항목 | 값 |
|---|---|
| 대상 | `.github/workflows/deploy-api.yml` (API EC2 자동 배포) |
| 요청 파트 | 백엔드 → 인프라 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | 2026-09-08 백엔드 전수 점검 마무리 — e2e를 돌려 보니 **21건 중 15건이 이틀째 실패**하고 있었고, 그동안 dev는 계속 초록이었다 |
| 근거 문서 | `backend/convention.md` 7장(테스트) · `backend/deploy/aws/README.md` CI 장 · `docs/infra/runbook.md` |
| 심각도 | **중** — 지금도 깨진 코드가 운영에 그대로 나간다. 이번에는 테스트 픽스처만 깨져 사고로 이어지지 않았을 뿐이다 |
| 상태 | pending — **설계 확정**(러너 실행 · `pull_request` 트리거, 2026-09-08). 구현 대기 |

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
