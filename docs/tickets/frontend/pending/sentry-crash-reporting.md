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
| 상태 | 대기 |

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
