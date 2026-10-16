# [FE] 설정 — 광고 측정(Meta) 끄기 토글

| 항목 | 값 |
|---|---|
| 대상 | 설정 화면 · Meta SDK 초기화 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-217](https://runtime364.atlassian.net/browse/KAN-217) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-16 (Low — 이번 주 금요일) |
| 선행 | 없음 |
| 관련 | 랜딩 영어 처리방침 9장 · 한국어 처리방침 7.3 |
| 중요도 | Low |
| 상태 | 코드·문서 반영(PR, 2026-10-16) — **운영 실기기 확인 대기** |

## 왜
영어 처리방침은 "Meta 광고 측정을 캘리포니아 등에서 '공유'로 볼 수 있고, 거부하면 멈춘다"고 고지한다(2026-10-15 A안 유지). 지금은 이메일 요청을 수동 처리하는데, 앱 안에서 스스로 끌 수 있게 한다.

## 무엇을 한다
- 설정에 "광고 측정 허용" 토글(기본 켜짐). 끄면 Meta SDK 이벤트 전송을 멈춘다(SDK의 자동 이벤트 로깅·광고 ID 수집 비활성화 API). 다시 켜면 재개.
- 값은 기기에 저장하고 앱 시작 시 SDK 초기화 전에 읽는다. 서버 저장은 필요 없다(기기 단위 측정).
- KR·GLOBAL 공통. 한국어 처리방침 7.3의 거부 방법에도 한 줄 추가한다(랜딩 브랜치에서 같이).
- Firebase Analytics는 범위 밖(앱 개선용 분석).

## 완료 조건
- Given 토글 끔 / When 앱 사용 / Then Meta로 가는 이벤트가 0건(디버그 로그·Meta 이벤트 관리자로 확인)
- Given 토글 다시 켬 / Then 전송 재개
- Given 앱 재시작 / Then 끈 상태가 유지되고 SDK가 초기화 시점부터 전송하지 않는다

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira).
- 2026-10-16 코드·문서 반영(브랜치 `feat(fe)/ad-measurement-toggle`, **네이티브 변경 없음 — OTA**. runtimeVersion·`app.json` 플러그인 값 그대로).
  - 설정 › **개인정보 › 광고 측정 허용** 토글(기본 켜짐) + 설명 한 줄(ko·en). 값은 기기 저장(`analytics.meta_ad_measurement_allowed`), 서버 저장 없음. 저장 실패 시 원복 + 토스트.
  - `shared/analytics/meta.ts` — 꺼지면 `forwardToMeta` 가 `opted_out`(미전송). 토글 즉시 SDK 반영(끔: 자동 이벤트·광고 ID false / 켬: 자동 이벤트 true · 광고 ID Android true·iOS false). 종전의 "매번 자동 이벤트 true" 를 저장 값을 따르게 바꿨다. 앱 시작 때 `bootstrapApp` 이 저장 값으로 SDK 를 한 번 맞춘다. 화면은 `@/shared/analytics` 공개 API 로만 닿는다.
  - **재시작 시 초기화 시점부터 미전송의 근거** — Meta SDK 가 두 setter 값을 기기에 영구 저장하고 다음 실행에서 Info.plist·매니페스트보다 먼저 읽는다(SDK 18.x 소스 확인: iOS `Settings+PersistedProperties`·`Settings+AutoLogAppEvents` — UserDefaults → Info.plist, Android `UserSettingsManager.initializeUserSetting` — SharedPreferences `com.facebook.sdk.USER_SETTINGS` → 매니페스트). 그래서 네이티브 플러그인 값을 바꾸지 않아도 된다.
  - 문서: `features/settings.md` 4.1·8장, `spec/uiux/settings-uiux.md` 3·4.1·5·6·7장, `features/analytics.md` 2장·3.5(거부 경로). 랜딩 처리방침 한국어 7.3(현행 + 2026-11-01 개정본)·영어 8·9장에 앱 안에서 끄는 방법.
  - 테스트: `meta.test.ts` — 꺼짐 미전송·SDK 즉시 반영, 다시 켬 재개, 시작 동기화(저장 값 꺼짐), 저장 값 없음·읽기 실패 시 켜짐, 저장 실패 시 값 유지.
  - **남은 것(티켓을 pending 에 두는 이유)** — 완료 조건의 실기기 확인: 운영 앱(OTA 적용 후)에서 토글 끔 → 앱 사용·재시작 → Meta 이벤트 관리자 0건, 다시 켬 → 재개. **개발계 앱은 `IS_META_STUBBED` 라 Meta 전송 자체가 없어 확인할 수 없다.** 끄는 순간 SDK 내부 진단 이벤트(`fb_sdk_settings_changed`)가 한 번 보일 수 있다 — 앱 사용 이벤트가 아니다. 랜딩 처리방침 문구는 OTA 가 운영에 닿은 뒤 main 으로 내보낸다(먼저 나가면 없는 기능을 고지하게 된다).
