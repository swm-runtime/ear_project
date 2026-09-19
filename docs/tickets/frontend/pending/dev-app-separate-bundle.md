# [FE] 개발계 앱을 별도 앱으로 분리 — `com.runtime.ear.dev` "이어 dev" (iOS·Android)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.config.js`(신설) · `frontend/eas.json` · `frontend/assets/*-dev.png` · `.github/workflows/eas-update.yml` · `.github/workflows/dev-app-build.yml`(신설) |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 발행 날짜 | 2026-09-19 |
| Jira | [KAN-76](https://runtime364.atlassian.net/browse/KAN-76) |
| 발견 시점 | KAN-65(A안) 운영 중 — 개발계 앱과 운영 앱의 번들 ID 가 같아 한 폰에 하나만 깔리고, iOS 는 ad-hoc 기기 등록에서 멈춰 팀 배포가 안 됐다 |
| 근거 문서 | `docs/tickets/frontend/pending/dev-api-test-method.md`(KAN-65 — "번들 ID 분리는 필요해지면 별도 티켓") · `docs/frontend/architecture.md` 2.1 |
| 중요도 | **Medium** — 3일 안 |
| 상태 | 진행 — 코드 반영, **콘솔 등록·iOS 빌드 남음**(사람 손) |

## 문제

- 개발계 앱(preview 프로필)과 운영 앱(production 프로필)이 같은 번들 ID `com.runtime.ear` 를 써서 **나중에 깐 쪽이 먼저 깐 쪽을 덮는다.** 심사 빌드를 확인하는 폰에 개발계 앱을 깔 수 없다.
- 홈 화면에서 두 앱이 구분되지 않는다(설정 버전 줄의 "· 개발계" 표시가 유일한 단서 — #502).
- iOS 개발계 앱은 ad-hoc 배포라 팀원 아이폰을 하나씩 등록하고, 기기가 늘 때마다 다시 빌드해야 한다.

## 요청 내용

1. **앱 변형.** `APP_VARIANT=dev` 면 번들 ID·패키지 `com.runtime.ear.dev`, 이름 "이어 dev", DEV 띠 아이콘. 운영 설정의 원본은 `app.json` 그대로이고 변형 값이 없으면 `app.config.js` 는 아무것도 바꾸지 않는다.
2. 개발계 앱은 **도메인 연결(`associatedDomains`·https `intentFilters`)을 선언하지 않는다** — 공유 링크는 운영 앱이 받는다.
3. `eas.json` preview 프로필과 `eas-update.yml` preview 채널 발행이 같은 `APP_VARIANT=dev` 를 쓴다. production 은 preview 를 `extends` 하므로 `APP_VARIANT=production` 을 **명시**한다(env 는 병합된다 — 빠뜨리면 운영 빌드가 dev 를 물려받는다).
4. **iOS 는 TestFlight 내부 테스트**(`preview-store` 프로필, 스토어 서명)로 배포한다 — 기기 등록이 필요 없고 새 팀원은 이메일 초대만 받는다.
5. **Android APK 는 GitHub Actions 에서 `eas build --local`** 로 뽑는다(`dev-app-build.yml`, 수동 실행). EAS 무료 플랜의 월 빌드 한도를 쓰지 않는다 — 2026-09-19 에 Android 한도가 소진돼 클라우드 빌드가 막혔다(10-01 초기화).
6. 콘솔 등록(아래 "사람 손").

## 사람 손 — 콘솔 등록

개발계 앱 Android 서명 키(EAS 저장, 2026-09-19 생성):
- SHA-1 `A0:29:9F:92:9B:C4:97:33:81:6B:B5:08:7E:89:90:52:ED:7F:4C:7D`
- 카카오 키 해시 `oCmfkpvElzOBa7UIfomQUu1/TH0=`

| # | 어디 | 무엇을 | 안 하면 |
|---|---|---|---|
| 1 | Apple(터미널) | `cd frontend && npx eas-cli build -p ios --profile preview-store` — Apple 로그인, 번들 ID·인증서 자동 생성. 이어서 `npx eas-cli submit -p ios --latest` — ASC 앱 "이어 dev" 자동 생성 | iOS 개발계 앱이 없다 |
| 2 | App Store Connect | TestFlight > 내부 테스트 그룹에 팀원 추가 | 팀원이 설치 못 한다 |
| 3 | 구글 클라우드(프로젝트 475643832949) | OAuth 클라이언트 2개 생성 — **iOS**(번들 `com.runtime.ear.dev`) · **Android**(패키지 `com.runtime.ear.dev` + 위 SHA-1). iOS 클라이언트 ID 는 `app.config.js` 의 `DEV_SOCIAL_AUTH.googleIosClientId` 에 넣는다(네이티브 값이라 iOS 재빌드 필요 — **1번보다 먼저 하면 빌드 한 번으로 끝난다**) | 개발계 앱 구글 로그인 실패 |
| 4 | 카카오 개발자 콘솔 | 플랫폼에 iOS 번들 ID·Android 패키지 `com.runtime.ear.dev` + 위 키 해시 추가 | 개발계 앱 카카오 로그인 실패 |
| 5 | 네이버 개발자 센터 | Android 패키지 `com.runtime.ear.dev` · iOS 번들 추가(URL 스킴은 그대로 `earnaverlogin`) | 개발계 앱 네이버 로그인 실패 |
| 6 | 개발계 서버 env | `APPLE_CLIENT_ID=com.runtime.ear.dev` — `docs/tickets/infra/pending/dev-server-apple-client-id.md` | 개발계 iOS 앱 애플 로그인이 `aud` 불일치로 거부된다 |

## 알려진 한계

- **URL 스킴은 두 앱이 같다**(`ear` · `kakao<앱키>` · `earnaverlogin`). 한 폰에 둘 다 깔려 있으면 카카오톡·네이버 앱에서 돌아올 때 iOS 가 어느 앱을 열지 보장하지 않는다(Android 는 선택 창). 문제가 되면 개발계 전용 카카오·네이버 앱을 따로 등록해 스킴을 가른다 — 별도 티켓.
- 종전 preview 빌드(`com.runtime.ear`, Android vc 11)는 계속 preview 채널 OTA 를 받는다. 개발계 앱으로 갈아탄 뒤 지운다.
- 푸시: 번들이 다르므로 개발계 앱의 푸시 토큰은 별개다. FCM(`google-services.json`)은 KAN-69 쪽 미결 그대로.

## 완료 조건

- Given 운영 앱이 깔린 폰 / When 개발계 앱을 설치한다 / Then 두 앱이 나란히 있고 이름("이어 dev")·아이콘(DEV 띠)으로 구분된다
- Given `APP_VARIANT` 없이 설정을 평가한다 / When `app.json` 만 쓸 때와 비교한다 / Then 한 글자도 다르지 않다
- Given 개발계 앱 / When dev 에 JS 변경이 머지된다 / Then preview 채널 OTA 로 받고 개발계 API 를 본다
- Given 개발계 앱 / When 구글·카카오·네이버·애플로 로그인한다 / Then 개발계 API 로 로그인된다
- Given 새 팀원 / When TestFlight 초대를 수락(iOS)하거나 APK 를 받는다(Android) / Then 기기 등록·재빌드 없이 설치된다

## 처리 기록 (2026-09-19 — 코드 반영)

- `app.config.js` 신설. **운영 불변 확인**: `APP_VARIANT` 없이 `expo config --json` 결과가 `app.config.js` 가 없을 때와 바이트 단위로 같다. dev 변형의 차이는 name · icon · bundleIdentifier · package · adaptiveIcon.foregroundImage · associatedDomains(제거) · intentFilters(제거) · extra.appVariant 뿐이다.
- `eas.json`: preview `APP_VARIANT=dev`, production `APP_VARIANT=production` 명시, `preview-store` 프로필 추가. `eas-update.yml`: 채널 결정 단계가 `app_variant` 도 정한다.
- EAS 에 개발계 앱 Android 키스토어 생성됨(위 SHA-1). 클라우드 빌드는 무료 한도 소진으로 실패 → `dev-app-build.yml` 로 대체.
- 남은 것: 위 "사람 손" 1~6, Android APK 워크플로 첫 실행 확인, 팀 Slack 공지. 끝나면 KAN-65 와 함께 닫는다.
