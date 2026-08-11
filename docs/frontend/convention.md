# Frontend Convention

> 이 문서는 '이어' 프론트엔드의 **코드 작성 규칙 문서**다. 시스템 구조·계층 책임·상태 관리 전략·보안 정책은 [architecture.md](architecture.md)에서 다룬다.
>
> 연결 문서: `architecture.md`, `docs/backend/convention.md`, `docs/features/common-error-handling.md`, `docs/spec/api/*`
>
> **문서 운용 원칙**
> - 이 문서와 다른 코드는 리뷰에서 반려한다. 규칙이 틀렸다면 코드가 아니라 문서를 먼저 고친다.
> - "취향 차이로 논쟁이 생기는 지점"을 없애는 것이 목적이다. 규칙에 없어서 매번 다르게 쓰고 있는 게 발견되면 여기에 추가한다.
> - 규칙 간 충돌 시 우선순위: **클라이언트 계약(`docs/features/*`, `docs/spec/*`) > architecture.md > convention.md**.
> - Git 규칙(6장)은 `docs/backend/convention.md` 6장과 **동일 체계**를 쓴다. 한쪽만 바꾸지 않는다.

## 1. Naming Convention

### 1.1 컴포넌트·클래스류

**PascalCase**, 역할이 이름에 드러나게 한다.

| 종류 | 형식 | 예시 |
|---|---|---|
| 화면 | `<이름>Screen` | `LibraryScreen`, `PlayerScreen`, `TermsConsentScreen` |
| 컴포넌트 | 명사형 PascalCase | `LibraryItemCard`, `MiniPlayer`, `PaywallBottomSheet` |
| Provider | `<대상>Provider` | `AppProviders`, `ThemeProvider` |
| Domain Service | `<도메인>Service` | `PlaybackService`, `SessionService` |
| Store (Zustand) | `use<도메인>Store` | `usePlaybackStore`, `useNetworkStore` |
| 에러 클래스 | `<사유>Error` | `ApiError` |

- 화면만 `Screen` 접미사를 강제한다. 내비게이터에 등록되는 단위임을 이름만 보고 알 수 있어야 한다.
- 컴포넌트 이름에 `Component` 접미사를 붙이지 않는다.

### 1.2 Hook / 함수

**camelCase**, 훅은 `use` 접두사, 함수는 **동사로 시작**한다.

| 종류 | 형식 | 예시 |
|---|---|---|
| 화면 훅(ViewModel) | `use<화면>` | `useLibraryScreen`, `usePlayerScreen` |
| Query 훅 | `use<대상>Query` / `use<대상>InfiniteQuery` | `useLibraryItemsInfiniteQuery`, `useProfileSummaryQuery` |
| Mutation 훅 | `use<동작><대상>Mutation` | `useSaveContentMutation`, `useDeleteLibraryItemMutation` |
| 일반 커스텀 훅 | `use<기능>` | `useDebounce`, `useCountdown` |
| 이벤트 핸들러 | `handle<대상><이벤트>` | `handlePlayPress`, `handleEmailSubmit` |
| 핸들러 props | `on<대상><이벤트>` | `onPlayPress`, `onRetry` |
| API 함수 | `<동작><대상>` — HTTP 동사가 아니라 도메인 행위 | `fetchLibraryItems`, `saveContent`, `verifyEmailCode` |
| 변환 함수 | `to<도메인 모델>` / `to<DTO>` | `toLibraryItem(dto)`, `toUpdateInterestsDto(model)` |

- 조회 API 함수는 `fetch` 접두사로 통일한다. `get`은 로컬 값 접근(스토리지·store)에만 쓴다.
- boolean 반환 함수는 `is`/`has`/`can`/`should` 접두사(backend 1.3과 동일).

### 1.3 변수 / 상수 / 타입

`docs/backend/convention.md` 1.3과 동일한 규칙을 쓴다. 요약:

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수·파라미터 | camelCase | `contentId`, `remainingPlays` |
| boolean | `is` / `has` / `can` / `should` 접두사 | `isPlaying`, `canResend`, `hasActiveSubscription` |
| 상수 | SCREAMING_SNAKE_CASE | `PLAYBACK_POSITION_SYNC_INTERVAL_MS` |
| enum·union 이름 | PascalCase 단수 | `LibraryItemStatus`, `PlaybackState` |
| union 멤버 값 | 서버 계약 그대로(snake_case 문자열) | `'not_played' \| 'completed'` |
| interface / type | PascalCase, `I` 접두사 금지 | `PlaybackSnapshot` (○) / `IPlayback` (×) |
| 배열 | 복수형 | `libraryItems`, `topicIds` |
| Props 타입 | `<컴포넌트>Props` | `LibraryItemCardProps` |

**매직 넘버·매직 스트링 금지** — 정책 값(재시도 2회, 백오프 1초→3초, 스켈레톤 지연 0.3초, 코드 6자리, 스낵바 5초 등)은 이름 있는 상수로 선언하고 근거 문서를 주석으로 남긴다.

```ts
/** common-error-handling.md 5 — 0.3초 미만 로딩은 표시하지 않는다 */
export const LOADING_INDICATOR_DELAY_MS = 300;
```

**시간·크기 단위를 이름에 포함한다**: `timeoutMs`, `positionSec`, `retryAfterSec`. 서버 계약(`_sec`)과 혼동을 막는다.

### 1.4 파일

| 대상 | 규칙 | 예시 |
|---|---|---|
| 컴포넌트·화면 | **PascalCase.tsx**, 파일명 = 컴포넌트명 | `LibraryScreen.tsx`, `MiniPlayer.tsx` |
| 훅 | **camelCase.ts(x)**, 파일명 = 훅명 | `useLibraryScreen.ts`, `useCountdown.ts` |
| 그 외(서비스·api·store·타입·유틸) | **kebab-case + 역할 접미사** | `playback.service.ts`, `library.api.ts`, `playback.store.ts`, `library.types.ts`, `format-duration.ts` |
| 테스트 | 대상 파일명 + `.test` | `playback.service.test.ts`, `LibraryScreen.test.tsx` |

파일 하나에 공개 컴포넌트 하나를 기본으로 한다. 파일명과 기본 export 이름은 일치해야 한다.

### 1.5 Feature · 디렉터리 이름

- feature 디렉터리는 **소문자 단수형**: `player`, `library`, `paywall`. 화면 명세 문서명과 대응시킨다(`docs/features/library.md` ↔ `features/library`).
  - 예외: `interest-management.md` ↔ **`features/interest`** — `architecture.md` 4.1·4.4의 모듈명(`interest`)과 코드가 일치하는 쪽을 우선했다(기록 2026-08-11). 새 폴더를 `interest-management`로 만들지 않는다.
- 하위 디렉터리는 고정 이름만 쓴다: `screens/ components/ hooks/ api/ services/ store/`. 새 종류가 필요하면 이 문서에 추가한 뒤 쓴다.

### 1.6 표기 경계 정리

`backend/convention.md` 1.6과 짝을 이루는 클라이언트 쪽 규칙이다.

```
API JSON (snake_case) ──api/ 모듈의 변환 함수──▶ 도메인 모델 (camelCase) ──▶ 화면·서비스
```

- **DTO 타입은 서버 계약 그대로 snake_case 필드로 선언한다.** 계약 문서(`docs/spec/api/*`)와 1:1 대조가 가능해야 한다.
- **변환은 `api/` 모듈 안에서만 일어난다.** 화면·훅·서비스에서 snake_case 필드를 다루면 변환 경계가 무너진 것이다.
- 서버 enum 값(`'light'`, `'not_played'`)은 변환하지 않고 그대로 쓴다. 이름을 바꾸면 계약 대조가 불가능해진다.

```ts
// library.api.ts
type LibraryItemDto = {
  id: string;
  content_id: string;
  status: 'not_played' | 'completed';
  last_played_sec: number;
  added_at: string;            // ISO 8601
};

export type LibraryItem = {
  id: string;
  contentId: string;
  status: 'not_played' | 'completed';
  lastPlayedSec: number;
  addedAt: string;
};

const toLibraryItem = (dto: LibraryItemDto): LibraryItem => ({ ... });
```

## 2. File Structure Convention

### 2.1 Feature 내부 구조

feature는 화면 명세 단위로 나눈다(architecture.md 4.1). 기본 형태:

```
features/library/
├── index.ts                     # 공개 API — 여기서 export한 것만 외부 사용 가능
├── screens/
│   └── LibraryScreen.tsx
├── components/
│   ├── LibraryItemCard.tsx
│   └── LibraryFilterTabs.tsx
├── hooks/
│   ├── useLibraryScreen.ts
│   └── useLibraryItemsInfiniteQuery.ts
├── api/
│   └── library.api.ts           # 엔드포인트 + DTO + 변환
└── library.types.ts             # feature 도메인 모델
```

**확장 규칙** — 파일이 늘어나면 다음 순서로만 나눈다. 처음부터 빈 디렉터리를 만들지 않는다.

| 조건 | 조치 |
|---|---|
| React 밖 동작이 생김 | `services/` 추가 (`playback.service.ts`) |
| 전역 구독 상태가 생김 | `store/` 추가 (`playback.store.ts`) |
| 상수·정책 값이 여러 파일에서 쓰임 | `<feature>.constants.ts` |
| 컴포넌트가 전용 하위 컴포넌트를 가짐 | `components/<이름>/` 디렉터리로 묶음 |

### 2.2 공개 API (`index.ts`)

- feature 간 import는 **상대 feature의 `index.ts`가 export한 것만** 사용한다. 내부 파일 직접 import 금지(architecture.md 4.3).
- `index.ts`에는 **의도적으로 공개하는 것만** 올린다. 전부 re-export 하는 배럴 파일로 쓰지 않는다.
- 같은 feature 내부에서는 `index.ts`를 거치지 않고 직접 import 한다(순환 방지).

### 2.3 Import 규칙

- 절대 경로 alias `@/`(`src/` 기준)를 사용한다. feature 밖으로 나가는 `../`는 금지한다. 같은 feature 내부만 상대 경로를 허용한다.
- import 순서: ① react/react-native → ② 외부 패키지 → ③ `@/shared` → ④ `@/features`(공개 API) → ⑤ 상대 경로. 그룹 사이에 빈 줄을 둔다. (backend 2.3과 같은 원리 — lint로 강제한다)
- `shared/`에서 `features/`를 import 하면 안 된다. lint 경계 규칙으로 강제한다.

### 2.4 수정 범위 경계

- **프론트엔드 코드 작업에서 수정할 수 있는 파일은 프론트엔드 코드뿐이다.** 백엔드 코드(서버 소스·백엔드 설정 등)는 어떤 경우에도 수정하지 않는다.
- 백엔드는 **필요할 때 참조만 한다** — API 계약 확인, 에러 코드 대조, 스키마(`docs/backend/domain.md`) 확인 등 읽기 목적에 한한다.
- 참조 결과 백엔드 코드·문서에 수정이 필요하다고 판단되면, 직접 고치지 않고 **백엔드 담당에게 전달**한다(문서 우선 원칙과 동일 — 어긋남을 발견한 쪽이 고치는 게 아니라 소유한 쪽이 고친다).

## 3. Component Convention

### 3.1 작성 규칙

- **함수형 컴포넌트만** 쓴다. 클래스 컴포넌트 금지(에러 바운더리 제외).
- Props는 반드시 타입을 선언한다. `any` props 금지. 컴포넌트 바로 위에 `<컴포넌트>Props`로 정의한다.
- **화면(Screen)은 조립만 한다.** 데이터 로딩·분기 판단은 화면 훅(`use<화면>`)에 두고, Screen은 훅이 준 상태를 배치·렌더링한다. JSX 안에 비즈니스 분기가 3개 이상 중첩되면 컴포넌트나 훅으로 분리한다.
- 컴포넌트가 200줄을 넘으면 분리를 검토한다. 강제 상한은 아니지만 리뷰에서 사유를 물을 수 있다.
- 조건부 렌더링은 `&&`보다 삼항 또는 조기 return을 우선한다. `count && <X/>`처럼 0이 렌더되는 사고를 막는다.

### 3.2 상태·이펙트

- `useEffect`는 최후 수단이다. 파생 값은 렌더 중 계산하고, 이벤트 응답은 핸들러에서 처리한다. 이펙트를 쓰면 **무엇과 동기화하는지** 주석으로 남긴다.
- 타이머·구독·리스너는 반드시 클린업한다.
- 카운트다운(코드 만료 등)은 **서버가 준 `expires_at` 기준으로 매 tick 재계산**한다. 로컬에서 감산 누적하지 않는다(`auth-uiux.md` 4.10).

### 3.3 스타일

- **`StyleSheet.create` + `shared/theme` 토큰**으로 작성한다. 스타일 라이브러리를 추가하지 않는다(MVP 범위 — 도입하려면 architecture.md 2장 원칙을 따른다).
- 색·간격·타이포를 컴포넌트에 리터럴로 쓰지 않는다. 토큰(`theme.color.*`, `theme.spacing.*`)만 쓴다. 다크 모드 대응 여부가 미결이므로(architecture.md 미결) 색 직접 참조는 그 결정을 막는다.
- 스타일 객체는 컴포넌트 파일 하단에 둔다. 인라인 스타일은 동적 값 1~2개에만 허용한다.

### 3.4 접근성 (uiux 명세 이행)

- 터치 타깃 최소 44×44pt.
- 아이콘 전용 버튼에는 `accessibilityLabel` 필수.
- 색만으로 상태를 구분하지 않는다. 비활성 사유는 텍스트로 함께 밝힌다("47초 후 재전송").
- 동적 텍스트 크기 200%에서 잘리지 않아야 한다. 고정 height에 텍스트를 넣지 않는다.

### 3.5 카피(문구)

- 사용자 노출 문구는 컴포넌트에 하드코딩하지 않고 feature별 `<feature>.copy.ts`(상수 모듈)에 모은다. uiux 명세의 확정 카피와 1:1 대조가 가능해야 한다.
- 해요체 통일, 사용자를 탓하지 않는 문구, 법적 고지는 완곡하게 바꾸지 않는다(`auth-uiux.md` 6).
- 서버가 `message`를 내려주면 그것을 우선 사용한다.

## 4. State Convention

### 4.1 TanStack Query

**Query Key는 feature별 factory 한 곳에서만 만든다.** 문자열 배열을 호출부에서 즉석 조립하지 않는다 — 무효화 누락의 주범이다.

```ts
// library.api.ts
export const libraryKeys = {
  all: ['library'] as const,
  items: (filters: LibraryFilters) => [...libraryKeys.all, 'items', filters] as const,
};
```

| 항목 | 규칙 |
|---|---|
| key 구조 | `[feature, 대상, 파라미터]`. 파라미터는 직렬화 가능한 객체 |
| 무효화 | mutation 성공 시 관련 key를 명시적으로 invalidate. "새로고침하면 되겠지"를 코드에 남기지 않는다 |
| 재시도 | 전역 기본값은 architecture.md 8.2의 정책을 따른다. 화면별 override는 사유 주석 필수 |
| enabled | 조건부 조회는 `enabled` 옵션으로. 훅을 조건부 호출하지 않는다 |
| select | 화면 전용 가공은 `select`로. 캐시에는 도메인 모델 원형을 유지한다 |

### 4.2 Zustand

- store는 `store/` 아래 파일당 하나. 파일명 `<도메인>.store.ts`, 훅명 `use<도메인>Store`.
- **컴포넌트는 selector로 필요한 조각만 구독한다.** store 전체 구독(`useXxxStore()` 인자 없이)을 금지한다 — 미니플레이어처럼 초 단위 갱신 상태에서 전체 리렌더가 난다.
- store 간 직접 참조 금지. 조합이 필요하면 훅에서 조합한다.
- **서버 상태를 store에 넣지 않는다**(architecture.md 7.1). store에 들어갈 수 있는 것은 서버가 모르는 클라이언트 고유 상태뿐이다.

### 4.3 영속 규칙

- 저장소 선택은 architecture.md 7.2 표를 따른다. 표에 없는 항목을 영속하려면 표를 먼저 갱신한다.
- 스토리지 키는 `shared/storage`의 상수 한 곳에서 관리한다. 리터럴 키 산재 금지.

## 5. API Layer Convention

### 5.1 구성

- feature마다 `api/<feature>.api.ts` 하나로 시작한다. 커지면 대상 단위로 분리(`library-items.api.ts`).
- 하나의 api 파일은 **엔드포인트 함수 + DTO 타입 + 변환 함수 + query key factory**를 담는다.
- 모든 요청은 `shared/api`의 ApiClient를 경유한다. axios 직접 import 금지.

### 5.2 원칙

1. **DTO와 도메인 모델을 분리한다.** DTO는 snake_case 계약 그대로, 도메인 모델은 camelCase(→ 1.6). 응답을 화면에 그대로 흘리지 않는다.
2. **요청 DTO와 응답 DTO를 공유하지 않는다.** 같은 모양이어도 각각 선언한다(backend 3.2와 동일한 이유 — 서로 다른 속도로 변한다).
3. api 함수는 **정규화된 `ApiError`를 그대로 위로 던진다.** api 모듈에서 try/catch로 삼키지 않는다. 처리 위치는 훅·화면이다.
4. 부작용 있는 POST(담기·결제·탈퇴·코드 발송)는 요청 정의에 **멱등키 필요 여부를 명시**한다(`spec/api/*`의 ★ 표시와 대조).
5. 클라이언트가 `user_id`를 만들어 보내지 않는다. 내 리소스는 `me` 경로다(IDOR 방지 — `backend/architecture.md` 9.2).

### 5.3 에러 분기

- 화면·훅은 `error.errorCode`로만 분기한다. HTTP status 직접 비교 금지(`common-error-handling.md` — 403이어도 페이월인지 회수인지는 코드가 가른다).
- 에러 코드 문자열은 `shared/api/error-codes.ts` 한 곳의 상수로 관리한다. 서버 enum(`backend/architecture.md` 7.5)과 이름을 일치시킨다.
- 분기하지 않는 에러는 공통 표현 규칙(architecture.md 8.3)에 맡긴다. 화면에서 개별 처리하는 코드는 그 화면이 실제로 다르게 동작해야 하는 것뿐이다.

## 6. Git Convention

**`docs/backend/convention.md` 6장과 같은 체계를 쓴다.** 아래는 프론트엔드 적용값이며, 형식이 어긋나면 백엔드 문서가 기준이다.

### 6.1 Commit

```
<type>(<scope>): <subject>
```

```
feat(player): add playback start gate
fix(paywall): restore blocked content after purchase
refactor(library): extract infinite list hook
docs(frontend): add state management rule
```

| 항목 | 규칙 |
|---|---|
| type | `feat` `fix` `docs` `refactor` `test` `chore` `perf` `style` (backend와 동일 목록) |
| scope | feature 이름 소문자 (`auth`, `library`, `player`, `paywall`, ...) 또는 `frontend`(횡단 변경) |
| subject | 영문 소문자, 명령형 현재시제, 마침표 없음, 50자 이내 |

- 하나의 커밋은 하나의 목적만. 본문에는 **왜** 바꿨는지를 쓴다. 관련 FR이 있으면 `Relates to FR-29`.

### 6.2 Branch

```
<type>(fe)/<짧은-설명>
```

```
feat(fe)/playback-gate
fix(fe)/paywall-restore
docs(fe)/architecture-convention
```

- **`(fe)` 표기로 프론트엔드 작업 브랜치임을 표시한다**(backend 6.2가 정의한 파트 표기 규칙).
- 설명은 소문자 kebab-case 2~4단어. 브랜치는 main에서 분기하고 작업 종료 시 삭제한다.

### 6.3 PR

backend 6.3과 동일하다: main 직접 push 금지, PR 제목은 커밋 형식, 본문에 **변경 요약 / 관련 FR·문서 / 테스트 방법**을 포함하고, 작게 유지한다. 프론트엔드는 추가로 **화면 변경 시 스크린샷(또는 녹화)** 을 첨부한다.

## 7. Testing Convention

### 7.1 위치·파일명

**테스트는 대상 파일과 같은 디렉터리에 둔다**(backend 7.1과 동일 원칙).

```
features/player/services/
├── playback.service.ts
└── playback.service.test.ts

features/library/screens/
├── LibraryScreen.tsx
└── LibraryScreen.test.tsx
```

| 종류 | 도구 | 대상 |
|---|---|---|
| 단위 테스트 | Jest | 서비스·훅·변환 함수·유틸 |
| 컴포넌트 테스트 | React Native Testing Library | 화면 상태 분기·상호작용 |
| E2E | 미결(Maestro / Detox) | PRD 9.2 핵심 시나리오 |

### 7.2 무엇을 테스트하는가

| 대상 | 방침 |
|---|---|
| **Domain Service** | **필수.** 재생 시작 게이트 분기, 트래킹 값 계산(`listened_sec`·`max_reached_sec`), 오프라인 큐 규칙, 세션 갱신 단일 인플라이트 |
| **변환 함수(DTO↔모델)** | 필수. 계약 필드 누락이 여기서 걸린다 |
| **화면 훅** | 분기가 있는 것은 작성. Query·서비스는 mock |
| **컴포넌트** | 상태 분기가 복잡한 것만(페이월 시트, 코드 입력, 재생 확인 팝업). 단순 표시 컴포넌트는 생략 가능 |
| **shared/ui·유틸** | 재사용 범위가 넓으므로 작성 |

**클라이언트 정책 로직은 단위 테스트를 반드시 작성한다** — PRD 9.1의 클라이언트 몫: 재생 전 고지 분기(차감=고지 / 재청취·무제한=고지 없음 / 소진=페이월), 완청·스킵 판정 값 계산, 낙관적 UI 롤백, 삭제 스낵바 후 전송, 오프라인 큐 덮어쓰기·순서 보존, 401 갱신 후 1회 재시도, 커서 페이지네이션 병합.

### 7.3 작성 규칙

`backend/convention.md` 7.3과 동일한 형식을 쓴다.

```ts
describe('PlaybackGate', () => {
  describe('startPlayback', () => {
    it('한도를 소진한 무료 사용자가 재생을 시도하면 페이월이 열리고 재생은 시작되지 않는다', async () => {
      // given
      // when
      // then
    });
  });
});
```

- `it` 설명은 한글 "~하면 ~한다" 형식. 명세의 Given-When-Then 문장을 그대로 옮겨도 좋다.
- given / when / then 주석으로 구분, 테스트 하나는 하나만 검증, 테스트 간 상태 공유 금지.
- **`Date.now()`·타이머·랜덤을 직접 쓰지 않는다.** 시각은 주입 가능하게 만들고 fake timer로 고정한다. 카운트다운·큐 타임스탬프·서비스 날짜 표시가 전부 시각 의존이다.
- 실패 경로를 반드시 테스트한다. 네트워크 실패·롤백·큐 적재가 이 앱의 절반이다.

### 7.4 커버리지

수치 목표를 강제하지 않는다. **7.2의 정책 로직에 테스트가 없으면 PR을 머지하지 않는다**(backend 7.4와 동일 기준).

## 8. Lint · Format · 타입

- **ESLint + Prettier**를 쓰고 CI에서 검사한다. 포맷 논쟁을 코드 리뷰에서 하지 않는다.
- 필수 룰:
  - `@typescript-eslint/no-explicit-any` — `any` 금지. 불가피하면 `unknown` + 좁히기
  - `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` — error
  - import 순서·경계 규칙(2.3) — `import/order` + 경계 플러그인으로 강제
  - `no-console` — 9장 로거만 허용
- `tsconfig`는 `strict: true` 고정. `// @ts-ignore` 금지, 정말 필요하면 `@ts-expect-error` + 사유 주석.
- 커밋 훅(lint-staged) 도입 여부는 미결이다.

## 9. Logging Convention

클라이언트 로깅은 backend 8장의 축소판이다. 목적은 두 가지뿐이다: 에러 수집(도구 미결 — architecture.md 8.4)과 개발 중 디버깅.

- **`console.log`를 커밋하지 않는다.** `shared/lib/logger`를 경유한다. 개발 빌드에서만 출력되고, 릴리즈 빌드에서 debug 레벨은 비활성이다.
- 수집 대상: API 실패(경로·`error_code`·재시도 횟수), 재생 실패, 결제 검증 실패, 크래시. `common-error-handling.md` 4.7의 지표와 연결한다.
- **남기지 않는 것**: 토큰, 서명 URL, 영수증 본문, 이메일 원문·개인식별정보, 스크립트(대본) 텍스트. backend 8.4와 동일 목록이다.
- 정상 도메인 분기(페이월 노출·한도 초과)를 error로 남기지 않는다.

## 미결 사항

- E2E 도구 선정(Maestro / Detox)과 CI 연동 시점
- 커밋 훅(lint-staged + husky) 도입 여부
- 에러 수집 도구 선정 후 로거 연동 규칙(브레드크럼·마스킹 목록) 구체화
- 다크 모드 확정 시 theme 토큰 구조(라이트/다크 팔레트) 규칙 추가
- 광고 형태 확정 시(PRD 결정 포인트 #20) 광고 컴포넌트·SDK 사용 규칙 추가
- 디자인 토큰 값 확정 — 현재 와이어프레임(`docs/wireframe/style.css`) 기준 임시값, UI·UX 담당 확정 후 반영
