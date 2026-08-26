# Backend Architecture

> 이 문서는 '이어' 백엔드의 **구조 기준 문서**다. 코드 작성 규칙(네이밍·파일 구성·DTO 작성법 등)은 [convention.md](convention.md)에서 다룬다.
>
> 연결 문서: `docs/backend/domain.md`(스키마의 유일한 기준), `docs/prd/ear_root_prd.md`, `docs/features/common-error-handling.md`, `docs/features/content-pipeline.md`, `docs/features/drip-scheduling.md`
>
> **문서 운용 원칙**
> - 이 문서와 충돌하는 구현은 리뷰에서 반려한다. 구현이 옳다면 문서를 먼저 고친다.
> - 도메인 확정·기능 추가에 따라 4·5·6장은 계속 채워진다. 미확정 항목은 각 장 하단 또는 마지막 "미결 사항"에 남긴다.
> - 규칙을 예외적으로 어길 경우, 코드 주석이 아니라 이 문서에 **예외 사유와 함께** 기록한다.

## 1. Backend Overview

Backend는 다음 4가지를 책임진다.

| 책임 | 내용 |
|---|---|
| **Client 요청 처리** | 인증·인가, 요청 검증, 응답 반환 |
| **비즈니스 로직 처리** | 도메인 규칙, 정책 판정(구독 티어·재생 한도·드립 편성 등), 트랜잭션 관리 |
| **Database 관리** | 스키마·마이그레이션, 데이터 정합성 보장 |
| **AI Server와의 통신** | 대본 생성·QA·TTS 작업 요청 및 결과 수신, 작업 상태 관리 |

**AI 파이프라인 자체는 AI 서버의 책임으로 분리한다.** Backend는 파이프라인을 *실행*하지 않고 *오케스트레이션*한다. 즉 "어떤 원문을 언제 어떤 순서로 처리할지, 그 결과를 어떤 상태로 저장하고 언제 발행할지"는 Backend가 관리하고, 모델 추론·프롬프트·QA 판정 알고리즘·음성 합성은 AI 서버 내부에 둔다.

```
┌──────────┐        ┌─────────────────────────────┐        ┌──────────────┐
│  Client  │ ──────▶│          Backend            │ ──────▶│  AI Server   │
│  (App)   │◀────── │  API · 도메인 로직 · 상태관리  │◀────── │  대본/QA/TTS  │
└──────────┘        └──────────────┬──────────────┘        └──────────────┘
                                   │
                            ┌──────▼──────┐   ┌──────────────┐
                            │ PostgreSQL  │   │ Object Storage│
                            └─────────────┘   │  (오디오 파일)  │
                                              └──────────────┘
```

**경계 원칙**

- Client는 DB·Object Storage·AI Server에 직접 접근하지 않는다. 모든 접근은 Backend를 경유한다.
- AI Server는 Backend DB에 직접 쓰지 않는다. 결과는 API 응답 또는 콜백으로 Backend에 전달하고, 상태 저장은 Backend가 한다.
- 오디오 파일 접근은 Backend가 발급한 단기 서명 URL로만 이루어진다 (→ 9.4).

## 2. Tech Stack

| 구분 | 선택 | 비고 |
|---|---|---|
| Framework | **NestJS** | 모듈 기반 DI, 레이어 분리 강제에 적합 |
| Language | **TypeScript** | `strict: true` 필수 |
| Database | **PostgreSQL** | |
| ORM | **TypeORM** | Entity 기반. Raw SQL은 예외적으로만 (→ 3.4) |

**추가 도입 시 원칙** — 라이브러리 추가는 다음을 만족할 때만 한다.

- 직접 구현 대비 명확한 이득이 있고, 도메인 코드가 그 라이브러리에 종속되지 않는다.
- 도입 시 이 문서 또는 convention.md에 사용 범위를 함께 기록한다.

## 3. Application Layer Architecture

### 3.1 기본 흐름

```
Controller  ──▶  Service  ──▶  Repository (TypeORM)  ──▶  Database
                    │
                    └──▶  (필요 시) Orchestrator 로 대체·상위 배치
```

각 계층은 **바로 아래 계층까지만** 호출한다. Controller가 Repository를 직접 호출하거나, Service가 DataSource로 직접 쿼리하는 것을 금지한다.

### 3.2 계층별 책임

| 계층 | 담당한다 | 담당하지 않는다 |
|---|---|---|
| **Controller** | 라우팅, Request validation(DTO + ValidationPipe), 인증·인가 가드 적용, Service 호출, Response 반환 | 비즈니스 로직, 조건 분기 판정, 트랜잭션, DB 접근, try/catch 를 통한 에러 변환 |
| **Service** | Business Logic, 도메인 규칙 판정, 트랜잭션 경계 관리, 도메인 예외 발생, 다른 도메인 Service 호출 | 직접적인 DB 접근(쿼리 작성), HTTP 관심사(status code·헤더), 요청 형식 검증 |
| **Repository** | TypeORM을 통한 Entity 조회·저장·수정·삭제, 쿼리 작성, Entity 객체 생성 | 비즈니스 판정, 트랜잭션 시작, 도메인 예외 발생, 다른 도메인 Repository 호출 |

**Service의 "직접적인 DB 접근을 하지 않는다"의 정의**
Service는 SQL·QueryBuilder를 작성하지 않고, `DataSource`/`EntityManager`로 직접 CRUD 하지 않는다. TypeORM을 사용한 접근은 **Repository를 경유하는 경로만** 허용한다.
단 하나의 예외: 트랜잭션 경계를 열기 위해 Service가 `DataSource.transaction()`을 사용하는 것은 허용한다. 이때도 실제 쿼리는 트랜잭션 컨텍스트를 전달받은 Repository가 수행한다 (→ 8.2).

### 3.3 Orchestrator

여러 도메인 Service를 조합해야 하는 **파이프라인·다단계 유스케이스**에 한해 Service 위에 Orchestrator를 둔다.

- 적용 대상 예시: 콘텐츠 파이프라인(수급 → 대본 생성 → QA → TTS → 발행), 드립 편성 배치, 결제 검증 후 티어 반영.
- Orchestrator는 **자기 Repository를 갖지 않는다.** 상태 저장은 각 도메인 Service에 위임한다.
- Orchestrator는 순서·재시도·실패 시 상태 전이만 담당한다. 도메인 규칙 판정은 Service에 둔다.
- Controller는 Orchestrator를 호출할 수 있다. Service가 Orchestrator를 호출하는 것은 금지한다(방향 역전).

```
Controller / Scheduler / Consumer
        │
        ▼
   Orchestrator ──▶ A.Service ──▶ A.Repository
        │
        ├────────▶ B.Service ──▶ B.Repository
        └────────▶ AiClient (외부 통신)
```

### 3.4 계층 위반 예외

| 상황 | 허용 조건 |
|---|---|
| 복잡한 통계·집계 쿼리로 Raw SQL이 필요 | **Repository 안에서만** 작성. Service로 새어 나가지 않게 결과를 타입으로 정의해 반환 |
| 성능 문제로 N+1 회피가 필요 | Repository에서 join·relation 로드로 해결. Service에서 루프 조회하지 않는다 |
| 조회 전용 화면(대시보드 등) | 그래도 Controller → Service → Repository를 지킨다. Service가 얇아지는 것은 문제가 아니다 |

## 4. Module Structure

### 4.1 모듈 분리 기준

**모듈은 Entity를 기준으로 나눈다.** 화면이나 API 그룹이 아니라 데이터 소유권 단위로 나눈다.

```
user / content / library / playback / subscription / interest / partner ...
```

각 모듈은 자기 Entity의 **소유자**다. 해당 Entity를 쓰고 지우는 코드는 그 모듈 안에만 존재한다. 다른 모듈이 그 데이터를 바꿔야 하면 소유 모듈의 Service를 호출한다.

### 4.2 디렉터리 구조

```
src/
├── main.ts
├── app.module.ts                 # 최상위 조립만
├── config/                       # 환경 변수 스키마·설정
├── common/                       # 도메인 지식이 없는 횡단 코드
│   ├── filters/
│   ├── interceptors/
│   ├── middlewares/              # 라우팅 이전 단계(trace_id 발급 등)
│   ├── guards/
│   ├── decorators/
│   ├── exceptions/
│   └── utils/
├── database/
│   ├── data-source.ts
│   └── migrations/
└── modules/
    ├── user/
    │   ├── user.module.ts
    │   ├── user.controller.ts
    │   ├── user.service.ts
    │   ├── user.repository.ts
    │   ├── user.entity.ts         # Entity가 2개 이상이면 entities/ 로 분리
    │   ├── dto/
    │   └── ...
    ├── auth/
    └── content/
```

- `common/`에는 **도메인 지식이 들어가지 않는다.** 도메인을 아는 공용 코드는 별도 모듈로 만든다.
- `middlewares/`에는 **Guard보다 먼저 실행되어야 하는 것만** 둔다. Nest의 실행 순서는 미들웨어 → Guard → 인터셉터이므로, Guard에서 발생한 예외도 갖고 있어야 하는 값(`trace_id`)은 인터셉터에 둘 수 없다. 그 외 요청 단위 횡단 처리는 인터셉터를 기본으로 한다.
- 모듈 내부 파일 구성 규칙·네이밍은 convention.md를 따른다.

### 4.3 모듈 간 의존 규칙 (DI)

**의존은 단방향이며, 순환은 금지한다.**

```
✅  Auth  ──▶  User
❌  User  ──▶  Auth
```

- 기준: **더 구체적·상위 유스케이스를 가진 모듈이 더 일반적·기반이 되는 모듈에 의존한다.** User는 Auth를 몰라도 성립해야 하고, Auth는 User 없이 성립하지 않는다.
- `forwardRef()`로 순환 참조를 푸는 것을 **금지한다.** 순환이 생겼다면 모듈 경계가 잘못된 것이므로, 공통 부분을 하위 모듈로 추출하거나 의존 방향을 재설계한다.
- 모듈은 다른 모듈의 **Service만** 주입받는다. 다른 모듈의 Repository·Entity Repository를 주입받지 않는다.
- 외부에 공개할 Provider는 `exports`에 명시한다. exports에 없는 것은 내부 구현으로 간주한다.

### 4.4 AppModule의 역할

`AppModule`은 **최상위 조립 역할만** 한다.

- 허용: Feature Module import, 전역 설정 모듈(Config, TypeORM, Logger 등) 등록, 전역 Filter/Pipe/Interceptor 바인딩.
- 금지: Controller·Service 보유, 비즈니스 Provider 선언.
- **Feature Module은 필요한 모듈만 직접 import 한다.** AppModule에 있으니 알아서 주입될 것이라 가정하지 않는다(전역 모듈로 선언한 것 제외).

### 4.5 의존 방향 기록

모듈이 늘어나면 아래 표를 갱신한다. 표에 없는 의존이 코드에 생기면 리뷰에서 반려한다.

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| Auth | User, Idempotency | 로그인·토큰 발급 시 사용자 조회·생성 |
| User | Subscription, Idempotency | 탈퇴 시 결제 이력 판정 — **한시적 방향**, 아래 참고 |
| Interest | *(없음)* | `topics` · `user_interests` 소유. 다른 모듈을 모른다 |
| Content | Interest | `content_topics`가 `topics`를 참조한다 |
| Library | Content, User | |
| Playback | Content, Library, Subscription, **User**, **Drip**, **Idempotency** | `domain.md` 2장의 세 방향 + 재생 한도 판정에 `users.tier`가 필요해 User를, 재생 시 드립 영구 제외 적재(`drip_excluded_contents`)에 Drip을, `replay`·원문 클릭의 멱등키(`player-api.md` 4.4·4.5 — 신호 테이블에 유니크 제약이 없어 재전송 중복을 DB가 못 막는다)에 Idempotency를 더한다. 세 모듈 모두 `Playback`을 모르므로 순환은 없다 |
| Subscription | *(없음)* | `plans` · `subscriptions` 소유. 다른 모듈을 모른다 |
| Drip | Content, Library, Interest, Subscription, **User** | `domain.md` 2장의 네 방향 + 편성 편수 판정에 `users.tier`가 필요해 User를 더한다. `User`는 `Drip`을 모르므로 순환은 없다 |
| DripBatch | User, Interest, Subscription, Content, Library, Playback, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| Onboarding | User, Interest, Content, Library, Drip, Idempotency | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| LibraryScreen | Library, Playback, Content, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| Explore | Content, Library, Playback, Interest, Drip | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| ContentDetail | Content, Library, Playback | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| Profile | User, Subscription, Interest, Library, Playback, Content | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| Settings | User, Subscription, Interest | **Entity를 소유하지 않는 유스케이스 모듈**, 아래 참고 |
| *(도메인 확정 시 계속 추가)* | | |

**DripBatch도 Entity를 갖지 않는다** (신설 2026-08-27 — 일일 편성 배치, `drip-scheduling.md` 2·4). 3.3이 "드립 편성 배치"를 Orchestrator 대상으로 명시한 자리다. 스코어링 입력인 소비 신호(`user_signals`)의 소유자가 `playback`인데 **`playback → drip` 의존이 이미 있어**(재생 시 영구 제외 적재) `drip`이 신호를 읽으면 순환이 된다(`forwardRef` 금지 — 4.3). 그래서 두 모듈 **위에서** Orchestrator가 조합한다. 도메인 판정(스코어링·신호 집계·적립 원자성)은 전부 `drip` 모듈의 Service(`DripScoringService` · `PreferenceVectorService` · `DripPlacementService`)에 있고, Orchestrator는 순서·조합·사용자 단위 실패 격리만 담당한다. 트리거는 05:00 KST 크론(`DripBatchScheduler`)이며 중복 실행은 `drip_batch_runs.run_date` 유니크 선점으로 막는다. 어떤 모듈도 이 모듈을 의존하지 않는다.

**Onboarding은 Entity를 갖지 않는다.** 온보딩은 화면 흐름이라 자기 데이터가 없고 `users` · `user_interests` · `contents` · `library_items` · `first_drip_jobs`를 횡단한다. 4.1의 "모듈은 Entity 기준으로 나눈다"의 예외이며, Repository 없이 **Orchestrator가 각 소유 모듈의 Service를 조합한다**(→ 3.3). 도메인 규칙 판정(주제 개수 상한, 발행 상태, 완료 여부)은 전부 소유 모듈의 Service에 있고 Orchestrator는 순서·조합만 담당한다.

- 경로를 `/onboarding` 아래에 모으는 이유는 온보딩의 저장이 **단계 전이(`onboarding_step`)를 동반하기** 때문이다. 같은 데이터를 다루는 `interest-management` · `profile`의 엔드포인트에 이 부수 효과를 붙이면, 온보딩을 끝낸 사용자가 관심사를 고칠 때마다 재개 지점이 함께 움직인다(`onboarding-api.md` 3장).

**LibraryScreen도 Entity를 갖지 않는다.** 라이브러리 화면의 응답에는 재생 위치·오늘 카운트(`playback` 소유)와 재생 한도(`subscription` 소유)가 함께 나가고, 삭제는 드립 영구 제외(`drip` 소유)까지 건드린다. 그런데 `library-api.md` 8장이 **`playback` → `library`** 방향과 "`library` 모듈은 `content` · `user`에만 의존한다"를 함께 정하고 있어, `library`가 `playback`을 의존하면 순환이 된다(`forwardRef` 금지 — 4.3). 그래서 두 모듈 **위에서** Orchestrator가 조합한다(→ 3.3). `/users/me/library-items`의 6개 엔드포인트가 여기에 속한다.

- **재생 시작(`POST /contents/:content_id/play`)은 LibraryScreen이 아니라 Playback 모듈에 남는다.** `library-api.md` 8장이 지정한 위치이고, 라이브러리·탐색·미니플레이어·푸시가 같은 엔드포인트를 쓰기 때문이다. 화면별 유스케이스 모듈로 올리면 한도 판정이 진입점마다 갈라진다.
- **잔여 재생 표시값은 직접 조립하지 않는다.** 티어 조회(`users.tier`) → 요금제 한도(`plans.daily_play_limit`) → `play_records` 집계까지를 `PlaybackService`의 조립 함수 하나가 수행하고, 탐색 화면도 **같은 함수를 호출한다**(`explore-api.md` 2장 — 화면마다 조립하면 같은 사용자에게 서로 다른 숫자가 표시된다). 그래서 이 모듈은 `subscription` · `user`를 의존하지 않는다. **한도 판정이 필요한 재생 시작은 이 함수를 쓰지 않는다** — 거기서는 최상위 티어 여부까지 있는 정책 자체가 필요하다.

**Explore도 Entity를 갖지 않는다.** 탐색 응답에는 콘텐츠·주제·인기 집계(`content` 소유), 행의 라이브러리 상태와 담기·해제(`library` 소유), 오늘 카운트·잔여 재생 표시값·소비 신호(`playback` 소유), 관심 주제(`interest` 소유)가 함께 나가고, 담기 해제는 드립 영구 제외(`drip` 소유)까지 건드린다. 어느 한 모듈의 Entity로 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `/explore/*`와 담기·해제(`/contents/:content_id/save`)가 여기에 속한다.

- **`content` 모듈에 넣을 수 없다.** 담기·해제가 `library_items`를 쓰고 영구 제외가 `drip_excluded_contents`를 건드리는데, `content` 모듈은 `interest`에만 의존한다(`domain.md` 2장). 거기에 `library` · `drip` · `playback`을 더하면 세 모듈이 이미 갖고 있는 `→ content` 방향과 부딪쳐 순환이 된다.
- **`user` · `subscription`을 직접 의존하지 않는다.** 잔여 재생 표시값은 LibraryScreen과 같은 이유로 `playback`이 조립해 내려준다.
- **재생 시작은 여기에 없다.** 담기·해제와 경로 계층이 같지만(`/contents/:content_id/...`) 재생은 `library-api.md` 8장이 지정한 대로 Playback 모듈에 남는다 — 진입점마다 모듈이 갈리면 한도 판정이 경로별로 새는 구멍이 된다.

**ContentDetail도 Entity를 갖지 않는다.** 상세 한 화면에 콘텐츠 메타·주제·소스 목록(`content` 소유 — `contents` · `content_topics` · `content_sources`), 담김 여부(`library` 소유), 재청취 창 힌트(`playback` 소유)가 함께 나간다. 어느 한 모듈의 Entity로 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `GET /contents/:content_id` 하나가 여기에 속한다.

- **`content` 모듈에 넣을 수 없다.** `library` · `playback`이 이미 `→ content` 방향을 갖고 있어 반대 방향을 더하면 순환이 된다.
- **`user` · `subscription`을 의존하지 않는다.** 상세 응답에는 잔여 재생 표시값이 없다(`content-detail-api.md` 2장 — 상세 화면에 잔여 표시가 없고, [재생] 허용은 재생 시작 시점에 서버가 판정한다).
- **쓰기 경로가 없다.** 상세 화면의 액션([재생]·[담기]/[삭제]·[원문 보기])은 전부 기존 계약의 재사용이라(`content-detail-api.md` 1장) 소유 모듈(playback·explore·library-screen)에 그대로 남는다.

**Profile도 Entity를 갖지 않는다.** 프로필 응답에는 계정·커리어(`user` 소유), 구독 상태·요금제(`subscription` 소유), 관심 주제 요약(`interest` 소유), 완청 고유 콘텐츠 수(`library` 소유), 청취 시간·연속 일수·주간 그래프(`playback` 소유), 주제 분포의 주제 매핑(`content` 소유)이 함께 나간다. `profile.md` 6장이 **전용 테이블을 만들지 않는다**고 정하고 있어 조립할 자기 Entity가 애초에 없다. 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `/users/me/profile`과 `/users/me/profile/weekly-listening`이 여기에 속한다.

- **`user` 모듈에 넣을 수 없다.** 통계가 `library_items` · `play_records` · `content_topics`를 읽는데, `user` 모듈에 그 셋을 더하면 `library → user` · `playback → user`와 부딪쳐 순환이 된다.
- **`user` · `subscription`을 직접 의존한다 — `LibraryScreen` · `Explore`와 다른 점이다.** 저 둘이 두 모듈을 피한 이유는 잔여 재생 표시값을 `PlaybackService`가 조립해 주기 때문인데, **프로필은 그 값을 응답에 싣지 않는다**(`profile-api.md` 4.1에 세 필드가 없다). 프로필이 필요한 것은 계정 정보와 플랜 카드이며, 특히 플랜은 `users.tier` 캐시가 아니라 **`subscriptions`를 기준으로 조립하라**고 계약이 요구한다(`profile-api.md` 3장).
- **캐시를 고치지 않는다.** 조회 시점에 `users.tier`가 `subscriptions`와 어긋나 있어도 응답만 `subscriptions` 기준으로 내려주고, 캐시 갱신은 `SubscriptionService` 한 곳이 한다(`domain.md` 3.1 — 갱신 경로를 한 곳으로 제한).
- **쓰기 경로가 없다.** 프로필에서 직접 서버에 쓰는 값은 하나도 없고(`profile.md` 1장), 각 카드의 편집은 소유 화면의 API가 담당한다 — 같은 데이터를 두 화면이 각자 저장하면 규칙이 갈라진다.

**Settings도 Entity를 갖지 않는다.** 설정 응답에는 계정·설정값·마케팅 동의 상태(`user` 소유 — `users` · `user_settings` · `consents`), 구독 요약(`subscription` 소유), 관심 주제 요약(`interest` 소유)이 함께 나간다. 설정은 대부분 **하위 기능으로 연결하는 허브**라(`settings-api.md` 1장) 이 모듈이 소유하는 것은 화면 조회 · 설정 값 변경 · 마케팅 동의·철회 셋뿐이고, 이메일 인증·로그아웃·탈퇴·구독 변경·관심사 변경은 각 소유 API가 담당한다. 소유 모듈들 **위에서** Orchestrator가 조합한다(→ 3.3). `/users/me/settings`와 `/users/me/consents/marketing`이 여기에 속한다.

- **`user_settings`를 이 모듈이 소유하지 않는다.** 설정 화면이 그 테이블의 주 사용처이지만 **소유는 화면이 아니라 데이터 기준으로 나눈다**(→ 4.1) — `domain.md` 2장이 `user` 모듈로 지정하고 있고 Entity·Repository·Service가 전부 거기에 있다. 화면 기준으로 갈랐다면 어긋났을 근거가 둘이다: `default_playback_rate`는 **플레이어도 읽고**(`player.md` 4.2 — 사용자 전역 배속) 설정 모듈이 소유하면 플레이어가 화면 모듈에 의존하게 되며, `sleep_timer_last_choice`는 **이 화면이 아예 다루지 않는다**(`settings-api.md` 8장).
- **`plan` · `interest_summary`는 소유 모듈의 조립 함수를 호출한다.** `settings-api.md` 4.1이 `profile-api.md` 4.1과 **같은 모양·같은 조립 함수**를 쓰라고 요구하므로 `SubscriptionService` · `UserInterestService`가 조립하고 두 화면이 그것을 부른다 — 화면마다 조립하면 같은 사용자에게 다른 구독 표시·다른 주제 개수가 나간다(`LibraryScreen`의 잔여 재생 표시값과 같은 논리).
- **`playback`을 의존하지 않는다.** 설정 응답에는 잔여 재생 표시값이 없다 — 필요한 것은 구독 요약뿐이다.
- **마케팅 동의를 설정 값 변경에 싣지 않는다.** 설정 값은 절대값 UPDATE인데 동의는 `consents`에 **행을 추가한다**(`domain.md` 3.2 — append-only). 저장 구조가 달라 실패·재전송 성질이 다르므로 엔드포인트를 나눈다.

**`User → Subscription`은 한시적이다.** `domain.md` 2장이 `Subscription → User`(결제 반영 시 `users.tier` 갱신)를 함께 정의하고 있어, 두 방향이 동시에 성립하면 순환이 된다. Subscription 모듈이 티어 갱신을 시작하는 시점에 **탈퇴를 Orchestrator로 올려**(→ 3.3) 두 Service를 위에서 조합하고 이 의존을 제거한다.

**Idempotency 모듈**은 도메인이 없는 플랫폼 모듈이다(`idempotency_keys` 소유 — 8.4). Entity를 갖기 때문에 `common/`이 아니라 모듈로 둔다.

## 5. Domain Responsibility

> **작성 예정.** 도메인이 확정되는 대로 각 도메인이 "담당하는 것"과 "담당하지 않는 것"을 아래 형식으로 채운다. 경계가 애매해서 생기는 로직 중복·책임 누수를 막는 것이 목적이다.

작성 형식:

| 도메인 | 담당한다 | 담당하지 않는다 | 소유 Entity |
|---|---|---|---|
| *(예시)* User | 계정 정보, 탈퇴 처리 | 인증 토큰 발급, 구독 상태 판정 | User, UserProfile |

## 6. Database Architecture

> **스키마는 [`domain.md`](domain.md)가 유일한 기준이다.** 테이블·컬럼·인덱스·제약 정의는 그 문서에만 두고, 이 장에는 중복해서 적지 않는다. **Entity 코드는 domain.md의 정의를 따른다**(convention.md 4.1).
>
> 스키마를 바꿔야 하면 domain.md를 먼저 고친 뒤 Entity·마이그레이션을 작성한다. 코드에만 존재하는 컬럼을 만들지 않는다.

domain.md와 별개로 아래 전제는 이 장에서 고정한다.

- 스키마 변경은 **반드시 마이그레이션 파일**로 관리한다. `synchronize: true`는 어떤 환경에서도 사용하지 않는다.
- 정합성이 중요한 규칙은 애플리케이션 검증에만 맡기지 않고 **DB 제약(unique·FK·not null·check)으로 이중 방어**한다 (→ 8.4).
- 삭제 정책(hard delete / soft delete)은 도메인별로 이 장에 명시한다. 기본은 hard delete이며, 회원 탈퇴·파트너 회수처럼 이력이 필요한 경우만 soft delete를 쓴다.

## 7. Error Handling Architecture

클라이언트가 기대하는 에러 응답 규격과 재시도 정책은 `docs/features/common-error-handling.md`에 이미 정의되어 있다. **이 장은 그 규격을 서버가 어떻게 만들어 내는지**를 정의한다. 두 문서가 충돌하면 클라이언트 계약(에러 코드·응답 필드)은 `common-error-handling.md`가 기준이다.

### 7.1 원칙

1. **에러는 계층을 타고 올라가고, 변환은 한 곳에서만 한다.** Controller는 try/catch 하지 않는다. 전역 Exception Filter가 HTTP 응답으로 변환한다.
2. **도메인 예외와 시스템 예외를 구분한다.** 도메인 규칙 위반은 4xx이며 예상된 흐름이다. 그 외는 5xx이며 버그이거나 장애다.
3. **클라이언트가 분기해야 하는 상황은 반드시 `error_code`로 구분한다.** HTTP status만으로 판단하게 만들지 않는다.
4. **외부 시스템의 예외를 그대로 노출하지 않는다.** AI 서버·스토어·TTS의 에러는 경계에서 도메인 예외로 변환한다.

### 7.2 예외 계층

```
Error
└── HttpException (Nest)
    └── BusinessException              # 우리가 던지는 모든 도메인 예외의 부모
        ├── BusinessNotFoundException  # 예: CONTENT_NOT_FOUND
        ├── BusinessForbiddenException # 예: PLAY_LIMIT_EXCEEDED, CONTENT_WITHDRAWN
        ├── BusinessConflictException  # 예: DUPLICATE_REQUEST
        └── ExternalServiceException   # AI 서버·스토어 연동 실패
```

**`Business` 접두사를 붙이는 이유** — `NotFoundException` / `ForbiddenException` / `ConflictException`은 `@nestjs/common`에 같은 이름이 이미 있다. 접두사가 없으면 자동 import로 Nest 것이 섞여 들어오고, 그 예외는 `errorCode`를 갖지 않으므로 클라이언트가 기대한 `error_code` 대신 상태 코드 기본값이 내려간다. 이름이 겹치지 않는 `ExternalServiceException`은 접두사를 붙이지 않는다.

`BusinessException`은 다음을 갖는다.

```ts
class BusinessException extends HttpException {
  readonly errorCode: ErrorCode;   // 클라이언트 분기용 문자열 코드
  readonly retryable: boolean;     // 클라이언트 자동 재시도 허용 여부
  readonly retryAfterSec?: number; // 429·점검 등에서 사용
  readonly logLevel: 'info' | 'warn' | 'error';
}
```

### 7.3 계층별 에러 규칙

| 계층 | 규칙 |
|---|---|
| **Repository** | 예외를 만들지 않는다. 없으면 `null`(또는 빈 배열)을 반환한다. DB 드라이버 예외는 그대로 위로 던진다 |
| **Service** | 도메인 판정 결과로 `BusinessException`을 던진다. "없으면 404"의 판정도 여기서 한다 |
| **Orchestrator** | 부분 실패 시 상태 전이·재시도 여부를 결정한다. 재시도 불가일 때만 예외를 위로 던진다 |
| **외부 클라이언트(AiClient 등)** | 타임아웃·비정상 응답을 `ExternalServiceException`으로 변환한다. 원본 에러는 로그에만 남긴다 |
| **Controller** | try/catch 하지 않는다 |
| **Exception Filter** | 모든 예외를 아래 응답 규격으로 변환하고, 레벨에 맞게 로깅한다 |

### 7.4 에러 응답 규격

`common-error-handling.md` 6장의 `ApiError`를 그대로 따르며, 운영 추적을 위해 `trace_id`를 추가한다.

```json
{
  "error_code": "PLAY_LIMIT_EXCEEDED",
  "message": "오늘 들을 수 있는 콘텐츠를 모두 들었어요",
  "retryable": false,
  "retry_after_sec": null,
  "trace_id": "01H8X...."
}
```

- `message`는 **사용자 노출용**이다. 내부 사유·스택·테이블명·쿼리를 절대 담지 않는다.
- 예상하지 못한 5xx는 `error_code: "INTERNAL_ERROR"`, `message: "일시적인 오류가 발생했어요"`로 고정한다. 내부 정보 유출 방지.
- `trace_id`는 요청 단위로 생성해 응답 헤더(`X-Trace-Id`)와 모든 로그에 함께 남긴다. 클라이언트는 문의 대응용으로 화면에 작게 노출할 수 있다.

**규격 밖 추가 필드** — 클라이언트가 화면을 그리는 데 값이 더 필요한 에러에 한해, 위 5개 필드 옆에 **평면(flat)으로 추가 필드를 실을 수 있다.**

```json
{ "error_code": "EMAIL_VERIFICATION_CODE_MISMATCH", "...": "...", "attempts_remaining": 4 }
```

- **API 명세서가 요구하는 경우에만** 추가한다(예: `auth-api.md` 4.10의 `attempts_remaining` — 남은 시도 횟수를 못 내리면 클라이언트가 "남은 N회"를 표시할 수 없다).
- 위 5개 필드는 **모든 에러에 항상 존재한다.** 추가 필드는 해당 `error_code`에서만 나타나므로, 클라이언트는 `error_code`로 분기한 뒤에만 읽는다.
- 추가 필드에 **내부 사유·식별자·개인정보를 담지 않는다.** 판정 결과 숫자·시각 정도로 제한한다.
- 새 필드를 만들 때는 그 API 명세서에 함께 적는다. 공통 규격(위 5개)에는 추가하지 않는다.

### 7.5 ErrorCode 관리

- 모든 코드는 **enum 한 곳**에서 관리한다. 문자열 리터럴을 직접 던지지 않는다.
- 네이밍: `대상_사유` 형태의 SCREAMING_SNAKE_CASE. (`CONTENT_WITHDRAWN`, `SUBSCRIPTION_EXPIRED`)
- **클라이언트가 다르게 동작해야 할 때만 새 코드를 만든다.** 서버 내부 사유 구분은 로그로 남기고 코드를 늘리지 않는다.
- 코드를 추가·변경하면 **enum → `common-error-handling.md` 9장 표 → 해당 `spec/api/*-api.md` 5장** 순서로 갱신한다. **9장 표가 원본이고 api 문서 5장은 화면분 발췌다.** 이미 배포된 코드의 의미를 바꾸는 것은 금지하며, 새 코드를 추가한다.

### 7.6 로깅

| 상황 | 레벨 | 내용 |
|---|---|---|
| 정상 도메인 분기(페이월·한도 초과 등) | `info` | 스택 없음 |
| 잘못된 요청·권한 없음(4xx) | `warn` | 요청 경로·error_code·user_id |
| 서버 오류(5xx)·미처리 예외 | `error` | 스택 포함 |
| 외부 연동 실패 | `error` | 대상 시스템·응답 코드·재시도 횟수 |

- 로그에는 **토큰·비밀번호·소셜 액세스 토큰·영수증 본문·개인식별정보를 남기지 않는다.** 마스킹은 로깅 인터셉터에서 일괄 처리한다.
- 모든 요청 로그에는 `trace_id`, `user_id`(있으면), 처리 시간을 포함한다.

### 7.7 재시도·타임아웃 (서버 → 외부)

| 대상 | 타임아웃 | 재시도 |
|---|---|---|
| AI 서버(동기 요청) | 짧게(초 단위) + 비동기 작업으로 전환 권장 | 지수 백오프, 최대 2회 |
| 스토어 영수증 검증 | 10초 | 재시도. 단 멱등하게 (→ 8.4) |
| Object Storage | 5초 | 3회 |

- **재시도는 멱등한 요청에만 적용한다.** 비멱등 요청은 멱등키를 붙이기 전까지 재시도하지 않는다.
- 반복 실패하는 외부 연동은 회로 차단(연속 실패 시 일정 시간 호출 중단)을 적용해 장애 전파를 막는다. *(도입 시점 미결)*

## 8. Transaction / Consistency Rule

### 8.1 트랜잭션 경계는 Service(또는 Orchestrator)가 소유한다

- Controller와 Repository는 트랜잭션을 시작하지 않는다.
- **1 유스케이스 = 1 트랜잭션**을 기본으로 한다. 하나의 요청에서 여러 트랜잭션을 여는 것은 각 트랜잭션이 독립적으로 의미 있을 때만 허용한다.
- Orchestrator는 **전체를 하나의 트랜잭션으로 묶지 않는다.** 단계별로 짧은 트랜잭션을 쓰고, 단계 간 정합성은 상태 머신 + 재시도로 보장한다 (→ 8.5).

### 8.2 구현 방식

```ts
// Service
async withdraw(userId: string) {
  return this.dataSource.transaction(async (manager) => {
    const user = await this.userRepository.findByIdForUpdate(userId, manager);
    ...
    await this.userRepository.softDelete(user, manager);
    await this.libraryService.purgeByUser(userId, manager);
  });
}
```

- Repository 메서드는 선택적 `EntityManager`(또는 트랜잭션 컨텍스트)를 마지막 인자로 받는다. 전달되면 그것을, 아니면 기본 매니저를 쓴다.
- 트랜잭션 컨텍스트를 전역 상태로 숨기는 방식(AsyncLocalStorage 기반 `@Transactional`)의 도입 여부는 미결 사항이다. 도입 전까지는 **명시적 전달**을 규칙으로 한다.

### 8.3 트랜잭션 안에서 금지하는 것

트랜잭션이 길어지면 커넥션 고갈과 락 경합으로 전체 장애가 된다. 다음은 **트랜잭션 밖**에서 수행한다.

- 외부 HTTP 호출 (AI 서버, TTS, 스토어 영수증 검증, 소셜 로그인 검증)
- 오디오·파일 업로드·다운로드
- 푸시 발송, 이메일 발송
- 무거운 CPU 작업, 대량 루프

**커밋 이후에 발행한다.** 푸시·이벤트·외부 통지는 트랜잭션 커밋이 확정된 뒤에 실행한다. 커밋 전에 보내면 롤백 시 "취소된 일에 대한 알림"이 나간다.

### 8.4 동시성·중복 방어

애플리케이션 검증만으로는 동시 요청을 막을 수 없다. **판정은 애플리케이션, 최종 방어는 DB 제약**으로 이중화한다.

| 상황 | 방어 수단 |
|---|---|
| 동일 콘텐츠 중복 적립 (FR-16) | `(user_id, content_id)` unique 제약 + 위반 시 정상 흐름으로 흡수 |
| 무료 하루 2편 재생 카운트 | 원자적 증가(`UPDATE ... SET count = count + 1 WHERE count < limit`)로 판정과 증가를 한 문장에 |
| 결제·영수증 중복 검증 | 영수증 고유값 unique 제약 + 멱등 처리 |
| 클라이언트 재시도로 인한 중복 생성 | `Idempotency-Key` 헤더 저장 테이블(키 unique). 같은 키 재요청은 **저장된 첫 응답을 그대로 반환** |
| 구독 상태 동시 변경 | 낙관적 락(`@VersionColumn`) 또는 행 잠금(`SELECT ... FOR UPDATE`) |

- **유니크 위반 예외를 도메인 흐름으로 흡수할 수 있는 경우 예외로 만들지 않는다.** 예: 중복 적립은 "이미 있음"으로 처리하고 200을 반환한다.
- 비관적 락은 짧게, 순서를 정해 건다(락 순서 불일치 = 데드락).

### 8.5 최종 일관성 — 파이프라인·배치

콘텐츠 파이프라인·드립 편성처럼 여러 단계가 시간에 걸쳐 진행되는 작업은 **강한 일관성을 포기하고 상태 머신으로 관리한다.**

- 각 작업은 상태 컬럼을 갖는 행으로 표현한다. (`PENDING → RUNNING → SUCCEEDED / FAILED`)
- 상태 전이는 원자적으로 수행하고, 어떤 시점에 프로세스가 죽어도 **재시작 시 안전하게 이어갈 수 있어야 한다.**
- 모든 단계는 **멱등**해야 한다. 같은 입력으로 두 번 실행해도 결과가 같아야 한다.
- 실패는 재시도 횟수와 마지막 실패 사유를 기록한다. 한도 초과 시 자동 진행을 멈추고 운영 검토 대상으로 남긴다(파이프라인 QA 재생성 한도 3회 — `content-pipeline.md`).
- DB 커밋과 외부 시스템 호출을 원자적으로 묶을 수 없다. **DB를 먼저 커밋하고, 외부 호출은 재시도 가능한 작업으로 남긴다.**

### 8.6 격리 수준

- 기본은 PostgreSQL 기본값 `READ COMMITTED`를 사용한다.
- 더 높은 격리 수준이 필요한 지점은 이 문서에 사유와 함께 기록한 뒤 적용한다. 대부분의 경우 격리 수준 상향보다 **적절한 제약·락·원자적 UPDATE**가 옳은 해법이다.

### 8.7 읽기 정합성

- 조회 API는 트랜잭션으로 감싸지 않는 것을 기본으로 한다.
- 단, 여러 테이블을 함께 읽어 한 화면을 구성하고 그 사이 값이 바뀌면 안 되는 경우는 읽기 트랜잭션을 사용한다.

## 9. Security

### 9.1 인증 (Authentication)

- **소셜 로그인(카카오·구글·네이버)만 지원한다.** 자체 비밀번호를 저장하지 않는다.
- 클라이언트가 받은 소셜 토큰은 **반드시 서버가 제공자 API로 검증**한다. 클라이언트가 보낸 프로필 정보(이메일·이름·소셜 ID)를 그대로 신뢰하지 않는다.
- 검증 성공 시 서버가 자체 **JWT access token + refresh token**을 발급한다. 소셜 토큰은 저장하지 않거나, 필요한 경우에만 암호화해 보관한다.

| 토큰 | 수명(잠정) | 저장 |
|---|---|---|
| access token | 30분 | 저장하지 않음(stateless 검증) |
| refresh token | 30일 | **해시**해서 DB 저장. 원문 저장 금지 |

- **refresh token은 사용 시 회전(rotation)한다.** 이전 토큰은 즉시 무효화하고, 이미 쓰인 토큰이 재사용되면 해당 사용자의 세션 전체를 무효화한다(탈취 감지).
- 로그아웃·회원 탈퇴 시 저장된 refresh token을 삭제한다.
- 401 응답은 `common-error-handling.md` 4.1의 자동 갱신 흐름과 맞물린다. 갱신 실패는 재갱신 여지 없이 명확히 실패시킨다(무한 루프 방지).

### 9.2 인가 (Authorization)

- 인가는 **Guard에서 판정한다.** Controller 본문에서 `if (user.role === ...)`를 쓰지 않는다.
- 역할: `USER` / `PARTNER` / `ADMIN`. 파트너 콘솔·운영 API는 별도 경로와 Guard로 분리한다.
- **리소스 소유권 검증은 Service에서 한다.** "이 라이브러리 항목이 이 사용자의 것인가"는 Guard가 아니라 도메인 판정이다.
- **모든 조회는 요청자 기준으로 스코프한다.** `userId`를 클라이언트가 보낸 값으로 받지 않고, 토큰에서 꺼낸 값을 쓴다. (IDOR 방지)
- 티어 기반 기능 접근(드립·오프라인 저장 등)은 Service에서 구독 상태를 조회해 판정한다. 클라이언트가 보낸 tier 값을 신뢰하지 않는다.

### 9.3 입력 검증

- 전역 `ValidationPipe`에 `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`를 적용한다. **DTO에 선언되지 않은 필드는 잘라낸다.**
- 모든 요청 바디·쿼리·파라미터는 DTO + class-validator로 검증한다. `any`로 받지 않는다.
- Entity를 요청 DTO로 쓰지 않는다. Entity를 응답으로 그대로 반환하지 않는다(내부 필드 유출 방지, → convention.md).
- TypeORM 파라미터 바인딩을 사용한다. 문자열 연결로 쿼리를 만들지 않는다.
- 목록 조회는 **페이지네이션 상한을 강제한다.** `limit`을 클라이언트가 무제한으로 지정할 수 없게 한다.

### 9.4 콘텐츠 보호 (파트너 계약 사항)

PRD FR-33 / 비기능 "저작권·파트너 계약 준수"에 직접 대응한다. **이 절의 규칙은 협상 대상이 아니다.**

- 오디오 파일은 **공개 URL로 노출하지 않는다.** 재생 시마다 Backend가 **단기 서명 URL**(수 분 단위 만료)을 발급한다.
- 서명 URL 발급 시점에 **접근 권한을 재검증한다**: 구독 상태, 재생 한도, 콘텐츠 회수 여부.
- **파트너 회수는 발급 경로에서 즉시 차단된다.** 이미 발급된 URL은 만료 시간까지만 유효하며, 이것이 회수 반영 지연의 상한이다(오프라인 저장분은 별도 — `offline-download.md`의 라이선스 상한 30일).
- 대본 텍스트도 동일한 접근 통제를 받는다. 오디오만 막고 텍스트를 열어두지 않는다.
- 대량 다운로드 패턴(짧은 시간 내 다수 콘텐츠 URL 요청)은 레이트 리밋 + 이상 탐지 대상으로 둔다.
- **스트리밍 라우트는 JWT Guard를 쓰지 않는다**(기록 2026-08-11). 네이티브 재생기는 URL만 받아 요청하므로 인증 헤더를 붙일 수 없다 — 서명(HMAC, `contentId:userId:expires` 전체를 덮음)이 인증이며, 값 하나만 바꿔도 검증이 깨져 IDOR가 성립하지 않는다. 이것이 convention.md 3.3 금지 규칙(쿼리로 `userId` 수신)의 유일한 예외다. **오브젝트 스토리지·CDN 전환 시 이 라우트와 예외가 함께 사라진다** — 그때 두 문서의 예외 문구도 걷어낸다.

### 9.5 통신·비밀 관리

- 모든 외부 통신은 HTTPS. 내부 서비스 간 통신도 신뢰 경계를 넘으면 TLS를 사용한다.
- **AI Server와의 통신은 내부 인증을 거친다.** 콜백 엔드포인트도 인증 없이 열어두지 않으며, 서명 검증 또는 서비스 토큰을 요구한다. AI Server를 "내부라서 안전"하다고 가정하지 않는다.
- 모든 비밀값(DB 비밀번호, JWT 서명 키, 소셜 앱 시크릿, 스토어 검증 키, AI 서버 토큰)은 **환경 변수**로 주입한다. 코드·저장소에 커밋하지 않는다.
- 환경 변수는 부팅 시 스키마 검증한다. 누락되면 **기동을 실패시킨다.** 기본값으로 조용히 넘어가지 않는다.
- CORS는 허용 오리진을 명시한다. `*`를 쓰지 않는다.
- 보안 헤더(helmet 등)를 전역 적용한다.

### 9.6 레이트 리밋 / 남용 방지

| 대상 | 정책(잠정) |
|---|---|
| 인증 요청(로그인·토큰 갱신) | IP·계정 단위 제한 |
| 일반 API | 사용자 단위 제한 |
| 콘텐츠 서명 URL 발급 | 사용자 단위 제한 + 이상 패턴 탐지 |
| 결제 검증 | 멱등키 필수, 중복 요청은 첫 결과 반환 |

- 제한 초과는 `429` + `retry_after_sec`으로 응답한다. 클라이언트는 이 값만큼 대기 후 재시도한다.

### 9.7 개인정보

- 수집 항목을 최소화한다. 소셜 프로필에서 서비스에 필요한 값만 저장한다.
- **회원 탈퇴 시** 라이브러리·관심사·커리어 정보 등 식별 가능한 데이터를 삭제한다(FR-02). 통계·정산 목적으로 남겨야 하는 재생 로그는 **비식별화 후** 보존하며, 보존 범위·기간은 법무 검토로 확정한다(미결).
- 개인정보는 로그·에러 메시지·외부 전송 페이로드에 포함하지 않는다. **AI Server로 사용자 개인정보를 보내지 않는다** — 콘텐츠 파이프라인은 사용자 단위 개인화를 하지 않으므로(PRD 2.2) 개인정보를 전달할 이유가 없다.
- DB 백업·덤프에도 동일한 접근 통제를 적용한다.

## 미결 사항

- 트랜잭션 컨텍스트 전달 방식: 명시적 `EntityManager` 전달 vs AsyncLocalStorage 기반 데코레이터 도입
- ~~비동기 작업 처리 방식: DB 기반 작업 테이블 + 스케줄러 vs 메시지 큐(BullMQ 등) 도입 여부와 시점~~ → **DB 기반 작업 테이블 + 스케줄러로 확정한다**(아래 참고). 메시지 큐 도입은 이 방식이 감당하지 못하는 부하가 확인된 뒤에 다시 논의한다
- AI Server 연동 방식 확정: 동기 요청 / 비동기 콜백 / 폴링 중 어느 조합인지
- 서명 URL 만료 시간 확정(회수 반영 지연 상한과 직결 — 파트너 계약 명시 대상)
- 레이트 리밋 구체 수치, 회로 차단 도입 시점
- 탈퇴 시 재생 로그 비식별 보존 범위·기간 (PRD FR-02 "조사 필요", 법무 검토)
- 5장 Domain Responsibility — 도메인별 책임 경계 작성 (스키마는 `domain.md`가 기준이므로 6장은 원칙만 유지한다)

**비동기 작업 처리 — DB 작업 테이블 + 스케줄러**

`onboarding.md` 4가 요구하는 "서버의 비동기 재시도 큐"를 구현하면서 확정했다. 요청이 끝난 뒤에도 남아 있는 작업(온보딩 첫 드립 편성)은 **상태 컬럼을 가진 행으로 표현하고, 주기적으로 도는 스케줄러가 미처리 행을 집어 간다**(→ 8.5 최종 일관성).

- 상태 테이블은 도메인이 소유한다. 첫 드립은 `first_drip_jobs`(`domain.md` 7.4)이며, 이 테이블의 `(status, last_attempted_at)` 인덱스가 폴러의 조회 경로다.
- **선점은 원자적으로 한다** — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`. 서버가 여러 인스턴스로 떠도 한 인스턴스만 가져간다. 선점과 동시에 시도 횟수를 올려 두 번 세지 않는다.
- 재시도 횟수 상한을 두고, 소진하면 자동 진행을 멈추고 운영 알림 대상으로 남긴다(무한 재시도는 장애를 늘린다).
- Redis·BullMQ를 들이지 않는 이유: 대상이 방금 가입한 사용자 1명 단위의 작업이고 대기 구간이 십수 초다. 인프라를 하나 더 늘려 얻을 것보다 운영·장애 지점이 늘어나는 비용이 크다.
