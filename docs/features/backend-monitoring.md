# 백엔드 모니터링 기능 명세서

> 등재 2026-09-06 — 구현(2026-09-04 로그 콘솔 · 09-06 자원/DB 확장·대시보드·자원 알림)이 먼저 있었고 문서가 뒤따른다. 어긋나면 이 문서를 기준으로 코드를 맞춘다.

## 1. 목적 & 연결

- **무엇**: 제품 API 서버(EC2)의 로그·에러·트래픽·자원·DB 부하를 **SSH 없이** 웹에서 보고, ERROR 발생을 Slack으로 받아보는 운영 도구.
- **왜**: 백엔드 EC2는 git이 아닌 파일 복사본으로 돌고 SSH 접근이 제한적이다. "서버에 들어가야 알 수 있는 상태"를 없애 장애 인지 시간을 줄인다.
- **어디에**: 파이프라인 웹(`admin.earcast.co.kr/backend-logs`) 안의 콘솔 4탭 + 워커의 Slack 알림 모듈. 제품 기능이 아니라 **운영 절차**이므로 사용자 화면·FR과 연결되지 않는다(비기능 요구 — 루트 PRD "운영 관측" 영역).
- **구현 위치**: 콘솔은 `pipeline/apps/web/app/backend-logs/*` + `app/api/backend-{logs,status,metrics}`, 알림은 `pipeline/apps/worker/src/log-watch.ts`(ERROR)와 백엔드 `resource-alert.service.ts`(자원 임계), 자원/DB 원천은 백엔드 `GET /admin/system-stats`(`admin-api.md` 4.9).

## 2. 진입 조건

- **콘솔 전체**: 파이프라인 웹 Supabase 로그인(팀원)이 필수다. 미로그인 요청은 모든 조회 라우트가 401로 거절한다.
- **자원·DB 탭 데이터**: 추가로 제품 서버의 관리자 판정을 거친다 — 웹 서버가 SSO 어서션(`EAR_SSO_SECRET`)으로 제품 토큰을 교환해 `GET /admin/system-stats`를 호출하며, **같은 이메일의 `role == 'admin'` 계정이 제품 DB에 있어야 한다**(`admin-api.md` 2장). 토큰은 서버에만 있고 브라우저로 나가지 않는다.
- Slack 알림은 사람의 진입이 없다 — 워커 기동 시 `SLACK_ERROR_WEBHOOK_URL`이 있으면 자동으로 켜진다.

## 3. 데이터 경로

```
백엔드 compose(awslogs 드라이버)
  → CloudWatch Logs  그룹 /ear/api · /ear/caddy  (스트림 api · caddy, 보관 7일)
      → 콘솔 조회 라우트 (AI 서버 EC2 인스턴스 롤 ear-logs-read — 키를 env에 두지 않는다)
      → 워커 log-watch (5분 틱, ERROR/FATAL → Slack)

백엔드 /proc · pg 통계 뷰
  → GET /admin/system-stats (관리자 가드, 읽기 전용)
      → 콘솔 자원·DB 카드 / 대시보드 게이지 (SSO 경유)
백엔드 /proc (자체 60초 틱)
  → resource-alert (CPU 70%·메모리 80% 임계) → Slack
```

- **콘솔은 자동 폴링하지 않는다** — 모든 탭이 "열 때 1회 + [새로고침]"이다(사용자 결정
  2026-09-06). 보고만 있어도 서버·CloudWatch를 계속 두드리는 부하를 만들지 않는다.
  지속 감시는 화면이 아니라 알림 모듈(log-watch·resource-alert)의 몫이다.

- 전 경로가 **읽기 전용**이다. 콘솔·알림 어디에도 서버 상태를 바꾸는 조작이 없다.
- 로그 원문에 무엇이 찍히는가는 이 기능의 소유가 아니다 — 토큰·이메일 원문·요청 바디 금지는 백엔드 로깅 규칙(`backend/convention.md`)이 소유한다.

### 3-1. Grafana Cloud 와의 병행 (2026-09-25 — KAN-97)

CloudWatch(EC2 지표·`/ear/api`·`/ear/caddy` 로그)·Sentry·합성 헬스체크는 **Grafana Cloud 대시보드 "ear 운영"** 에도 표시된다(`infra/inventory.md` Grafana Cloud 행). 코드 변경 없음 — 같은 원천을 두 화면이 읽는다.

- **콘솔은 그대로 유지한다.** 실시간 로그(5초 폴링)·에러 모아보기·서버 상태(`/admin/system-stats`)·요청 통계는 콘솔이 소유한다. Grafana 는 EC2·헬스체크·Sentry 를 함께 보는 상황판이다.
- **같은 값이 다르게 보일 때의 기준**: 요청 p50/p95 는 콘솔(로그 파싱)이 현재 기준이다. 백엔드가 `/metrics` 를 내보내는 2단계(KAN-98) 이후에는 Grafana 히스토그램이 기준이 되고 그때 이 절을 고친다.
- Grafana 알림(헬스체크 실패·TLS·CPU 70%·메모리 80%)은 Slack 에러 채널로 간다. 백엔드 `resource-alert` 의 CPU·메모리 Slack 경보와 임계가 겹치므로 몇 주 비교 뒤 하나로 정리한다(9장 미결).

### 3-2. 무엇이 돌고 있는가 — 배치·외부 연동 목록 (신설 2026-09-29)

배치와 외부 연동이 늘면서 문제가 된 것은 개수가 아니라 **한눈에 볼 곳이 없는 것**이었다(2026-09-29 — "웹훅이 비어 있나, GA4 키가 들어갔나"를 Secrets 를 뒤져 확인하는 데 반나절). 장애 때 "지금 뭐가 켜져 있지"에 답하는 데 걸리는 시간이 곧 복구 시간이므로 목록을 여기 둔다.

**배치** — 전부 API 프로세스 안에서 돈다. 클러스터(워커 여러 개)에서는 **스케줄러 워커 1개에서만** 돈다(`isSchedulerProcess` — `ScheduleModule` 이 그 프로세스에만 올라간다). 이름은 코드의 크론 등록명이고 기동 로그의 `crons=[…]` 에 그대로 찍힌다.

| 시각(KST) | 이름 | 무엇 | 실패하면 |
|---|---|---|---|
| 04:00 | `content-stat-aggregation` | 콘텐츠 통계(`content_stats`) 재집계 | 로그, 다음 날 재시도(재집계라 안전) |
| 04:10 | `content-license-expiry` | 라이선스 만료 콘텐츠를 `expired` 로 전환 + 라이브러리 잔존분 정리 | 로그, 다음 날 재시도 — 그 사이는 재생·발급 게이트의 만료 검사가 막는다 |
| 04:15 | `empty-topic-sweep` | 주제 노출 갱신 — 노출 가능 콘텐츠가 0건인 노출 주제를 숨긴다 | 로그, 다음 날 재시도 |
| 04:30 | `retention-purge` | 보존 기한 지난 데이터 삭제(`domain.md` 12.1) | 로그 — 테이블 하나가 실패해도 나머지는 계속 지운다 |
| 05:00 | `daily-drip-batch` | 드립 편성(`drip-scheduling.md`) | 로그 · `drip_batch_runs` 기록. 도중에 프로세스가 죽으면 재기동 시 이어받는다 |
| 10분마다 | `push-receipt-check` | 푸시 영수증(receipt) 회수 | 로그 — 실패분은 다음 주기에 다시 묻는다 |
| 17:00 | `daily-metrics` | 일일 지표 Slack 보고(GA4 + 서버 — 3-3) | 로그, 던지지 않음 |
| 60초마다 | 자원 경보(`setInterval` — 크론 아님) | CPU·메모리 표본 + Slack 경보(5장) | 로그. 표본은 모든 워커가 쌓고 **경보 발송만** 스케줄러 워커가 한다 |

- 04시대의 순서(집계 → 만료 → 주제 숨김 → 삭제 → 05:00 편성)는 서비스 날짜 경계(04:00) 뒤에 전날분을 확정하고 편성이 그 결과를 읽게 하려는 것이다.
- **크론이 아닌 주기 작업**(`@Interval`)도 같은 스케줄러 워커에서 돈다 — 첫 드립 재시도 큐 `first-drip-retry`(30초마다)와 정리 4종 `first-drip-purge` · `session-purge` · `idempotency-purge` · `email-verification-purge`(1시간마다). 실패는 로그 한 줄이고 다음 주기가 다시 시도한다. **이들은 기동 로그의 `crons=[…]` 에 나오지 않는다**(크론 등록분만 찍는다).
- 어느 배치도 예외를 밖으로 던지지 않는다 — 던지면 스케줄러가 멈추기 때문이다. 실패는 로그 한 줄로 끝나고, ERROR 로 남은 것은 Slack ERROR 감시(5장 `log-watch`)가 받는다.

**외부 연동**

| 연동 | 켜는 env | 꺼지면 |
|---|---|---|
| 소셜 로그인 카카오·구글·애플 | `KAKAO_APP_ID` · `GOOGLE_WEB_CLIENT_ID` · `APPLE_CLIENT_ID` · `APPLE_SERVICES_ID` — **필수** | 값이 없으면 env 검증에서 **기동이 실패한다**(조용히 꺼지지 않는다). 값이 틀리면 해당 제공자 로그인 불가 |
| 오디오 CDN | `AUDIO_DELIVERY=cloudfront` + `CLOUDFRONT_KEY_PAIR_ID` · `CLOUDFRONT_PRIVATE_KEY_BASE64` · `AUDIO_BUCKET` · `AWS_REGION` (`AUDIO_URL_BASE_URL` · `AUDIO_URL_SIGNING_KEY` 는 항상 필수) | `cloudfront` 모드에서 값이 빠지면 기동 실패. 값이 틀리면 재생 URL 발급 불가 |
| Sentry | `SENTRY_DSN` (+`SENTRY_ENVIRONMENT`) | 크래시 수집 안 됨 — 조용히 꺼짐 |
| Slack 경보·가입 알림 | `SLACK_ERROR_WEBHOOK_URL` (가입 알림·일일 보고는 `SLACK_SIGNUP_WEBHOOK_URL` 우선) | 조용히 꺼짐 |
| GA4 일일 보고 | `GA4_PROPERTY_ID` + `GA4_SERVICE_ACCOUNT_BASE64` (+ 위 웹훅) | 조용히 꺼짐 |

- **조용히 꺼지는 것은 아래 셋(Sentry·Slack·GA4)이다** — "env 가 있으면 켜짐"이라 빠져도 서버는 정상 기동한다. 그래서 기동 요약이 이 셋의 켜짐/꺼짐을 찍는다. 위 둘(소셜 로그인·오디오)은 빠지면 서버가 뜨지 않으므로 기동했다는 사실이 곧 확인이다.
- 푸시(Expo — `PUSH_DELIVERY=expo`)와 메일(SES — `MAIL_DELIVERY=ses`)은 발송 방식 값으로 켠다. 기본값은 로그만 남기는 쪽이고, 기동 요약에는 나오지 않는다.

**규칙**: 켜짐/꺼짐의 **런타임 진실은 기동 로그의 `features …` 한 줄**이다(백엔드 `startup-summary.ts`). 문서 표는 "무엇이 있는가", 로그는 "지금 이 서버에 무엇이 켜졌는가"다. 배포 뒤 확인은 그 줄로 한다:

```
[Startup] features env=production scheduler=yes sentry=on resource-alert=on signup-alert=on daily-metrics=on crons=[content-license-expiry,content-stat-aggregation,daily-drip-batch,daily-metrics,empty-topic-sweep,push-receipt-check,retention-purge]
```

- 값은 찍지 않는다 — 있는지 없는지만 찍는다. `env` 는 `SENTRY_ENVIRONMENT` 값이다.
- **프로세스마다 한 줄씩 나온다.** 스케줄러가 아닌 워커는 `scheduler=no … daily-metrics=off crons=[]` 로 찍힌다 — 고장이 아니다. `scheduler=yes` 인 줄이 정확히 하나 있는지를 본다.
- `resource-alert` 는 `SLACK_ERROR_WEBHOOK_URL`, `signup-alert` 는 두 웹훅 중 하나, `daily-metrics` 는 스케줄러 워커 + 웹훅 + GA4 두 값이 모두 있을 때 `on` 이다.

**판단**: 배치·연동 개수는 이 규모 제품에서 정상이다. 관리 가능 여부를 가르는 것은 개수가 아니라 **격리**(실패가 로그 한 줄로 끝나는가 — 이미 그렇다)와 **가시성**(이 절)이다. 트래픽이 늘면 다음 단계는 스케줄러를 별도 프로세스로 떼는 것이다 — 배치의 메모리·CPU 가 요청 응답과 한 프로세스에 있기 때문이다(2026-09-29 GA4 SDK +54MB 를 지연 로드로 피한 것이 첫 징후).

### 3-3. 일일 지표 보고 (신설 2026-09-29 — KAN-107 2단계)

제품 지표를 매일 한 번 Slack 에 올린다. 숫자의 정의와 출처는 이 절이 기준이다 — 채널의 숫자를 다음에 읽는 사람이 무엇인지 알 수 있어야 한다. 구현은 백엔드 `daily-metrics.scheduler.ts`(크론·게시) · `ga4.service.ts`(GA4 Data API) · `daily-metrics-db.service.ts`(서버 값) · `daily-metrics.format.ts`(문구).

| 항목 | 규칙 |
|---|---|
| 시각·대상 | 매일 **17:00 KST**, **어제** 하루치(오늘은 안 끝났고 GA4 당일 처리는 늦다). 수동 발송 `POST /admin/reports/daily-metrics` — 크론과 같은 본문을 지금 게시한다(202 로 바로 응답, 미설정이면 409 `ADMIN_REPORT_NOT_CONFIGURED`) |
| 채널 | 가입 알림과 같은 웹훅(`SLACK_SIGNUP_WEBHOOK_URL` → 없으면 `SLACK_ERROR_WEBHOOK_URL`). **운영만 켠다** — GA4 자격을 운영에만 넣는다. 자격이나 웹훅이 비면 조용히 건너뛴다. 운영이 아닌 환경에서 켜면 문구 앞에 `[환경명]` 이 붙는다 |
| 출처 | **GA4 운영 스트림**(`streamName` 이 `ear prod` 로 시작) + **서버**. 개발계 스트림은 걸러 테스트 트래픽이 섞이지 않는다 |
| 사용자 | 활성·신규·세션·평균 세션 길이·7일 활성 — GA4 `activeUsers` `newUsers` `sessions` `averageSessionDuration`. 7일 활성은 보고일을 포함한 최근 7일 창의 `activeUsers`. 활성·신규의 ▲▼ 는 전일 대비 |
| 획득 | **가입 = 서버** `users.created_at`(서비스 날짜 04시 경계) · 온보딩 완료 = GA4 `onboarding_complete` · 전환율 = 온보딩 완료 ÷ 가입(가입 0이면 적지 않는다) · 푸시 응답 = GA4 `push_permission` 건수(`result` 는 맞춤 측정기준 미등록이라 허용/거부 미분리) · **탈퇴 = GA4** `withdrawal`(서버는 행을 삭제해 흔적이 없다 — `domain.md` 12.3) |
| 재생 | 시작(건·사용자) `play_start` · **완청 = 서버** `library_items.status = completed` 의 `completed_at`(서비스 날짜) · 중도 이탈 `play_abandon` · 드립 재생 `drip_play` · 담기 `content_save` |
| 리텐션 | GA4 코호트(`firstSessionDate`). **D1** = `date-1` 에 처음 온 사용자 중 `date` 에 활성인 비율, **D7** = `date-7` 기준(`date` = 보고 대상일 — 둘 다 완결된 하루를 측정일로 둔다). 표본(코호트 크기)을 함께 적고, **코호트가 비면 `—`(표본 없음), 아무도 안 돌아오면 0%** — 다른 사실이다 |
| 경계 | GA4 는 KST 달력일(00시), 서버 값은 서비스 날짜(04시). 4시간 어긋남을 문구 각주로 밝힌다 |
| 실패 | 던지지 않고 로그만 남긴다 — 던지면 스케줄러가 멈춰 다음 날도 오지 않는다. 그 회차 보고는 오지 않으며, 필요하면 같은 날 수동 발송으로 다시 올린다 |

- 문구는 퍼널 순서 4묶음(사용자 → 획득 → 재생 → 리텐션)이다. 이벤트 이름은 `analytics.md` 3.4 를 그대로 쓴다.
- **가입·완청 두 건수만 서버 값인 이유**: GA4 이벤트는 그 이벤트가 실린 빌드(runtime 7 이후)에서만 들어와 스토어 1.0.0 사용자를 놓친다. 가입은 반드시 서버를 거치고 완청은 서버가 판정하므로 앱 버전과 무관하게 정확하다(`analytics.md` 1장).
- GA4 SDK 는 **실행 시점에 지연 로드한다** — require 만으로 메모리가 54MB 늘어(2026-09-29 실측) 하루 한 번 도는 일에 모든 워커가 상시 내줄 비용이 아니다. 스케줄러 워커가 첫 실행 뒤에만 들고 있는다.

## 4. 구성 — 콘솔 6탭

| 탭 | 경로 | 내용 |
|---|---|---|
| 실시간 로그 | `/backend-logs` | api·caddy 스트림 꼬리(tail). 창 기본 60분(최대 7일), 기본 300줄(최대 1,000줄). ANSI 색 코드는 지우고 표시 |
| 요청 통계 | `/backend-logs/traffic` | api 로그의 요청 완료 라인을 파싱해 경로별 건수·오류·소요 요약. **불러온 창 안의 근사치**이며 전 기간 통계가 아니다. 한 번에 최대 1,500**건**을 모은다(줄이 아니다 — 요청 1건이 9~11줄이라 줄 수는 표본 수의 대용이 되지 못한다) |
| 에러 모아보기 | `/backend-logs/errors` | ERROR(선택 시 WARN 포함)만 서버 필터로 걷어 **가변값(숫자·id)을 지운 시그니처**로 묶는다. 건수·최근 발생 순. 원문은 실시간 로그에서 |
| 서버 상태 | `/backend-logs/status` | ① health 핑(타임아웃 4초) ② 로그 파이프 생존(마지막 이벤트 시각) ③ 최근 1시간 ERROR 수(상한 500) ④ 자원·DB 부하(CPU·load·메모리·연결·캐시 적중률·진행 중 쿼리) |
| 대시보드 | `/backend-logs/dashboard` | 시간축 그래프 — 버킷별 요청 수(오류 적층) + **응답시간 산점도**(개정 2026-09-09: 요청 1건 = 점 1개, 정상은 브랜드색·4xx/5xx는 빨강. **y축은 로그 축**(1·10·100·1,000ms) — 응답시간은 배수로 읽는 지표이고 10ms대와 300ms대가 선형 축에서는 빠른 쪽이 바닥에 뭉갠다. 호버는 가장 가까운 요청 하나의 시각·소요·메서드·경로·status. **백분위는 차트가 아니라 카드 부제에 창 전체 기준 p50·p95·최대로** 적는다 — 백분위는 버킷을 합칠 수 없어 칸 폭이 바뀌면 같은 시각의 값이 통째로 달라지기 때문이다. 트래픽이 칸당 수십 건 규모가 되면 히스토그램 기반 백분위·히트맵으로 바꾼다) + **자원 이력 선 그래프**(CPU·메모리 %, DB 연결 수 — 서버의 60초 샘플 링 버퍼 최대 6시간, 재기동 시 초기화). 전 그래프 호버 툴팁·축 눈금. 요청 로그는 **건수 기준**으로 모은다 — 목표 1,500건을 채울 때까지 CloudWatch를 과거로 넘기고(최대 6회), 헬스체크는 건수를 세기 전에 제외한다. 못 채우면 창의 앞부분이 빠지며 [요청 수] 카드가 어디부터 그렸는지 밝힌다 |
| 검색 로그 | `/backend-logs/search` | **다른 탭과 달리 CloudWatch가 아니라 제품 API의 DB를 읽는다**(`GET /admin/search-query-logs/summary` — `admin-api.md` 4.21, 실배포·개발계 토글). 검색 질의 로그(`domain.md` 5.7)의 미스율(0건 비율)·질의별 반응 수(10분 안 재생·담기 — 서버가 역산, 비율로는 안 만든다)·일별 추이·0건 질의·많이 찾은 질의. 창 7·14·30·90일. 매칭 방식(`explore.md` 4.5-5) 재검토의 근거 화면 (신설 2026-10-01) |

## 5. 판정 규칙

- **로그 파이프 생존 주의**: api 스트림이 **30분** 넘게 조용하면 주의(호박색) — api는 요청마다 찍히므로 장시간 무소식은 파이프 단절 신호다. 그룹이 없으면 "전환 전/권한 없음"으로 구분 표시한다.
- **자원 주의/경고 임계** (콘솔 표시색): CPU 70%/90% · 메모리 80%/92% · DB 연결 60%/80%(max 대비) · 캐시 적중률 95% 미만 주의 · 진행 중 쿼리 1초/5초.
- **자원 임계 Slack 알림** (백엔드 `resource-alert.service.ts`): 60초 틱으로 /proc과 접속 수(pg_stat_activity count 1회)를 읽고, 샘플을 이력 버퍼에 쌓는다(알림 여부와 무관하게 항상). **CPU 70%·메모리 80%** 를 **3틱(≈3분) 연속** 넘겨야 발보한다 — 순간 스파이크 오탐 방지. 지속 중 재알림은 30분에 한 번, 3틱 연속 정상 복귀 시 해제 알림 1회. `SLACK_ERROR_WEBHOOK_URL`(백엔드 .env.prod)이 없으면 꺼진다. 격리 원칙은 log-watch와 동일(자체 타이머 unref·전부 try/catch).
- **Slack 알림 판정** (`log-watch.ts`): 5분 틱마다 `/ear/api`의 **새** ERROR/FATAL만. 같은 유형(가변값 지운 시그니처)은 틱당 한 줄로 묶고 메시지당 최대 8유형 — 에러 폭풍이 Slack 도배가 되지 않게. 워커 재시작 시 시작 시점 이후만 본다(과거분 재알림 없음 — 놓친 창은 에러 모아보기에서).
- 임계값은 전부 **표시용 근사**다. 자동 조치(스케일링·재시작)를 트리거하지 않는다 — 판단과 조치는 사람이 한다.

## 6. 격리 원칙 (Slack 알림)

`log-watch`는 워커 본 기능(작업 큐)과 완전히 분리된 부가 모듈이다 — **이 모듈이 어떤 상태여도 파이프라인 작업 처리는 영향받지 않는다**:

- 자체 `setInterval`(unref)로 돌아 `--once`·`--drain` 종료를 붙잡지 않는다.
- 모든 실행이 try/catch 안 — CloudWatch·Slack 장애는 로그 한 줄로 끝난다.
- `SLACK_ERROR_WEBHOOK_URL`이 없으면(노트북 워커) 타이머 자체를 만들지 않는다 — 서버 env.prod에만 넣는다.

## 7. 예외 상황

| 상황 | 동작 |
|---|---|
| CloudWatch 권한 없음·그룹 없음 | 해당 카드/목록이 "조회 불가/전환 전"으로 표시, 나머지는 정상 동작 |
| 제품 서버에 system-stats 미배포 | 자원·DB 섹션만 "아직 배포되지 않았습니다" 안내(503), 기존 카드는 유지 |
| SSO 교환 실패(관리자 계정 없음) | 자원·DB 섹션에 실패 사유 표시 — 콘솔 접근 자체는 막지 않는다 |
| Slack webhook 장애 | 해당 틱 알림 유실, 다음 틱 재시도. 워커 작업 처리 무영향 |
| 개발 환경(AWS 없음) | `BACKEND_LOGS_STUB=1`로 스텁 데이터 표시 — **운영 빌드에서는 절대 켜지지 않는다** |

## 8. 완료 조건

- Given 팀원이 Supabase 로그인 / When 실시간 로그 탭 진입 / Then api·caddy 로그 꼬리가 SSH 없이 보인다
- Given 미로그인 사용자 / When 조회 라우트 직접 호출 / Then 401로 거절된다
- Given 백엔드에 ERROR 발생 / When 5분 틱 도래 / Then Slack에 유형 요약 + 콘솔 링크가 1회 온다 (같은 유형 반복은 묶인다)
- Given 자원·DB 탭 / When 제품 서버가 system-stats를 서비스 중 / Then CPU·메모리·DB 연결·진행 중 쿼리가 열 때 1회 표시되고 [새로고침]으로 갱신된다(자동 폴링 없음 — 3장)
- Given log-watch의 어떤 실패 / When 워커가 작업을 처리 중 / Then 작업 처리·종료 동작에 영향이 없다

## 9. 미결 사항

- **보관 7일 초과 검색 없음** — CloudWatch 보관을 늘리거나 S3 아카이브를 붙일지 미정(비용 대비 필요 불명).
- ~~메모리·디스크의 CloudWatch 지표화~~ — **해소**(2026-09-11 CloudWatch Agent `CWAgent` 네임스페이스, `infra/inventory.md`).
- **자체 CPU·메모리 Slack 경보와 Grafana Alerting 의 중복** — 임계(70/80)는 같고 지속 조건(3틱 vs 5분)이 다르다. 비교 기간 뒤 하나로 정리(2026-09-25).
- **콘솔 서버 상태·요청 통계 탭의 존속** — 2단계(KAN-98, 백엔드 `/metrics`) 이후 재검토. 지금은 유지(결정 2026-09-25).
- **알림 채널·임계 설정 UI 없음** — webhook 주소·틱 주기는 서버 env로만 바꾼다.
- caddy 로그 기반 트래픽 통계(현재는 api 로그 파싱)로의 승격 여부.
