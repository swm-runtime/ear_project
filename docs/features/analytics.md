# 제품 분석 (GA4) 명세서

> 연결 PRD: 9.2 시범 운영 "성과 지표 측정·데이터 축적" / 9월 3주차 회고 "강준혁 멘토님 멘토링 — 광고 셋팅, 유저 행동 분석" (신설 2026-09-22, KAN-90)

## 1. 목적 & 연결

앱 안에서 사용자가 **무엇을 하다가 어디서 빠지는지**를 GA4로 본다. 서버가 이미 재생·완청·담기를 기록하지만(`user_signals`) 그것은 **추천 스코어링 입력 전용**이고 180일 뒤 지워진다(`domain.md` 6.4·12.1). 퍼널·리텐션·화면 체류처럼 제품 결정에 쓰는 지표는 이 문서가 소유한다.

- **수단은 Firebase Analytics다.** 모바일 앱의 GA4는 Firebase SDK를 통해서만 들어간다(웹 gtag는 앱에 쓸 수 없다). Firebase 프로젝트는 푸시와 같은 `ear-push`(KAN-81) — 2026-09-22에 Google Analytics를 켰고(GA 계정 `runtime364`), iOS 앱 `com.runtime.ear`·`dev.runtime.ear` 를 등록했다.
- **`user_signals`와 역할을 분리한다.** 같은 사건(완청)을 둘 다 기록하지만 서로 참조하지 않는다. GA4 값으로 추천·집계를 만들지 않고, `user_signals`로 퍼널을 보지 않는다.
- **개발계 앱은 별도 스트림이다.** `dev.runtime.ear`(iOS·Android)는 GA4 속성 안에서 다른 데이터 스트림으로 잡히므로 테스트 데이터가 운영 지표에 섞이지 않는다. 대시보드는 운영 스트림만 본다.
- Google Ads·AdMob 연동은 이 문서 범위 밖이다 — GA4 속성이 있어야 붙일 수 있으므로 **선행**이다.

## 2. 진입 조건

- 운영·개발계 앱 모두 **항상 켠다.** 사용자 옵트아웃 토글은 두지 않는다(MVP — 개인정보처리방침에 수집 사실을 고지한다, 7장).
- 웹(`expo start --web`)·mock 실행에서는 **no-op**이다. 푸시 권한 스텁(`IS_OS_PERMISSION_STUBBED`)과 같은 기준.
- 이벤트를 보내는 곳은 **`shared/analytics`의 `track()` 하나**다. 화면·훅·서비스가 Firebase를 직접 부르지 않는다 — SDK를 바꿀 때 한 곳만 고친다.

## 3. 입력값 — 이벤트 사전

이름은 GA4 규칙(소문자 snake_case, 40자 이내, 파라미터 25개 이내)을 따른다. **파라미터 값에 사용자 식별 정보·제목 텍스트·검색어 원문을 넣지 않는다**(7장). `content_id`는 UUID라 허용.

### 3.1 공통 파라미터 (모든 이벤트에 자동으로 붙는다)

| 파라미터 | 값 | 어디서 |
|---|---|---|
| `app_variant` | `production` \| `dev` | `app.config.js` 변형 |
| `bundle_label` | 실행 중 OTA 번들 8자리 (`내장` 이면 `embedded`) | `app-version.ts` — "안 고쳐졌다"를 가르는 값 |
| `tier` | `free` \| … (서버 티어명 그대로) | 세션 store |

### 3.2 사용자 속성 (user property)

| 속성 | 값 | 갱신 시점 |
|---|---|---|
| `user_id` (GA4 기본) | 서버 `user_id`의 **SHA-256 앞 16자** | 로그인·복원 |
| `tier` | 위와 같음 | 티어 변경 |
| `topic_count` | 선택한 관심 주제 수 | 온보딩 완료·관심사 저장 |
| `push_permission` | `granted` \| `denied` \| `undetermined` | 권한 결과·포그라운드 복귀 동기화 |

### 3.3 자동 수집 (SDK 기본, 코드 없음)

`first_open` · `session_start` · `app_update` · `os_update` · `screen_view`(React Navigation `onStateChange`에서 화면 이름을 넘긴다 — 라우트 이름 그대로: `Library` · `Explore` · `Player` · `Settings` …).

### 3.4 퍼널별 이벤트

**온보딩** (`onboarding.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `onboarding_step` | `step`: `topic` \| `career` \| `pick` \| `tutorial` \| `notification` · `action`: `next` \| `skip` | 각 단계의 [다음]·[건너뛰기] |
| `onboarding_complete` | `topic_count` · `career_filled`(bool) · `picked_count` · `elapsed_sec` | 완료 요청 성공 |

**알림** (`notification.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `push_permission` | `result`: `granted` \| `denied` · `source`: `onboarding` \| `settings` | OS 다이얼로그 결과 |
| `push_open` | `target`: `library` \| `content` · `app_state`: `background` \| `killed` | 알림 탭으로 진입 |
| `push_foreground_banner` | `action`: `view` \| `tap` | 인앱 배너 |

**드립** (`drip-scheduling.md` · `library.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `drip_arrival_view` | `count` · `hours_since_arrival` | 라이브러리 도착 배너 노출 |
| `drip_play` | `content_id` · `slot`: `regular` \| `discovery` · `hours_since_arrival` | 드립 편성 콘텐츠 첫 재생 |

**재생** (`player.md` · `paywall.md`) — `PlaybackService` 한 곳에서 보낸다

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `play_start` | `content_id` · `entry`: `PlayEntryPoint` 값 그대로 · `origin`: `ai_generated` \| `partner` · `resumed`(bool) | 재생 시작(차감 성공 뒤) |
| `play_progress` | `content_id` · `percent`: `25` \| `50` \| `75` | 구간 통과, 한 세션에 각 1회 |
| `play_complete` | `content_id` · `listen_sec` | 완청 판정(서버 기준과 같은 값 — `player.md` 4장) |
| `play_abandon` | `content_id` · `percent`(정수) · `reason`: `pause_timeout` \| `switch` \| `background` | 완청 전 이탈 |
| `play_rate_change` | `from` · `to` | 배속 변경 |
| `play_limit_hit` | `remaining`: 0 | 한도 소진으로 재생 거부 |
| `paywall_view` | `entry` | 페이월(MVP는 한도 안내) 노출 |
| `play_confirm` | `action`: `confirm` \| `cancel` \| `suppress_today` · `remaining` | 재생 확인 팝업 |

**탐색·검색** (`explore.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `explore_period_change` | `period`: `week` \| `month` \| `all` (코드 `ExplorePeriod` 그대로) | 인기 구간 토글 |
| `search` (GA4 권장 이름) | `query_length` · `result_count` | 검색 실행 — **검색어 원문은 넣지 않는다** |
| `content_save` | `content_id` · `entry`: 저장 사유(`user_save` 등 — API 가 진입점을 모른다) | 담기(탐색·상세 공용 API 한 곳) |
| `content_remove` | `content_id` · `entry` · `undone`(bool) | 담기 해제(`unsave`). **라이브러리 삭제·실행취소는 미구현** — 항목 id→콘텐츠 id 매핑이 호출부에 없다 |
| `content_detail_view` | `content_id` · `entry`: `ContentDetailEntryPoint` | 상세 진입 |
| `source_link_click` | `content_id` | 원문 보기 — 서버 `source_link_clicks`와 별개로 기록 |

**공유** (`share.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `share` (GA4 권장 이름) | `content_id` · `entry`(호출부가 안 주면 `unknown`) | OS 공유 시트가 열림(취소는 세지 않는다 — `share.md` 완료 조건) |
| `share_receive` | `content_id` · `installed`(bool) | 공유 링크로 앱 진입 |

**계정·설정** (`auth.md` · `settings.md`)

| 이벤트 | 파라미터 | 시점 |
|---|---|---|
| `login` (GA4 권장 이름) | `method`: `google` \| `kakao` \| `naver` \| `apple` | 세션 시작(`startSession`) — 온보딩을 끝낸 사용자 |
| `sign_up` (GA4 권장 이름) | `method` | 세션 시작 — 온보딩 미완료 사용자(서버에 신규 플래그가 없어 이 기준으로 가른다). 세션 **복원**은 둘 다 아니다 |
| `logout` | — | 로그아웃 |
| `withdrawal` | `reason` (선택지 키) | 탈퇴 완료 |
| `settings_toggle` | `key`: `drip_notification` \| `marketing_consent` · `value`(bool) | 설정 토글 — 서버 호출이 나가는 시점(권한 미결정으로 막힌 탭은 세지 않는다) |

## 4. 처리 로직

- **`track(event, params)`** — 이름·파라미터를 TypeScript 유니온으로 고정해 오타를 컴파일에서 잡는다. 공통 파라미터(3.1)는 래퍼가 붙인다.
- **화면 이름 자동 추적** — 내비게이션 컨테이너의 `onStateChange`에서 포커스된 리프 라우트 이름이 바뀔 때만 `screen_view`를 보낸다(같은 화면 재렌더에 중복 발송 금지).
- **재생 이벤트는 `PlaybackService`만 보낸다.** 화면이 보내면 미니플레이어·푸시 딥링크 경로에서 빠진다.
- **실패해도 앱 동작에 영향이 없다.** 발송 오류는 `logger.warn`으로만 남기고 던지지 않는다.
- **로그아웃·탈퇴 시 `user_id`·사용자 속성을 지운다**(`setUserId(null)`) — 다음 사용자에게 앞 사용자의 속성이 넘어가지 않게.
- iOS **광고 식별자(IDFA)는 쓰지 않는다** → ATT 팝업을 띄우지 않는다. Firebase iOS SDK는 `FirebaseAnalyticsWithoutAdIdSupport` 변형을 쓴다.

## 5. 화면 상태

화면 변화는 없다. 개발계 앱 설정 > 정보에 **"분석 디버그" 행**(개발계 전용, 푸시 토큰 행과 같은 방식)을 두어 DebugView 활성 여부와 마지막 전송 이벤트 이름을 보인다 — 실기기 검증용.

## 6. 데이터 모델

앱·서버 DB 변경 없음. 네이티브 설정만 바뀐다.

| 항목 | 값 |
|---|---|
| 패키지 | `@react-native-firebase/app` · `@react-native-firebase/analytics` |
| Android 설정 | `google-services.json` — 이미 있음(KAN-81). Analytics 켜면서 파일이 갱신됐을 수 있어 **다시 받아 교체**한다 |
| iOS 설정 | `GoogleService-Info.plist` **2개**(운영 `com.runtime.ear` · 개발계 `dev.runtime.ear`) — `app.config.js` 가 변형에 따라 고른다. 저장소에 둔다(비밀 아님 — 클라이언트 키) |
| `runtimeVersion` | 4 → **5** (네이티브 모듈 추가) |
| 빌드 | iOS·Android 운영·개발계 모두 재빌드. KAN-76 개발계 빌드·심사 빌드 교체와 같은 빌드로 묶는다 |

## 7. 예외 상황

- **개인정보** — 수집 항목이 늘어난다. Apple 개인정보 라벨("앱 활동·식별자 — 분석"), Play 데이터 보안 섹션, 앱 개인정보처리방침에 GA4 수집 사실을 추가한다. 광고 추적은 하지 않으므로 ATT는 불필요.
- **오프라인** — SDK가 큐에 쌓았다가 보낸다. 앱이 손댈 것 없음.
- **개발계 데이터 오염** — 3.1의 `app_variant`와 스트림 분리 둘 다로 막는다. 대시보드 필터는 스트림 기준.
- **`user_id` 해시** — 서버 `user_id`를 그대로 보내지 않는다. 해시는 앱에서 만들고 서버는 모른다.

## 8. 완료 조건

- Given 개발계 앱을 처음 실행한다 / When Firebase DebugView를 켠다 / Then `first_open`·`screen_view`가 `dev.runtime.ear` 스트림에 실시간으로 보인다
- Given 온보딩을 끝까지 진행한다 / When DebugView를 본다 / Then `onboarding_step` 4~5건과 `onboarding_complete` 1건이 순서대로 보이고 `topic_count`가 실제 선택 수와 같다
- Given 콘텐츠를 끝까지 듣는다 / When DebugView를 본다 / Then `play_start` → `play_progress`(25·50·75) → `play_complete`가 한 번씩이고, 서버 `user_signals`의 완청 판정 시각과 1초 안에서 일치한다
- Given 운영 앱 / When 같은 동작을 한다 / Then 운영 스트림에만 잡히고 개발계 스트림에는 없다
- Given 로그아웃한다 / When 다른 계정으로 로그인한다 / Then 앞 계정의 `user_id`·`tier` 속성이 새 이벤트에 붙지 않는다
- Given 웹·mock 실행 / When 어떤 동작을 해도 / Then Firebase 호출이 없고 오류도 없다

## 구현 현황 (2026-09-23, KAN-90 1차)

들어감: `screen_view`(자동) · `onboarding_step`(topic·career·pick) · `push_permission` · `push_open` · `push_foreground_banner` · `play_start` · `play_progress` · `play_complete` · `play_abandon`(switch만) · `play_rate_change` · `play_limit_hit` · `explore_period_change` · `content_save` · `content_remove`(unsave) · `content_detail_view` · `source_link_click` · `share` · `login` · `sign_up` · `settings_toggle`. 사용자 속성 `tier` · `push_permission`.

**아직 없음**(다음 티켓): `onboarding_step` tutorial·notification · `onboarding_complete` · `drip_arrival_view` · `drip_play` · `play_abandon` background/pause_timeout · `paywall_view` · `play_confirm` · `search` · `share_receive` · `logout` · `withdrawal` · 사용자 속성 `topic_count`.

## 미결 사항

- Google Ads 전환 이벤트로 어떤 것을 표시할지(`sign_up`? `play_complete`?) — 멘토링 뒤 결정.
- 이벤트 보존 기간(GA4 기본 2개월 → 14개월로 올릴지) — 속성 설정에서 바꾼다. 비용 없음.
- BigQuery 연동(무료 샌드박스) — 원본 이벤트를 SQL로 보고 싶어지면.
