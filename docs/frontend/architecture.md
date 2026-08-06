# Frontend Architecture

> 이 문서는 '이어' 프론트엔드(모바일 앱)의 **구조 기준 문서**다. 코드 작성 규칙(네이밍·파일 구성·컴포넌트 작성법 등)은 [convention.md](convention.md)에서 다룬다.
>
> 연결 문서: `docs/prd/ear_root_prd.md`, `docs/backend/architecture.md`, `docs/backend/convention.md`, `docs/features/common-error-handling.md`, `docs/features/*`, `docs/spec/*`
>
> **문서 운용 원칙**
> - 이 문서와 충돌하는 구현은 리뷰에서 반려한다. 구현이 옳다면 문서를 먼저 고친다.
> - 기능 추가·명세 확정에 따라 4·5·6장은 계속 채워진다. 미확정 항목은 각 장 하단 또는 마지막 "미결 사항"에 남긴다.
> - 규칙을 예외적으로 어길 경우, 코드 주석이 아니라 이 문서에 **예외 사유와 함께** 기록한다.

## 1. Frontend Overview

Frontend는 다음 5가지를 책임진다.

| 책임 | 내용 |
|---|---|
| **화면 렌더링·상호작용** | 명세(`docs/features/*`, `docs/spec/uiux/*`)가 정의한 화면 상태·전이를 구현 |
| **서버 계약 준수** | API 계약(`docs/spec/api/*`)대로 요청·응답 처리. 에러 규격·재시도 정책(`common-error-handling.md`) 이행 |
| **재생 경험** | 전역 오디오 재생(백그라운드·잠금화면 제어), 재생 위치·청취 시간 트래킹, 미니플레이어 |
| **로컬 영속** | 토큰 보안 저장, 오프라인 큐, 재생 위치 로컬 우선 기록, 목록·피드 캐시 |
| **플랫폼 연동** | 소셜 로그인 SDK, 인앱 결제, 푸시, 미디어 세션, 공유 시트, 스토어 이동 |

```
┌───────────────────────────── App ─────────────────────────────┐
│  Screens / Components                                         │
│        │                                                      │
│  Hooks (ViewModel)  ──▶  Query/Mutation ──▶  ApiClient ───────┼──▶ Backend
│        │                                          ▲           │
│        └──▶  Domain Services  ────────────────────┘           │
│              (Playback · Session · OfflineQueue · Lifecycle)  │
│                     │                                         │
│              Local Storage (SecureStore · SQLite · MMKV)      │
└───────────────────────────────────────────────────────────────┘
```

**경계 원칙**

- **판정은 서버, 클라이언트는 표시와 진입 제어만 한다.** 재생 한도·04시 서비스 날짜 경계·구독 만료·토큰 만료·관심 주제 상한은 전부 서버가 판정한다. 클라이언트가 갖는 카운트·시각은 UI 힌트일 뿐 최종 근거가 아니다(`paywall.md` 4.1~4.4, `splash.md` 7).
- **모든 서버 자원 접근은 Backend API를 경유한다.** DB·Object Storage·AI Server에 직접 접근하지 않는다(`backend/architecture.md` 1).
- **오디오는 Backend가 발급한 단기 서명 URL로만 재생한다.** URL을 저장·공유하지 않으며, 만료 전 선제 갱신은 PlaybackService가 담당한다(→ 5.1).
- **티어명을 코드에 하드코딩하지 않는다.** 기능 분기는 서버가 내려주는 `entitlements` 객체로만 한다(`subscription.md` 4.1). 요금제 값 변경에 앱 배포가 필요해지면 안 된다.
- **기기 시각·시간대를 정책 판정에 쓰지 않는다.** 시각 판정이 필요한 값(만료·쿨다운·카운트다운)은 항상 서버가 준 값(`expires_at`, `retry_after_sec`)으로 다시 계산한다.

## 2. Tech Stack

| 구분 | 선택 | 비고 |
|---|---|---|
| Framework | **React Native + Expo (prebuild/CNG, development build)** | Expo Go가 아니라 dev client 기준. 네이티브 모듈(오디오·IAP·소셜 SDK)은 config plugin·prebuild로 구성 |
| Language | **TypeScript** | `strict: true` 필수. Backend와 언어·타입 규칙 공유 |
| Navigation | **React Navigation** (native-stack + bottom-tabs) | 진입 분기·스택 초기화·딥링크 보류 등 명령형 제어가 많아 명시적 API를 택한다 |
| 서버 상태 | **TanStack Query** | 캐싱·커서 페이지네이션·낙관적 업데이트·재시도가 명세 요구와 일치 |
| 클라이언트 상태 | **Zustand** | 전역 상태 최소한만. 서버 상태를 넣지 않는다 (→ 7.1) |
| HTTP | **axios** | 인터셉터로 토큰 갱신·에러 정규화·trace 헤더 일괄 처리 (→ 8장) |
| 오디오 | **react-native-track-player** | 백그라운드 재생, 잠금화면·알림센터 컨트롤, 오디오 포커스 |
| 인앱 결제 | **react-native-iap** | 스토어 SDK 가격 조회, pending 트랜잭션 처리, 서버 검증 후 finish (→ `subscription.md`) |
| 푸시 | **@react-native-firebase/messaging** | FCM 기반. APNs 연동 포함 |
| 로컬 DB | **expo-sqlite** | 오프라인 큐·재생 위치 등 구조적 데이터 (→ 7.2) |
| Key-Value 저장 | **react-native-mmkv** | 플래그·최근 검색어·소형 캐시 |
| 보안 저장소 | **expo-secure-store** | access/refresh token 전용 |
| 리스트 | **FlashList** | 무한 스크롤 목록(라이브러리·탐색) 가상화 |

**추가 도입 시 원칙** — `backend/architecture.md` 2장과 동일하다. 직접 구현 대비 명확한 이득이 있고 도메인 코드가 라이브러리에 종속되지 않을 때만 추가하며, 도입 시 이 문서 또는 convention.md에 사용 범위를 기록한다.

## 3. Application Layer Architecture

### 3.1 기본 흐름

```
Screen / Component
      │
      ▼
Hook (ViewModel)  ──▶  Query / Mutation (TanStack Query)  ──▶  api/ (feature API 모듈)  ──▶  ApiClient
      │
      └──────────────▶  Domain Service (재생·세션·큐 등 React 밖 싱글턴)
```

각 계층은 **바로 아래 계층까지만** 호출한다. Screen이 ApiClient를 직접 호출하거나, 컴포넌트가 axios를 import 하는 것을 금지한다.

### 3.2 계층별 책임

| 계층 | 담당한다 | 담당하지 않는다 |
|---|---|---|
| **Screen / Component** | 렌더링, 사용자 입력을 Hook에 위임, 내비게이션 트리거 | API 호출, 비즈니스 분기 판정, 저장소 접근, 타이머·구독 관리 |
| **Hook (ViewModel)** | 화면 상태 조립, Query/Mutation 사용, Domain Service 호출, 화면 단위 분기(무엇을 보여줄지) | HTTP 세부(헤더·재시도), 정책 판정(서버 몫), 다른 화면의 상태 조작 |
| **Query / Mutation** | 서버 상태 캐싱·무효화, 커서 페이지네이션, 낙관적 업데이트·롤백 | 응답 가공 이상의 도메인 로직, 화면 상태 보유 |
| **api/ 모듈** | 엔드포인트 정의, 요청·응답 DTO 타입, snake_case ↔ camelCase 변환(→ convention.md 5장) | 캐싱, 재시도 정책(전역 처리), UI 관심사 |
| **Domain Service** | React 생명주기와 무관한 도메인 동작 — 재생, 세션, 오프라인 큐, 생명주기 오케스트레이션 | 렌더링, 화면 내비게이션 직접 수행(이벤트·콜백으로 위임) |
| **ApiClient (shared)** | 인증 헤더, 토큰 갱신(단일 인플라이트), 에러 정규화, 자동 재시도, trace 헤더 | 도메인 지식 일체 |

**Domain Service의 정의** — 화면이 언마운트돼도 살아 있어야 하는 동작(백그라운드 재생, 큐 재전송, 포그라운드 복귀 동기화)은 React 트리 밖의 싱글턴 모듈로 만든다. 화면은 이 서비스의 상태를 구독(store)하고 명령을 호출할 뿐, 동작의 수명을 소유하지 않는다.

### 3.3 계층 위반 예외

| 상황 | 허용 조건 |
|---|---|
| 단순 조회 화면이라 Hook이 얇아짐 | 그래도 Screen → Hook → Query를 지킨다. Hook이 얇은 것은 문제가 아니다 |
| 컴포넌트 안에서 즉시 처리해야 하는 순수 UI 로직(포커스 이동, 애니메이션) | 컴포넌트에 둔다. 이건 계층 위반이 아니라 UI 관심사다 |
| Domain Service가 서버 호출 필요 | Service → feature api 모듈 경유. Service가 axios를 직접 잡지 않는다 |

## 4. Module(Feature) Structure

### 4.1 분리 기준

**Feature는 화면 명세(`docs/features/*`) 단위로 나눈다.** Backend가 Entity 소유권으로 나누듯, Frontend는 명세 문서가 정의한 도메인 화면 묶음이 소유권 단위다.

```
auth / onboarding / library / explore / player / paywall / subscription
/ settings / profile / interest / notification / admin / splash
```

각 feature는 자기 화면·상태·API 호출의 **소유자**다. 다른 feature가 그 동작을 쓰려면 feature의 공개 API(`index.ts`)를 통한다.

### 4.2 디렉터리 구조

```
src/
├── app/                          # 최상위 조립만
│   ├── App.tsx                   # Provider 조립 (Query·테마·게이트)
│   ├── navigation/               # 루트 스택·탭 정의, 딥링크 설정
│   └── bootstrap/                # 앱 초기화(서비스 기동·주입 연결)
├── shared/                       # 도메인 지식이 없는 횡단 코드
│   ├── api/                      # ApiClient, ApiError, 재시도·토큰 갱신 인터셉터
│   ├── storage/                  # SecureStore·SQLite·MMKV 래퍼
│   ├── ui/                       # 공통 컴포넌트(토스트·스낵바·전체화면에러·스켈레톤 등)
│   ├── hooks/                    # 도메인 무관 훅 (useDebounce, useAppState ...)
│   ├── lib/                      # 순수 유틸 함수
│   └── theme/                    # 디자인 토큰(색·타이포·간격)
└── features/
    ├── player/
    │   ├── index.ts              # 공개 API — 여기 없는 것은 내부 구현
    │   ├── screens/
    │   ├── components/
    │   ├── hooks/
    │   ├── api/
    │   ├── services/             # PlaybackService, 재생 시작 게이트
    │   ├── store/
    │   └── player.types.ts
    ├── library/
    ├── paywall/
    └── ...
```

- `shared/`에는 **도메인 지식이 들어가지 않는다.** `shared/` 안에 콘텐츠·티어·재생 같은 도메인 단어가 등장하면 잘못 둔 것이다. 해당 feature로 옮긴다.
- feature 내부 파일 구성·네이밍은 convention.md를 따른다. 처음부터 빈 디렉터리를 만들지 않는다.

### 4.3 의존 규칙

**의존은 단방향이며, 순환은 금지한다.**

```
app  ──▶  features  ──▶  shared
```

- `shared/`는 `features/`를 import 하지 않는다. shared가 도메인 동작을 필요로 하면(예: ApiClient가 토큰 필요) **인터페이스를 정의하고 `app/bootstrap`에서 구현을 주입**한다. 예: `ApiClient`는 `TokenProvider` 인터페이스만 알고, auth feature의 SessionService가 그 구현으로 등록된다.
- feature 간 의존은 **상대 feature의 `index.ts`(공개 API)만** 사용한다. 내부 파일 직접 import를 금지한다.
- 순환이 생기면 경계가 잘못된 것이다. 공통 부분을 하위 feature 또는 shared(도메인 지식이 없다면)로 추출하거나 의존 방향을 재설계한다. 콜백·이벤트 주입으로 방향을 뒤집을 수 있는지 먼저 검토한다(→ 5.2 페이월 사례).

### 4.4 의존 방향 기록

feature가 늘어나면 아래 표를 갱신한다. 표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.

| feature | 의존하는 feature | 비고 |
|---|---|---|
| library | player | 재생 시작 게이트 호출, 미니플레이어 상태 구독 |
| explore | player, library | 게이트 호출 / 담기(라이브러리 적립) 호출 |
| player | paywall, subscription | 차단 시 페이월 시트 표시 / entitlements 조회 |
| paywall | subscription | 요금제 비교·결제 실행. **player를 알지 못한다** (→ 5.2) |
| profile | interest, subscription, auth | 관심사·플랜 카드 / 이메일 인증 진입 |
| settings | auth, subscription, notification, interest | 각 도메인 진입점 허브 |
| onboarding | interest, library, notification, auth | 주제 선택 / 첫 담기 / 알림 권한 / 종료 시 세션 상태 갱신(라이브러리 진입 전환) |
| notification | player | 푸시 딥링크 → 재생 게이트 |
| splash | auth, onboarding | 진입 분기 판정 |

## 5. 전역 Domain Service

화면과 수명이 다른 5개 서비스를 둔다. 모두 React 트리 밖 싱글턴이며, 상태 노출은 각자의 store(→ 7.1)로 한다.

### 5.1 PlaybackService (`features/player`)

track-player를 감싸는 유일한 재생 제어 지점이다. 화면·미니플레이어·잠금화면 컨트롤이 전부 이 서비스로 명령을 보낸다.

**책임**

- 재생·일시정지·시크·배속(전역 설정 `default_playback_rate` 적용 — `settings.md` 4.1)
- 백그라운드 재생 유지, 잠금화면·알림센터 컨트롤, 오디오 포커스(전화·타 앱 → 자동 일시정지, **종료 후 자동 재개 금지**), 블루투스 해제 시 즉시 일시정지(`player.md` 4.2)
- **트래킹 값 3종을 별도로 기록한다**(`player.md` 4.3·4.4·4.4-1):
  - `position_sec` — 현재 위치. 5초 주기 / 일시정지 / 화면 이탈 / 백그라운드 진입 / 재생 종료 시 로컬 우선 저장 → 서버 비동기 동기화(실패 시 큐)
  - `max_reached_sec` — 최대 연속 도달 위치. 완청(90%) 판정 근거. 시크 점프는 도달로 치지 않는다
  - `listened_sec` — 재생기가 실제로 소리를 낸 시간. 배속 무관 경과 시간, 시크 구간 제외. 재생 종료 이벤트마다 가산 전송(파트너 정산 근거)
- 소비 신호(`play`/`complete`/`skip`/`replay`) 발행. `seek`·`rate_change`는 신호로 기록하지 않는다
- 서명 URL 만료 전 **백그라운드 선제 갱신**(재생이 끊기기 전에)
- 네트워크 단절 시 버퍼 소진까지 재생 유지 → 소진 시 일시정지 + 안내
- (P1) 수면 타이머 — 만료 시 페이드아웃 후 일시정지, 완청 시점과 겹치면 완청 처리 우선

**미니플레이어 복원** — 앱 실행 시 완청하지 않은 `last_played_at` 최신 1건을 **일시정지 상태로만** 복원한다. 자동 재생 절대 금지, 재생 위치 0이면 미니플레이어를 띄우지 않는다(`library.md` 4.2). 라이브러리 삭제·콘텐츠 회수 시 미니플레이어를 내린다.

### 5.2 재생 시작 게이트 (`features/player`)

재생을 시작시키는 진입점은 4개다: 라이브러리, 탐색, 미니플레이어, 푸시 딥링크. **네 경로 모두 단일 게이트를 통과한다**(`paywall.md` 4.2). 진입점별로 판정 로직을 복제하지 않는다.

```
startPlayback(contentId, origin)
  1. 서버에 재생 가능 판정 요청
  2. 차감 발생        → 확인 팝업(남은 횟수·1회 차감 고지) → [재생하기] 시 서버 재판정
  3. 한도 소진        → 페이월 바텀시트 (blocked_content_id 로컬 영속 저장)
  4. 회수(WITHDRAWN)  → 안내 후 목록·미니플레이어에서 제거
  5. 통과             → PlaybackService.play() — 플레이어는 게이트를 통과한 요청만 받는다
```

- 확인 팝업의 숫자는 서버가 준 값을 표시만 한다. **[재생하기] 시점의 한도 판정은 서버가 다시 수행한다**(FR-29).
- 페이월 결제 완료 후 복귀 재생은 **게이트가 수행한다.** paywall은 결제 결과만 반환하고 player를 알지 못한다(의존 역전 방지 — 4.4). `blocked_content_id`는 세션 메모리가 아니라 로컬에 영속한다 — 결제 중 앱이 죽어도 복귀 재생이 가능해야 한다(`paywall.md` 7).
- 탐색발 재생은 게이트 통과(실제 재생 시작) 시에만 라이브러리 자동 적립한다. 페이월로 차단되면 적립하지 않는다(`explore.md` 4.4).

### 5.3 SessionService (`features/auth`)

- 토큰은 **SecureStore에만** 저장한다. MMKV·AsyncStorage·전역 변수 금지.
- **토큰 갱신은 단일 인플라이트로 묶는다.** 동시 다발 401에서 갱신 요청은 1개만 나가고 나머지는 결과를 공유한다(`common-error-handling.md` 7).
- 401 → 갱신 → 원 요청 자동 1회 재시도. 갱신 실패 시 즉시 로컬 세션 정리 → 시작 화면(재갱신 루프 금지).
- 로그아웃은 서버 호출 실패와 무관하게 로컬 토큰·캐시 삭제를 우선한다(`auth-api.md` 4.4).
- ApiClient에는 `TokenProvider` 인터페이스로 주입된다(→ 4.3).

### 5.4 OfflineQueue (`shared/storage` 기반, 규칙은 각 feature가 등록)

온라인 복귀 시 재전송할 요청을 SQLite 큐에 적재한다. 앱 재실행 후에도 보존된다(`common-error-handling.md` 4.5).

| 대상 | 재전송 규칙 |
|---|---|
| 재생 위치 | 같은 콘텐츠는 최신 1건만 유지(덮어쓰기) |
| 소비 신호 | 전부 보존, 발생 순서대로 전송 |
| 담기·삭제 | 마지막 상태만 유지 |
| 영수증 검증 | **성공할 때까지 무기한 재시도. 절대 폐기하지 않는다** |

- 큐 항목은 `request_id`(멱등키)·`type`·`payload`·`created_at`·`retry_count`를 갖는다. 발생 시각으로 서버가 순서를 판정한다.
- 상한 초과 시 오래된 소비 신호부터 폐기한다. 결제·영수증은 폐기 대상에서 제외한다.
- **백그라운드 동기화 실패는 사용자에게 알리지 않는다.** 어떤 에러 UI도 띄우지 않고 큐에 적재한다.

### 5.5 AppLifecycleService (`app/bootstrap`)

포그라운드 복귀 시 수행할 작업이 5종에 달하므로 한 곳에서 조율한다. 각 feature가 핸들러를 등록하고, 서비스는 순서·중복 실행만 관리한다.

| 트리거 | 작업 | 등록 feature |
|---|---|---|
| 포그라운드 복귀 | 라이브러리 조용한 재조회(인디케이터 없음) | library |
| 포그라운드 복귀 | 구독 상태 동기화, 미처리 스토어 트랜잭션 검증 | subscription |
| 포그라운드 복귀 | OS 알림 권한 재확인 → 서버 동기화 | notification |
| 백그라운드 30분 초과 복귀 | 버전 체크·세션 검증만 재수행(**화면 분기는 하지 않는다**) | splash |
| 온라인 복귀 | 오프라인 큐 재전송 | (OfflineQueue) |

### 5.6 Entitlements (`features/subscription`)

- 서버가 내려주는 `entitlements`(`daily_play_limit`·`daily_drip_count`·`drip_enabled`·`ads_enabled` 등)를 보관하고 `useEntitlements()` 훅으로 공개한다.
- 모든 기능 분기는 이 훅으로만 한다. `tier === 'light'` 같은 티어명 비교가 코드에 등장하면 리뷰에서 반려한다.
- 티어 표시용 `tier` 값과 어긋나면 `subscriptions` 조회 결과를 진실로 삼아 갱신한다(`subscription.md` 4.3).

## 6. Navigation Architecture

### 6.1 구조

```
RootStack
├── SplashGate                    # 진입 판정 (버전 → 인증 → 온보딩)
├── AuthStack                     # 시작 화면·약관 동의
├── OnboardingStack               # 주제 → 커리어 → 담기 → 완료 → 알림
├── MainTab                       # 하단 탭 3개
│   ├── LibraryStack
│   ├── ExploreStack
│   └── ProfileStack              # 프로필 → 설정(우상단 아이콘) → 하위 화면
├── PlayerModal                   # 플레이어 (탭 위 풀스크린 모달)
└── (전역 오버레이) MiniPlayer · PaywallBottomSheet · Toast/Snackbar
```

- **미니플레이어는 내비게이션 스택 밖의 전역 오버레이다.** MainTab 위에 상주하며, PlaybackService store를 구독한다. 탭 이동·화면 전환에 언마운트되지 않는다.
- 설정은 탭이 아니다. 프로필 우상단 아이콘이 유일한 진입점이다(`settings.md` 2).
- 페이월은 화면이 아니라 **바텀시트**다. 플레이어를 열지 않은 상태에서도 띄울 수 있어야 한다(`paywall.md`).

### 6.2 진입 분기 — SplashGate

순차 판정하며, 앞 단계에서 걸리면 뒤를 실행하지 않는다(`splash.md` 4).

```
1. 버전 체크 → 강제 업데이트(닫기 불가) / 권장(바텀시트) / 점검 화면
2. 인증     → 토큰 없음·갱신 실패 → 로컬 토큰 삭제 후 AuthStack
3. 온보딩   → onboarding_completed == false → 서버의 onboarding_step부터 재개
4. 통과     → MainTab (라이브러리)
```

- 최소 노출 0.8초(깜빡임 방지), 1.5초 초과 시 인디케이터 추가.
- 스플래시 도중 백그라운드 → 복귀 시 판정을 처음부터 다시 한다(중간 상태를 신뢰하지 않는다).
- 버전값 캐시는 허용하되(가용성 우선 — 버전 체크 실패로 앱을 막지 않는다), **점검 응답은 절대 캐시하지 않는다.**

### 6.3 스택 초기화 규칙

| 시점 | 동작 |
|---|---|
| 온보딩 완료 → 라이브러리 | 온보딩 스택 전체 제거(뒤로가기 복귀 불가) |
| 회원 탈퇴 완료 | 스택 전체 초기화 → 시작 화면 |
| 세션 만료(refresh 실패) | 어느 화면이든 스택 초기화 → 시작 화면 |
| 온보딩 진행 중 | 다른 탭 접근 차단. 1단계에서 뒤로가기는 무동작(계정은 이미 생성됨) |

### 6.4 딥링크 게이트

딥링크(푸시 포함)는 **도착지가 결정된 뒤 스택 위에 얹는다**(`splash.md` 4, `notification.md` 4.4).

1. SplashGate 판정을 먼저 통과한다.
2. 온보딩 미완료면 딥링크를 보류했다가 완료 후 이동한다.
3. 콘텐츠 딥링크는 재생 시작 게이트(5.2)를 거친다 — 차단 시 페이월.
4. 대상이 회수·삭제됐으면 라이브러리로 폴백 + 토스트.

### 6.5 결제 후 막힌 지점 복귀

```
재생 차단 → 페이월 시트 → 결제 → 서버 영수증 검증 → entitlements 갱신
        → 시트 자동 닫힘 → blocked_content_id 자동 재생(position_sec부터)
[닫기]  → 원래 화면 복귀, blocked_content_id 폐기
```

- 결제 진행 중에는 시트 닫기·화면 이탈을 차단한다.
- 결제 중 백그라운드 이탈 → 복귀 시 미처리 트랜잭션 조회 → 검증 → 티어 반영 → 자동 재생(5.5).
- 결제 직후 해당 콘텐츠가 회수됐으면 자동 재생 대신 종료 안내 후 복귀한다(`paywall.md` 7).

## 7. State Management

### 7.1 상태 분류

**어떤 상태를 어디에 두는지**가 이 장의 전부다. 아래 표를 벗어나는 배치는 리뷰에서 반려한다.

| 분류 | 도구 | 예 |
|---|---|---|
| **서버 상태** | TanStack Query | 라이브러리 목록, 탐색 피드, 프로필 요약, 구독 상태, 관심 주제 |
| **클라이언트 전역 상태** | Zustand store | 재생 상태(PlaybackService), 네트워크 상태, 세션 상태, entitlements |
| **화면 로컬 상태** | `useState` / `useReducer` | 입력값, 시트 열림, 관심사 편집 중간 상태(일괄 편집 — `interest-management.md`) |
| **영속 상태** | SecureStore / SQLite / MMKV | → 7.2 |

- **서버 데이터를 Zustand에 복사하지 않는다.** 서버 상태의 진실은 Query 캐시 하나다. 전역 store에는 서버가 모르는 클라이언트 고유 상태만 둔다.
- 라이브러리 주제 필터는 화면 상태이며 **앱 종료 시 초기화한다**(영속 금지 — `library.md` 7).

### 7.2 영속 계층 3종

| 저장소 | 용도 | 항목 |
|---|---|---|
| **SecureStore** | 비밀값 | access/refresh token |
| **SQLite** | 구조적·순서 보존 데이터 | 오프라인 큐, 재생 위치 로컬 기록, (P1) 오프라인 저장 메타 |
| **MMKV** | Key-Value 플래그·소형 캐시 | 최근 검색어(10건), `blocked_content_id`, 알림 재고 팝업 소진 플래그, 온보딩 주제 임시 저장, 버전 캐시, 마지막 목록 1페이지 캐시 |

- 토큰이 SecureStore 밖으로 나가면 리뷰에서 반려한다.
- 캐시는 "없으면 새로 받으면 되는 것"만 MMKV에 둔다. 유실되면 안 되는 것(큐·영수증)은 SQLite다.

### 7.3 낙관적 UI · 롤백

`common-error-handling.md` 4.4를 따른다.

- 대상: 토글·담기·삭제. Mutation의 낙관적 업데이트로 즉시 반영하고, 실패 시 원상 복구 + 토스트.
- **삭제는 [실행 취소] 스낵바(5초)가 사라진 뒤에 서버 요청을 보낸다.** 서버 삭제 후의 실행 취소는 재적립하되 원래 `added_at`을 유지한다(`library.md` 4.5·7).
- 연타 대응: 요청에 클라이언트 시퀀스를 실어 오래된 응답을 무시한다. 최종 멱등성은 서버 유니크 제약이 보장한다.
- 관심사 관리 화면만 예외적으로 일괄 편집 + [저장] 버튼이다(낙관적 토글 아님).

### 7.4 캐싱 정책

- 목록 조회는 **커서 기반 무한 스크롤**(20건)이 기본이다. Query의 infinite 패턴을 쓴다.
- 오프라인 진입 시: 캐시가 있으면 캐시 + 상단 오프라인 배너, 없으면 전체 화면 에러 + [다시 시도].
- 오프라인 실행 시 온보딩 완료자만 캐시 라이브러리 진입을 허용한다. 미완료자는 네트워크 오류 화면이다(`splash.md` 7).
- 편집 후 복귀 시 **해당 카드만 재무효화**한다. 화면 전체 스켈레톤을 다시 띄우지 않는다(`profile.md` 5).

## 8. Error Handling

클라이언트 에러 계약은 `common-error-handling.md`가 기준이다. 이 장은 그 규칙을 **코드 어디에서 구현하는지**를 정한다. 두 문서가 충돌하면 `common-error-handling.md`가 기준이다.

### 8.1 원칙

1. **에러 분류·재시도는 한 곳(ApiClient 인터셉터)에서만 처리한다.** 화면·훅에서 status code로 분기하지 않는다.
2. 모든 서버 에러는 `ApiError { errorCode, message, retryable, retryAfterSec, traceId }`로 정규화되어 상위로 전달된다. 화면은 `errorCode`로만 분기한다.
3. **사용자가 시작하지 않은 실패는 알리지 않는다.** 백그라운드 동기화 실패는 무음으로 큐에 적재한다.
4. 서버가 준 `message`를 우선 노출한다(운영 중 문구 조정 가능). 클라이언트가 더 적절한 문구를 아는 경우(남은 시간 분 환산 등)만 재구성한다.

### 8.2 구현 분담

| 규칙 | 구현 위치 |
|---|---|
| 401 → 토큰 갱신(단일 인플라이트) → 원 요청 1회 재시도 | ApiClient 인터셉터 + SessionService |
| 타임아웃(일반 10초/미디어 20초), 5xx·429 자동 재시도(최대 2회, 1초→3초, 지터 ±20%) | ApiClient 인터셉터. GET 기본 대상, 변경 요청은 멱등키 있을 때만 |
| 결제·영수증 검증·탈퇴 자동 재시도 금지 | ApiClient — 요청 옵션으로 명시 제외 |
| `Idempotency-Key` 부착 | api 모듈이 요청 정의 시 선언, 발급·저장은 ApiClient |
| 네트워크 없음 판정 | NetworkState store. 단 **OS 연결 상태만 믿지 않고 실제 응답으로 최종 판정**(캡티브 포털) |
| 화면별 표현(전체 화면/인라인/토스트/무음) | 화면·훅 — 아래 8.3 표에 따라 shared/ui 공통 컴포넌트 사용 |

### 8.3 표현 규칙 → 공통 컴포넌트

`common-error-handling.md` 4.3·5의 표를 `shared/ui`로 구현하고 전 화면이 재사용한다. 화면마다 에러 UI를 새로 만들지 않는다.

| 상황 | 컴포넌트 |
|---|---|
| 화면 진입 조회 실패 | `FullScreenError` (+[다시 시도], 인플라이트 중 연타 무시) |
| 무한 스크롤 추가 로딩 실패 | `ListFooterError` (기존 목록 유지) |
| 사용자 액션 실패 | `Toast` (3초) / 인라인 에러 |
| 삭제 취소 | `Snackbar` (5초, [실행 취소]) |
| 백그라운드 실패 | 없음 — 무음 |
| 오프라인 | `OfflineBanner` (상단 고정, 복귀 시 자동 소멸) |
| 로딩 | `Skeleton`(목록) / `Spinner`(액션) — **0.3초 미만이면 표시하지 않는다** |
| 점검·강제 업데이트 | 전용 전체 화면 (닫기 불가 규칙 포함) |

### 8.4 크래시·에러 수집

- 4xx/5xx·타임아웃·재시도 소진을 수집한다(요청 경로·에러 코드·재시도 횟수). 개인정보·토큰·영수증 본문은 수집하지 않는다.
- 수집 도구는 미결이다(`common-error-handling.md` 미결 — Sentry / Crashlytics). 선정 시 이 장에 초기화 위치·마스킹 규칙을 기록한다.

## 9. Security

### 9.1 토큰·비밀값

- 토큰은 SecureStore 전용(→ 7.2). 로그·에러 리포트·전역 상태에 토큰을 넣지 않는다.
- **앱 번들에 비밀값을 넣지 않는다.** 소셜 SDK의 앱 키 등 클라이언트 배포가 불가피한 키만 환경 설정(app config)으로 관리하고, 서버 시크릿은 절대 클라이언트로 내리지 않는다.
- 클라이언트가 보낸 프로필·티어 값을 서버가 신뢰하지 않는 구조(`backend/architecture.md` 9)를 전제로, 클라이언트도 **판정 결과를 로컬에서 위조 가능한 값에 의존하지 않는다.**

### 9.2 콘텐츠 보호 (파트너 계약 사항 — 협상 불가)

- 오디오는 단기 서명 URL로만 재생하고 URL을 저장·노출하지 않는다.
- 미디어 캐시는 **앱 전용 저장소**에 두고 외부 접근을 차단한다(`player.md` 4.8). 기기 백업에서 제외한다.
- 스크립트 텍스트는 **선택·복사를 차단한다**(`player.md` 4.6).
- (P1 오프라인 저장 도입 시) iOS Data Protection / Android 내부 저장소 + 암호화, 파일명 난수화, 루팅·탈옥 탐지 시 저장 비활성화(`offline-download.md` 4.6). MVP에서는 관련 UI 자체를 노출하지 않는다.

### 9.3 화면·플랫폼

- 관리자 메뉴는 `role == admin`에만 노출하되, **UI 은닉은 통제가 아니다.** 접근 통제는 서버 403이 한다(`admin.md` 4.1).
- 외부 링크(약관·원문·공지)는 인앱 브라우저로 연다. 약관 열람을 동의로 기록하지 않는다(`auth-uiux.md` 4.1).
- OS 알림 권한 다이얼로그는 프리퍼미션을 거쳐 1회만 소진한다(`notification.md` 4.1). 거부 상태에서 토글 시도는 [설정 열기]로 안내한다.
- 로그에 개인정보·토큰·영수증을 남기지 않는다(→ convention.md 로깅 규칙).

## 10. Performance

| 항목 | 기준 | 수단 |
|---|---|---|
| 재생 시작 | 탭 후 **2초 내** (정상 네트워크, PRD 비기능) | 서명 URL 발급과 플레이어 준비 병렬화, 버퍼링 2초 초과 시 인디케이터 |
| 로딩 표시 | 0.3초 미만이면 미표시 | shared/ui 로딩 컴포넌트에 지연 내장 |
| 목록 | 무한 스크롤 프레임 저하 없음 | FlashList, 카드 컴포넌트 메모이제이션 |
| 스플래시 | 최소 0.8초·판정 병렬화 | 버전 체크와 토큰 검증 동시 수행 후 순차 판정 |
| 이미지 | 커버 아트 캐싱 | expo-image (메모리+디스크 캐시) |
| JS 엔진 | Hermes 사용 | Expo 기본값 유지 |

- 성능 최적화는 계측 후에 한다. 병목 확인 없이 memo·useCallback을 선제 살포하지 않는다.

## 미결 사항

- 크래시·에러 수집 도구 선정(Sentry / Firebase Crashlytics)과 마스킹 규칙
- 무료 티어 광고 형태(오디오 프리롤 / 배너 — PRD 결정 포인트 #20)에 따른 플레이어·광고 SDK 구조
- Query 캐시의 디스크 영속(persistQueryClient) 도입 여부 — MVP는 수동 캐시(MMKV 1페이지)로 시작
- 소셜 로그인 SDK 확정(카카오·네이버 커뮤니티 모듈 버전·유지보수 상태 확인)
- 푸시 토큰 갱신·`UNREGISTERED` 처리 세부 흐름 — notification 명세 확정 후
- 다크 모드 대응 범위(`auth-uiux.md` 미결) — theme 토큰 구조는 대응 가능하게 설계하되 MVP 범위 미정
- E2E 테스트 도구(Maestro / Detox) 도입 여부와 시점
- OTA 업데이트(EAS Update) 운용 정책 — 스토어 심사 정책 확인 후
