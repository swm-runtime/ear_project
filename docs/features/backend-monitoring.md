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
| 04:45 | `subscription-reconcile` | 구독 만료 보정(만료일이 지났는데 유효로 남은 구독을 스토어 상태로 맞춘다 — `subscription-api.md` 4.2) + 버려진 결제 의도 정리(30일, `domain.md` 8.3) (신설 2026-10-02) | 로그, 다음 날 재시도 — 스토어에 물을 수 없으면 저장된 상태를 그대로 둔다(추측으로 강등하지 않는다) |
| 05:00 | `daily-drip-batch` | 드립 편성(`drip-scheduling.md`) | 로그 · `drip_batch_runs` 기록. 도중에 프로세스가 죽으면 재기동 시 이어받는다 |
| 10분마다 | `push-receipt-check` | 푸시 영수증(receipt) 회수 → 무효 토큰 정리. **마지막 활성 토큰이 죽은 iOS 사용자는 앱 삭제 추정으로 Slack**(3-5, 2026-10-06) | 로그 — 실패분은 다음 주기에 다시 묻는다 |
| 17:00 | `daily-metrics` | 일일 지표 Slack 보고(GA4 + 서버 — 3-3) | 로그, 던지지 않음 |
| 15분마다 | `store-review-poll` | App Store·Google Play 새 리뷰·수정 리뷰를 Slack 한 메시지로(KAN-133 VoC — `store_reviews`에 알린 것을 기록). 리뷰어 닉네임은 어디에도 싣지 않는다 | 로그, 다음 주기 재시도 — 보냈을 때만 기록하므로 웹훅이 죽은 주기의 리뷰는 다음 주기에 다시 고른다. **Play 는 최근 1주일치만 돌아와** 7일 넘게 멈추면 그 사이 리뷰는 복구되지 않는다 |
| 15분마다 | `app-remove-poll` | GA4 실시간 `app_remove`(Firebase 가 Android 에서 자동 수집하는 앱 삭제)를 읽어 새로 도착한 건수를 Slack 한 줄로(3-4). 운영 스트림만, 신원 값 없음 | 로그, 다음 주기 — "마지막으로 집계한 분"이 그대로라 30분 창 안이면 다시 본다. 재배포 뒤 첫 주기는 창을 전부 집계해 한 번 중복될 수 있다 |
| 60초마다 | 자원 경보(`setInterval` — 크론 아님) | CPU·메모리 표본 + Slack 경보(5장) | 로그. 표본은 모든 워커가 쌓고 **경보 발송만** 스케줄러 워커가 한다 |

- 04시대의 순서(집계 → 만료 → 주제 숨김 → 삭제 → 구독 보정 → 05:00 편성)는 서비스 날짜 경계(04:00) 뒤에 전날분을 확정하고 편성이 그 결과를 읽게 하려는 것이다.
- **크론이 아닌 주기 작업**(`@Interval`)도 같은 스케줄러 워커에서 돈다 — 첫 드립 재시도 큐 `first-drip-retry`(30초마다)와 정리 4종 `first-drip-purge` · `session-purge` · `idempotency-purge` · `email-verification-purge`(1시간마다). 실패는 로그 한 줄이고 다음 주기가 다시 시도한다. **이들은 기동 로그의 `crons=[…]` 에 나오지 않는다**(크론 등록분만 찍는다).
- 어느 배치도 예외를 밖으로 던지지 않는다 — 던지면 스케줄러가 멈추기 때문이다. 실패는 로그 한 줄로 끝나고, ERROR 로 남은 것은 Slack ERROR 감시(5장 `log-watch`)가 받는다.

**외부 연동**

| 연동 | 켜는 env | 꺼지면 |
|---|---|---|
| 소셜 로그인 카카오·구글·애플 | `KAKAO_APP_ID` · `GOOGLE_WEB_CLIENT_ID` · `APPLE_CLIENT_ID` · `APPLE_SERVICES_ID` — **필수** | 값이 없으면 env 검증에서 **기동이 실패한다**(조용히 꺼지지 않는다). 값이 틀리면 해당 제공자 로그인 불가 |
| 오디오 CDN | `AUDIO_DELIVERY=cloudfront` + `CLOUDFRONT_KEY_PAIR_ID` · `CLOUDFRONT_PRIVATE_KEY_BASE64` · `AUDIO_BUCKET` · `AWS_REGION` (`AUDIO_URL_BASE_URL` · `AUDIO_URL_SIGNING_KEY` 는 항상 필수) | `cloudfront` 모드에서 값이 빠지면 기동 실패. 값이 틀리면 재생 URL 발급 불가 |
| Sentry | `SENTRY_DSN` (+`SENTRY_ENVIRONMENT`) | 크래시 수집 안 됨 — 조용히 꺼짐 |
| Slack 경보·가입 알림·**탈퇴 알림**(2026-10-06 — 사유 코드·직접 입력 사유·가입 N일차·결제 이력 여부, 신원 값 없음)·**스토어 리뷰**·**앱 삭제**(3-4 GA4 · 3-5 iOS 추정)·**결제 실패**(3-6) | `SLACK_ERROR_WEBHOOK_URL` (가입·탈퇴 알림·리뷰·일일 보고는 `SLACK_SIGNUP_WEBHOOK_URL` 우선) — 전송은 `modules/alert` 의 `SlackAlertService` 한 곳 | 조용히 꺼짐 |
| App Store Connect API(리뷰 조회 — KAN-133) | `APP_STORE_CONNECT_ISSUER_ID` · `APP_STORE_CONNECT_KEY_ID` · `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`(**팀 키** — 결제용 In-App Purchase 키와 다르다) + `APP_STORE_APP_APPLE_ID` | 그 스토어만 조용히 꺼짐 |
| Google Play Developer API(리뷰 조회 — KAN-133) | 결제용 `GOOGLE_PLAY_PACKAGE_NAME` · `GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64` 재사용(Play Console 에서 서비스 계정에 리뷰 권한 추가) | 그 스토어만 조용히 꺼짐 |
| GA4 일일 보고 · **앱 삭제 알림**(3-4, 2026-10-06) | `GA4_PROPERTY_ID` + `GA4_SERVICE_ACCOUNT_BASE64` (+ 위 웹훅) — 같은 자격을 두 기능이 쓴다 | 조용히 꺼짐 |

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
| 시각·대상 | 매일 **17:00 KST**, **어제** 하루치(오늘은 안 끝났고 GA4 당일 처리는 늦다). **크론으로만 나간다** — 수동 발송 엔드포인트는 없앴다(2026-10-02, `admin-api.md` 4.20) |
| 채널 | 가입 알림과 같은 웹훅(`SLACK_SIGNUP_WEBHOOK_URL` → 없으면 `SLACK_ERROR_WEBHOOK_URL`). **운영만 켠다** — GA4 자격을 운영에만 넣는다. 자격이나 웹훅이 비면 조용히 건너뛴다. 운영이 아닌 환경에서 켜면 문구 앞에 `[환경명]` 이 붙는다 |
| 출처 | **GA4 운영 스트림**(`streamName` 이 `ear prod` 로 시작). 개발계 스트림은 걸러 테스트 트래픽이 섞이지 않는다. **서버 값은 가입 대조 하나뿐이다**(개정 2026-10-02 — 아래) |
| 사용자 | 활성·신규·세션·평균 세션 길이·7일 활성 — GA4 `activeUsers` `newUsers` `sessions` `averageSessionDuration`. 7일 활성은 보고일을 포함한 최근 7일 창의 `activeUsers`. 활성·신규의 ▲▼ 는 전일 대비 |
| 획득 | **가입 = GA4** `sign_up`(온보딩을 끝내지 않은 사용자의 로그인 세션 시작 — `analytics.md` 3.4). 서버 `users.created_at`(서비스 날짜 04시 경계) 건수와 **다를 때만** 괄호로 함께 적는다 — `가입 11 (서버 10)` · 온보딩 완료 = GA4 `onboarding_complete` · 전환율 = 온보딩 완료 ÷ 가입(둘 다 GA4. 가입 0이면 적지 않는다) · 푸시 응답 = GA4 `push_permission` 건수(`result` 는 맞춤 측정기준 미등록이라 허용/거부 미분리) · **탈퇴 = GA4** `withdrawal`(서버는 행을 삭제해 흔적이 없다 — `domain.md` 12.3) |
| 재생 | 시작(건·사용자) `play_start` · **완청 = GA4** `play_complete`(재생이 끝에 닿은 횟수 — 재청취도 세고, 서버의 90% 완청 판정과는 다른 값이다) · 중도 이탈 `play_abandon` · 드립 재생 `drip_play` · 담기 `content_save` |
| 리텐션 | GA4 코호트(`firstSessionDate`). **D1** = `date-1` 에 처음 온 사용자 중 `date` 에 활성인 비율, **D7** = `date-7` 기준(`date` = 보고 대상일 — 둘 다 완결된 하루를 측정일로 둔다). 표본(코호트 크기)을 함께 적고, **코호트가 비면 `—`(표본 없음), 아무도 안 돌아오면 0%** — 다른 사실이다 |
| 경계 | GA4 는 KST 달력일(00시). 괄호의 서버 가입 값만 서비스 날짜(04시)다 — 문구 각주로 밝힌다 |
| 실패 | 던지지 않고 로그만 남긴다 — 던지면 스케줄러가 멈춰 다음 날도 오지 않는다. 그 회차 보고는 오지 않는다 — 다시 올리는 길은 없고 다음 날 보고를 기다린다(수동 발송 삭제 2026-10-02) |

- 문구는 퍼널 순서 4묶음(사용자 → 획득 → 재생 → 리텐션)이다. 이벤트 이름은 `analytics.md` 3.4 를 그대로 쓴다.
- **가입·완청도 GA4 값이다**(개정 2026-10-02). 종전에는 두 건수만 서버 값이었다 — GA4 이벤트가 그 이벤트가 실린 빌드(runtime 7 이후)에서만 들어와 스토어 1.0.0 사용자를 놓쳤기 때문이다. 운영 iOS 가 1.1.0 으로 넘어가 그 이유가 사라졌고, 서버 값을 섞으면 한 줄 안에서 모수와 날짜 경계가 갈려(시작·이탈은 GA4 00시, 완청은 서버 04시·첫 완청만) "시작 25인데 완청 7 + 이탈 14 = 21"처럼 읽을 수 없는 줄이 됐다.
  - **가입만 서버 값과 대조한다.** GA4 `sign_up` 은 "가입"이 아니라 "온보딩 미완료 사용자의 로그인"이라, 가입 뒤 온보딩을 미루고 다시 로그인하면 또 센다. 서버 건수와 다르면 괄호로 드러내 숫자를 믿을 수 있는지 보이게 한다. 같으면 한 숫자만 적는다.
  - 완청은 대조하지 않는다 — 정의가 달라(GA4 는 끝에 닿은 횟수, 서버는 90% 를 처음 넘긴 콘텐츠 수) 어긋나는 것이 정상이다.
- GA4 SDK 는 **실행 시점에 지연 로드한다** — require 만으로 메모리가 54MB 늘어(2026-09-29 실측) 하루 한 번 도는 일에 모든 워커가 상시 내줄 비용이 아니다. 스케줄러 워커가 첫 실행 뒤에만 들고 있는다.

### 3-4. 앱 삭제 알림 (신설 2026-10-06)

탈퇴 버튼을 누르지 않고 앱만 지우는 **준탈퇴**를 그날 안에 본다. 가입·탈퇴 알림과 같은 채널에 한 줄로 온다.

| 항목 | 규칙 |
|---|---|
| 출처 | **GA4 `app_remove`** — Firebase 가 **Android 에서 자동 수집**하는 삭제 이벤트(Play 서비스가 올린다. 우리가 심은 이벤트가 아니다). **iOS 는 없다** — Apple 이 삭제를 알려 주지 않는다. iOS 의 유일한 신호는 푸시 토큰 무효화(`device_tokens.invalidated_at` — `push-receipt-check`)다 |
| 주기·창 | **15분마다** GA4 Data API **실시간 보고**(REST `runRealtimeReport`)로 최근 30분을 분 단위(`minutesAgo` × `platform`)로 읽는다. 일일 보고의 gRPC SDK 는 쓰지 않는다 — 54MB 를 상주시킬 일이 아니다. 인증은 같은 서비스 계정(`GA4_SERVICE_ACCOUNT_BASE64`)의 JWT |
| 중복 방지 | 실시간 보고는 매번 30분을 통째로 주므로 **"마지막으로 집계한 분"**(epoch 분)을 메모리에 들고 그보다 새 분만 더한다. 막 도착한 분(3분 안)은 아직 채워지는 중일 수 있어 다음 주기로 미룬다. 재배포 뒤 첫 주기는 보이는 창을 전부 집계한다 — 직전 프로세스가 알린 분이 섞여 **한 번 중복될 수 있다**(놓치는 것보다 낫다) |
| 문구 | `:wastebasket: 앱 삭제 N건 · Android · HH:mm~HH:mm KST (GA4 app_remove)` — 시각은 GA4 **도착** 분이다(삭제 시각이 아니다. Play 서비스가 올리기까지 늦을 수 있다). 플랫폼이 둘 이상이면 `Android 2 · iOS 1`. **누가 지웠는지는 싣지 않는다** — 실시간 보고에 사용자 식별자가 없고, 있어도 Slack 에는 신원 값을 쓰지 않는다 |
| 켜짐 | GA4 자격(`GA4_PROPERTY_ID` · `GA4_SERVICE_ACCOUNT_BASE64`) + 웹훅이 있을 때, 스케줄러 프로세스에서만. 기동 로그 `app-remove-alert=on` |
| 한계 | Play 서비스가 없는 기기·오프라인으로 지운 기기는 빠지거나 늦는다. 기기 기준이라 한 사람이 두 기기에서 지우면 2건이다. "누가"가 필요하면 GA4 탐색 분석에서 `app_remove` × `user_id`(앱이 로그인 시 해시를 설정한다 — `analytics.md`) 로 본다 |

### 3-5. iOS 앱 삭제 추정 알림 (신설 2026-10-06)

Apple 은 삭제 이벤트를 주지 않는다(3-4 는 Android 만). iOS 의 유일한 신호는 **푸시 토큰 무효화**다 — 앱을 지우면 APNs 가 그 토큰을 거부하고, 드립 알림 발송의 ticket(즉시) 또는 receipt(10분 뒤 회수)에 `DeviceNotRegistered`로 돌아와 `device_tokens.invalidated_at`이 찍힌다.

| 항목 | 규칙 |
|---|---|
| 판정 | 토큰을 무효화한 직후, **그 사용자의 활성 기기(토큰 있음·무효화 안 됨)가 0이 되면** 앱 삭제로 **추정**한다. 다른 기기가 살아 있으면 기기 하나만 지운 것이라 알리지 않는다. 사용자당 한 번(같은 주기에 토큰 둘이 죽어도 1) |
| 왜 추정인가 | 기기 변경·초기화도 같은 신호다 — 새 기기로 다시 들어오면 토큰이 다시 등록된다. **알림 권한을 끈 사용자는 토큰이 없어 잡히지 않는다.** 전원을 잡으려면 권한 없이도 받는 무음 푸시가 필요한데, 그건 FE 가 권한 없이 토큰을 얻는지에 달렸다(미결) |
| 시점 | 드립 알림을 보내는 05:00 직후(ticket 단계)와 그 뒤 10분 주기 영수증 회수에서 — 즉 **삭제 다음 날 아침**에 안다. 삭제 즉시가 아니다 |
| 문구 | `:iphone: 앱 삭제 추정 N건 · iOS · 푸시 토큰 무효화(활성 기기 0) · MM. DD. HH:mm` — 가입·탈퇴 알림과 같은 채널. **Android 는 Slack 에 올리지 않는다**(3-4 GA4 `app_remove`가 삭제를 정확히 세고 있어 같은 삭제가 두 번 울린다) — 로그(`uninstall estimated from invalidated push tokens`)에만 플랫폼별 건수를 남긴다. 사용자 식별자는 싣지 않는다 |
| 구현 | `notification/services/uninstall-alert.service.ts` — `DeviceTokenService.invalidateDeliveredTokensDetailed`(무효화한 행의 사용자·플랫폼, RETURNING) → `countActiveByUserIds` → Slack. 던지지 않는다 — 알림 실패가 발송·정리 흐름을 깨지 않는다 |
| 추가 설정 | 없음 — 기존 웹훅이 있으면 켜진다 |

### 3-6. 결제·스토어 알림 실패 Slack (신설 2026-10-06 — KAN-132)

결제 경로의 실패는 전부 `warn` 로그라 ERROR 감시(`log-watch`)에 걸리지 않았다. 셋은 사람이 봐야 해서 `billing/services/billing-alert.service.ts`가 Slack 으로 올린다(가입·탈퇴 알림과 같은 채널).

| 알림 | 언제 | 문구 |
|---|---|---|
| 결제 검증 거부 | 구매 제출·복원의 영수증(JWS)·구매 토큰이 거부됨(`SUBSCRIPTION_RECEIPT_INVALID`) — 사용자가 돈을 냈는데 권한을 못 받았을 수 있다. 설정 오류(번들 ID·키)면 전원이 막힌다 | `:credit_card: 결제 검증 거부 · App Store · <사유>` |
| 스토어 알림 거부 | App Store S2S·Play RTDN 의 서명·OIDC 검증 실패 — 환불·갱신이 반영되지 않는다 | `:warning: 스토어 알림 거부 · Google Play · <kind>: <사유>` |
| 구독 보정 실패 | 04:45 `subscription-reconcile`이 작업 중단됐거나 구독 1건을 스토어에 묻지 못함 | `:hourglass: 구독 보정 실패 · <내용>` |

- **종류·스토어별 10분 창에 한 번만** 보낸다 — 위조 시도나 잘못된 클라이언트가 같은 거부를 수십 번 만들 수 있다. 창 안의 나머지는 건수만 로그(`billing alert suppressed within window`)로 남기고, 창이 지나 다음 알림이 나갈 때 "직전 10분 N건 더 있었음"을 덧붙인다.
- 사유는 내부 코드 문자열이다. 사용자·거래·토큰 식별자는 싣지 않는다. 받으면 할 일은 `infra/runbook.md` 4-1 알림 표.
- 추가 설정 없음 — 기존 웹훅이 있으면 켜진다.

## 4. 구성 — 콘솔 6탭

| 탭 | 경로 | 내용 |
|---|---|---|
| 실시간 로그 | `/backend-logs` | api·caddy 스트림 꼬리(tail). 창 기본 60분(최대 7일), 기본 300줄(최대 1,000줄). ANSI 색 코드는 지우고 표시 |
| 요청 통계 | `/backend-logs/traffic` | api 로그의 요청 완료 라인을 파싱해 경로별 건수·오류·소요 요약. **불러온 창 안의 근사치**이며 전 기간 통계가 아니다. 한 번에 최대 1,500**건**을 모은다(줄이 아니다 — 요청 1건이 9~11줄이라 줄 수는 표본 수의 대용이 되지 못한다) |
| 에러 모아보기 | `/backend-logs/errors` | ERROR(선택 시 WARN 포함)만 서버 필터로 걷어 **가변값(숫자·id)을 지운 시그니처**로 묶는다. 건수·최근 발생 순. 원문은 실시간 로그에서 |
| 서버 상태 | `/backend-logs/status` | ① health 핑(타임아웃 4초) ② 로그 파이프 생존(마지막 이벤트 시각) ③ 최근 1시간 ERROR 수(상한 500) ④ 자원·DB 부하(CPU·load·메모리·연결·캐시 적중률·진행 중 쿼리) |
| 대시보드 | `/backend-logs/dashboard` | 시간축 그래프 — 버킷별 요청 수(오류 적층) + **응답시간 산점도**(개정 2026-09-09: 요청 1건 = 점 1개, 정상은 브랜드색·4xx/5xx는 빨강. **y축은 로그 축**(1·10·100·1,000ms) — 응답시간은 배수로 읽는 지표이고 10ms대와 300ms대가 선형 축에서는 빠른 쪽이 바닥에 뭉갠다. 호버는 가장 가까운 요청 하나의 시각·소요·메서드·경로·status. **백분위는 차트가 아니라 카드 부제에 창 전체 기준 p50·p95·최대로** 적는다 — 백분위는 버킷을 합칠 수 없어 칸 폭이 바뀌면 같은 시각의 값이 통째로 달라지기 때문이다. 트래픽이 칸당 수십 건 규모가 되면 히스토그램 기반 백분위·히트맵으로 바꾼다) + **자원 이력 선 그래프**(CPU·메모리 %, DB 연결 수 — 서버의 60초 샘플 링 버퍼 최대 6시간, 재기동 시 초기화). 전 그래프 호버 툴팁·축 눈금. 요청 로그는 **건수 기준**으로 모은다 — 목표 1,500건을 채울 때까지 CloudWatch를 과거로 넘기고(최대 6회), 헬스체크는 건수를 세기 전에 제외한다. 못 채우면 창의 앞부분이 빠지며 [요청 수] 카드가 어디부터 그렸는지 밝힌다 |
| 검색 로그 | `/backend-logs/search` | **다른 탭과 달리 CloudWatch가 아니라 제품 API의 DB를 읽는다**(`GET /admin/search-query-logs/summary` — `admin-api.md` 4.21, 실배포·개발계 토글). 검색 질의 로그(`domain.md` 5.7)의 결과 없음 비율(미스율)·검색어별 **나온 콘텐츠 수**(가장 최근 검색의 첫 페이지 건수, 더 있으면 "20건+" — 2026-10-02)·검색어별 콘텐츠 클릭 수(10분 안 재생·담기 — 서버가 역산, 비율로는 안 만든다)·일별 추이·결과가 없던 검색어·많이 찾은 검색어. 창 7·14·30·90일. 매칭 방식(`explore.md` 4.5-5) 재검토의 근거 화면 (신설 2026-10-01) |

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
