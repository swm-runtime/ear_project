# [INFRA] 운영 API 무중단 배포 — 슬롯 2개 롤링(평시 1개 가동, 배포 때만 겹침) + 마이그레이션 분리

| 항목 | 값 |
|---|---|
| 대상 | `backend/docker-compose.prod.yml`(api 슬롯 2개) · `backend/deploy/caddy/Caddyfile`(업스트림 2개 + 헬스체크) · `backend/deploy/push.sh`(한쪽씩 교체, 마이그레이션 선행) · `backend/deploy/docker-entrypoint.sh`(`RUN_MIGRATIONS` 기본값) · `docs/infra/runbook.md` 4장(배포·롤백 절차) · `docs/backend/convention.md`(마이그레이션 호환 규칙 — changes/pending 경유) |
| 요청 파트 | 인프라 |
| 요청자 | 박준현(백엔드·인프라) |
| 담당 | 박준현 |
| Jira | [KAN-166](https://runtime364.atlassian.net/browse/KAN-166) |
| 발행 날짜 | 2026-10-09 |
| 시작 날짜 | 2026-10-09 |
| 기한 | 없음 (Lowest — 가장 나중. 아래 "착수 조건"이 충족될 때 집는다) |
| 선행 | 없음(티켓). 사람 손: 운영 api 컨테이너 **메모리 실사용 측정**(`docker stats` 또는 CWAgent) — 배포 겹침 때 두 배가 t4g.small(1.8GB, 스왑 없음)에 들어가는지. 상태: 미측정 |
| 근거 문서 | `infra/runbook.md` 4장(배포 흐름·롤백) · `backend/deploy/push.sh` · `features/common-error-handling.md`(5xx 지수 백오프 재시도) · 외부: Caddy `reverse_proxy`(lb_retries·health_uri) · Kamal 2 배포 모델(동일 패턴) |
| 중요도 | **Lowest** — 지금은 배포 끊김이 10초 안팎이고 앱이 5xx를 지수 백오프로 재시도해 체감이 작다. 사용자가 적은 시간대에 배포하면 피할 수 있다. 그 전제가 깨질 때 집는다 |
| 상태 | 대기 |

## 왜

운영 배포(`push.sh`)는 `docker compose up -d api`로 **api 컨테이너 하나를 교체**한다. 옛 컨테이너 종료 → 새 컨테이너 시작 → 엔트리포인트 마이그레이션 → Nest 부팅 → healthy까지 **약 10초** 동안 Caddy 뒤에 api가 없어 502가 난다. 앱은 5xx를 지수 백오프로 재시도하지만(`common-error-handling.md`), 그 순간의 로그인·재생 URL 발급은 실패할 수 있다.

지금은 사용자가 적은 시간대(심야·새벽)에 배포하면 되므로 급하지 않다. **사용자가 하루 종일 고르게 쓰게 되면 "조용한 시간대"가 사라져** 배포마다 누군가는 끊긴다 — 그때가 이 티켓의 착수 시점이다.

## 착수 조건 (하나라도 충족되면 집는다)

1. **조용한 시간대가 없다** — 최근 2주 운영 API 시간대별 요청 수(CloudWatch `/ear/caddy` 접근 로그 또는 Grafana)에서 **가장 조용한 1시간 구간의 요청 수가 피크 시간대의 20% 이상**이다. 즉 어느 시간에 배포해도 피크의 1/5 이상이 걸린다.
2. **배포 시간대를 고를 수 없다** — 긴급 수정(Highest·High 티켓)이 주 2회 이상 주간(09~24시 KST)에 배포되는 주가 2주 연속 나온다. 심야 배포를 기다릴 수 없는 수정이 일상이 됐다는 뜻이다.
3. **끊김이 실제로 보인다** — 배포 시각 ±1분에 Sentry(ear-app) 네트워크 오류 이벤트나 사용자 문의가 배포 2회 연속 확인된다.
4. 위 어느 것도 아니지만 **판단이 애매하면**(예: 조용한 구간이 피크의 10~20% 사이, 배포가 주간에 몰리기 시작) 주간 회고에서 올려 결정한다 — 애매함 자체를 착수 사유로 본다. 배포가 사용자를 끊는 횟수는 가입자가 늘수록 커지고, 이 작업은 사용자 수와 무관하게 반나절이다.

## 무엇을 한다

### 0. 마이그레이션을 컨테이너 부팅에서 뺀다 (착수 조건과 무관하게 먼저 해도 된다)

- `docker-entrypoint.sh`는 `RUN_MIGRATIONS` 기본값 `true`로 부팅마다 마이그레이션을 돈다. 슬롯이 둘이면 **두 컨테이너가 같은 DB에 동시에 마이그레이션**을 시도한다. api 서비스는 `RUN_MIGRATIONS=false`로 두고, `push.sh`가 교체 전에 `docker compose run --rm -e RUN_MIGRATIONS=true api npm run migration:run:prod`를 **한 번** 돌린다. 실패하면 거기서 멈춘다 — 돌던 컨테이너는 그대로 산다(지금 `set -e` 흐름과 같다).
- **마이그레이션 호환 규칙**을 `backend/convention.md`에 추가한다(changes/pending 경유): 새 마이그레이션은 **직전 배포의 코드와도 동작**해야 한다. 컬럼·테이블 삭제, NOT NULL 추가, 타입 변경은 두 배포에 나눈다(1차: 코드가 더 이상 쓰지 않게 → 2차: 삭제). 지금도 롤백(`runbook.md` 4장)이 같은 전제를 요구하므로 새 규칙이 아니라 명문화다.

### 1. 슬롯 2개 롤링

- `docker-compose.prod.yml`: `api` 하나를 `api-a`·`api-b` 둘로 선언한다(같은 이미지·env·로그 설정, `expose: 3000`, `container_name`·`ports` 없음). 평시에는 **한 슬롯만** 떠 있다(다른 슬롯은 `docker compose stop`).
- `Caddyfile`: `reverse_proxy api-a:3000 api-b:3000`에 능동 헬스체크(`health_uri /api/v1/health`, `health_interval 3s`, `health_timeout 2s`)와 재시도(`lb_try_duration 5s`, `lb_retries 3`)를 둔다. Caddy가 **두 슬롯을 이름으로 알아야** 한쪽이 내려갈 때 다른 쪽으로의 재시도가 보장된다(Docker DNS 한 이름에 맡기는 `docker rollout` 방식은 Caddy에서는 보장되지 않는다 — 2026-10-09 조사). 멈춰 있는 슬롯은 헬스 실패로 자동 제외된다.
- `push.sh`: 어느 슬롯이 가동 중인지 읽고(`docker compose ps`), **비어 있는 슬롯**에 새 이미지로 `up -d` → `/api/v1/health` 200 + Caddy 헬스 통과 대기 → 옛 슬롯 `stop`(SIGTERM — Nest `enableShutdownHooks`가 처리 중 요청을 비운다. `stop_grace_period` 20s) → 완료. 롤백은 멈춘 옛 슬롯을 다시 `start`하고 새 슬롯을 `stop`하면 끝(이미지가 그대로 남아 있다).
- 겹치는 동안(10~30초) 메모리가 두 배다. `CLUSTER_WORKERS` 기본값이 1이라 컨테이너당 Nest 프로세스 하나다 — 선행의 실측값으로 여유를 확인한다. 부족하면 겹침 전에 `docker image prune`·캐시 정리를 끼우거나 인스턴스를 t4g.medium으로 올리는 결정을 먼저 한다.
- `runbook.md` 4장의 배포·롤백 절차를 갱신한다(changes/pending 경유 — infra 문서는 이 티켓 담당이 소유하므로 직접 갱신해도 된다).

### 2. 개발계에서 먼저

- `dev` 머지 = 개발계 배포이므로, 개발계에 같은 구성을 올려 배포를 3회 이상 돌리며 `while true; do curl -s -o /dev/null -w '%{http_code}\n' https://api-dev…/api/v1/health; sleep 0.2; done`로 200이 끊기지 않는지 본다. 그다음 운영.

## 하지 않는 것

- 정통 blue/green(두 슬롯 상시 가동) — 평시 메모리 두 배. 지금 서버에 맞지 않는다.
- `docker rollout` 플러그인 — Caddy와의 궁합이 보장되지 않는다(위). Traefik 전환까지 하면 범위가 커진다.
- 서버 2대 + ALB, ECS — 무중단을 넘어 가용성 문제이고 월 비용이 붙는다. 서버 1대 장애를 걱정할 단계에 별도 티켓.

## 완료 조건

- Given 운영 api가 슬롯 A에서 가동 중 / When `push.sh`로 새 이미지를 배포한다 / Then 배포 중 0.2초 간격 헬스 폴링이 **한 번도 200 이외를 받지 않고**, 끝나면 슬롯 B만 가동 중이다
- Given 배포 직후 문제가 발견됐다 / When 롤백 절차(runbook 4장)를 따른다 / Then 이미지 빌드·pull 없이 1분 안에 옛 슬롯으로 돌아간다
- Given 새 이미지에 마이그레이션이 있다 / When 배포한다 / Then 마이그레이션은 컨테이너 교체 **전에 한 번** 돌고, 실패하면 교체 없이 멈춘다(돌던 슬롯 그대로)
- Given 개발계 / When 같은 절차로 3회 배포한다 / Then 위 조건이 3회 모두 성립한 뒤에만 운영에 적용한다
- `convention.md`에 마이그레이션 호환 규칙이, `runbook.md` 4장에 새 배포·롤백 절차가 반영돼 있다

## 처리 기록

- 2026-10-09 발행(마크다운 + Jira). 배경: 배포마다 10초 끊김 질문 → 방식 비교(blue/green·docker rollout·ALB·ECS·Kamal 조사) → "슬롯 2개, 평시 1개" 변형으로 결정. 중요도 Lowest, 착수 조건 명시.
