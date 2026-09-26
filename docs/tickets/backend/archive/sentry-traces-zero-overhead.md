# [BE] Sentry `tracesSampleRate=0` 이 성능 계측을 전부 켜 API CPU 1.5~1.8배 — 키를 빼서 끈다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/instrument.ts` · `backend/src/common/sentry-options.ts`(신설) · `backend/src/config/env.validation.ts` · `backend/.env.example` · `docs/backend/architecture.md` 7.6 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-23 |
| 시작 날짜 | 2026-09-23 |
| 기한 | 2026-09-23 (High — 오늘 안에) |
| 선행 | 없음 |
| Jira | [KAN-93](https://runtime364.atlassian.net/browse/KAN-93) |
| 발견 시점 | 온보딩 가입 램프 부하 테스트(2026-09-23, `backend/load-test/results/2026-09-23-dev-onboarding/REPORT.md`) — 현재 코드가 2026-09-15 빌드보다 같은 부하에서 CPU 1.5~1.8배. Sentry 를 끄고 다시 재니 09-15 빌드와 같아졌다 |
| 심각도 | **상** — 운영에 Sentry 를 켜는 순간 청취·가입 상한이 30~40% 내려간다(t4g.small). 운영은 아직 미적용이라 지금 피해는 없다 |

## 문제

Sentry 도입(#651)에서 `tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0)` 으로 **0 을 SDK 에 그대로 넘겼다.** Sentry Node SDK 는 `tracesSampleRate != null` 이면 스팬이 켜진 것으로 본다(`@sentry/core` `hasSpansEnabled` — "0 은 nullish 가 아니다"라는 주석까지 있다). 그러면 express·nest·pg 성능 계측(`getAutoPerformanceIntegrations`)과 diagnostics-channel 주입이 전부 등록된다. 표본이 0 이라 **아무것도 보내지 않으면서 계측 비용은 다 냈다.**

## 실측 (개발계 t4g.small, 온보딩 가입 분당 600명 고정 2분, 단일 프로세스)

| 구성 | API CPU | 전체 p95 | 완료 요청 p95 |
|---|---|---|---|
| Sentry 없음(DSN 미설정) | **45~54%** | 51ms | 76ms |
| Sentry + 표본 0 (램프 A3 첫 구간) | **70~93%** | 초 단위 | 초 단위 |
| Sentry + 표본 0.5 (개발계 설정 그대로) | **108~140%** | — | — |
| 2026-09-15 빌드(Sentry 이전) | 49~54% | — | — |

## 수정 (PR #666 — 발견 당일 반영)

- `common/sentry-options.ts` `resolveTracesSampleRate` — env 가 비었거나 0·음수·NaN 이면 `undefined` 를 돌려 **키를 빼고** 넘긴다. 0 초과일 때만 그 값(1 상한).
- `instrument.ts` — `...(rate === undefined ? {} : { tracesSampleRate: rate })`. 주석에 이유·실측.
- 문서·env 예시 — "기본 0" → "비운다 = 계측 미등록. 운영은 켜지 않는다". 종전 운영 계획(0.05~0.1)은 폐기 — t4g.small 한 대로는 감당이 안 된다.

## 완료 조건

- Given `SENTRY_TRACES_SAMPLE_RATE` 가 비었거나 0 / When 부팅한다 / Then `tracesSampleRate` 키가 SDK 옵션에 없다(`sentry-options.spec.ts` 5건)
- Given dev 배포 뒤 개발계에서 env 를 비운 상태 / When 온보딩 분당 600명 2분 / Then API CPU 가 Sentry 없음(45~54%)에 근접한다
- Given `architecture.md` 7.6 / When 읽는다 / Then 0 이 "끔"이 아니라는 것과 운영에서 켜지 않는다는 것이 적혀 있다

## 처리 기록

| 항목 | 값 |
|---|---|
| **반영 날짜** | **2026-09-23** — PR #666(`fix(be)/sentry-traces-off`). 코드·스펙·문서 같은 PR |
| 확인 완료 | 2026-09-23 20:30 dev 배포(b5a1207) 뒤 개발계 재측정(완료 조건 2): 분당 600명에서 API CPU 100~140% → **50~80%**, 완료 요청 p95 14.4s → 130ms, 첫 드립 대기 p95 26.7s → 1.16s. Sentry 없음(43~54%)과의 차이 10~20%p 는 에러 수집용 계측 몫 — 감수. 개발계 `.env.prod` 추적 줄 삭제 완료(결정: 어드민 서버 상태 그래프로 충분, Sentry 성능 추적은 필요할 때만 잠깐) |
