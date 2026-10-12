# [FE] Android 광고 ID 수집이 처리방침 적용일(11/1) 전에 운영 OTA로 켜졌다 — 되돌리기

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/shared/analytics/meta.ts`(운영 OTA 번들) |
| 요청 파트 | 프론트엔드 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-02 |
| Jira | [KAN-117](https://runtime364.atlassian.net/browse/KAN-117) |
| 시작 날짜 | 2026-10-02 |
| 기한 | 2026-10-02 (High — 당일) |
| 선행 | 없음 |
| 발견 시점 | Android 메타 광고 연결 작업 중 #1104 의 반영 범위를 확인하다가(2026-10-02 밤) |
| 근거 문서 | `docs/features/analytics.md` 3.5(#1104 가 추가한 문단 — "이 변경은 적용일 이전에 운영 OTA로 배포하지 않는다") · 랜딩 `privacy/2026-11-01` 개정 안내(#1105 — 공지 10/2, 적용 예정 11/1) · `.github/workflows/eas-update.yml`(main 머지 = production 채널 OTA 자동 발행) |
| 심각도 | 상 (High) — 오늘 안. 고지한 적용일보다 먼저 개인정보(광고 ID)가 수집되고 있다 |
| 상태 | 진행하지 않음 — PM 결정(2026-10-05) |

## 문제

- #1104(`d6dab1c5`)가 Meta SDK 초기화 값을 `setAdvertiserIDCollectionEnabled(Platform.OS === 'android')`로 바꿨다. 같은 날 #1107(dev → main) 머지로 `eas-update` 가 **production 채널 OTA 를 발행했다**(2026-10-02 21:30 KST, 실행 `37007083931` 성공). `runtimeVersion` 이 31 그대로라 오늘 출시된 Android 운영 빌드 1.1.0 이 이 업데이트를 받는다.
- 업데이트는 받은 **다음 실행**부터 적용된다. Meta SDK 설정은 `getSdk()`에서 적용되고, `getSdk()`는 `sign_up`·`onboarding_complete`·`play_start` 때 불린다. 즉 업데이트를 받은 Android 사용자가 다음 실행에서 **재생을 한 번 하면 그때부터 광고 ID(AAID/GAID)가 Meta 로 간다.**
- 그런데 같은 커밋이 `analytics.md` 3.5 에 "적용일 이전에 운영 OTA로 배포하지 않는다(자동 활성화 예약 없음)"고 적었고, 개인정보처리방침 개정은 **10/2 공지, 11/1 적용 예정**이다. 고지한 적용일보다 먼저 수집이 시작된 상태다.
- 원인은 운영 전제와 배포 장치의 어긋남이다. **main 에 `frontend/` 변경이 머지되면 production OTA 가 자동으로 나간다**(`eas-update.yml`). "OTA 로 배포하지 않는다"를 지키려면 코드가 main 에 들어가지 않거나, 코드 안에 적용 시점 장치가 있어야 하는데 둘 다 없었다.

## 요청 내용

1. **main 에서 Android 광고 ID 수집을 다시 끈다** — `meta.ts`의 값을 iOS·Android 모두 `false`로 되돌린다. dev → main PR(작성자 외 1명 승인) 머지로 production OTA 가 자동 발행된다. 같은 `runtimeVersion` 31 이라 Android·iOS 운영 빌드 모두 받는다.
2. **이미 켜진 기기의 저장값을 덮는다.** Facebook Android SDK 18.3 은 `setAdvertiserIDCollectionEnabled` 값을 기기(SharedPreferences `com.facebook.sdk.USER_SETTINGS`)에 저장하고, 다음 실행의 네이티브 초기화에서 **저장값을 매니페스트 값보다 먼저 읽는다**(`UserSettingsManager.initializeUserSetting` — 저장값이 없을 때만 매니페스트를 본다). 되돌린 코드도 `getSdk()`가 불리기 전까지는(재생 전까지는) 저장된 `true`로 앱 실행 이벤트가 나간다. **운영에서 앱 시작 시 Meta 설정을 한 번 적용하는 호출**을 함께 넣어(예: `getSdk()`를 앱 시작 시 1회 — 개발계·웹·mock 은 지금처럼 건너뜀) 저장된 `true`를 `false`로 덮는다.
3. 11/1 이후 다시 켜는 방법(설치 이벤트까지 광고 ID 를 싣는 네이티브 설정 포함)은 후속 티켓 `android-meta-ad-id-install-event.md`에서 다룬다. 이 티켓은 **끄기만** 한다.
4. 경위는 처리 기록에 남긴다 — 언제부터 언제까지 운영에서 켜져 있었는지(OTA 발행 시각 기준). 처리방침·대외 고지가 필요한지는 팀이 판단한다.

## 요지 (Jira 본문용)

- #1104 의 Android 광고 ID 수집이 #1107 main 머지로 운영 OTA 에 실렸다(10/2 21:30). 처리방침 개정 적용일은 11/1 — 고지보다 먼저 수집 중
- main 에서 수집을 다시 끄고(dev → main PR, 머지 시 운영 OTA 자동 발행)
- SDK 가 저장해 둔 true 를 덮도록 운영 앱 시작 시 Meta 설정을 한 번 적용
- 11/1 이후 재활성화는 후속 티켓에서
- 상세·완료 조건은 원본 문서

## 사람 손

| # | 어디 | 무엇을 | 담당 | 상태 |
|---|---|---|---|---|
| 1 | Play Console | 광고 ID 선언·데이터 보안 양식 — **그대로 둔다.** SDK 가 광고 ID 권한을 매니페스트에 넣고 있어 "예" 선언이 맞고, 11/1 에 다시 켤 예정이다 | — | 변경 없음 |

## 완료 조건

- Given origin/main 의 `meta.ts` / When 광고 ID 설정 줄을 본다 / Then 2026-11-01 전에는 iOS·Android 모두 `false`이고, 운영 앱 시작 시 이 값이 한 번 적용된다
- Given 되돌림 커밋이 main 에 머지됐다 / When `eas-update`(main) 실행을 본다 / Then 성공했고 production 채널의 최신 업데이트가 그 커밋이다
- Given 21:30 업데이트를 받아 재생까지 한 Android 운영 기기(기기 광고 ID 를 이벤트 관리자 테스트 이벤트에 등록) / When 되돌림 업데이트를 받은 뒤 앱을 두 번 실행한다 / Then 테스트 이벤트에 이 기기의 이벤트가 잡히지 않는다(광고 ID 가 실리지 않아 매칭되지 않는다)

## 처리 기록

- **2026-10-05 — 진행하지 않음 (반영 날짜 2026-10-08)**
  - PM 결정으로 운영 JS 의 Android 광고 ID 수집(`true`)을 끄지 않는다. 같은 결정이 후속 티켓 `android-meta-ad-id-install-event.md`(archive) 선행 행에 적혀 있다
  - 운영 `meta.ts` 는 #1104 이후 Android `true` 그대로이고, 2026-10-06 `c8f5a48f` 로 네이티브 기본값도 Android `true` 가 됐다
  - 완료 조건은 되돌리기 전제라 해당 없음. Jira KAN-117 은 2026-10-06 완료 처리됐다
  - 이 문서는 발행(2026-10-02) 뒤 커밋되지 않고 로컬에만 있었다 — 2026-10-08 archive 로 옮겨 커밋한다
