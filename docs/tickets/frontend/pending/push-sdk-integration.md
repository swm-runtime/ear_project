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
