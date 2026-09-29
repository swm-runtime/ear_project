# [문서] 일일 지표 Slack 보고의 지표 정의·출처를 등재한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/backend-monitoring.md` (새 절 "일일 지표 보고") · `features/analytics.md` 1장 경계 한 줄 |
| 요청 파트 | 문서(구현은 KAN-107 2단계 — PR #957 · 릴리스 #971) |
| 발행 날짜 | 2026-09-29 |
| 발견 시점 | KAN-107 완료 조건 "지표 정의가 문서에 적혀 있다"를 닫으려다 — 정의가 티켓·코드 주석에만 있다 |
| 심각도 | 중 — 이 정의가 문서에 없으면 채널의 숫자를 다음에 읽는 사람이 무엇인지 알 수 없다 |

## 수정 내용

### `features/backend-monitoring.md` — 새 절 "일일 지표 보고"

| 항목 | 규칙 |
|---|---|
| 시각·대상 | 매일 **17:00 KST**, **어제** 하루치(오늘은 안 끝났고 GA4 당일 처리는 늦다). 수동 발송 `POST /admin/reports/daily-metrics` |
| 채널 | 가입 알림과 같은 웹훅(`SLACK_SIGNUP_WEBHOOK_URL` → 없으면 `SLACK_ERROR_WEBHOOK_URL`). 운영만 켠다 |
| 출처 | **GA4 운영 스트림**(`streamName` 이 `ear prod` 로 시작) + **서버**. 개발계 스트림은 걸러 테스트 트래픽이 섞이지 않는다 |
| 사용자 | 활성·신규·세션·평균 세션 길이·7일 활성 — GA4 `activeUsers` `newUsers` `sessions` `averageSessionDuration`. ▲▼ 는 전일 대비 |
| 획득 | **가입 = 서버** `users.created_at`(서비스 날짜 04시 경계) · 온보딩 완료 = GA4 `onboarding_complete` · 전환율 = 온보딩 완료 ÷ 가입 · 푸시 응답 = GA4 `push_permission` 건수(`result` 는 맞춤 측정기준 미등록이라 허용/거부 미분리) · **탈퇴 = GA4** `withdrawal`(서버는 행을 삭제해 흔적이 없다 — `domain.md` 12.3) |
| 재생 | 시작(건·사용자) `play_start` · **완청 = 서버** `library_items.status = completed` 의 `completed_at`(서비스 날짜) · 중도 이탈 `play_abandon` · 드립 재생 `drip_play` · 담기 `content_save` |
| 리텐션 | GA4 코호트(`firstSessionDate`). **D1** = `date-1` 에 처음 온 사용자 중 `date` 에 활성인 비율, **D7** = `date-7` 기준. 표본(코호트 크기)을 함께 적고, **코호트가 비면 `—`, 아무도 안 돌아오면 0%** — 다른 사실이다 |
| 경계 | GA4 는 KST 달력일(00시), 서버 값은 서비스 날짜(04시). 4시간 어긋남을 문구 각주로 밝힌다 |

이벤트 이름은 `analytics.md` 3.4 를 그대로 쓴다.

### `features/analytics.md` 1장 — 경계 한 줄 추가

"제품 결정 지표는 이 문서(GA4)가 소유한다" 아래에: **일일 Slack 보고는 GA4 값을 그대로 옮기되, 가입·완청 두 건수만 서버 값을 쓴다** — GA4 가 runtime 7 이후 빌드에서만 들어와 스토어 1.0.0 사용자를 놓치기 때문이다. 그 둘은 퍼널 분석이 아니라 계수(count)라 `user_signals` 로 퍼널을 보지 않는다는 규칙과 충돌하지 않는다.

## 완료 조건

- Given `features/backend-monitoring.md` / When "일일 지표 보고" 절을 읽는다 / Then 4묶음 각 항목의 출처(GA4 이벤트명 또는 서버 컬럼)와 리텐션 D1/D7 정의가 적혀 있다
- Given 같은 절 / When 경계를 찾는다 / Then GA4 00시·서버 04시 차이가 적혀 있다
- Given `features/analytics.md` 1장 / When 경계를 읽는다 / Then 가입·완청 두 건수는 서버 값이라는 예외가 적혀 있다
