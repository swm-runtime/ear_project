# [문서] Sentry 도입을 `backend/architecture.md` 7.6(로깅)에 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/architecture.md` 7.6 로깅 (에러가 어디로 가는가) |
| 요청 파트 | 문서(구현은 백엔드 `feat(be)/sentry-error-tracking`) |
| 발행 날짜 | 2026-09-23 |
| 발견 시점 | 2026-09-23 Sentry 도입 — 7.6 은 "스택은 error 레벨에서만 남긴다"까지만 적고 있어, 그 error 가 **외부 서비스로도 나간다**는 사실이 문서에 없다 |
| 심각도 | 중 — 개인정보가 외부로 나가는 경로가 문서에 없으면 다음 사람이 모르고 필드를 늘린다 |

## 넣을 내용

7.6 에 아래를 덧붙인다.

**에러가 가는 곳은 이제 둘이다.**

| 경로 | 무엇이 | 언제 |
|---|---|---|
| CloudWatch `/ear/api` → 워커 감시 → Slack | 전 레벨 로그 | 5분 주기 묶음 |
| **Sentry** | **`error` 등급만** | 즉시, 그룹화·빈도·릴리스 포함 |

- **`error` 등급만 보낸다.** 4xx 업무 예외는 정상 흐름이라 보내면 잡음이 되고 무료 할당량을 앱 크래시 대신 갉아먹는다. 판정은 `BusinessException.logLevel` 이 이미 하고 있고 `AllExceptionsFilter` 가 그 결과를 따른다.
- **`SENTRY_DSN` 이 없으면 초기화 자체를 하지 않는다.** 로컬·테스트·CI 기본값이고, 운영에서 잠깐 끄는 스위치이기도 하다.
- **세탁은 `common/sentry-scrub.ts` 한 곳에서 한다.** 8장의 "토큰·인증 코드·이메일 원문·요청 바디를 남기지 않는다"는 Sentry 에 더 엄하게 적용된다 — 외부 서비스이기 때문이다. 요청 바디·전 헤더·쿠키를 지우고, 사용자는 id 만 남기며, 서명 쿼리는 `redactSensitiveQuery` 로 값만 가린다. **이벤트에 필드를 늘리려면 이 파일을 먼저 본다.**
- **초기화는 `src/instrument.ts` 이고 진입점의 첫 줄에서 import 한다.** Nest 부팅 전에 돌아야 해서 ConfigService 를 쓰지 않고 `process.env` 를 직접 읽는다. 이 import 의 위치를 바꾸면 조용히 계측이 빠진다.
- **성능 추적은 기본 0 이다.** 무료 할당량은 앱 크래시에 쓴다.
- 릴리스는 `ear-api@<package.json version>` 이다 — 버전의 기준이 앱이므로(CLAUDE.md) Sentry 의 릴리스도 앱 버전을 따른다.

## 왜 바로 안 고치고 기록만 하는가

`docs/backend/` 는 수정 전에 확인을 받는다(`backend/CLAUDE.md` 2장). 통합 시점에 이 내용을 7.6 에 반영한다.

## 완료 조건

- Given `architecture.md` 7.6 / When 읽는다 / Then 에러가 Sentry 로도 간다는 것과 **`error` 등급만 간다**는 것이 적혀 있다
- Given 같은 절 / When 읽는다 / Then 세탁 위치(`common/sentry-scrub.ts`)와 "필드를 늘리려면 여기를 본다"가 적혀 있다
- Given 같은 절 / When 읽는다 / Then `SENTRY_DSN` 이 없으면 꺼진다는 것이 적혀 있다

## 처리 기록

| 항목 | 값 |
|---|---|
| **반영 날짜** | **2026-09-23** |
| 반영 내용 | `backend/architecture.md` 7.6에 Sentry 경로 표·`error` 등급만·`SENTRY_DSN` 스위치·세탁 위치·초기화 위치·릴리스 규칙 추가. `common-error-handling.md` 4.7·미결에 Sentry 확정 반영 |
| 반영 PR | `docs/changes-integration-2026-09-23` (dev) |
