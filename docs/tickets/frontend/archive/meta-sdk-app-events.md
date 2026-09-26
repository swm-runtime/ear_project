# [FE] Meta SDK 연동 — 메타 광고 설치·앱 이벤트 측정

| 항목 | 값 |
|---|---|
| 대상 | `frontend/package.json` · `app.json`/`app.config.js`(config plugin·runtimeVersion) · `frontend/src/shared/analytics/`(KAN-90 의 `track()`) |
| 요청 파트 | 프론트엔드 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-09-23 |
| Jira | [KAN-94](https://runtime364.atlassian.net/browse/KAN-94) |
| 시작 날짜 | 2026-09-23 |
| 기한 | 2026-09-26 (Medium +3일) |
| 선행 | 티켓 선행 없음 — **KAN-90(`analytics-ga4-integration.md`)과 같은 빌드로 묶기 권장**(둘 다 네이티브 추가라 재빌드·심사가 필요하다). 사람 손 1~3(Meta 앱 생성·iOS 플랫폼 등록·광고 계정 연결) 모두 완료(2026-09-24) — 구현 착수 가능 |
| 발견 시점 | 메타 광고(페이스북·인스타그램·스레드) 집행 준비 — iOS 출시 완료 후 앱 설치 캠페인을 돌리려 했더니 앱에 광고 측정 수단이 없다 |
| 근거 문서 | `docs/features/analytics.md`(이벤트 사전·`track()` 단일 진입점·IDFA 미사용 4장) · `docs/frontend/architecture.md` 2.1(runtimeVersion) |
| 심각도 | 중 (Medium) — 3일 안. 광고는 SDK 없이도 켤 수 있지만 "링크 클릭" 최적화에 머물러 광고비 효율이 떨어진다 |
| 상태 | **완료** — 반영 날짜 2026-09-24 |

## 문제

- 앱에 Meta SDK·MMP 가 없다(`package.json` 확인, 2026-09-23). Meta 가 **설치를 알 수 없어** 앱 설치 캠페인의 최적화 목표를 "앱 설치"로 고를 수 없고 "링크 클릭"까지만 된다. 설치 수·설치당 비용·설치 후 행동이 광고 관리자에 잡히지 않는다.
- KAN-90(GA4)은 앱 안 퍼널 분석용이고 광고 측정을 다루지 않는다 — GA4 가 들어가도 메타 광고 성과는 보이지 않는다.

## 요청 내용

1. `react-native-fbsdk-next` 설치 + Expo config plugin 설정 — **App ID `1099309105917768` · Client Token `cc292d78bb9e0b966b3eebe357ded779` · 표시 이름 `이어`**. 두 값은 앱 바이너리에 들어가는 클라이언트 값이라 `app.json`에 둔다(카카오 네이티브 앱 키와 같은 취급). App Secret 은 앱에 넣지 않는다. **ATT 팝업은 넣지 않는다** — `advertiserIDCollectionEnabled: false`로 IDFA 를 수집하지 않아 `analytics.md` 4장("IDFA 미사용, ATT 없음")과 그대로 맞는다. iOS 성과는 Meta 집계 측정(AEM)·SKAdNetwork 로 들어오며, 그 처리는 SDK 가 자동으로 한다(`Info.plist` SKAdNetwork 항목 추가 불필요 — 그건 광고를 **게재하는** 앱의 설정이다).
2. 앱 실행 이벤트 자동 기록(`autoLogAppEventsEnabled: true`) — 설치·실행이 여기서 잡힌다.
3. 전환 이벤트 3개를 **KAN-90 의 `track()` 안에서** Meta 로도 보낸다(화면·훅이 SDK 를 직접 부르지 않는다 — `analytics.md` 2장 단일 진입점):

   | GA4 이벤트(`analytics.md` 3.4) | Meta 이벤트 | 비고 |
   |---|---|---|
   | `sign_up` | `fb_mobile_complete_registration` (표준) | `method` 전달 |
   | `onboarding_complete` | `onboarding_complete` (커스텀) | |
   | `play_start` 중 **계정의 첫 재생 1회** | `first_play` (커스텀) | 광고 최적화 목표 후보 |

   KAN-90 이 먼저 끝나지 않았으면 같은 PR 에서 `track()` 골격을 함께 만든다.
4. **개발계 변형(`dev.runtime.ear`)·웹·mock 에서는 Meta 전송을 끈다** — 테스트 이벤트가 광고 최적화 학습에 섞이면 안 된다.
5. 네이티브 모듈 추가이므로 runtimeVersion 을 올리고 iOS 운영 빌드 재제출(Android 는 출시 빌드에 포함).

## 요지 (Jira 본문용)

- react-native-fbsdk-next 설치·config plugin 설정 — App ID 1099309105917768 · Client Token cc292d78bb9e0b966b3eebe357ded779. ATT 팝업은 넣지 않고 IDFA 수집 끔(analytics.md 4장과 일치)
- 앱 실행 이벤트 자동 기록 — 설치·실행 측정
- 전환 이벤트 3개(가입 완료·온보딩 완료·첫 재생)를 KAN-90 의 track() 안에서 Meta 로도 전송
- 개발계·웹·mock 은 Meta 전송 끔
- runtimeVersion 올리고 iOS 재빌드·재심사 — KAN-90 과 같은 빌드로 묶기 권장
- 상세·완료 조건은 원본 문서

## 사람 손

| # | 어디 | 무엇을 | 담당 | 상태 |
|---|---|---|---|---|
| 1 | Meta for Developers | 앱 생성(이용 사례 "기타" · 유형 "비즈니스") → **App ID · Client Token** 발급 | 박수헌 | **완료** 2026-09-23 — 값은 요청 내용 1 |
| 2 | 같은 앱 > 설정 > 기본 설정 | iOS 플랫폼 추가 — 번들 ID `com.runtime.ear`, App Store ID `6807708636`. Android 는 출시 때 `com.runtime.ear` 추가 | 박수헌 | **완료** 2026-09-23 |
| 3 | 비즈니스 관리자 | 광고 계정에 앱 연결(광고 관리자에서 앱 설치 캠페인에 이 앱이 보이게) | 박수헌 | **완료** 2026-09-24 |
| 4 | App Store Connect · 개인정보처리방침 | 개인정보 라벨에 제3자 SDK(Meta) 수집 항목 반영(**추적 아님** — ATT 미사용), 처리방침에 Meta 제공 고지 | 박수헌 | 구현 뒤 |

## 완료 조건

- Given 운영 빌드를 새로 설치한다 / When 앱을 처음 연다 / Then Meta 이벤트 관리자에 이 앱의 앱 실행(activate) 이벤트가 들어온다
- Given 새 계정으로 가입·온보딩을 마치고 첫 재생을 한다 / When 이벤트 관리자 테스트 이벤트를 본다 / Then `fb_mobile_complete_registration` → `onboarding_complete` → `first_play`가 각 1회 들어온다
- Given 같은 계정으로 두 번째 콘텐츠를 재생한다 / When 이벤트 관리자를 본다 / Then `first_play`가 다시 들어오지 않는다
- Given 개발계 앱·웹·mock 실행 / When 같은 동작을 한다 / Then Meta 로 아무 이벤트도 가지 않고 오류도 없다
- Given iOS 운영 앱 / When 앱을 쓰는 내내 / Then ATT 팝업이 뜨지 않는다
- Given 광고 관리자에서 앱 설치 캠페인을 만든다 / When 최적화 목표를 고른다 / Then "앱 설치"와 `first_play` 이벤트를 선택할 수 있다

## 처리 기록

- 2026-09-24 21:40 (효헌이): 구현 — `react-native-fbsdk-next` 13.4 + app.json 플러그인(App ID·Client Token·표시 이름·스킴, IDFA 끔, 자동 이벤트 켬, ATT 설명문 없음). `shared/analytics/meta.ts` 가 `track()` 안에서 세 이벤트만 Meta 로 전달, `first_play` 는 계정 해시별 기기 로컬 1회. 개발계 변형은 `app.config.js` 에서 네이티브 자동 이벤트·자동 초기화까지 끔. runtimeVersion 8. 유닛 6건(`meta.test.ts`), 전체 152 통과. 문서 요청 `changes/pending/analytics-meta-sdk.md`.
- 남은 것: 운영 iOS 빌드(rt 8) TestFlight → 완료 조건 1~3·5 를 Meta 이벤트 관리자 "테스트 이벤트" 로 확인 · Android 는 출시 빌드 · 사람 손 4(ASC 개인정보 라벨·처리방침) · 광고 관리자에서 `first_play` 최적화 목표 선택 가능한지(조건 6).
- **2026-09-24 23:41 완료(반영 날짜)** — 박수헌이 Meta 이벤트 관리자에서 완료 조건 확인(PM 전달). 운영 빌드 iOS 1.1.0 (13)(rt 8) · Android vc 14. Jira KAN-94 완료 전이. 남은 사람 손: ASC 개인정보 라벨·처리방침 Meta 반영 → 운영 (13) 심사 제출, Play 운영 aab 업로드.
