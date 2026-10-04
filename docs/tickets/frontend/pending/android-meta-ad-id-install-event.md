# [FE] Android 광고 ID 를 설치 이벤트부터 싣기 — 네이티브 기본값을 Android 만 true 로 (11/1 출시)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json`(plugins · `runtimeVersion`) · `frontend/plugins/`(신규 config plugin) · `frontend/src/shared/analytics/meta.ts` |
| 요청 파트 | 프론트엔드 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-02 |
| Jira | [KAN-118](https://runtime364.atlassian.net/browse/KAN-118) |
| 시작 날짜 | 2026-10-02 |
| 기한 | 2026-10-05 (Medium +3일 — 코드·빌드 준비까지. **운영 공개는 2026-11-01 이후**) |
| 선행 | `android-meta-ad-id-ota-rollback.md`(KAN-117) — 운영에서 먼저 끈 뒤 이 변경을 얹는다. 사람 손: 처리방침 개정본 11/1 게시(#1105 로 공지 완료, 게시 확인 대기) |
| 발견 시점 | Android 메타 앱 설치 캠페인 연결(2026-10-02) — #1104 가 JS 만 바꿔서는 설치 이벤트에 광고 ID 가 실리지 않는 것을 확인 |
| 근거 문서 | `docs/features/analytics.md` 3.5 · `docs/frontend/architecture.md` 2.1(runtimeVersion) · `react-native-fbsdk-next` 13.4.3 플러그인(`withFacebookAndroid` — `com.facebook.sdk.AdvertiserIDCollectionEnabled` meta-data 를 씀) · Facebook Android SDK 18.3(`facebook-core` 매니페스트가 `com.google.android.gms.permission.AD_ID` 를 선언) |
| 심각도 | 중 (Medium) — 3일 안에 준비. 없으면 Android 광고의 설치 귀속·최적화가 약한 채로 돈다 |
| 상태 | 대기 |

## 문제 — JS 설정만으로는 설치 이벤트에 광고 ID 가 실리지 않는다

광고 ID 수집 여부를 정하는 곳은 두 군데다.

| 위치 | 지금 값 | 적용 시점 |
|---|---|---|
| ① 빌드에 박히는 Android 매니페스트 meta-data `com.facebook.sdk.AdvertiserIDCollectionEnabled` | `false` — `app.json` 플러그인의 `advertiserIDCollectionEnabled: false`가 iOS·Android 공통으로 쓴다 | 앱 시작 즉시(네이티브) |
| ② JS `Settings.setAdvertiserIDCollectionEnabled(...)` (`meta.ts`의 `getSdk()`) | #1104 로 Android `true` | `getSdk()`가 처음 불릴 때 — `sign_up`·`onboarding_complete`·`play_start` |

- 운영은 `isAutoInitEnabled: true`·`autoLogAppEventsEnabled: true`라 SDK 가 **앱 시작 즉시 네이티브로 초기화**되고 첫 실행 이벤트(`fb_mobile_first_app_launch`·`fb_mobile_activate_app`)를 **①의 값으로** 보낸다. ②는 그 뒤, 가입이나 재생 때에야 적용된다.
- 게다가 OTA 는 받은 **다음 실행**부터 적용된다. 새로 설치한 사람의 첫 세션은 스토어 빌드에 들어 있는 JS 로 돈다.
- SDK 는 JS 로 정한 값을 기기에 저장하고, 네이티브 초기화 때 **저장값을 ①보다 먼저 읽는다**(Facebook Android SDK 18.3 `UserSettingsManager` — 저장값이 없을 때만 매니페스트를 본다). 새로 설치한 기기는 저장값이 없으므로 첫 실행은 ①이 정한다.
- 결과: **설치 이벤트에는 광고 ID 가 실리지 않는다.** Meta 의 Android 앱 설치 캠페인(`이어_Android설치_2026-10`, 캠페인 ID 52534477085895)은 설치 이벤트로 광고와 설치를 잇는다. 광고 ID 가 없으면 Play 설치 리퍼러로 잡히는 클릭 기반 설치 일부만 귀속되고, 조회 기반 귀속과 "설치할 만한 사람" 학습이 약해진다.

## 요청 내용

1. **Android 에만 네이티브 기본값을 `true`로** — `app.json`의 `react-native-fbsdk-next` 플러그인 **앞에** 로컬 config plugin 을 추가해 Android 매니페스트 meta-data 를 `true`로 덮는다. 플러그인 옵션 `advertiserIDCollectionEnabled: false`는 그대로 둬 **iOS `Info.plist`(`FacebookAdvertiserIDCollectionEnabled`)는 `false`, ATT 설명문 없음**을 유지한다. 운영 설정의 원본이 `app.json`이므로(`app.config.js` 머리말 — 운영 바이너리는 이 파일로 달라지지 않는다) 플러그인은 `app.json`에 건다. 예:

   ```js
   // frontend/plugins/with-android-meta-advertiser-id.js
   const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

   const KEY = 'com.facebook.sdk.AdvertiserIDCollectionEnabled';

   module.exports = (config) =>
     withAndroidManifest(config, (mod) => {
       const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
       AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, 'true');
       return mod;
     });
   ```

   새 설치 기기는 저장값이 없어 이 값으로 첫 실행 이벤트가 나간다. 기존 사용자는 예전 JS 가 저장한 값이 우선하지만, 그들은 이미 설치를 마쳐 설치 귀속과 상관이 없다(요청 2 의 JS 설정이 다음 초기화부터 덮는다).

   **순서가 중요하다.** Expo 는 plugins 목록 뒤쪽 플러그인의 매니페스트 수정을 먼저 실행한다. 그래서 fbsdk 플러그인 **뒤에** 두면 fbsdk 가 같은 meta-data 를 `false`로 다시 써서 `false`가 남고, **앞에** 둬야 `true`가 남는다(2026-10-04 prebuild 실측 — 발행 당시 "뒤에"로 잘못 적었던 것을 정정). 결과는 prebuild 매니페스트로 확인한다(완료 조건 1).
2. **JS 도 같은 값을 가리킨다** — 선행 티켓에서 되돌린 `meta.ts`를 이 빌드에서 Android `true`로 다시 켠다. 네이티브와 JS 가 다른 값을 가리키면 어느 쪽이 이겼는지 매번 따져야 한다.
3. **`runtimeVersion` 31 → 32** — 네이티브 변경이라 올린다(`architecture.md` 2.1, `_runtimeVersionNote`에 사유 기록). 올린 뒤의 OTA 는 32 빌드에만 간다 — **iOS 도 같은 값을 쓰므로 iOS 운영 빌드도 32 로 함께 내야** iOS 사용자가 이후 OTA 를 계속 받는다. 머지 시점과 두 스토어 출시 계획을 같이 잡는다.
   참고(2026-10-04): 매니페스트 meta-data 값 하나라 새 JS 가 옛 빌드에서도 깨지지 않는다. 2026-09-29 Android 재빌드 때 31 을 유지한 선례(`app.json` `_runtimeVersionNote`)처럼 **31 유지도 가능하다** — 올리면 iOS 도 32 빌드를 내야 OTA 가 이어진다. 어느 쪽으로 할지는 담당이 판단한다.

4. **운영 공개는 2026-11-01(처리방침 적용일) 이후** — 빌드·심사는 미리 받아 두고, Play Console 의 관리형 게시(또는 출시 보류)로 공개 시점을 11/1 이후에 맞춘다. 네이티브 값은 OTA 로 늦출 수 없어서, 공개하는 순간부터 수집된다.
5. **문서** — `analytics.md` 3.5 의 "네이티브 기본값은 false 를 유지한다" 문단이 바뀐다. `changes/pending`에 기록해 통합 때 반영한다.

## 요지 (Jira 본문용)

- 지금(#1104)은 JS 에서만 켜서 첫 실행의 설치 이벤트엔 광고 ID 가 안 실린다 — SDK 가 앱 시작 즉시 네이티브 설정(false)으로 설치 이벤트를 보내고, JS 설정은 가입·재생 때에야 적용된다. OTA 는 다음 실행부터라 새 설치자의 첫 세션엔 아예 안 닿는다
- Android 매니페스트만 true 로 덮는 config plugin 추가(iOS 는 false·ATT 없음 유지), JS 도 Android true
- runtimeVersion 31 → 32 — iOS 빌드도 32 로 함께 내야 OTA 가 끊기지 않는다
- 운영 공개는 처리방침 적용일 11/1 이후(관리형 게시)
- analytics.md 3.5 수정은 changes/pending 기록
- 상세·완료 조건은 원본 문서

## 사람 손

| # | 어디 | 무엇을 | 담당 | 상태 |
|---|---|---|---|---|
| 1 | Play Console | 관리형 게시(또는 출시 보류)로 이 빌드의 프로덕션 공개를 11/1 이후로 | 박수헌 | 빌드 준비 뒤 |
| 2 | 랜딩 처리방침 | 개정본(`privacy-2026-11-01`)이 11/1 에 본 처리방침으로 게시됐는지 확인 | 이주호 | 11/1 |
| 3 | Play Console | 광고 ID 선언("예" — 광고·분석)·데이터 보안 양식 | 박수헌 | 완료(analytics.md 3.5 기록) |

## 완료 조건

- Given `runtimeVersion` 32 운영 프로필로 prebuild 한다 / When Android 매니페스트를 본다 / Then `com.facebook.sdk.AdvertiserIDCollectionEnabled`가 `true`이고, 빌드된 AAB 의 병합 매니페스트에 `com.google.android.gms.permission.AD_ID`가 있다
- Given 같은 prebuild 의 iOS / When `Info.plist`를 본다 / Then `FacebookAdvertiserIDCollectionEnabled`가 `false`이고 `NSUserTrackingUsageDescription`이 없다(ATT 팝업 없음)
- Given 11/1 이후 공개된 Android 빌드를 새로 설치하고 기기 광고 ID 를 이벤트 관리자 테스트 이벤트에 등록한다 / When 앱을 처음 연다 / Then 테스트 이벤트에 첫 실행 이벤트(`fb_mobile_activate_app` 또는 `fb_mobile_first_app_launch`)가 보인다
- Given Play Console / When 이 빌드의 프로덕션 출시 기록을 본다 / Then 공개일이 2026-11-01 이후다
