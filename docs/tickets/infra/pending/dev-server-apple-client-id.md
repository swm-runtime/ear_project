# [INFRA] 개발계 서버의 `APPLE_CLIENT_ID` 를 개발계 앱 번들 ID 로

| 항목 | 값 |
|---|---|
| 대상 | 개발계 API(`api-dev.earcast.co.kr`) 환경변수 `APPLE_CLIENT_ID` |
| 요청 파트 | 인프라 |
| 요청자 | 이주호(FE) |
| 발행 날짜 | 2026-09-19 |
| Jira | [KAN-77](https://runtime364.atlassian.net/browse/KAN-77) |
| 발견 시점 | 개발계 앱을 별도 번들(`com.runtime.ear.dev`)로 분리(KAN-76) |
| 근거 문서 | `backend/src/config/env.validation.ts`(`APPLE_CLIENT_ID` — 애플 identity token 의 `aud` = iOS 번들 ID) · `spec/api/auth-api.md` 4.1 |
| 중요도 | **Low** — 이번 주 안. iOS 개발계 앱이 TestFlight 에 올라오기 전까지는 영향 없다 |

## 문제

서버는 애플 identity token 의 `aud` 를 `APPLE_CLIENT_ID`(iOS 번들 ID)·`APPLE_SERVICES_ID` 와 대조한다(`apple.client.ts`). 개발계 iOS 앱의 번들 ID 가 `com.runtime.ear.dev` 로 바뀌면 토큰의 `aud` 도 그 값이라, 개발계 서버가 운영 번들 ID(`com.runtime.ear`)를 들고 있으면 **개발계 iOS 앱의 애플 로그인이 전부 거부된다.**

## 요청 내용

- **개발계** 서버의 `APPLE_CLIENT_ID` 를 `com.runtime.ear.dev` 로 바꾼다. **운영은 건드리지 않는다.**
- `APPLE_SERVICES_ID`(Android 웹 OAuth)는 그대로 둔다 — 개발계 앱도 같은 Services ID 를 쓴다.
- 종전 preview 빌드(번들 `com.runtime.ear`)의 iOS 판은 뽑은 적이 없으므로(ad-hoc 기기 0대) 두 값을 동시에 받을 필요는 없다.

## 완료 조건

- Given 개발계 iOS 앱(`com.runtime.ear.dev`) / When 애플로 로그인한다 / Then 개발계 API 가 토큰을 받아들인다
- Given 운영 iOS 앱 / When 애플로 로그인한다 / Then 종전과 같이 동작한다(운영 env 불변)
