# [FE] Sentry 도입 — 앱 크래시·JS 오류를 볼 수 있게 한다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/` — `@sentry/react-native` 도입 · 전역 ErrorBoundary 신설 · EAS 빌드에 소스맵 업로드 · 노이즈 필터 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-23 |
| 시작 날짜 | 2026-09-23 |
| 기한 | 2026-09-26 (Medium — 3일) |
| 선행 | 티켓 선행 없음. **티켓이 아닌 선행 1건** — Sentry 조직·프로젝트(React Native) 생성과 DSN 발급(담당: 박준현·인프라 / 상태: **진행 예정**). DSN 없이도 코드 작업은 끝까지 할 수 있고, 값만 나중에 넣으면 된다 |
| Jira | [KAN-92](https://runtime364.atlassian.net/browse/KAN-92) |
| 발견 시점 | 2026-09-22 Sentry 도입 검토 — 서버는 감시가 촘촘한데 **앱 쪽은 아무것도 없다**는 것이 드러났다 |
| 근거 문서 | `frontend/architecture.md`(에러 처리) · `features/common-error-handling.md` 4.7(로깅·모니터링) |
| 중요도 | **Medium** — 지금 앱 버그를 알게 되는 경로가 **앱스토어 리뷰뿐**이다. 가장 느리고 가장 아픈 채널이다 |
| 상태 | 진행 — 코드 반영, **DSN·소스맵 토큰·빌드 남음** |

## 문제

**`frontend/` 어디에도 ErrorBoundary가 없다.** 렌더 트리 어디서든 JS 오류가 나면 **흰 화면**이 되고, 그 사실이 서버에 닿지 않으므로 우리는 영영 모른다.

서버 쪽은 이미 촘촘하다 — UptimeRobot(외부 감시) · CloudWatch 알람 6개 · 워커의 ERROR → Slack(5분) · 자원 임계 알림. **앱 쪽만 0이다.**

| 무엇을 보나 | 지금 |
|---|---|
| 서버 죽음·인프라·500 | 있음 |
| **앱 크래시·JS 오류** | **없음** |

## 요청 내용

### 1. `@sentry/react-native` 도입

- Expo 환경이므로 `npx expo install @sentry/react-native` + `app.json` 플러그인 등록.
- DSN은 **`app.config.js`의 `extra`를 거쳐 주입**한다 — 소셜 키를 다루는 기존 방식과 같게(`DEV_SOCIAL_AUTH` 패턴). **DSN을 소스에 하드코딩하지 않는다.**
- `environment`를 빌드 채널로 가른다 — 프리뷰 빌드의 오류가 운영 통계를 오염시키면 판단이 흐려진다.
- `release`는 `expo.version`을 쓴다(CLAUDE.md — 버전의 기준은 앱). 그래야 "이 크래시가 어느 배포부터인가"가 자동으로 잡힌다.

### 2. 전역 ErrorBoundary

- 렌더 오류를 잡아 Sentry로 보내고, **흰 화면 대신 복구 화면**을 띄운다(다시 시도 · 홈으로).
- 카피는 `spec/uiux/`의 공통 오류 문구 규칙을 따른다. 새 문구가 필요하면 `changes/`에 올린다.

### 3. **소스맵 업로드 — 이게 유일하게 손이 가는 부분이다**

소스맵을 안 올리면 스택 트레이스가 난독화된 문자열이라 **있으나 마나다.** EAS 빌드 후처리에 업로드 단계를 붙여야 한다(`SENTRY_AUTH_TOKEN`은 EAS 시크릿).

### 4. **노이즈 필터 — 이걸 안 하면 아무도 안 보게 된다**

기본 설정은 네트워크 오류를 전부 잡는다. **지하철에서 앱을 켠 사람이 전부 에러로 잡히고**, 그러면 알림이 무의미해져 진짜 크래시가 묻힌다.

- 네트워크 타임아웃·오프라인은 보내지 않는다(이미 `common-error-handling.md` 4.5 오프라인 큐가 다루는 정상 흐름이다).
- 서버가 계약대로 내려준 4xx(`error_code` 있는 응답)는 보내지 않는다 — 정상 동작이다.
- **보낼 것은 크래시와 예상 못한 예외뿐이다.**

### 5. 개인정보

`sendDefaultPii: false`. 사용자 식별은 **user id만** 쓰고 이메일·닉네임은 보내지 않는다. 백엔드도 같은 기준으로 맞췄다(`backend/src/common/sentry-scrub.ts`).

## 범위 밖

- **백엔드 Sentry** — 같은 날 별도 PR(`feat(be)/sentry-error-tracking`)로 반영했다. 참고할 설정이 있으면 그쪽 `instrument.ts`·`sentry-scrub.ts`를 보면 된다.
- Sentry 조직·프로젝트 생성, Slack 연동, 알림 규칙 — 인프라(박준현)가 콘솔에서 한다.
- 성능 추적(트랜잭션) — 처음에는 끄고 시작한다. 무료 할당량은 크래시에 쓴다.

## 완료 조건

- Given 렌더 트리에서 JS 오류가 난다 / When 화면을 연다 / Then 흰 화면 대신 복구 화면이 뜨고 Sentry에 이슈가 올라온다
- Given 그 이슈 / When Sentry에서 연다 / Then **난독화되지 않은 스택 트레이스**와 `release`(앱 버전)가 보인다
- Given 비행기 모드에서 앱을 쓴다 / When 요청이 실패한다 / Then Sentry에 **아무것도 올라가지 않는다**
- Given 서버가 계약대로 내려준 4xx(재생 한도 초과 등) / When 화면이 처리한다 / Then Sentry에 올라가지 않는다
- Given 로그인한 사용자의 크래시 / When 이슈를 연다 / Then 사용자 식별이 **id만** 있고 이메일·닉네임이 없다
- Given 프리뷰 빌드에서 난 오류 / When Sentry에서 본다 / Then `environment`가 운영과 구분된다

## 처리 기록

- 2026-09-23 발행.

## 처리 기록 (2026-09-23 — 코드 반영)

**들어간 것**

- `@sentry/react-native` ~7.11(`expo install`) · `app.json` 플러그인 `@sentry/react-native/expo`(organization `runtime364` · project `ear-app` — 인프라가 만드는 이름과 다르면 맞춘다) · **`runtimeVersion` 5 → 6**(네이티브 모듈).
- **DSN 주입**(요청 1) — `app.config.js` 가 env `SENTRY_DSN` 을 `extra.sentryDsn` 으로 싣는다. 소스에 값 없음. `eas.json` preview·production env 에 빈 `SENTRY_DSN` 자리, `eas-update.yml` 에 `secrets.SENTRY_DSN`. **값이 없으면 `initSentry()` 가 건너뛰어 아무것도 보내지 않는다** — DSN 발급 전에도 빌드·OTA 가 그대로 돈다. `environment` 는 `IS_DEV_API` 로 `preview`/`production`(설정 "· 개발계" 표시와 같은 판정), `release` 는 `ear@<APP_VERSION>`.
- **전역 ErrorBoundary**(요청 2) — `shared/monitoring/AppErrorBoundary`. `Sentry.ErrorBoundary` 로 잡아 보내고 기존 `FullScreenError` 로 복구 화면([다시 시도] = 경계 리셋). 경계가 `NavigationContainer` 바깥이라 "홈으로"는 둘 수 없다 — 내비게이션 자체가 죽었을 수 있다. `App` 을 `Sentry.wrap` 으로 감싸 네이티브 크래시·터치 breadcrumb 도 잡는다. `initSentry()` 는 `bootstrapApp()` 보다 먼저.
- **노이즈 필터**(요청 4) — `shared/monitoring/event-filter.ts` `isExpectedError`: `ApiError` 중 `NETWORK_ERROR`·`TIMEOUT` 과 **4xx 전부**는 `beforeSend` 에서 버린다(서버가 계약대로 내려준 응답은 버그가 아니다). 5xx·상태 미상 `ApiError`·`ApiError` 가 아닌 예외만 보낸다. 유닛 테스트 7건.
- **개인정보**(요청 5) — `sendDefaultPii: false` + `scrubEvent`: 사용자는 `id` 만(로그인·복원 시 `setSentryUser(id)`, 로그아웃·만료 시 `null` — `bootstrap` 의 세션 전이 한 곳), breadcrumb URL 쿼리 제거, `request` 통째 삭제. 백엔드 `sentry-scrub.ts` 와 같은 기준.
- 성능 추적은 끔(`enableAutoPerformanceTracing: false`, `tracesSampleRate: 0`).
- `reportError(error, context)` — 화면·서비스가 "이건 버그다" 지점에서 명시적으로 보낼 때. 같은 필터를 탄다. **`logger.error` 대신 쓰지 않는다** — 지금은 호출부 없음(다음 티켓에서 필요한 곳에만).

**확인한 것** — tsc · eslint · jest 133건 통과. `expo config` 로 운영·개발계 변형 모두 `extra.sentryDsn` 이 env 값을 받고, 플러그인이 1개 등록된 것 확인. 실기기·소스맵은 아래가 남았다.

**남은 것 (사람 손)**

| # | 어디 | 무엇을 | 안 하면 |
|---|---|---|---|
| 1 | Sentry(박준현) | 조직·React Native 프로젝트 생성 → **DSN** | 앱이 아무것도 보내지 않는다(빌드는 됨) |
| 2 | EAS | `eas secret:create --scope project --name SENTRY_DSN --value <dsn>` · GitHub repo secret `SENTRY_DSN` 같은 값 | 빌드·OTA 번들에 DSN 이 안 실린다 |
| 3 | Sentry > 조직 설정 > Auth Tokens | 소스맵 업로드용 토큰(`project:releases` · `org:read`) → `eas secret:create --name SENTRY_AUTH_TOKEN` | 스택이 난독화된 채로 온다(요청 3) |
| 4 | `app.json` 플러그인 | 실제 조직 slug·프로젝트 slug 로 맞춘다(지금 `runtime364`/`ear-app` 은 가정) | 소스맵이 엉뚱한 프로젝트로 가거나 실패 |
| 5 | 빌드 | runtime 6 — iOS·Android 운영/개발계. GA4(KAN-90) SDK 와 묶어 한 번에 | — |

완료 조건은 **DSN 이 들어간 개발계 빌드**로 확인한다(개발계 앱 설정에 "크래시 테스트" 행은 두지 않았다 — 필요하면 다음 PR).
