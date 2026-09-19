# [FE] preview 앱에 개발계 카카오 앱 키·구글 iOS 클라이언트 반영 + 재빌드

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.config.js`(`DEV_SOCIAL_AUTH`·플러그인 덮어쓰기) · `frontend/app.json`(`runtimeVersion`) |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-80](https://runtime364.atlassian.net/browse/KAN-80) |
| 발견 시점 | preview 앱(`dev.runtime.ear`)에서 카카오·네이버·구글 로그인이 모두 실패 — 원인 조사(2026-09-20) |
| 근거 문서 | `tickets/frontend/pending/dev-app-separate-bundle.md`(KAN-76 — 콘솔 등록 6항목) · `frontend/architecture.md` 2.1(runtimeVersion) |
| 중요도 | **High**(오늘 안) — 로그인이 막혀 preview 앱으로 **아무것도 검증할 수 없다.** 개발계 앱을 만든 목적 자체가 서 있지 않다 |
| 상태 | 진행 — 코드·재빌드·산출물 검증 완료(2026-09-20), **실기기 로그인 확인 남음** |

## 배경 — 확인된 사실

KAN-76 으로 앱 식별자를 `dev.runtime.ear` 로 바꾼 뒤 소셜 로그인 3종이 실패했다. 콘솔 등록을 마쳤는데도 카카오가 계속 실패해 **빌드된 APK 를 직접 뜯어 확인했다**(Actions 아티팩트 `ear-dev-apk`).

```
패키지명        dev.runtime.ear
카카오 URL 스킴   kakaoe1f65f8291691ef43de3164b0a602604   ← 운영 앱 키
```

앱이 **운영 카카오 앱 키를 그대로 들고 있다.** 그 키는 카카오 콘솔에서 패키지 `com.runtime.ear` 에 묶여 있어, 패키지가 `dev.runtime.ear` 인 앱이 그 키로 로그인을 요청하면 거부된다. 콘솔에 개발계 패키지·키 해시를 아무리 등록해도 **앱이 내미는 키가 옛 키라서** 통과하지 못한다.

세 제공자가 앱 신원을 확인하는 방식이 달라 증상이 갈렸다.

| 제공자 | 무엇에 묶이나 | preview 앱에서 |
|---|---|---|
| 카카오 | 네이티브 앱 키 ↔ 패키지명·번들 ID (로그인마다 대조) | **실패** — 앱에 운영 키가 박혀 있다 |
| 구글 | OAuth 클라이언트 ↔ 패키지+SHA-1(Android) · 번들 ID(iOS) | Android 는 콘솔 등록으로 해결, **iOS 는 클라이언트 ID 를 앱에 심어야 한다** |
| 네이버 | 클라이언트 ID·시크릿(패키지/번들을 로그인 시점에 강제하지 않음) | iOS 성공. Android 는 네이버 앱이 호출자 패키지를 보므로 콘솔 등록 필요 |

## 요청 내용

1. **`DEV_SOCIAL_AUTH` 에 `kakaoNativeAppKey` 추가** — `a67198ac1a489d5d2d3099e8f098a570`.
   - `@react-native-kakao/core` 플러그인의 `nativeAppKey` 를 덮는다(네이티브 — URL 스킴이 `kakaoa67198ac…` 로 바뀐다).
   - `extra.socialAuth.kakaoNativeAppKey` 도 함께 덮는다(JS — `provider-auth.service.ts` 의 `initializeKakaoSDK` 가 읽는다). **둘 중 하나만 바꾸면 스킴과 SDK 초기화 값이 갈린다.**
   - 기존 `googleIosClientId` 처리와 같은 모양이다(플러그인 + `extra` 동시 덮어쓰기).
2. **`DEV_SOCIAL_AUTH.googleIosClientId`** 를 개발계 iOS 클라이언트 ID 로 채운다(현재 `null` → 운영 값 사용). 클라이언트는 구글 클라우드 프로젝트 `475643832949` 에 번들 `dev.runtime.ear` 로 새로 만든다 — **아래 "선행 작업" 참조.**
3. **`runtimeVersion` 을 `3` → `4`** 로 올리고 `_runtimeVersionNote` 에 사유를 적는다(네이티브 URL 스킴 변경).
4. **안드로이드·iOS 를 다시 빌드**한다. Android 는 `dev-app-build.yml`, iOS 는 `preview-store` 프로필 → TestFlight.
5. 빌드 후 3종 로그인을 실기기에서 확인한다.

## 선행 작업 (사람 손)

| # | 어디 | 무엇을 | 상태 |
|---|---|---|---|
| 1 | 카카오 개발자 콘솔 | 네이티브 앱 키 `ear-dev-native-key` 생성 — 패키지·번들 `dev.runtime.ear`, 키 해시 2종 | **완료**(2026-09-20) |
| 2 | 구글 클라우드 | **Android** 클라이언트 — 패키지 `dev.runtime.ear` + SHA-1 `66:B6:…` | **완료** |
| 3 | 구글 클라우드 | **iOS** 클라이언트 — 번들 `dev.runtime.ear` | **완료**(2026-09-20) |
| 4 | 네이버 개발자센터 | Android 패키지 `dev.runtime.ear` 추가 | 확인 필요 |
| 5 | 개발계 서버 | `APPLE_CLIENT_ID=dev.runtime.ear` — `tickets/infra/archive/dev-server-apple-client-id.md`(KAN-77) | **완료**(2026-09-20) |

## 확인된 식별자 (다음에 또 찾지 않도록)

```
카카오 개발계 앱 키   a67198ac1a489d5d2d3099e8f098a570
  URL 스킴          kakaoa67198ac1a489d5d2d3099e8f098a570
카카오 운영 앱 키     e1f65f8291691ef43de3164b0a602604   (건드리지 않는다)

Play 앱 서명 키       66:B6:B9:AA:C1:28:BB:EC:FD:AC:96:23:F9:C5:65:07:B3:DC:90:5C
  카카오 키 해시      Zra5qsEou+z9rJYj+cVlB7PckFw=
EAS 업로드 키         3A:D2:96:CF:BA:3E:64:CF:B5:77:DD:C5:A7:4B:E3:A2:55:C6:BB:58
  카카오 키 해시      OtKWz7o+ZM+1d93Fp0vjolXGu1g=

Apple Team ID        3RJ4N5XLN9
App Store ID (개발계)  6813738593        운영 6807708636
```

Play 스토어로 설치한 앱은 **Play 가 다시 서명**하므로 실제 서명키는 Play 앱 서명 키다. EAS 업로드 키는 APK 를 직접 받아 설치할 때만 쓰인다 — 둘 다 등록해 두면 어느 경로로 깔아도 동작한다.

## 범위 밖

- 운영 앱(`com.runtime.ear`)의 소셜 설정 — 건드리지 않는다. `app.json` 은 운영 원본이고 `app.config.js` 는 `APP_VARIANT=dev` 일 때만 덮는다.
- 개발계 서버 `APPLE_CLIENT_ID` — 인프라 티켓 KAN-77(완료).
- 네이버·구글 Android 콘솔 등록 — 앱에 심는 값이 없어 재빌드와 무관하다.

## 완료 조건

- Given 재빌드한 preview 앱(Android·iOS) / When 카카오로 로그인한다 / Then 개발계 서버로 `social-login` 요청이 도달하고 로그인·가입이 완료된다
- Given 재빌드한 preview 앱 iOS / When 구글로 로그인한다 / Then 성공한다(운영 클라이언트 ID 로 떨어지지 않는다)
- Given 빌드된 APK 의 `AndroidManifest.xml` / When 스킴을 읽는다 / Then `kakaoa67198ac1a489d5d2d3099e8f098a570` 이다
- Given 운영 앱 빌드 / When `expo config --type introspect` 로 확인한다 / Then 카카오 키·구글 클라이언트가 종전 운영 값 그대로다
- Given `app.json` / When 읽는다 / Then `runtimeVersion` 이 `4` 이고 사유가 `_runtimeVersionNote` 에 적혀 있다

## 처리 기록

- 2026-09-20 발행. 원인은 APK 매니페스트로 확정했다(운영 카카오 키가 박혀 있음).
- 2026-09-20 **코드 반영**(PR #521 머지). 카카오 개발계 키·구글 iOS 클라이언트를 `DEV_SOCIAL_AUTH`에 넣고 플러그인·`extra` 양쪽을 덮었다. `runtimeVersion` 3 → 4. introspect 로 운영 값 불변 확인, lint 통과. **남은 것**: 재빌드 → 실기기 3종 로그인 확인.
- 2026-09-20 **재빌드·산출물 검증 완료 — 실기기 로그인 확인만 남았다.**
  - runtime 4 빌드(같은 4 에 KAN-78 expo-image 가 함께 실렸다): **iOS 개발계 1.0.0 (5)** TestFlight 업로드 완료 · **Android 개발계 APK** Actions 실행 35457296079, 아티팩트 **`ear-preview-apk`**(이름이 `ear-dev-apk`에서 바뀌었다).
  - **완료 조건 3** — 새 APK 의 `AndroidManifest.xml`을 뜯어 확인: 패키지 `dev.runtime.ear`, 스킴 `kakaoa67198ac1a489d5d2d3099e8f098a570` 하나뿐이다(운영 키 `kakaoe1f65f…` 없음). 내장 `app.config`: runtime 4 · `appVariant: dev` · 카카오 개발계 키 · 구글 iOS 클라이언트 `…8p18o9514dn…`.
  - **완료 조건 4** — `APP_VARIANT=production expo config --type introspect`: 번들 `com.runtime.ear`, 카카오 `e1f65f…`, 구글 iOS `…gl9ntr62dss…`, iOS URL 스킴도 운영 값 그대로. dev 변형은 Info.plist 스킴까지 개발계 값으로 바뀐다(`kakaoa67198…` · `com.googleusercontent.apps.…8p18o9514dn…`).
  - **완료 조건 5** — `app.json` runtimeVersion `4`, 사유 기록됨.
  - **남은 것(사람 손)**: 새 빌드를 깐 실기기에서 카카오(Android·iOS)·구글(iOS) 로그인 → 완료 조건 1·2. 네이버 Android 패키지 등록(선행 작업 4)은 여전히 "확인 필요"다. 확인되면 archive · KAN-80 완료.
  - **마감**(High, 오늘 안): 코드·빌드·산출물 검증은 발행 당일에 끝났다. 남은 것은 기기에서 로그인 버튼을 눌러 보는 일이다.

