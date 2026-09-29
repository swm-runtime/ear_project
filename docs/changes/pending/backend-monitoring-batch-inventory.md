# [문서] 백엔드 배치·외부 연동 목록과 기동 요약 로그를 등재한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/backend-monitoring.md` (새 절 "무엇이 돌고 있는가") |
| 요청 파트 | 문서(기동 요약 로그 구현은 `docs(be)/startup-summary`) |
| 발행 날짜 | 2026-09-29 |
| 발견 시점 | "배치도 연동도 너무 많지 않나"(PM) — 세어 보니 개수보다 **한눈에 볼 곳이 없는 것**이 문제였다. 오늘 반나절이 "웹훅이 비어 있나, GA4 키가 들어갔나"를 Secrets 뒤지는 데 갔다 |
| 심각도 | 중 — 장애 때 "지금 뭐가 켜져 있지"에 답하는 데 걸리는 시간이 곧 복구 시간이다 |

## 수정 내용

### 새 절 "무엇이 돌고 있는가" — 표 두 개 + 규칙 하나

**배치 (전부 API 프로세스 안, 스케줄러 워커 1개에서만 — `isSchedulerProcess`)**

| 시각(KST) | 이름 | 무엇 | 실패하면 |
|---|---|---|---|
| 04:00 | `content-stat-aggregation` | 콘텐츠 통계 재집계 | 로그, 다음 날 재시도(재집계라 안전) |
| 04:10 | `content-expiry` | 만료 콘텐츠 처리 | 로그 |
| 04:15 | `topic-exposure` | 주제 노출 갱신 | 로그 |
| 04:30 | `retention-purge` | 보존 기한 지난 데이터 삭제 | 로그 |
| 일 1회 | `drip-batch` | 드립 편성 | 로그 · `drip_batch_runs` 기록 |
| 10분 | `push-receipt` | 푸시 영수증 회수 | 로그 |
| 60초 | 자원 경보 (`setInterval`) | CPU·메모리 표본 + Slack 경보 | 로그 |
| 17:00 | `daily-metrics` | 일일 지표 Slack 보고(GA4+서버) | 로그, 던지지 않음 |

**외부 연동 (전부 "env 가 있으면 켜짐")**

| 연동 | 켜는 env | 꺼지면 |
|---|---|---|
| 소셜 로그인 카카오·구글·애플 | `KAKAO_*` `GOOGLE_*` `APPLE_*` | 해당 제공자 로그인 불가 |
| 오디오 CDN | `CLOUDFRONT_*` `AUDIO_*` | 재생 URL 발급 불가 |
| Sentry | `SENTRY_DSN` (+`SENTRY_ENVIRONMENT`) | 크래시 수집 안 됨 |
| Slack 경보·가입 알림 | `SLACK_ERROR_WEBHOOK_URL` (가입은 `SLACK_SIGNUP_WEBHOOK_URL` 우선) | 조용히 꺼짐 |
| GA4 일일 보고 | `GA4_PROPERTY_ID` + `GA4_SERVICE_ACCOUNT_BASE64` | 조용히 꺼짐 |

**규칙**: 켜짐/꺼짐의 **런타임 진실은 기동 로그의 `features …` 한 줄**이다(`startup-summary.ts`). 문서 표는 "무엇이 있는가", 로그는 "지금 이 서버에 무엇이 켜졌는가". 배포 뒤 확인은 그 줄로 한다:

```
[Startup] features env=production scheduler=yes sentry=on resource-alert=on signup-alert=on daily-metrics=on crons=[content-expiry,content-stat-aggregation,daily-metrics,drip-batch,push-receipt,retention-purge,topic-exposure]
```

### 덧붙일 판단 한 줄

배치·연동 개수는 이 규모 제품에서 정상이다. 관리 가능 여부를 가르는 것은 개수가 아니라 **격리**(실패가 로그 한 줄로 끝나는가 — 이미 그렇다)와 **가시성**(이 절)이다. 트래픽이 늘면 다음 단계는 스케줄러를 별도 프로세스로 떼는 것이다 — 배치의 메모리·CPU 가 요청 응답과 한 프로세스에 있기 때문(2026-09-29 GA4 SDK +54MB 를 지연 로드로 피한 것이 첫 징후).

## 완료 조건

- Given `features/backend-monitoring.md` / When "무엇이 돌고 있는가" 절을 읽는다 / Then 배치 8개의 시각·이름·실패 시 동작과 외부 연동 5묶음의 켜는 env 가 표로 있다
- Given 같은 절 / When 배포 뒤 확인법을 찾는다 / Then 기동 로그 `features …` 한 줄을 보라고 적혀 있다
