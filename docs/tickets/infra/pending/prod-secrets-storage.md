# [INFRA] 운영 시크릿 보관 방식 — `.env.prod` 파일 유지 vs 시크릿 매니저 이전

| 항목 | 값 |
|---|---|
| 대상 | API EC2의 `/opt/ear/backend/.env.prod`에 있는 비밀값 보관 방식 — `JWT_SECRET` · `ARCHIVE_HASH_PEPPER` · `WITHDRAWAL_HASH_PEPPER` · `SLACK_ERROR_WEBHOOK_URL` · DB 비밀번호 등 |
| 요청 파트 | 백엔드 → 인프라 (상의 후 결정) |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | `tickets/backend/archive/api-server-deployment.md`를 닫으며 — 시크릿 조건("시크릿 매니저에만 있다")을 **현 시점 `.env.prod` 보관 합격으로 판정**해 닫았고, 이전 여부는 별건으로 분리했다 |
| 근거 문서 | `backend/architecture.md` 9.5(비밀 관리) · `backend/domain.md` 11.2(pepper 보관) · `docs/infra/inventory.md` · `docs/infra/runbook.md` 3장 |
| 심각도 | **하** — 현 상태도 저장소·코드·로그에는 값이 없고(전부 환경변수 주입) 파일은 EC2 안에서만 접근된다. 다만 아래 한계가 있어 개선 여부를 정할 필요가 있다 |
| 상태 | pending — infra 담당과 상의 대기 |

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
