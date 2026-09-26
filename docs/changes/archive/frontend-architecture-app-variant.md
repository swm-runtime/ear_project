# frontend/architecture.md — 앱 변형(운영 앱 · 개발계 앱) 규칙 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 2.1(OTA 업데이트 운용) · 환경변수 표 |
| 발행 날짜 | 2026-09-19 |
| 사유 | 개발계 앱을 별도 번들로 분리(KAN-76) — 설정 원본이 `app.json` + `app.config.js` 둘이 됐다 |

## 수정 내용

1. 2.1 에 "앱 변형" 항을 추가한다.
   - 운영 앱 `com.runtime.ear`(production 프로필·production 채널·운영 API), 개발계 앱 `dev.runtime.ear` "이어 - preview"(preview 계열 프로필·preview 채널·개발계 API).
   - **운영 설정의 원본은 `app.json`** 이고 `app.config.js` 는 `APP_VARIANT=dev` 일 때만 덮어쓴다.
   - `APP_VARIANT` 는 **빌드 프로필 env(`eas.json`)와 OTA 발행(`eas-update.yml`) 두 곳에서 같은 값**이어야 한다. production 프로필은 preview 를 extends 하므로 값을 명시한다.
   - 개발계 앱은 도메인 연결을 선언하지 않는다(공유 링크는 운영 앱이 받는다).
2. "`runtimeVersion` 을 올려야 하는 변경" 목록에 `app.config.js` 의 네이티브 값(번들 ID·아이콘·plugin 옵션)을 포함한다.
3. 빌드 절차: iOS 개발계는 `preview-store` 프로필 → TestFlight 내부 테스트, Android 개발계는 `dev-app-build.yml`(러너 로컬 빌드, EAS 빌드 한도 미사용).
4. 환경변수 표에 `APP_VARIANT`(`dev` | `production`, 빌드·OTA 시점 값) 추가.

## 완료 조건

- Given 새 팀원이 architecture.md 2.1 을 읽는다 / When 개발계 앱을 새로 뽑아야 한다 / Then 어느 프로필·워크플로를 쓰는지, `APP_VARIANT` 를 어디서 주는지 문서만으로 안다

## 처리 기록

| 항목 | 값 |
|---|---|
| **반영 날짜** | **2026-09-23** |
| 반영 내용 | `frontend/architecture.md` 2.1에 "앱 변형" 표·`APP_VARIANT` 규칙·빌드 절차, runtimeVersion 대상에 `app.config.js` 네이티브 값, 환경변수 표 신설(`APP_VARIANT` 포함) |
| 반영 PR | `docs/changes-integration-2026-09-23` (dev) |
