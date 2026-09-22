# [FE] GA4(Firebase Analytics) 연동 — 퍼널·재생·탐색 이벤트 사전대로 계측

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/shared/analytics/`(신설) · `frontend/app.config.js`·`app.json`(plist·runtimeVersion) · `PlaybackService`·내비게이션·각 화면 훅 |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 발행 날짜 | 2026-09-22 |
| 시작 날짜 | 2026-09-22 |
| 기한 | 2026-09-25 (Medium +3일) |
| 선행 | 티켓 없음. 사람 손: `GoogleService-Info.plist` 2개 + `google-services.json` 재다운로드(대기) — Firebase GA 켜기·iOS 앱 등록은 2026-09-22 완료 |
| Jira | [KAN-90](https://runtime364.atlassian.net/browse/KAN-90) |
| 발견 시점 | 9월 3주차 회고 — 다음 주 계획 "강준혁 멘토님 멘토링 — 광고 셋팅, 유저 행동 분석". 앱에 분석 SDK가 없고 서버 `user_signals` 는 추천 전용이라 퍼널을 볼 수 없다 |
| 근거 문서 | `docs/features/analytics.md`(이벤트 사전 — 이 티켓과 함께 신설) · `docs/backend/domain.md` 6.4·12.1(`user_signals` 역할) · `docs/frontend/architecture.md` 2.1(runtimeVersion) |
| 중요도 | **Medium** — 3일 안. 멘토링 전에 속성·이벤트가 있어야 광고 설정을 얹을 수 있다 |
| 상태 | 진행 — 문서 초안·Firebase 콘솔 준비 완료, **plist 수급·구현 남음** |

## 문제

- 앱에 제품 분석이 없다. `package.json`·`app.json`에 분석 SDK가 없고 문서에도 결정이 없다.
- 서버 `user_signals`는 **추천 스코어링 입력 전용**이고 180일 뒤 삭제된다(`domain.md` 6.4·12.1). 온보딩 이탈·화면 체류·재생 진행률 같은 퍼널 지표는 어디에도 없다.
- 멘토링(광고 셋팅)은 GA4 속성이 있어야 Google Ads를 붙일 수 있다 — 속성·이벤트가 선행이다.

## 요청 내용

1. **문서 먼저** — `docs/features/analytics.md`에 이벤트 사전(3장)·공통 파라미터·사용자 속성·PII 규칙을 확정한다. 화면별 spec에는 "여기서 이 이벤트" 표를 붙이지 않고 analytics.md 한 곳이 소유한다(공유·에러 처리처럼 횡단 문서).
2. `@react-native-firebase/app` + `@react-native-firebase/analytics` 설치. `shared/analytics/track(event, params)` 래퍼 — 이름·파라미터를 TS 유니온으로 고정, 공통 파라미터 자동 부착, 웹·mock no-op.
3. 화면 자동 추적 — 내비게이션 `onStateChange`에서 리프 라우트 변경 시 `screen_view`.
4. iOS `GoogleService-Info.plist` 2개를 `app.config.js` 변형(`APP_VARIANT`)으로 선택. Android `google-services.json`은 Analytics 켠 뒤 다시 받아 교체. **runtimeVersion 4 → 5.**
5. 이벤트 심기 — 온보딩 → 재생(`PlaybackService` 한 곳) → 드립 → 탐색·공유 → 계정. 로그아웃·탈퇴 시 `setUserId(null)`.
6. 개발계 앱 설정 > 정보에 "분석 디버그" 행(개발계 전용).
7. 운영·개발계 iOS/Android 재빌드 — KAN-76 개발계 빌드·심사 빌드 교체와 **같은 빌드로 묶는다**.
8. 스토어 개인정보 신고 갱신(Apple 라벨·Play 데이터 보안·처리방침) — 사람 손.

## 사람 손

| # | 어디 | 무엇을 | 상태 |
|---|---|---|---|
| 1 | Firebase `ear-push` > 통합 | Google Analytics 사용 설정(GA 계정 runtime364) | **완료** 2026-09-22 |
| 2 | Firebase > 프로젝트 설정 > 내 앱 | iOS 앱 `com.runtime.ear`(ASC 6807708636) · `dev.runtime.ear`(ASC 6813738593) 등록 | **완료** 2026-09-22 |
| 3 | 같은 화면, Apple 앱 각각 | **`GoogleService-Info.plist` 다운로드 2개** → `frontend/GoogleService-Info.plist`(운영) · `frontend/GoogleService-Info.dev.plist`(개발계) | 대기 — 브라우저 자동화로는 파일이 떨어지지 않아 계정 소유자가 받는다 |
| 4 | 같은 화면, Android 앱 | `google-services.json` 다시 다운로드(Analytics 켜면서 갱신) → `frontend/google-services.json` 교체 | 대기 |
| 5 | ASC · Play Console · 처리방침 | 개인정보 수집 항목에 "분석(앱 활동·식별자)" 추가 | 구현 뒤 |

## 완료 조건

`docs/features/analytics.md` 8장과 같다.

- Given 개발계 앱을 처음 실행한다 / When Firebase DebugView를 켠다 / Then `first_open`·`screen_view`가 `dev.runtime.ear` 스트림에 실시간으로 보인다
- Given 온보딩을 끝까지 진행한다 / When DebugView를 본다 / Then `onboarding_step` 4~5건과 `onboarding_complete` 1건이 순서대로 보이고 `topic_count`가 실제 선택 수와 같다
- Given 콘텐츠를 끝까지 듣는다 / When DebugView를 본다 / Then `play_start` → `play_progress`(25·50·75) → `play_complete`가 한 번씩이고, 서버 완청 판정 시각과 1초 안에서 일치한다
- Given 운영 앱 / When 같은 동작을 한다 / Then 운영 스트림에만 잡히고 개발계 스트림에는 없다
- Given 로그아웃한다 / When 다른 계정으로 로그인한다 / Then 앞 계정의 `user_id`·`tier` 속성이 새 이벤트에 붙지 않는다
- Given 웹·mock 실행 / When 어떤 동작을 해도 / Then Firebase 호출이 없고 오류도 없다

## 처리 기록 (2026-09-22 — 발행)

- Firebase 콘솔: `ear-push`에 Google Analytics 켬(GA 계정 `runtime364`, 속성 자동 생성). iOS 앱 2개 등록(운영 앱 ID `1:800761431485:ios:edba047c74e6a513457ed4`). Analytics·Gemini를 끄고 만든 프로젝트라 이번에 Analytics만 켰다.
- `docs/features/analytics.md` 초안(이벤트 사전 30여 개) 발행 — 팀 확인 뒤 구현.
- plist 다운로드 버튼은 크롬 자동화로 눌러도 파일이 떨어지지 않았다(마법사가 다음 단계로 넘어가며 다운로드 생략). Firebase > 프로젝트 설정 > 내 앱 > Apple 앱에서 사람이 받는다.
