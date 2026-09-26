# 부하 테스트 — k6

실서버(`api.earcast.co.kr`)에 사용자 여정 단위로 부하를 걸어 응답 시간·오류율·병목을 잰다.
여정은 `backend/test/*.e2e-spec.ts`의 시나리오에서 따왔다(정확성 검사가 아니라 흐름만 빌린다).

| 파일 | 용도 |
|---|---|
| `k6/scenarios/smoke.js` | 전 여정을 1명이 1회 — **부하 전에 반드시 통과** |
| `k6/scenarios/library-listen.js` | 청취 여정(목록 → 재생 → 위치 저장 × N → 완청). **핵심 부하** |
| `k6/scenarios/library-browse.js` | 둘러보기(탭·필터·페이지네이션·탐색·검색·프로필). 읽기 집중 |
| `k6/scenarios/library-delete-undo.js` | 삭제 → 실행 취소 |
| `k6/scenarios/paywall-limit.js` | 무료 한도 → 403 페이월, 재청취 창. 부하 아래 판정 정확성 |
| `k6/scenarios/library-listen-ramp.js` | 청취 여정을 계단식으로 올려 한계 지점 찾기(스트레스). `MAX_VUS`·`STEP`·`STEP_DURATION`·`HOLD`. 임계값을 어겨도 중단하지 않음 |
| `k6/scenarios/onboarding-signup-ramp.js` | **가입 몰림** — 온보딩 여정(상태·주제·관심사·커리어·추천·완료·첫 드립 폴링)을 **분당 가입 수**로 계단식 올림(`RATES`·`STEP_DURATION`·`PICKS`·`ACCOUNT_OFFSET`, `SMOKE=1`은 1명 1회). 계정은 `server/seed-signups.js`(온보딩 미완료)로 만들고 **한 계정은 한 번만** 쓴다 — 실행마다 `ACCOUNT_OFFSET`을 옮긴다 |
| `k6/lib/config.js` · `http.js` | 주소·토큰·임계값·HTTP 도우미 |
| `server/seed-users.js` · `seed-signups.js` · `issue-tokens.js` · `cleanup-users.js` | 계정 시드(온보딩 완료 / 미완료)·토큰 발급·정리(**실서버 api 컨테이너 안에서 실행**) |
| `out/` | 토큰 파일 등 산출물. gitignore — 비밀이다 |

## 원리 — 로그인 없이 계정만

- access 토큰은 **무상태**다(서명·만료·`typ`만 검사, `jwt-auth.guard.ts`). 서버와 같은 `JWT_SECRET`으로 직접 서명해 발급하므로
  로그인 API를 부르지 않는다 → 인증 라우트의 **IP당 분당 20회** 제한과 무관하게 한 PC에서 수백 계정을 쓴다.
- 일반 API는 **사용자당 분당 300회**다. 계정이 다르면 IP가 하나여도 각각 300회씩이다. 그래서 **계정 수 = 가상 사용자(VU) 수**로 맞춘다.
  계정 하나에 VU 여러 명을 태우면 429가 쏟아지고 라이브러리 상태도 서로 섞인다.
- 계정은 로그인이 아니라 **시드**로 만든다(`provider='loadtest'`). 관심 주제와 라이브러리 항목까지 넣어 실제 사용자와 같은 여정이 성립하게 한다.
- 오디오 서명 URL 발급은 사용자당 분당 30회 — 시나리오는 재생 1편에 1회만 부른다.

## 준비물

- k6 — `~/.local/bin/k6`(설치됨, 2026-09-11). 새로 깔려면 <https://github.com/grafana/k6/releases> 의 linux-amd64 tar.gz.
- 실서버 SSH(`~/.ssh/ear-prod-isb.pem`, 보안그룹 22번에 이 PC IP가 열려 있어야 한다).

## 절차

### 1. 실서버에 계정 시드 + 토큰 발급

```bash
HOST=ec2-43-203-57-240.ap-northeast-2.compute.amazonaws.com
scp -i ~/.ssh/ear-prod-isb.pem -r backend/load-test/server ec2-user@$HOST:/tmp/lt
ssh -i ~/.ssh/ear-prod-isb.pem ec2-user@$HOST
```

서버에서:

```bash
cd /opt/ear/backend
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C cp /tmp/lt api:/tmp/lt
# 스크립트가 /app 밖(/tmp)에 있어 NODE_PATH 로 이미지의 node_modules(pg·jsonwebtoken)를 가리켜야 한다
X="$C exec -T -e NODE_PATH=/app/node_modules api"
$X node /tmp/lt/seed-users.js --count 30 --tier pro   --items 4 > /dev/null   # 청취·둘러보기·삭제용
$X node /tmp/lt/seed-users.js --count 10 --tier light --items 4 > /dev/null   # 페이월용
$X node /tmp/lt/issue-tokens.js --ttl 3h > /tmp/tokens.json
```

PC에서:

```bash
scp -i ~/.ssh/ear-prod-isb.pem ec2-user@$HOST:/tmp/tokens.json backend/load-test/out/tokens.json
```

- `--items`는 사용자당 라이브러리 편 수. 실서버 발행 콘텐츠 수보다 클 수 없다. 페이월 시나리오는 (한도+1)편 이상 필요(light 한도 2 → 3 이상).
- `--ttl`은 테스트 총 길이보다 길게. 만료되면 전부 401이다.
- **토큰 파일은 실계정 권한 그 자체다.** 끝나면 지운다.

### 2. smoke — 스크립트가 실서버에 맞는지

```bash
cd backend/load-test
k6 run k6/scenarios/smoke.js
```

체크가 하나라도 실패하면 임계값이 아니라 여정(경로·필드·계정 상태) 문제다. 여기서 고친 뒤 부하로 간다.

### 3. 부하

```bash
# 핵심: 청취 여정 30명 5분 (pro 계정 30개 기준)
k6 run -e VUS=30 -e DURATION=5m k6/scenarios/library-listen.js

# 읽기: 둘러보기 30명 5분 — 청취와 동시에 띄워도 된다(쓰기 없음)
k6 run -e VUS=30 -e DURATION=5m k6/scenarios/library-browse.js

# 삭제·복구 10명 3분
k6 run -e VUS=10 -e DURATION=3m k6/scenarios/library-delete-undo.js

# 페이월 — light 계정 수만큼 1회씩. 한 계정은 서비스 날짜(04시 경계)당 한 번만 의미가 있다
k6 run k6/scenarios/paywall-limit.js

# 가입 몰림 — seed-signups.js 로 만든 계정 (분당 50→100→200→400, 단계 2분 = 계정 1,500개 소비)
k6 run -e RATES=50,100,200,400 -e STEP_DURATION=2m -e ACCOUNT_OFFSET=10 k6/scenarios/onboarding-signup-ramp.js
```

가입 몰림은 `ramping-arrival-rate`라 VU 가 아니라 **분당 도착 수**가 부하다. 첫 드립 편성(`POST /onboarding/complete` 뒤 백그라운드)이 무거운 지점이므로 서버 쪽에서 `first_drip_jobs` 상태 분포(`pending`·`queued`·`failed`)와 `completed_at - created_at` 을 같이 본다.

환경변수: `BASE_URL`(기본 실서버 · 로컬 `http://localhost:3000/api/v1`) · `VUS` · `DURATION` · `THINK_MIN/MAX`(화면 사이 대기 초) ·
`SAVE_INTERVAL_SEC`(위치 저장 주기, 기본 5 = 앱과 동일) · `SAVES_PER_PLAY`(재생 1편당 저장 횟수, 기본 6).

결과 저장: `k6 run --summary-export=out/listen-$(date +%m%d-%H%M).json …`.

### 4. 정리

서버에서:

```bash
$X node /tmp/lt/cleanup-users.js          # 대상 개수만 보여준다
$X node /tmp/lt/cleanup-users.js --yes    # provider='loadtest' 사용자 삭제(자식 행 CASCADE)
$C exec -T -u root api rm -rf /tmp/lt    # cp 로 넣은 파일은 root 소유라 -u root 가 필요하다
rm -rf /tmp/lt /tmp/tokens.json
```

PC에서 `rm backend/load-test/out/tokens.json`.

## 통과 기준 (초기값 — 팀 SLO 확정 시 `lib/config.js` 한 곳만 바꾼다)

| 지표 | 기준 |
|---|---|
| `http_req_failed` | < 1 % |
| `http_req_duration` | p95 < 500 ms · p99 < 1 s |
| 재생 시작 `POST /contents/:id/play` | p95 < 700 ms (트랜잭션: 판정·기록·전이·신호) |
| 위치 저장 `PUT /users/me/playback-progresses/:id` | p95 < 300 ms (가장 잦은 쓰기 — 병목 1순위 후보) |
| 탐색 피드 `GET /explore/feed` | p95 < 800 ms (가장 무거운 읽기) |
| `checks` | > 99 % |

PRD 7장의 성능 요구는 "재생 탭 후 2초 내 시작"뿐이다. 위 수치는 그것을 API 단위로 나눈 출발점이지 확정값이 아니다.

### 대시보드 · 연속 실행

- `K6_WEB_DASHBOARD=true`로 실행하면 `http://localhost:5665`에 실시간 그래프가 뜨고, `K6_WEB_DASHBOARD_EXPORT=<파일>.html`로 종료 시 보고서를 남긴다.
- **k6는 종료 후 요약·내보내기에 수 분을 쓰며 포트를 계속 잡는다.** 바로 다음 실행을 띄우면 대시보드가 "address already in use"로 조용히 빠진다 — 이전 프로세스 종료를 확인하거나 `K6_WEB_DASHBOARD_PORT`를 바꾼다(2026-09-16 실측).
- **api 컨테이너를 재생성할 때는 `API_IMAGE=$(cat .api-image)` 를 붙인다**(2026-09-23 실제 발생 — 안 붙이면 서버에 남은 옛 로컬 이미지로 바뀐다, `docs/infra/runbook.md` 4장). 재생성하면 컨테이너 안 `/tmp/lt` 가 사라지므로 `compose cp` 를 다시 한다.
- 개발계(`api-dev`)에서 돌릴 때: `plans`에는 마이그레이션이 만든 light 행만 있으므로 pro·daily 판정을 보려면 운영과 같은 행이 있어야 한다(2026-09-16 pro 행 추가됨). 정리 절차는 운영과 같다.

## 결과 읽을 때

- **`ear_rate_limited`(429)가 0이 아니면** 서버가 느린 게 아니라 레이트 리밋이 동작한 것이다. 계정 수·호출 빈도를 먼저 의심한다.
- **`ear_expected_denials`** 는 규칙대로 난 403(한도 소진)이다. 실패가 아니다.
- **`http_req_duration{name:…}`** 태그로 엔드포인트별 분포를 본다. uuid는 `:id`로 정규화돼 있다.
- 서버 쪽은 같은 시간대의 `docker compose … logs api`와 `GET /admin/system-stats`(CPU·메모리·DB 커넥션)를 같이 본다.
  실서버는 **t4g.small 한 대에 API+PostgreSQL**이라 DB 커넥션 풀·CPU가 먼저 찬다.

## 실서버에서 지킬 것

- 팀원 실사용이 적은 시간에, 시간을 정해 돌린다. stress(목표치 초과)는 로컬에서만.
- 시드는 운영 DB에 가짜 사용자·재생 기록을 남긴다. **끝나면 4번 정리를 반드시 한다.** 남기면 `content_stats` 인기 집계와 추천 신호가 오염된다.
- 시나리오는 재생·완청·삭제 같은 **쓰기를 실제로 한다.** 실계정 토큰을 넣고 돌리지 않는다.
- 첫 실행은 `VUS`를 작게(5) 시작해 429·오류가 없는지 본 뒤 올린다.
