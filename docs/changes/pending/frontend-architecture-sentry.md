# frontend/architecture.md 8.4 — 에러 수집 도구를 Sentry 로 확정

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 8.4(로깅·모니터링, "에러 수집 도구 미결") · `docs/features/common-error-handling.md` 4.7 |
| 발행 날짜 | 2026-09-23 |
| 사유 | KAN-92 — `@sentry/react-native` 도입. 미결이던 "에러 수집 도구 선정"이 확정됐다 |

## 수정 내용

1. 8.4 미결 "에러 수집 도구 연동 — 선정 시 error 레벨에 연결" → **Sentry 확정.** `shared/monitoring`(`initSentry` · `AppErrorBoundary` · `reportError` · `setSentryUser`). `logger.error` 는 Sentry 로 **자동 연결하지 않는다** — 필터를 거친 크래시·예상 못한 예외만 보내며, 명시적으로 보낼 때는 `reportError`.
2. 보내지 않는 것: `ApiError` 의 `NETWORK_ERROR`·`TIMEOUT`·4xx(계약된 응답). 개인정보: 사용자 id 만, breadcrumb URL 쿼리·요청 정보 제거(`sendDefaultPii: false`).
3. 2.1 runtimeVersion 이력에 6(Sentry) 추가. 환경변수 표에 `SENTRY_DSN`(빌드·OTA 시점, 없으면 수집 끔)·`SENTRY_AUTH_TOKEN`(EAS 시크릿, 소스맵 업로드) 추가.
4. `common-error-handling.md` 4.7: 전역 ErrorBoundary 가 렌더 오류를 잡아 복구 화면([다시 시도])을 띄운다 — 종전 "흰 화면" 상태 서술이 있으면 갱신.

## 완료 조건

- Given 새 팀원이 architecture.md 8.4 를 읽는다 / When 앱 오류를 어디서 보는지 찾는다 / Then Sentry·`shared/monitoring`·보내지 않는 오류 기준·DSN 주입 경로를 문서만으로 안다
