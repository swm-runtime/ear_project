# [FE] Android 푸시가 오지 않는다 — FCM 설정(`google-services.json` · FCM V1 키)이 없다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/google-services.json`(신설) · `frontend/app.json`(`android.googleServicesFile`) · EAS 자격 증명(Android FCM V1) |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-81](https://runtime364.atlassian.net/browse/KAN-81) |
| 발견 시점 | KAN-69 실기기 검증 준비 — EAS 자격 증명 조회에서 Android FCM 항목이 전부 비어 있고 저장소에 `google-services.json` 이 없었다 |
| 근거 문서 | `docs/tickets/frontend/pending/push-sdk-integration.md`(KAN-69 — "Android 발송용 FCM V1 서비스 계정 키도 EAS 에 올려야 한다") · `docs/frontend/architecture.md` 2 푸시 행 |
| 중요도 | **Medium** — 3일 안. Android 첫 정식 빌드를 Play 에 올리기 전에 들어가야 재업로드를 피한다 |
| 상태 | **완료**(2026-09-20) — Android 실기기에서 토큰 발급·발송 도착 확인 |

## 문제

- `expo-notifications` 는 Android 에서 토큰을 FCM 으로 받는다. `google-services.json` 이 없으면 `getExpoPushTokenAsync` 가 Firebase 초기화 오류로 실패한다.
- `notification-permission.service.ts` 의 `getPushToken` 은 그 오류를 잡아 `null` 을 돌린다(권한 결과 보고를 막지 않으려는 의도) → **권한 창은 뜨고 크래시도 없는데 서버에는 토큰 없이 올라간다.** 조용히 실패해서 겉으로는 정상으로 보인다.
- EAS 의 Android 자격 증명에 FCM V1 서비스 계정 키가 없다(`com.runtime.ear`·`dev.runtime.ear` 모두) — 토큰이 나와도 Expo 가 FCM 으로 발송하지 못한다.
- 발송 수단이 Expo Push 라 **BE 는 Firebase 를 모른다**(KAN-69 결정). 설정 파일은 앱 빌드에, 발송 키는 EAS 에 들어간다.

## 요청 내용

1. Firebase 프로젝트에 Android 앱 두 개(`com.runtime.ear` · `dev.runtime.ear`)를 등록하고 `google-services.json` 을 `frontend/` 에 둔다. `app.json` 의 `android.googleServicesFile` 로 연결한다(개발계 변형도 같은 파일 — 두 패키지가 한 파일에 들어 있다).
2. Analytics·Gemini 등 다른 Firebase 제품은 켜지 않는다 — 수집 항목이 늘면 스토어 개인정보 신고를 고쳐야 한다.
3. **FCM V1 서비스 계정 키를 EAS 에 등록한다(계정 소유자).** Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성" → `cd frontend && npx eas-cli credentials` → Android → (패키지 선택) → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → 업로드. **두 패키지 모두** 한다. 키 파일은 저장소에 넣지 않는다.
4. Android 재빌드 — 운영 aab, 개발계 apk/aab(`dev-app-build`).
5. 실기기에서 KAN-69 완료 조건 1·4·6 을 Android 로 확인한다.

## 완료 조건

- Given FCM 설정이 든 Android 빌드 / When 알림을 허용한다 / Then 서버에 `ExponentPushToken[...]` 이 등록된다(`null` 이 아니다)
- Given 그 기기 / When Expo 푸시 도구(expo.dev/notifications) 또는 개발계 드립이 발송한다 / Then 알림이 도착한다
- Given iOS / When 같은 JS 번들을 받는다 / Then 동작이 변하지 않는다

## 처리 기록 (2026-09-20 — 설정 파일 반영)

- Firebase 프로젝트 **`ear-push`**(프로젝트 번호 800761431485, runtime364 계정, Spark 무료 요금제)를 새로 만들었다. 구글 OAuth 프로젝트(475643832949)에 붙이지 않은 이유: 계정에 "My First Project" 가 셋이라 콘솔에서 가려낼 수 없었다 — FCM 은 OAuth 와 같은 프로젝트일 필요가 없다. Analytics·Gemini·Google 개발자 프로그램은 끄고 만들었다.
- Android 앱 `com.runtime.ear`("ear prod") · `dev.runtime.ear`("ear preview") 등록. `google-services.json` 한 파일에 둘 다 들어 있다.
- `app.json` 에 `android.googleServicesFile: "./google-services.json"`. `expo config` 로 운영·개발계 변형 모두 같은 경로를 보는 것을 확인했다.
- **`runtimeVersion` 은 올리지 않았다(4 유지).** 이 변경은 JS↔네이티브 인터페이스를 바꾸지 않는다 — FCM 설정이 없는 runtime 4 빌드는 같은 JS 로 종전처럼 토큰 `null`, 설정이 든 새 빌드는 같은 JS 로 토큰을 받는다. 올리면 iOS(runtime 4, 2026-09-19 빌드 5)까지 이유 없이 다시 뽑아야 한다.
- 남은 것: 요청 3(사람 손) → 4 → 5.

## 처리 기록 (2026-09-20 — 실기기 확인 완료, archive 로 옮긴다)

- **반영 날짜: 2026-09-20.** PM 이 Android 실기기(개발계 앱 — Play 내부 테스트 **3 (1.0.0)**, runtime 4)에서 확인했다. 테스트 발송은 Expo Push API 로 서버와 같은 페이로드를 보냈다.
- **요청 3(FCM V1 키)은 이미 등록돼 있었다** — 발송 영수증이 `ok` 로 돌아오고 기기에 알림이 도착했다. 위 기록의 "남은 것: 요청 3(사람 손)"은 이 시점에 끝나 있던 것이다.
- **요청 4(재빌드)** — FCM 설정이 든 개발계 AAB 가 versionCode 3 으로 Play 내부 테스트에 게시돼 있다(2026-09-20 17:21). Actions 의 최신 AAB(02:54 빌드)를 뜯어 같은 versionCode·패키지(`dev.runtime.ear`)·개발계 카카오 스킴임을 확인했다. 운영 aab 는 EAS 무료 Android 빌드 한도(10-01 초기화) 때문에 아직이다 — 운영 빌드가 나올 때 이 설정이 함께 들어간다.

| # | 완료 조건 | 확인 |
|---|---|---|
| 1 | 알림 허용 → 서버에 `ExponentPushToken[...]` 등록 | 토큰 발급(`ExponentPushToken[tm1mQIB4…]`) |
| 2 | 발송 → 도착 | Expo 영수증 `ok` + 기기에 OS 알림 도착 |
| 3 | iOS 동작 불변 | 같은 번들로 같은 날 KAN-69 완료 조건 7개를 iOS 에서 확인 |

- **덤으로 Android 에서 확인한 KAN-69 항목**(서버 로그 교차 — User-Agent `okhttp`): 콘텐츠 딥링크 → 확인 팝업 → 플레이어(`audio-urls` 201 · `play` 200) · 없는 콘텐츠 → 라이브러리 + 토스트(404), **이후 앱 정상**(iOS 에서 굳던 지점) · 대본 패널(`/script` 200) · **상태 표시줄 알림 아이콘 정상**(로고 실루엣 — 실기기 첫 확인).
- **미확인**: 포그라운드 인앱 배너를 Android 에서 따로 가려 보지 못했다(iOS 에서는 확인). Android 13+ 권한 다이얼로그가 채널 생성 뒤에 뜨는지도 눈으로 가려 보지 않았다 — 토큰이 나왔으므로 권한은 허용된 상태다.
- **후속**: 없는 콘텐츠에도 "오늘 N회 남았어요" 팝업이 먼저 뜬다 → `push-confirm-after-issue.md`(KAN-86).

