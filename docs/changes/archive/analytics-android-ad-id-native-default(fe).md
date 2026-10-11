# Android 광고 ID 네이티브 기본값 — "네이티브 기본값은 false 를 유지한다" 정정

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/analytics.md` 3.5 "광고 측정 (Meta)" · 4장 iOS 광고 식별자 항목 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(프론트엔드) |
| 발행 날짜 | 2026-10-06 |
| 관련 티켓 | `tickets/frontend/archive/android-meta-ad-id-install-event.md`([KAN-118](https://runtime364.atlassian.net/browse/KAN-118)) — 코드 반영, 묶음 빌드 대기 |

## 수정 내용

`features/analytics.md` 3.5 의 Android 광고 ID 항목을 바꾼다.

- 지울 것: "Android 광고 ID(AAID/GAID)는 운영 SDK의 JS 초기화에서만 수집을 켠다(2026-10-02). **네이티브 기본값은 false를 유지한다.**"
- 넣을 것: "Android 광고 ID(AAID/GAID)는 **네이티브 기본값부터 켠다**(KAN-118) — `app.json` 의 로컬 플러그인 `plugins/with-android-meta-advertiser-id.js` 가 매니페스트 meta-data `com.facebook.sdk.AdvertiserIDCollectionEnabled` 를 `true` 로 덮고(`react-native-fbsdk-next` 플러그인보다 **앞에** 둔다), JS 초기화(`meta.ts`)도 Android `true` 를 가리킨다. 운영 SDK 는 앱 시작 즉시 네이티브 값으로 첫 실행 이벤트를 보내므로, 설치 이벤트에 광고 ID 를 실으려면 네이티브 값이 `true` 여야 한다. **iOS 는 그대로** — 플러그인 옵션 `advertiserIDCollectionEnabled: false` 로 `Info.plist` 가 false, ATT 설명문 없음. 네이티브 값이라 OTA 가 아니라 스토어 빌드로만 바뀐다(묶음 네이티브 빌드, runtimeVersion 32 예정)."
- 같은 항목의 "운영 빌드 1.1.0(16)… OTA 적용 가능하다"·"적용일 이전에 운영 OTA로 배포하지 않는다" 서술은, 네이티브 값이 들어간 빌드의 **공개 시점**(처리방침 적용일 2026-11-01 이후 여부)으로 옮겨 적는다. 공개 시점은 묶음 빌드 제출 때 PM 이 정한다 — 반영 시점의 결정을 적는다.
- 4장 "Meta SDK(fbsdk)도 IDFA 를 끈다(`advertiserIDCollectionEnabled: false`…)" 문장은 iOS 한정임을 밝힌다: "Meta SDK(fbsdk)도 **iOS** IDFA 를 끈다 … Android 광고 ID 는 3.5."

## 사유

KAN-118 로 Android 매니페스트의 광고 ID 수집 기본값이 `true` 가 됐다(PR 에서 prebuild 로 확인). 3.5 는 아직 "네이티브 기본값은 false 를 유지한다"고 말해, 문서를 보고 구현하면 플러그인을 지우거나 순서를 바꾸게 된다. KAN-117(운영에서 먼저 끄는 OTA 롤백)은 PM 결정으로 진행하지 않았다(2026-10-05) — JS 의 Android `true` 는 그대로다. `features/`는 FE 단독 소유가 아니라 개발 중 직접 고치지 않고 여기 기록한다(루트 `CLAUDE.md` 요청 문서 규칙).

## 완료 조건

- Given `features/analytics.md` 3.5 / When Android 광고 ID 항목을 읽는다 / Then 네이티브 기본값이 Android `true`(로컬 플러그인, fbsdk 플러그인보다 앞)이고 iOS 는 `false`·ATT 없음이라고 적혀 있으며, "네이티브 기본값은 false 를 유지한다" 문장이 남아 있지 않다
- Given 같은 문서 4장 / When IDFA 항목을 읽는다 / Then fbsdk 의 `advertiserIDCollectionEnabled: false` 가 iOS 한정이라고 읽힌다

## 처리 기록

- **반영 날짜: 2026-10-09** — 브랜치 `docs/apply-changes-pending-1009`. features/analytics.md 3.5·4장 반영. 운영 공개 시점은 "처리방침 적용일 2026-11-01 이후, 확인은 KAN-156"으로 적었다.
