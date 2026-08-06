# Backend Convention

> 이 문서는 '이어' 백엔드의 **코드 작성 규칙 문서**다. 시스템 구조·계층 책임·트랜잭션·보안 정책은 [architecture.md](architecture.md)에서 다룬다.
>
> 연결 문서: `architecture.md`, `docs/backend/domain.md`(스키마의 유일한 기준), `docs/features/common-error-handling.md`
>
> **문서 운용 원칙**
> - 이 문서와 다른 코드는 리뷰에서 반려한다. 규칙이 틀렸다면 코드가 아니라 문서를 먼저 고친다.
> - "취향 차이로 논쟁이 생기는 지점"을 없애는 것이 목적이다. 규칙에 없어서 매번 다르게 쓰고 있는 게 발견되면 여기에 추가한다.
> - 규칙 간 충돌 시 우선순위: **클라이언트 계약(`docs/features/*`) > architecture.md > convention.md**.

## 1. Naming Convention

### 1.1 Class

**PascalCase**, 역할을 접미사로 붙인다.

| 종류 | 형식 | 예시 |
|---|---|---|
| Controller | `<도메인>Controller` | `UserController`, `NoteController` |
| Service | `<도메인>Service` | `UserService`, `ContentService` |
| Repository | `<도메인>Repository` | `UserRepository` |
| Orchestrator | `<유스케이스>Orchestrator` | `ContentPipelineOrchestrator` |
| Module | `<도메인>Module` | `UserModule` |
| **Entity** | **접미사 없이 도메인 단수형** | `User`, `Content`, `LibraryItem` |
| DTO | → 3장 | `CreateUserRequestDto` |
| 외부 연동 클라이언트 | `<대상>Client` | `AiServerClient`, `StoreReceiptClient` |
| Guard / Filter / Interceptor / Pipe | `<목적><종류>` | `JwtAuthGuard`, `AllExceptionsFilter` |
| 예외 | `<사유>Exception` | `PlayLimitExceededException` |
| 예외 — Nest와 이름이 겹치는 것 | `Business<사유>Exception` | `BusinessNotFoundException` (→ architecture.md 7.2) |

Entity만 접미사를 붙이지 않는다. Entity는 도메인 개념 그 자체이고, 코드에서 가장 자주 등장하는 타입이기 때문이다. (`UserEntity[]`보다 `User[]`가 읽힌다.)

### 1.2 Function / Method

**camelCase**, **동사로 시작**한다. 조회 동사는 아래 규칙을 지킨다 — 호출부가 null 체크를 해야 하는지 이름만 보고 알 수 있어야 한다.

| 접두사 | 의미 | 반환 |
|---|---|---|
| `find` | 없을 수 있는 조회 | `T \| null`, `T[]` |
| `get` | 반드시 있어야 하는 조회 | `T` — 없으면 예외 |
| `exists` | 존재 여부만 | `boolean` |
| `create` | 새로 만든다 | 생성된 대상 |
| `update` | 기존 것을 바꾼다 | |
| `delete` / `remove` | 지운다 (`delete`=물리, `remove`=논리) | |
| `save` | 생성·수정 통합 저장 (Repository 한정) | |
| `count` | 개수 | `number` |

```ts
findUserById(id: string): Promise<User | null>
getUserById(id: string): Promise<User>          // 없으면 NotFound 예외
existsByEmail(email: string): boolean
createNote(command: CreateNoteCommand): Promise<Note>
```

**계층별 이름 짓는 기준**

| 계층 | 기준 | 예시 |
|---|---|---|
| Controller | 유스케이스 이름 그대로 | `createNote()`, `withdrawUser()` |
| Service | 도메인 행위. HTTP 용어를 쓰지 않는다 | `withdrawUser()` (○) / `handlePostUser()` (×) |
| Repository | 데이터 접근 동작 + 조건 | `findByUserIdAndStatus()`, `saveAll()` |

### 1.3 Variable / Constant / Type

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수·파라미터 | camelCase | `userId`, `playCount` |
| boolean | `is` / `has` / `can` / `should` 접두사 | `isPublished`, `hasSubscription`, `canPlay` |
| 상수 | SCREAMING_SNAKE_CASE | `MAX_DAILY_PLAY_COUNT` |
| enum 이름 | PascalCase 단수 | `ContentStatus`, `SubscriptionTier` |
| enum 멤버 | SCREAMING_SNAKE_CASE | `ContentStatus.PUBLISHED` |
| interface / type | PascalCase. `I` 접두사를 쓰지 않는다 | `PlayPolicy` (○) / `IPlayPolicy` (×) |
| 배열 | 복수형 | `contents`, `userIds` |

**매직 넘버·매직 스트링을 코드에 직접 쓰지 않는다.** 정책 값(하루 2편, 완청 90%, QA 재생성 3회 등)은 이름 있는 상수로 선언하고, 근거가 되는 문서를 주석으로 남긴다.

```ts
/** PRD 4.1 — 무료 티어 하루 재생 상한 */
const FREE_TIER_DAILY_PLAY_LIMIT = 2;
```

### 1.4 File

**kebab-case**, `<이름>.<역할>.ts`.

```
user.controller.ts      library-item.entity.ts
user.service.ts         create-user-request.dto.ts
user.repository.ts      jwt-auth.guard.ts
```

파일 하나에 클래스 하나를 기본으로 한다. 파일명과 클래스명은 대응해야 한다 (`library-item.entity.ts` ↔ `LibraryItem`).

### 1.5 Database

**모두 snake_case.** 상세 스키마는 `domain.md`에서 정의하고, 여기서는 이름 규칙만 고정한다.

| 대상 | 규칙 | 예시 |
|---|---|---|
| 테이블 | **복수형** snake_case | `users`, `contents`, `library_items` |
| 컬럼 | snake_case | `user_id`, `created_at`, `play_count` |
| PK | `id` | |
| FK | `<참조 테이블 단수형>_id` | `user_id`, `content_id` |
| boolean 컬럼 | `is_` / `has_` 접두사 | `is_published` |
| 시각 컬럼 | `_at` 접미사 | `created_at`, `published_at`, `deleted_at` |
| 기간·수치 | 단위를 이름에 포함 | `duration_sec`, `price_krw` |
| enum 컬럼 | 단수 명사 | `status`, `tier` |
| 다대다 조인 테이블 | `<A단수>_<B복수>` | `user_interests` |
| index | `idx_<테이블>_<컬럼들>` | `idx_library_items_user_id` |
| unique | `uq_<테이블>_<컬럼들>` | `uq_library_items_user_id_content_id` |
| FK 제약 | `fk_<테이블>_<참조테이블>` | `fk_library_items_users` |

**약어를 쓰지 않는다.** `usr`, `cnt`, `desc` 대신 `user`, `count`, `description`. 예외는 이미 보편적인 것(`id`, `url`, `api`)뿐이다.

### 1.6 표기 경계 정리

프로젝트 안에 세 가지 표기가 공존하므로, **어디서 변환되는지**를 고정한다.

```
DB (snake_case)  ──Entity 매핑──▶  TypeScript (camelCase)  ──DTO──▶  API JSON (snake_case)
```

- **API JSON은 snake_case**로 통일한다. `docs/features/*`의 데이터 모델·에러 규격(`error_code`, `retry_after_sec`, `daily_play_count`)이 이미 snake_case이므로 클라이언트 계약을 따른다.
- **TypeScript 내부 코드는 camelCase**를 쓴다.
- 변환은 **DTO 경계에서만** 일어난다. 도메인 코드 안에서 snake_case 필드를 다루지 않는다.

## 2. File Structure Convention

### 2.1 모듈 내부 구조

모듈은 Entity 기준으로 나눈다(architecture.md 4.1). 모듈 하나의 기본 형태는 다음과 같다.

```
modules/user/
├── user.module.ts
├── user.controller.ts
├── user.service.ts
├── user.repository.ts
├── user.entity.ts
├── user.service.spec.ts          # 테스트는 대상 옆에 (→ 7장)
└── dto/
    ├── create-user-request.dto.ts
    ├── create-user-response.dto.ts
    └── update-user-request.dto.ts
```

**확장 규칙** — 파일이 늘어나면 다음 순서로만 나눈다. 처음부터 빈 디렉터리를 만들지 않는다.

| 조건 | 조치 |
|---|---|
| **같은 역할의 파일이 2개 이상** | **그 역할의 복수형 디렉터리로 모은다** — `entities/` · `repositories/` · `services/` · `controllers/` |
| Service가 커짐 | 유스케이스 단위로 분리 (`user.service.ts`, `user-withdrawal.service.ts`) |
| enum·상수가 여러 파일에서 쓰임 | `<모듈>/user.constant.ts`, `user.enum.ts` |
| 모듈 밖으로 공개할 타입 | `<모듈>/user.types.ts` — `exports`되는 것만 |

**역할별 디렉터리 규칙 (2개 이상)**

- **기준은 하나다 — 같은 역할이 2개 이상이면 폴더, 1개면 모듈 최상위에 그대로 둔다.** Entity만 예외로 두던 규칙을 Repository·Service·Controller까지 같은 숫자로 통일한다.
- 이유: **파일명 접미사는 역할을 그룹핑하지 못한다.** 정렬이 `archive.repository.ts` → `consent.repository.ts` → `consent.service.ts` 순으로 도메인 명사 기준으로 섞여, "이 모듈의 Repository가 무엇무엇인지"를 한눈에 볼 수 없다.
- **테스트는 대상과 같은 디렉터리에 둔다**(→ 7.1). 대상이 `services/`로 들어가면 spec도 함께 들어간다.
- 모듈 조립 파일(`<모듈>.module.ts`)·`<모듈>.constant.ts`·`.enum.ts`·`.types.ts`·외부 연동 클라이언트는 개수와 무관하게 **모듈 최상위**에 둔다. 역할 디렉터리는 계층(Controller/Service/Repository/Entity)에만 적용한다.

```
modules/user/
├── user.module.ts
├── user.constant.ts  user.enum.ts  user.types.ts
├── mail.client.ts
├── user.controller.ts            # Controller 1개 → 최상위
├── entities/                     # 2개 이상
├── repositories/                 # 2개 이상
├── services/                     # 2개 이상 (+ 각 spec 파일)
└── dto/
```

### 2.2 전체 구조

```
src/
├── main.ts
├── app.module.ts                 # 최상위 조립만 (architecture.md 4.4)
├── config/
├── common/                       # 도메인 지식 없는 횡단 코드
│   ├── filters/  interceptors/  middlewares/  guards/  decorators/  exceptions/  utils/
├── database/
│   ├── data-source.ts
│   └── migrations/
└── modules/
    ├── auth/  user/  content/  ...
```

- `common/`에 도메인 이름이 등장하면 잘못 둔 것이다. 해당 모듈로 옮긴다.
- `utils/`는 순수 함수만 둔다. 상태·DI가 필요하면 Provider로 만든다.
- `middlewares/`는 Guard보다 먼저 실행되어야 하는 것만 둔다(architecture.md 4.2).

### 2.3 Import 규칙

- **모듈 간 import는 그 모듈이 `exports`한 것만** 사용한다. 다른 모듈의 내부 파일을 경로로 직접 import 하지 않는다.
- 절대 경로(`src/` 기준 alias)를 사용한다. `../../../`은 금지한다. 같은 모듈 내부만 상대 경로를 허용한다.
- import 순서: ① Node/외부 패키지 → ② `@nestjs/*` → ③ 프로젝트 절대 경로 → ④ 상대 경로. 그룹 사이에 빈 줄을 둔다.

### 2.4 수정 범위 경계

- **백엔드 코드 작업에서 수정할 수 있는 파일은 `backend/` 안의 파일뿐이다.** 그 밖의 디렉터리(프론트엔드 코드, AI 서버, 공용 설정 등)는 어떤 경우에도 수정하지 않는다.
- `backend/` 밖은 **필요할 때 참조만 한다** — 클라이언트 계약(`docs/features/*`) 확인, 에러 코드 대조, 화면 요구사항 확인 등 읽기 목적에 한한다.
- 참조 결과 다른 파트의 코드·문서에 수정이 필요하다고 판단되면, 직접 고치지 않고 **해당 파트 담당에게 전달**한다(어긋남을 발견한 쪽이 고치는 게 아니라 소유한 쪽이 고친다).

## 3. DTO Convention

### 3.1 네이밍

| 종류 | 형식 | 예시 |
|---|---|---|
| 요청 | `<동작><도메인>RequestDto` | `CreateUserRequestDto`, `UpdateUserRequestDto` |
| 응답 | `<동작><도메인>ResponseDto` | `CreateUserResponseDto`, `UpdateUserResponseDto` |
| 목록 응답 | `<도메인>ListResponseDto` | `ContentListResponseDto` |
| 목록 요청(쿼리) | `<도메인>QueryRequestDto` | `ContentQueryRequestDto` |
| 응답 내부 항목 | `<도메인>ItemDto` | `LibraryItemDto` |

파일명은 kebab-case: `create-user-request.dto.ts`.

### 3.2 원칙

1. **Entity를 요청으로 받지 않고, Entity를 응답으로 반환하지 않는다.** Entity를 그대로 내보내면 내부 컬럼(삭제 플래그, 파트너 원가, 내부 상태)이 그대로 유출된다.
2. **Request DTO와 Response DTO를 공유하지 않는다.** 같은 모양이어도 각각 만든다. 요청과 응답은 서로 다른 속도로 변한다.
3. **DTO는 Controller 경계 전용이다.** Service ↔ Orchestrator 사이에는 DTO 대신 별도 타입(`<동작><도메인>Command`)을 쓴다. Service가 HTTP DTO에 의존하면 재사용·테스트가 막힌다.
4. **DTO에 로직을 넣지 않는다.** 예외는 Response DTO의 정적 팩토리뿐이다.
5. **필드는 API 계약 그대로 snake_case로 선언한다** (→ 1.6).

```ts
// create-user-response.dto.ts
export class CreateUserResponseDto {
  readonly id: string;
  readonly nickname: string;
  readonly created_at: string;   // ISO 8601 문자열

  static from(user: User): CreateUserResponseDto {
    return { id: user.id, nickname: user.nickname, created_at: user.createdAt.toISOString() };
  }
}
```

### 3.3 Validation — class-validator

**모든 Request DTO의 모든 필드에 검증 데코레이터를 붙인다.** 전역 `ValidationPipe`가 `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`로 동작하므로(architecture.md 9.3), **데코레이터가 없는 필드는 요청에서 잘려 나가 `undefined`가 된다.**

```ts
export class CreateNoteRequestDto {
  @IsString()
  @MaxLength(100)
  readonly title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly body?: string;

  @IsEnum(NoteVisibility)
  readonly visibility: NoteVisibility;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  readonly tag_ids: string[];
}
```

**필수 규칙**

| 항목 | 규칙 |
|---|---|
| 문자열 | `@MaxLength` **필수**. 상한 없는 문자열 입력을 허용하지 않는다 |
| 배열 | `@ArrayMaxSize` **필수**, 요소 검증은 `{ each: true }` |
| 선택 필드 | `@IsOptional()` + `?`. 기본값은 DTO가 아니라 Service에서 결정한다 |
| 숫자 | `@Type(() => Number)` + `@Min`/`@Max`. 쿼리 파라미터는 문자열로 오므로 변환 필수 |
| enum | `@IsEnum`. 문자열 리터럴 비교 금지 |
| 페이지네이션 `limit` | `@Max`로 상한 강제 (기본 20 / 최대 50) |
| ID | `@IsUUID()` |
| 날짜 | ISO 8601 문자열로 받고 `@IsISO8601()` |

**검증에 두지 않는 것** — "존재하는 사용자인가", "구독 중인가", "회수된 콘텐츠인가" 같은 판정은 DTO가 아니라 Service의 책임이다. DTO는 **형식**만 본다.

**금지** — `userId`를 요청 바디·쿼리로 받지 않는다. 인증 토큰에서 꺼낸다(architecture.md 9.2, IDOR 방지).

## 4. Entity Convention

### 4.1 작성 절차

**Entity를 새로 만들거나 컬럼을 추가할 때는 반드시 `docs/backend/domain.md`를 먼저 확인하고, 문서에 정의된 테이블·컬럼과 일치시켜 작성한다.**

1. `domain.md`에서 해당 테이블 정의를 찾는다.
2. 정의가 없거나 컬럼이 모자라면 **코드를 먼저 쓰지 않는다.** `domain.md`를 갱신해 팀 합의를 거친 뒤 작성한다.
3. Entity 작성 → 마이그레이션 생성 → 리뷰.

문서에 없는 컬럼을 임의로 추가하는 것을 금지한다. 스키마가 코드에만 존재하기 시작하면 도메인 문서가 즉시 무용지물이 된다.

> **`docs/backend/domain.md`가 스키마의 유일한 기준이다.** 다른 문서(architecture.md 6장, `docs/features/*`의 데이터 모델)와 어긋나면 domain.md를 따른다. 코드·문서 어느 쪽도 domain.md 정의를 앞지르지 않는다.

### 4.2 작성 규칙

```ts
@Entity('library_items')
@Unique('uq_library_items_user_id_content_id', ['userId', 'contentId'])
export class LibraryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: LibraryItemStatus;

  @Column({ name: 'last_played_sec', type: 'int', default: 0 })
  lastPlayedSec: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
```

| 항목 | 규칙 |
|---|---|
| 테이블명 | `@Entity('복수형_snake_case')` — **항상 명시**한다 |
| 컬럼명 | `@Column({ name: 'snake_case' })` — **항상 명시**한다. 전역 NamingStrategy에 맡기지 않는다. 전략이 바뀌면 스키마가 조용히 어긋나고, 문서와 1:1 대조가 불가능해진다 |
| 타입 | `type`을 명시한다. 추론에 맡기지 않는다 |
| PK | `uuid` 기본. 대량 로그성 테이블은 예외적으로 `bigint` 자동 증가 허용 |
| 시각 | **항상 `timestamptz`**. `timestamp`(타임존 없음) 금지. 애플리케이션은 UTC로 다루고 표시만 KST로 한다 |
| 금액 | 정수 원 단위(`int`/`bigint`). `float`·`double` 금지 |
| enum | **DB enum 타입을 쓰지 않고** `varchar` + TypeScript enum으로 관리한다. DB enum은 값 추가 시 마이그레이션 비용이 크다 |
| 공통 컬럼 | `created_at`, `updated_at`은 `BaseEntity` 추상 클래스로 공통화 |
| soft delete | 필요한 테이블만 `@DeleteDateColumn({ name: 'deleted_at' })`. 기본은 hard delete |
| nullable | `nullable: true`를 남발하지 않는다. null이 의미를 갖는 경우만 허용하고 그 의미를 주석으로 남긴다 |

### 4.3 관계

- **`eager: true` 금지.** 필요한 곳에서 Repository가 명시적으로 join 한다.
- **양방향 관계를 기본으로 만들지 않는다.** 반대 방향 탐색이 실제로 필요할 때만 추가한다.
- `cascade`는 소유 관계가 명확한 경우(부모 삭제 시 자식도 반드시 사라짐)에만 허용한다.
- FK 컬럼을 별도 프로퍼티로 함께 선언한다. 관계 객체를 로드하지 않고도 ID를 쓸 수 있어야 한다.

```ts
@Column({ name: 'user_id', type: 'uuid' })
userId: string;

@ManyToOne(() => User)
@JoinColumn({ name: 'user_id' })
user: User;
```

### 4.4 Entity에 넣지 않는 것

- 비즈니스 판정 로직(재생 가능 여부, 티어 판정 등) — Service 책임(architecture.md 3.2).
- Repository·Service 주입.
- API 노출용 직렬화 로직 — Response DTO 책임.

허용되는 것은 자기 필드만으로 끝나는 단순 계산·표현 헬퍼 정도다.

### 4.5 마이그레이션

- `synchronize: true`는 **어떤 환경에서도 사용하지 않는다.**
- 파일명: `<타임스탬프>-<변경내용>.ts` (`1730000000000-AddPlayCountToUsers.ts`)
- 하나의 마이그레이션은 하나의 논리적 변경만 담는다.
- 컬럼 삭제·타입 변경은 배포 순서를 함께 검토한다(구버전 서버가 살아 있는 동안 깨지지 않아야 한다).

## 5. API Convention

### 5.1 URL

- 기본 형태: `/api/v1/<리소스 복수형>`
- 리소스는 **명사 복수형 kebab-case**: `/users`, `/contents`, `/library-items`
- 동사를 URL에 쓰지 않는다: `/getUsers` (×)

| 동작 | 메서드 | 경로 | 성공 코드 |
|---|---|---|---|
| 목록 조회 | GET | `/users` | 200 |
| 단건 조회 | GET | `/users/:id` | 200 |
| 생성 | POST | `/users` | 201 |
| 부분 수정 | PATCH | `/users/:id` | 200 |
| 전체 교체 | PUT | `/users/:id` | 200 |
| 삭제 | DELETE | `/users/:id` | 204 |

**부분 수정은 PATCH를 기본으로 한다.** PUT은 전체 교체가 명확한 경우에만 쓴다.

### 5.2 중첩과 액션

- 중첩은 **한 단계까지만** 허용한다: `/users/:userId/library-items` (○) / `/users/:userId/library-items/:id/comments` (×)
- 내 리소스는 `me`를 쓴다: `/users/me`, `/users/me/library-items`. 경로에 자기 `userId`를 넣게 하지 않는다.
- **리소스 CRUD로 표현되지 않는 상태 전이는 하위 액션으로 허용한다.**

```
POST /contents/:id/play          재생 시작(카운트·권한 판정)
POST /library-items/:id/complete 완청 처리
POST /contents/:id/withdraw      파트너 회수
POST /auth/token/refresh         토큰 갱신
```

액션은 **POST 고정**이며, 동사는 하나만 쓴다(`/contents/:id/play-and-log` 같은 복합 금지).

### 5.3 요청·응답 규격

- 요청·응답 JSON 필드는 **snake_case** (→ 1.6).
- 목록 응답은 배열을 최상위로 두지 않는다. 나중에 메타데이터를 붙일 수 없다.

```json
{
  "items": [ ... ],
  "next_cursor": "eyJpZCI6...",
  "has_next": true
}
```

- 페이지네이션은 **커서 기반을 기본**으로 한다(무한 스크롤 화면이 주력이고, 드립 적립으로 목록 앞쪽이 계속 바뀌므로 offset은 중복·누락을 만든다). 관리·통계 화면은 offset 허용.
- 단건 응답은 래핑하지 않고 객체를 그대로 반환한다. 성공 응답에 `success: true` 같은 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.**
- 에러 응답은 architecture.md 7.4 규격을 따른다.

### 5.4 상태 코드

| 코드 | 사용 |
|---|---|
| 200 | 조회·수정 성공 |
| 201 | 생성 성공 |
| 204 | 삭제 성공, 본문 없음 |
| 400 | 형식·검증 실패 |
| 401 | 인증 없음·만료 |
| 403 | 권한 없음(티어 부족, 회수된 콘텐츠) |
| 404 | 리소스 없음 |
| 409 | 상태 충돌(중복 생성 등) |
| 429 | 레이트 리밋 |
| 500 | 서버 오류 |

**클라이언트가 분기해야 하는 상황은 상태 코드가 아니라 `error_code`로 구분한다**(`common-error-handling.md` 6장). 예: 403이어도 페이월인지 회수인지는 `PLAY_LIMIT_EXCEEDED` / `CONTENT_WITHDRAWN`으로 구분한다.

### 5.5 헤더·기타

| 헤더 | 용도 |
|---|---|
| `Authorization: Bearer <token>` | 인증 |
| `Idempotency-Key` | 중복 실행 부작용이 있는 POST에 필수(담기·결제·영수증 검증) — architecture.md 8.4 |
| `X-Trace-Id` | 응답에 항상 포함 |

- 시각은 응답에서 **ISO 8601 UTC 문자열**로 내려준다. epoch 정수를 쓰지 않는다.
- Boolean 쿼리 파라미터는 `true`/`false` 문자열만 허용한다(`1`/`0` 금지).
- 삭제된·회수된 리소스는 404가 아니라 상황에 맞는 `error_code`로 응답한다. 클라이언트가 목록에서 제거해야 하기 때문이다.

## 6. Git Convention

### 6.1 Commit

```
<type>(<scope>): <subject>
```

```
feat(auth): implement social login
fix(note): resolve duplicate link creation
docs(backend): add transaction rule to architecture
refactor(content): extract pipeline orchestrator
```

| 항목 | 규칙 |
|---|---|
| type | `feat` `fix` `docs` `refactor` `test` `chore` `perf` `style` |
| scope | 모듈·도메인 이름 소문자 (`auth`, `user`, `content`, `backend`) |
| subject | **영문 소문자, 명령형 현재시제, 마침표 없음, 50자 이내** |

- `feat`: 사용자에게 보이는 기능 추가 / `fix`: 버그 수정 / `refactor`: 동작 변경 없는 구조 개선 / `chore`: 빌드·설정·의존성.
- **하나의 커밋은 하나의 목적만** 담는다. 기능 추가와 리팩터링을 섞지 않는다.
- 본문이 필요하면 제목 다음 빈 줄 뒤에 **왜 바꿨는지**를 쓴다. 무엇을 바꿨는지는 diff가 말해준다.
- 관련 PRD 항목이 있으면 본문에 남긴다: `Relates to FR-29`.

### 6.2 Branch

```
<type>(be)/<짧은-설명>
```

```
feat(be)/social-login
fix(be)/duplicate-drip
docs(be)/architecture-convention
refactor(be)/content-orchestrator
```

- **`(be)` 표기로 백엔드 작업 브랜치임을 표시한다.** 다른 파트는 `(fe)`, `(ai)` 등 같은 규칙을 따른다.
- type은 커밋 type과 동일한 목록을 쓴다.
- 설명은 **소문자 kebab-case**, 2~4단어. 브랜치 이름만 보고 무슨 작업인지 알 수 있어야 한다.
- 브랜치는 **main에서 분기**하고, 작업이 끝나면 삭제한다.

### 6.3 PR

- `main` 직접 push를 금지한다. 모든 변경은 PR을 거친다.
- PR 제목은 커밋 규칙과 동일한 형식으로 쓴다.
- PR 본문에 다음을 포함한다: **변경 요약 / 관련 FR·문서 / 테스트 방법 / 스키마 변경 여부**.
- 스키마 변경(마이그레이션 포함) PR은 리뷰어에게 명시적으로 알린다.
- PR은 작게 유지한다. 리뷰가 불가능한 크기가 되면 기능을 쪼갠다.

## 7. Testing Convention

### 7.1 위치·파일명

**테스트는 대상 파일과 같은 디렉터리에 둔다.**

```
modules/user/
├── user.service.ts
├── user.service.spec.ts          # 단위 테스트
├── user.repository.ts
└── user.repository.spec.ts       # DB 통합 테스트

test/
└── play-limit.e2e-spec.ts        # E2E
```

| 종류 | 파일명 | 위치 |
|---|---|---|
| 단위 테스트 | `<대상>.spec.ts` | 대상 파일 옆 |
| E2E 테스트 | `<시나리오>.e2e-spec.ts` | 루트 `test/` |

### 7.2 무엇을 테스트하는가

| 대상 | 방침 |
|---|---|
| **Service** | **필수.** 도메인 규칙·분기·예외를 모두 커버한다. Repository와 외부 클라이언트는 mock |
| **Repository** | 쿼리 조건·제약이 중요한 것만. 실제 DB로 통합 테스트한다(mock 대상이 아니다) |
| **Orchestrator** | 단계 순서, 실패 시 상태 전이, 재시도·멱등성 |
| **Controller** | Service 위임만 하면 생략 가능. 가드·검증 동작 확인이 필요하면 E2E로 |
| **DTO** | 검증 규칙이 복잡한 경우만 |

**PRD 9.1의 정책 로직은 단위 테스트를 반드시 작성한다** — 무료 하루 2편 카운트(04시 리셋 경계 포함), 페이월 트리거, 티어별 드립 편수 상한, 결제 완료 시 티어 반영, 중복 적립 방지, 콜드스타트 편성, QA 이탈 시 재생성 트리거, 파트너 회수 반영.

E2E는 PRD 9.2의 핵심 시나리오를 우선한다.

### 7.3 작성 규칙

```ts
describe('UserService', () => {
  describe('withdraw', () => {
    it('탈퇴하면 라이브러리와 관심사가 함께 삭제된다', async () => {
      // given
      // when
      // then
    });
  });
});
```

- 구조: `describe(클래스) > describe(메서드) > it(동작)`
- **`it` 설명은 한글로 "~하면 ~한다" 형식**을 쓴다. 완료 조건(Given-When-Then) 문장을 그대로 옮겨도 좋다.
- 본문은 **given / when / then 주석으로 구분**한다.
- 테스트 하나는 하나만 검증한다. 여러 시나리오를 한 `it`에 몰지 않는다.
- **테스트 간 상태를 공유하지 않는다.** 순서를 바꿔도 통과해야 한다.
- **`Date.now()`·랜덤을 직접 쓰지 않는다.** 시각은 주입 가능한 형태로 만들고 테스트에서 고정한다. 04시 리셋·구독 만료처럼 시각이 규칙인 로직이 많다.
- 실패 경로를 반드시 테스트한다. 성공 케이스만 있는 테스트는 절반이다.
- DB 통합 테스트는 각 테스트 후 롤백하거나 데이터를 정리한다.

### 7.4 커버리지

수치 목표를 강제하지 않는다. 대신 **7.2의 정책 로직에 테스트가 없으면 PR을 머지하지 않는다.** 커버리지 숫자보다 "정책이 바뀌었을 때 테스트가 깨지는가"가 기준이다.

## 8. Logging Convention

architecture.md 7.6이 에러 로깅의 레벨 규칙을 정의한다. 이 장은 **어떤 로그를 남기고, 어떤 형식으로 남기며, 무엇을 남기지 않는지**를 정의한다.

### 8.1 형식

- **`console.log`를 사용하지 않는다.** Nest `Logger`(또는 그 위에 구성한 구조화 로거)만 사용한다.
- 로그는 **구조화(JSON)** 로 남긴다. 사람이 읽는 문장과 기계가 읽는 필드를 분리한다.
- 값을 message 문자열에 이어 붙이지 않고 **필드로 분리**한다. 검색·집계가 가능해야 한다.

```ts
// ✅
this.logger.warn('play blocked by daily limit', { userId, contentId, playCount });
// ❌
this.logger.warn(`user ${userId} blocked, count=${playCount}`);
```

**모든 로그의 공통 필드**

| 필드 | 설명 |
|---|---|
| `timestamp` | ISO 8601 UTC |
| `level` | error / warn / info / debug |
| `trace_id` | 요청 단위 식별자. 응답 헤더 `X-Trace-Id`와 동일 |
| `context` | 발생 클래스명 (`UserService`) |
| `message` | 영문 소문자 짧은 문장, 고정 문자열 |
| `user_id` | 인증된 요청인 경우 |

### 8.2 레벨 기준

| 레벨 | 언제 | 예 |
|---|---|---|
| `error` | 사람이 조치해야 함. 5xx, 미처리 예외, 외부 연동 실패 | 영수증 검증 서버 응답 없음 |
| `warn` | 비정상이지만 서비스는 정상. 4xx, 재시도 발생, 임계치 근접 | 인증 실패, 유니크 위반 흡수 |
| `info` | 운영상 의미 있는 정상 사건 | 로그인, 발행, 티어 변경 |
| `debug` | 개발 중 추적용. **운영 환경에서 비활성** | 쿼리 파라미터 |

**정상적인 도메인 분기에 `error`를 쓰지 않는다.** 페이월 노출·한도 초과는 서비스가 의도한 동작이므로 `info`다. 알림이 울려야 하는 것만 `error`로 남긴다.

### 8.3 반드시 남기는 로그

| 분류 | 이벤트 | 레벨 | 필수 필드 |
|---|---|---|---|
| **요청** | 모든 API 요청 시작·종료 (인터셉터에서 일괄) | info | method, path, status, duration_ms |
| **인증** | 로그인 성공/실패, 토큰 갱신 실패, 로그아웃, 회원 탈퇴 | info / warn | provider, reason |
| **인증 이상** | refresh token 재사용 감지 → 세션 무효화 | error | user_id |
| **정책 판정** | 재생 차단(페이월), 티어 접근 차단 | info | error_code, tier, play_count |
| **결제·구독** | 영수증 검증 결과, 티어 변경, 해지 | info / error | order_id(비민감), tier_before, tier_after |
| **파이프라인** | 작업 상태 전이(수급→생성→QA→TTS→발행), 재시도, 한도 초과 | info / warn | job_id, stage, result, retry_count |
| **QA** | 대조 실패·자동 재생성 트리거 | warn | content_id, attempt |
| **드립 편성** | 배치 실행 결과 | info | target_users, scheduled_count, skipped_reason |
| **파트너 통제** | 회수·제외·검수 반영 (**감사 로그**) | info | content_id, partner_id, action, actor |
| **콘텐츠 접근** | 서명 URL 발급 | info | content_id, expires_at |
| **외부 연동** | AI 서버·스토어·스토리지 호출 실패·타임아웃 | error | target, status, retry_count |
| **DB** | 트랜잭션 롤백, 데드락, 슬로우 쿼리 | warn / error | duration_ms |

**파트너 통제·결제·탈퇴는 감사 로그**로 취급한다. 누가·언제·무엇을 했는지가 남아야 하며, 일반 로그보다 긴 보존 기간을 적용한다.

### 8.4 남기지 않는 것

다음은 **어떤 레벨에서도 로그에 남기지 않는다.**

- access / refresh token, 소셜 액세스 토큰, 서명 URL 전문
- 결제 영수증 본문, 스토어 인증 키
- 개인식별정보: 이메일 원문, 실명, 전화번호 → 필요 시 `user_id`로만 참조
- 콘텐츠 대본·원문 전문 (파트너 저작물)
- 요청 바디 전체 덤프

마스킹은 개별 호출부에 맡기지 않고 **로깅 인터셉터에서 일괄 처리**한다. 마스킹 대상 키 목록은 한 곳에서 관리한다.

### 8.5 금지 사항

- 반복문 안에서 건당 로그 남기기 — 집계해서 한 번 남긴다(`scheduled_count: 320`).
- 같은 사건을 계층마다 중복으로 남기기 — 예외는 최종 처리 지점(Exception Filter)에서 한 번만 남긴다.
- 개인정보·토큰을 에러 메시지에 담아 던지기 — 그 메시지가 그대로 로그에 남는다.
- 운영 환경에서 `debug` 활성화.

### 8.6 지표로 뽑는 로그

PRD 10장 지표와 연결되는 것은 별도 카운터·대시보드로 관측한다.

- 재생 실패율, 결제 검증 실패율 (`common-error-handling.md` 4.7)
- QA 통과율·자동 재생성 발생률 (PRD 10 콘텐츠·편성 지표)
- 드립 적립 건수·스킵 사유 분포
- API 오류율·응답 시간(p95), 외부 연동 실패율

## 미결 사항

- API JSON 표기: 현재 규칙은 snake_case 직접 선언. class-transformer 네이밍 전략이나 인터셉터로 자동 변환할지 검토 필요
- PK 생성 방식: UUID v4 vs v7(시간 정렬) — 대량 조회 성능 확인 후 확정
- 로깅 라이브러리 선정(Nest Logger 확장 / pino / winston)과 로그 수집·보존 기간
- 감사 로그 보존 기간 — 파트너 계약·법무 검토 대상
- lint·formatter 규칙 세부(ESLint 룰셋, Prettier 설정)과 커밋 훅 도입 여부
