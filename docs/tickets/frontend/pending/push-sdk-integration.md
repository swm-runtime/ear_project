# [FE] 푸시 SDK를 연동한다 — 운영 빌드에서 알림 권한·토큰이 스텁이다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/notification/services/notification-permission.service.ts`(스텁 교체) · 알림 수신·탭 처리(신규) · `frontend/app.json`(`expo-notifications` 플러그인·iOS 권한) · EAS 자격 증명(APNs·FCM) · 포그라운드 복귀 동기화 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-17 |
| 발견 시점 | 2026-09-17 "앱에서 알림이 안 온다" 문의 조사 — 운영 빌드에서 권한·토큰 조회가 모두 스텁이었다 |
| 근거 문서 | `features/notification.md`(FR-19, P1) 4.1·4.2·4.4·4.5·8 · `frontend/architecture.md` 포그라운드 복귀 동기화 표·딥링크 절 · **`changes/archive/push-expo-and-discovery-in-drip-alert.md`(Expo Push 결정 — 2026-09-17 문서 반영 완료)** · `spec/api/onboarding-api.md` 4.9 · `features/paywall.md` 4.2(딥링크 재생 게이트) |
| 연관 | `tickets/backend/pending/push-drip-arrival-sender.md` — 서버 발송 코드도 아직 없다. **두 티켓이 모두 끝나야 알림이 간다** |
| 심각도 | **하** — P1 기능 미구현. 장애가 아니다 |
| 우선순위 | Low(이번 주 안) |
| Jira | [KAN-69](https://runtime364.atlassian.net/browse/KAN-69) |

## 문제

알림 **화면 흐름**(사전 안내 모달·설정 토글·유도 배너·`PUT /users/me/devices/:device_id` 호출)은 만들어져 있지만, 그 밑의 **OS 연동이 개발 스텁**이다.

- `notification-permission.service.ts` — `getOsPermissionStatus` · `requestOsPermission` · `getPushToken`이 `__DEV__`에서만 가짜 값을 주고, **운영 빌드에서는 `throw new Error('push notification SDK not integrated yet')`** 한다.
- 푸시 SDK가 설치돼 있지 않다(`package.json`에 `expo-notifications`가 없다).
- 그래서 실제 기기에서는 OS 권한 다이얼로그가 뜨지 않고, 서버에 **실제 토큰이 한 번도 등록되지 않는다.** 서버 발송이 생겨도 보낼 곳이 없다.
- 알림 수신·탭 처리(딥링크, 포그라운드 인앱 배너)도 없다.

## 요청 내용

1. **SDK 설치·네이티브 설정** — **`expo-notifications`**(결정 2026-09-17 — Expo Push). `app.json` 플러그인 등록, iOS APNs 키와 Android FCM 자격 증명은 **EAS 자격 증명**에 올린다(Firebase 설정 파일·`@react-native-firebase/*`는 쓰지 않는다 — Android 발송에 필요한 FCM 자격 증명만 EAS에 둔다). 토큰은 `getExpoPushTokenAsync({ projectId })`(`app.json`의 EAS `projectId`)로 받는다. **네이티브가 바뀌므로 `runtimeVersion`을 올리고 재빌드한다**(`architecture.md` 2.1).
2. **스텁 교체** — `notification-permission.service.ts`의 세 함수만 실제 구현으로 바꾼다(주석대로 화면·훅은 그대로 쓴다). 권한 거부면 토큰 `null`, 발급받지 못한 토큰을 만들지 않는다(`onboarding-api.md` 4.9).
3. **토큰 동기화 시점** — 사전 안내 종료(허용·거부 모두) · **포그라운드 복귀마다** OS 권한 재확인(`notification.md` 4.2) · **토큰 변경 이벤트**(`addPushTokenListener`) 시 `PUT /users/me/devices/:device_id`.
4. **수신·탭 처리**(`notification.md` 4.4·4.5)
   - 탭 → 스플래시 판정 통과 뒤 딥링크 이동. 온보딩 미완료면 보류했다가 완료 후 이동
   - 콘텐츠 딥링크는 **재생 단일 게이트**(`paywall.md` 4.2)를 그대로 거친다 — 한도 소진이면 페이월
   - 대상 콘텐츠가 회수·삭제면 라이브러리로 폴백 + "콘텐츠를 찾을 수 없어요"
   - 포그라운드 수신은 OS 배너 대신 인앱 배너("새 콘텐츠 N개 도착"), 라이브러리 화면이면 목록만 조용히 갱신
5. **로그아웃** — 로그아웃 후 이전 사용자 알림이 오지 않게 한다. 서버가 로그아웃 시 토큰을 해제하는 것과 짝이다(BE 티켓 5번) — 클라이언트에서 추가로 할 일(로그아웃 시 기기 등록 해제 호출 여부)은 BE와 맞춘다.
6. **iOS 권한 문구** — 푸시 권한만 추가하고 쓰지 않는 권한을 새로 넣지 않는다(`drop-unused-ios-permissions.md` 심사 반려 이력).

## 결정 사항 (2026-09-17)

- **서버 페이로드 확정(KAN-68)** — 앱은 푸시의 `data`에서 `{ type: "drip_arrival", deep_link, content_count }`를 읽는다. `deep_link`는 `ear://library` · `ear://contents/{content_id}`(`notification.md` 3장). 앱에 링킹 설정이 아직 없으니 착수 시 이 형식을 확인하고, 공유 링크 경로로 합치고 싶으면 BE에 알린다(서버 상수 두 개).
- **포그라운드 복귀 동기화가 필수다(요청 3번)** — 서버는 로그아웃 시 그 기기의 토큰을 무효화한다(KAN-68). 같은 계정으로 다시 로그인한 뒤 앱이 `PUT /users/me/devices/:device_id`를 다시 부르지 않으면 **그 기기로 알림이 영영 가지 않는다.** 지금은 사전 안내·설정에서만 호출한다(`useSettingsScreen.ts` 포그라운드 동기화 TODO).
- **발송 수단 = Expo Push** — 앱은 `expo-notifications` + Expo 푸시 토큰. `frontend/architecture.md` 2 푸시 행·`onboarding-api.md` 4.9에 **반영 완료**(2026-09-17 — `changes/archive/push-expo-and-discovery-in-drip-alert.md`). 문서대로 바로 구현하면 된다.
- 드립 도착 알림은 정규 + 탐험 편을 합쳐 하루 1건이다(BE 티켓). 앱 쪽 딥링크 규칙(1편 → 콘텐츠, 2편 이상 → 라이브러리)은 그대로다.
- 스토어 빌드 일정 — 재빌드·재심사가 필요하므로 다음 바이너리 빌드에 묶는다.

## 완료 조건

- Given 운영 빌드 · 권한 미결정 기기 / When 사전 안내에서 [알림 받기]를 누른다 / Then OS 권한 다이얼로그가 뜨고, 결과(허용·거부)와 Expo 푸시 토큰(`ExponentPushToken[...]`, 거부면 `null`)이 서버에 등록된다
- Given 운영 빌드 / When 알림 권한 조회·요청·토큰 조회를 한다 / Then `push notification SDK not integrated yet` 오류가 나지 않는다
- Given 기기 설정에서 알림을 끄고 앱으로 돌아온다 / When 포그라운드로 복귀한다 / Then 서버에 `is_os_permission_granted = false`가 동기화된다
- Given 앱이 백그라운드 / When 드립 알림이 도착해 탭한다 / Then 버전 체크·인증 판정을 거쳐 1편이면 플레이어, 2편 이상이면 라이브러리로 이동한다
- Given 무료 사용자가 오늘 한도를 소진했다 / When 콘텐츠 딥링크 알림을 탭한다 / Then 페이월이 노출된다
- Given 앱이 포그라운드 / When 드립 알림이 도착한다 / Then OS 배너 대신 인앱 배너가 노출된다
- Given 딥링크 대상 콘텐츠가 회수됐다 / When 알림을 탭한다 / Then 라이브러리로 이동하고 "콘텐츠를 찾을 수 없어요" 토스트가 뜬다

## 처리 기록 (2026-09-19 티켓 정리)

- 미착수. 서버 발송 쪽(KAN-68)은 완료됐다 — **이제 이 티켓이 알림의 유일한 병목이다.**
- `expo-notifications` 는 네이티브 모듈이라 **새 네이티브 빌드 + runtimeVersion 올림**이 필요하다. 2026-09-17 의 빌드(iOS 6 · Android 9)와 2026-09-19 의 Android 빌드 10 에는 들어 있지 않다 — 스토어 제출 전에 넣을지, 다음 빌드로 미룰지는 PM 결정.
- APNs 키·FCM 서비스 계정 등록(EAS 자격 증명)이 선행이다(계정 소유자 작업).

## 처리 기록 (2026-09-19 — 코드 반영, 실기기 확인 대기)

**들어간 것**

- `expo-notifications`(~57.0.20) 설치 · `app.json` 플러그인 등록(Android 알림 아이콘 `assets/notification-icon.png` — 로고를 흰색 실루엣으로 뽑았다) · **`runtimeVersion` 2 → 3**. iOS 권한 문구는 추가하지 않았다(푸시는 Info.plist 목적 문구가 없다 — 요청 6).
- 스텁 교체(요청 2) — 세 함수가 실제 SDK를 탄다. 스텁이 남는 곳은 **웹**과 **mock 개발 실행**뿐이다(`IS_OS_PERMISSION_STUBBED`). 운영 빌드에서 `push notification SDK not integrated yet`는 더 나지 않는다. 토큰 발급 실패(네트워크·자격 증명 누락)는 던지지 않고 `null`로 돌려 권한 결과 보고는 계속 가게 했다. Android 13+ 는 채널이 있어야 다이얼로그가 떠서 요청 직전에 `default` 채널을 만든다. 배지 권한은 묻지 않는다(쓰지 않는다).
- 동기화(요청 3) — `services/device-sync.service.ts`. **로그인 완료 · 포그라운드 복귀 · 토큰 변경(`addPushTokenListener`)** 에 `PUT /users/me/devices/:device_id`. 마지막으로 올린 값과 같으면 보내지 않고, 로그아웃하면 그 기억을 지운다(서버가 토큰을 지웠으므로 다음 로그인은 같은 값이어도 다시 올린다). `architecture.md` 5.5 의 "AppLifecycleService 에 핸들러 등록"은 그 서비스가 아직 없어 **회수 동기화와 같은 방식**(feature 서비스 + bootstrap 이 로그인 판정 주입)으로 했다.
- 탭 처리(요청 4) — 수신 서비스는 목적지를 store 에 적어 두기만 하고, **Main 안의 `usePushLinkGate`가 집는다.** Main 이 떴다는 것이 관문 통과(세션 복원 → 재동의 → 온보딩 완료)라 "스플래시 판정 먼저"와 "온보딩 미완료면 보류 후 이동"이 같은 구조로 풀린다. 콘텐츠 목적지는 `usePlayGate`(entry `push`)를 그대로 탄다 — 차감되면 확인 팝업, 소진이면 발급 403 → 플레이어가 페이월로 전환. 회수면 라이브러리 + "콘텐츠를 찾을 수 없어요". 모르는 `deep_link`는 라이브러리로 보낸다.
- 포그라운드 수신 — OS 배너·알림 센터 표시를 끄고 인앱 배너("새 콘텐츠 N개 도착", 5초, 탭 → 라이브러리)를 Main 위에 얹는다. 라이브러리를 보고 있으면 배너 없이 목록만 무효화한다.
- 로그아웃(요청 5) — 클라이언트는 보류 중인 목적지·배너·동기화 기억을 지운다. **기기 등록 해제 호출은 넣지 않았다** — 서버가 로그아웃 시 토큰을 무효화한다(KAN-68)로 충분하다고 봤다.
- 링킹 설정은 만들지 않았다 — `deep_link`는 OS 링크가 아니라 푸시 `data` 안의 문자열이라 앱이 직접 해석한다(`services/push-link.ts` + 테스트). 서버 상수는 그대로 둔다.

**확인한 것** — tsc · eslint · jest(129건) 통과. 웹(mock)에서 store 에 직접 넣어 확인: 탐색 탭 위 배너 노출 → 탭하면 라이브러리 / 라이브러리에서는 배너 없음 / 콘텐츠 목적지 → 재생 확인 팝업. **실제 푸시 수신은 웹·시뮬레이터로 확인할 수 없다** — 아래가 남았다.

**남은 것**

1. **EAS 자격 증명**(계정 소유자) — iOS 푸시 키(APNs) · Android FCM V1 서비스 계정 키. 없으면 토큰은 나와도 발송이 실패한다.
2. **새 네이티브 빌드**(runtime 3) — 기존 빌드(iOS 6 · Android 9·10)는 runtime 2 라 **이 PR 이후의 OTA 를 받지 못한다.** 새 빌드가 깔리기 전까지 그 기기들은 마지막 runtime 2 번들에 머문다.
3. 실기기에서 완료 조건 7개 확인. 그 뒤 archive · KAN-69 완료.

**알려진 공백** — 딥링크 대상이 **삭제**(404 `CONTENT_NOT_FOUND`)된 경우는 라이브러리 폴백이 아니라 플레이어의 로드 실패 화면이 뜬다. 재생 서비스가 404 를 네트워크 실패와 같은 `load_failed`로 내려 진입점이 둘을 가를 수 없다 — 회수(403)만 폴백된다. 발송 직후 삭제되는 경우라 드물다. 고치려면 player 의 세션 상태에 구분을 더해야 한다.

## 처리 기록 (2026-09-19 — runtime 3 빌드 결과)

- **Android production** versionCode 11(aab) · **Android preview** versionCode 11(apk, 개발계 API) — 성공. 둘 다 푸시 코드가 내장돼 있다.
- **iOS production build 8 — 실패.** `Provisioning profile … doesn't include the Push Notifications capability / aps-environment entitlement`. App ID 에 푸시 권한을 켜고 프로파일을 다시 만들어야 하는데, 그 작업은 Apple 계정 로그인(2단계 인증)이 필요해 `--non-interactive` 로는 되지 않는다.
  - **사람 손**: `cd frontend && npx eas-cli build --profile production --platform ios` 를 **대화형으로** 한 번 돌린다. Apple 로그인 → EAS 가 Push Notifications 권한 동기화 · 프로파일 재생성 · **푸시 키(APNs) 생성**까지 물어보며 해 준다(전부 Yes). 한 번 해 두면 이후 빌드는 다시 비대화형으로 돈다.
- **Android 발송용 FCM V1 서비스 계정 키**도 EAS 에 올려야 한다(`eas credentials` → Android → Google Service Account → FCM V1). 없으면 Android 토큰은 나와도 발송이 실패한다.
- **마감 사유**(Low, 발행 2026-09-17 → 이번 주): 코드는 기한 안에 끝났다. iOS 빌드와 발송 확인이 계정 소유자의 수동 작업에 걸려 있다.
