# [FE] 개발계 앱을 별도 앱으로 분리 — `dev.runtime.ear` "이어(Preview)" (iOS·Android)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.config.js`(신설) · `frontend/eas.json` · `frontend/assets/*-dev.png` · `.github/workflows/eas-update.yml` · `.github/workflows/dev-app-build.yml`(신설) |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 발행 날짜 | 2026-09-19 |
| Jira | [KAN-76](https://runtime364.atlassian.net/browse/KAN-76) |
| 발견 시점 | KAN-65(A안) 운영 중 — 개발계 앱과 운영 앱의 번들 ID 가 같아 한 폰에 하나만 깔리고, iOS 는 ad-hoc 기기 등록에서 멈춰 팀 배포가 안 됐다 |
| 근거 문서 | `docs/tickets/frontend/pending/dev-api-test-method.md`(KAN-65 — "번들 ID 분리는 필요해지면 별도 티켓") · `docs/frontend/architecture.md` 2.1 |
| 중요도 | **Medium** — 3일 안 |
| 상태 | **완료**(2026-09-20) — 카카오 로그인은 KAN-80·KAN-82 가 이어서 갖는다 |

## 문제

- 개발계 앱(preview 프로필)과 운영 앱(production 프로필)이 같은 번들 ID `com.runtime.ear` 를 써서 **나중에 깐 쪽이 먼저 깐 쪽을 덮는다.** 심사 빌드를 확인하는 폰에 개발계 앱을 깔 수 없다.
- 홈 화면에서 두 앱이 구분되지 않는다(설정 버전 줄의 "· 개발계" 표시가 유일한 단서 — #502).
- iOS 개발계 앱은 ad-hoc 배포라 팀원 아이폰을 하나씩 등록하고, 기기가 늘 때마다 다시 빌드해야 한다.

## 요청 내용

1. **앱 변형.** `APP_VARIANT=dev` 면 번들 ID·패키지 `dev.runtime.ear`, 이름 "이어(Preview)", PREVIEW 띠 아이콘. 운영 설정의 원본은 `app.json` 그대로이고 변형 값이 없으면 `app.config.js` 는 아무것도 바꾸지 않는다.
2. 개발계 앱은 **도메인 연결(`associatedDomains`·https `intentFilters`)을 선언하지 않는다** — 공유 링크는 운영 앱이 받는다.
3. `eas.json` preview 프로필과 `eas-update.yml` preview 채널 발행이 같은 `APP_VARIANT=dev` 를 쓴다. production 은 preview 를 `extends` 하므로 `APP_VARIANT=production` 을 **명시**한다(env 는 병합된다 — 빠뜨리면 운영 빌드가 dev 를 물려받는다).
4. **iOS 는 TestFlight 내부 테스트**(`preview-store` 프로필, 스토어 서명)로 배포한다 — 기기 등록이 필요 없고 새 팀원은 이메일 초대만 받는다.
5. **Android APK 는 GitHub Actions 에서 `eas build --local`** 로 뽑는다(`dev-app-build.yml`, 수동 실행). EAS 무료 플랜의 월 빌드 한도를 쓰지 않는다 — 2026-09-19 에 Android 한도가 소진돼 클라우드 빌드가 막혔다(10-01 초기화).
6. 콘솔 등록(아래 "사람 손").

## 사람 손 — 콘솔 등록

개발계 앱 Android 서명 키(EAS 저장): **식별자를 `dev.runtime.ear` 로 바꾸며 키스토어가 새로 생긴다 — SHA-1·카카오 키 해시는 첫 빌드 뒤 "처리 기록"에 적는다.** (`com.runtime.ear.dev` 용으로 만들어진 키 `A0:29:9F:…` 는 쓰지 않는다)

| # | 어디 | 무엇을 | 안 하면 |
|---|---|---|---|
| 1 | Apple(터미널) | `cd frontend && npx eas-cli build -p ios --profile preview-store` — Apple 로그인, 번들 ID·인증서 자동 생성. 이어서 `npx eas-cli submit -p ios --latest` — ASC 앱 "이어(Preview)" 자동 생성 | iOS 개발계 앱이 없다 |
| 2 | App Store Connect | TestFlight > 내부 테스트 그룹에 팀원 추가 | 팀원이 설치 못 한다 |
| 3 | 구글 클라우드(프로젝트 475643832949) | OAuth 클라이언트 2개 생성 — **iOS**(번들 `dev.runtime.ear`) · **Android**(패키지 `dev.runtime.ear` + 처리 기록의 SHA-1). iOS 클라이언트 ID 는 `app.config.js` 의 `DEV_SOCIAL_AUTH.googleIosClientId` 에 넣는다(네이티브 값이라 iOS 재빌드 필요 — **1번보다 먼저 하면 빌드 한 번으로 끝난다**) | 개발계 앱 구글 로그인 실패 |
| 4 | 카카오 개발자 콘솔 | 플랫폼에 iOS 번들 ID·Android 패키지 `dev.runtime.ear` + 처리 기록의 키 해시 추가 | 개발계 앱 카카오 로그인 실패 |
| 5 | 네이버 개발자 센터 | Android 패키지 `dev.runtime.ear` · iOS 번들 추가(URL 스킴은 그대로 `earnaverlogin`) | 개발계 앱 네이버 로그인 실패 |
| 6 | 개발계 서버 env | `APPLE_CLIENT_ID=dev.runtime.ear` — `docs/tickets/infra/pending/dev-server-apple-client-id.md` | 개발계 iOS 앱 애플 로그인이 `aud` 불일치로 거부된다 |

## 알려진 한계

- **URL 스킴은 두 앱이 같다**(`ear` · `kakao<앱키>` · `earnaverlogin`). 한 폰에 둘 다 깔려 있으면 카카오톡·네이버 앱에서 돌아올 때 iOS 가 어느 앱을 열지 보장하지 않는다(Android 는 선택 창). 문제가 되면 개발계 전용 카카오·네이버 앱을 따로 등록해 스킴을 가른다 — 별도 티켓.
- 종전 preview 빌드(`com.runtime.ear`, Android vc 11)는 계속 preview 채널 OTA 를 받는다. 개발계 앱으로 갈아탄 뒤 지운다.
- 푸시: 번들이 다르므로 개발계 앱의 푸시 토큰은 별개다. FCM(`google-services.json`)은 KAN-69 쪽 미결 그대로.

## 완료 조건

- Given 운영 앱이 깔린 폰 / When 개발계 앱을 설치한다 / Then 두 앱이 나란히 있고 이름("이어(Preview)")·아이콘(PREVIEW 띠)으로 구분된다
- Given `APP_VARIANT` 없이 설정을 평가한다 / When `app.json` 만 쓸 때와 비교한다 / Then 한 글자도 다르지 않다
- Given 개발계 앱 / When dev 에 JS 변경이 머지된다 / Then preview 채널 OTA 로 받고 개발계 API 를 본다
- Given 개발계 앱 / When 구글·카카오·네이버·애플로 로그인한다 / Then 개발계 API 로 로그인된다
- Given 새 팀원 / When TestFlight 초대를 수락(iOS)하거나 APK 를 받는다(Android) / Then 기기 등록·재빌드 없이 설치된다

## 처리 기록 (2026-09-19 — 코드 반영)

- `app.config.js` 신설. **운영 불변 확인**: `APP_VARIANT` 없이 `expo config --json` 결과가 `app.config.js` 가 없을 때와 바이트 단위로 같다. dev 변형의 차이는 name · icon · bundleIdentifier · package · adaptiveIcon.foregroundImage · associatedDomains(제거) · intentFilters(제거) · extra.appVariant 뿐이다.
- `eas.json`: preview `APP_VARIANT=dev`, production `APP_VARIANT=production` 명시, `preview-store` 프로필 추가. `eas-update.yml`: 채널 결정 단계가 `app_variant` 도 정한다.
- EAS 에 개발계 앱 Android 키스토어 생성됨(위 SHA-1). 클라우드 빌드는 무료 한도 소진으로 실패 → `dev-app-build.yml` 로 대체.
- 남은 것: 위 "사람 손" 1~6, Android APK 워크플로 첫 실행 확인, 팀 Slack 공지. 끝나면 KAN-65 와 함께 닫는다.

## 처리 기록 (2026-09-19 — 식별자·이름 변경)

- 계정 소유자가 등록한 값에 맞춰 식별자를 `com.runtime.ear.dev` → **`dev.runtime.ear`**, 이름을 "이어 dev" → **"이어(Preview)"**, 아이콘 띠를 DEV → PREVIEW 로 바꿨다. 아직 배포된 개발계 빌드가 없어 영향은 없다.

## 처리 기록 (2026-09-19 — Android APK 첫 빌드)

- `dev-app-build` 첫 실행은 `:app:compileReleaseKotlin` 의 `OutOfMemoryError: Metaspace` 로 실패하고 60분 타임아웃까지 매달렸다 → 러너 홈 `gradle.properties` 로 메모리 상향·데몬 끔·arm64 단일 아키텍처(PR #507). 두 번째 실행 성공(Gradle 11분 44초, 전체 약 14분).
- 산출물: **이어(Preview) 1.0.0 (versionCode 1)**, `dev.runtime.ear`, preview 채널, runtimeVersion 3, 44MB. APK 안의 매니페스트·`app.config` 로 패키지·채널·변형(`appVariant: dev`)을 확인했다. Actions 실행 35416601680 의 아티팩트 `ear-dev-apk`(30일 보관).
- **`dev.runtime.ear` Android 서명 키(EAS 저장)** — 콘솔 등록에 쓰는 값:
  - SHA-1 `3A:D2:96:CF:BA:3E:64:CF:B5:77:DD:C5:A7:4B:E3:A2:55:C6:BB:58`
  - SHA-256 `6D:61:42:9F:9B:CA:D4:4F:10:C9:45:C6:E2:E5:31:55:33:5D:FD:DE:D8:EC:D1:59:3C:9E:A3:3F:25:D3:72:E6`
  - 카카오 키 해시 `OtKWz7o+ZM+1d93Fp0vjolXGu1g=`
  - Play 내부 테스트로 배포하면 Play 앱 서명 키가 따로 생긴다 — 그 SHA-1 도 구글·카카오에 함께 등록한다(Play Console > 앱 무결성).
- iOS: `preview-store` 비대화형 빌드는 "Distribution Certificate is not validated for non-interactive builds" 로 막힌다 — 새 번들의 프로비저닝 프로파일 생성에 Apple 로그인이 필요하다(사람 손 1번 그대로).

## 처리 기록 (2026-09-19 — iOS 첫 업로드 실패, 표시 이름 변경)

- iOS `preview-store` 1.0.0 (2)(EAS `9670032f`)는 App Store Connect 업로드는 됐으나 Apple 처리에서 **실패** — `ITMS-90129: The bundle uses a bundle name or display name that is already taken`. 앱 표시 이름 "이어(Preview)"가 ASC 에 등록한 앱 이름 "이어 - preview"(Apple ID `6813738593`)와 달랐다.
- 표시 이름을 **"이어 - preview"** 로 바꿨다(iOS·Android 공통, `app.config.js`). 이 문서 위쪽의 "이어(Preview)"는 이 값으로 읽는다. Play Console 의 등록 이름("이어(Preview)")은 스토어 표시용이라 그대로 둬도 된다 — Android 홈 화면 이름은 다음 네이티브 빌드부터 바뀐다.
- ASC 등록정보(설명·스크린샷·심사 연락처·부제·카테고리·콘텐츠 권한)는 입력·저장했다. `eas.json` `submit.preview-store` 에 ascAppId 등록(PR #515).

## 처리 기록 (2026-09-19 — ITMS-90129 의 진짜 원인: CFBundleName "Preview")

- 표시 이름을 "이어 - preview" 로 바꾼 빌드 3 도 같은 `ITMS-90129` 로 실패했다. IPA 를 풀어 보니 **`CFBundleName` 이 `Preview`** 였다 — Expo 는 앱 이름에서 ASCII 만 남겨 PRODUCT_NAME·CFBundleName 을 만들고("이어(Preview)"·"이어 - preview" → "Preview"/"preview"), 이것이 애플 기본 앱 "미리보기(Preview)"와 겹친다. 운영 앱은 같은 규칙으로 "app" 이 돼 문제가 없었다.
- `app.config.js` 에 dev 변형 전용 config plugin 을 두어 `CFBundleName` 을 **`EarPreview`** 로 고정했다. `expo config --type introspect` 로 확인: dev `CFBundleName=EarPreview`·`CFBundleDisplayName=이어 - preview`, 운영은 `$(PRODUCT_NAME)`·`이어` 그대로.
- 교훈: 앱 이름을 바꿀 때는 **ASCII 만 남긴 결과**가 흔한 단어가 아닌지 본다. Windows 에서는 `expo prebuild -p ios` 가 막히므로 introspect 로 Info.plist 를 검증한다.

## 처리 기록 (2026-09-20 — 완료, archive 로 옮긴다)

- **반영 날짜: 2026-09-20.** PM 이 완료를 확인했다(Jira KAN-76 을 직접 닫음 — 원본을 같은 상태로 맞춘다).
- 개발계 앱은 양 플랫폼에 배포돼 팀이 쓰고 있다: iOS TestFlight "이어 - preview" 1.0.0 (5), 내부 그룹 SWM-Team 자동 배포 · Android APK 는 Actions `dev-app-build` 아티팩트 `ear-preview-apk`. 운영 앱과 한 기기에 같이 깔리고 각자 자기 환경(개발계·운영 API)만 본다. 팀 공지는 #dev-fullstack(2026-09-20, KAN-65).
- 콘솔 등록("사람 손")은 끝났다 — 구글 iOS·네이버 Android 로그인이 개발계 앱에서 성공했다(2026-09-20 실기기). 애플은 KAN-77 로 서버 값이 맞춰졌다.
- **여기서 갈라져 나가 아직 열려 있는 것**: 카카오 로그인 — 앱 키 분리는 KAN-80(`preview-app-social-keys.md`), 개발계 서버의 `KAKAO_APP_ID` 는 KAN-82(`tickets/infra/pending/dev-server-kakao-app-id.md`). 이 티켓의 범위(앱 분리) 밖이라 그쪽에서 닫는다.
