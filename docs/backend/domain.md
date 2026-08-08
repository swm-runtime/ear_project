# 도메인 모델

> `docs/features/*.md` 16개 기능 명세서의 "6. 데이터 모델"을 통합하고, `docs/backend/domain-conflicts.md`의 결정 사항을 반영한 최종 스키마다.
> **Entity 코드는 이 문서의 테이블·컬럼 정의를 따른다**(`convention.md` 4.1, `architecture.md` 6). 문서에 없는 컬럼을 코드에 임의로 추가하지 않는다.
> 이름 규칙은 `convention.md` 1.5를 따른다.

## 목차

1. [공통 규칙](#1-공통-규칙)
2. [모듈별 Entity 소유권](#2-모듈별-entity-소유권)
3. [계정 · 인증](#3-계정--인증)
4. [관심사](#4-관심사)
5. [콘텐츠](#5-콘텐츠)
6. [라이브러리 · 재생](#6-라이브러리--재생)
7. [편성(드립)](#7-편성드립)
8. [구독 · 결제](#8-구독--결제)
9. [알림](#9-알림)
10. [파트너](#10-파트너)
11. [보존 아카이브](#11-보존-아카이브)
12. [삭제 · 보존 정책](#12-삭제--보존-정책)
13. [테이블에 두지 않는 것](#13-테이블에-두지-않는-것)
14. [폐기된 개체](#14-폐기된-개체)
15. [미결 사항](#15-미결-사항)

---

## 1. 공통 규칙

### 1.1 모든 테이블에 공통으로 들어가는 것

아래는 **모든 테이블에 존재하며 개별 정의에서는 생략한다.** 예외는 각 테이블에 명시한다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | `uuid` | PK. 대량 로그성 테이블은 `bigserial` (`convention.md` 4.2 예외 조항) |
| `created_at` | `timestamptz` | `BaseEntity` |
| `updated_at` | `timestamptz` | `BaseEntity` |

- 시각은 **항상 `timestamptz`**. 애플리케이션은 UTC로 다루고 표시만 KST로 한다.
- 정합성이 중요한 규칙은 **DB 제약(unique·FK·not null·check)으로 이중 방어**한다(`architecture.md` 6).
- 스키마 변경은 반드시 마이그레이션 파일로 관리한다. `synchronize: true`는 어떤 환경에서도 쓰지 않는다.

### 1.2 서비스 날짜 경계 — 04시

**하루의 경계는 자정이 아니라 04:00 KST다.** 03:59의 행위는 전날로 계산한다(`paywall.md` 9.1).

이 규칙이 적용되는 곳:

| 대상 | 적용 |
|---|---|
| `play_records.play_date` | 04시 기준 서비스 날짜를 저장. 페이월 카운트의 근거 |
| `content_stats` 집계 경계 | 주간 = 월요일 04:00 ~ 다음 월요일 03:59 |
| 드립 편성 배치 | `drip_batch_runs.run_date` |

**서로 다른 경계를 쓰면 페이월 카운트와 통계가 영구히 어긋난다.** 경계 계산 함수는 한 곳에만 두고 전 모듈이 그것만 호출한다.

### 1.3 티어

| 값 | 의미 | 구독 행 |
|---|---|---|
| `light` | **무료 티어** | `subscriptions` 행 **없음** |
| `daily` | 유료 | 있음 |
| `pro` | 유료 | 있음 |

- `users.tier` · `plans.tier` · `subscriptions.tier`는 **같은 enum 값 집합**을 쓴다.
- `subscriptions`에는 실제로 `light` 행이 생기지 않는다(무료는 구독이 아니다). enum을 공유하는 이유는 세 곳의 값이 어긋나는 것을 막기 위해서다.
- `plans`에는 `light` 행이 **존재한다**. 무료 정책(하루 재생 2편, 드립 2편)을 데이터로 표현하기 위해서다.

### 1.4 멱등 요청 저장 — `idempotency_keys`

중복 실행 부작용이 있는 POST는 `Idempotency-Key` 헤더를 필수로 받고, **같은 키의 재요청에는 저장된 첫 응답을 그대로 반환한다**(`architecture.md` 8.4, `convention.md` 5.5). 클라이언트가 오프라인 큐·자동 재시도로 같은 요청을 두 번 보내도(`common-error-handling.md` 4.2) 계정이 두 개 생기거나 탈퇴가 두 번 실행되지 않게 하는 최종 방어다.

```
idempotency_keys
  id                        uuid            PK
  owner_key                 varchar         ★스코프 — 인증 요청은 `user:<user_id>`, 인증 전(가입)은 `anonymous`
  idempotency_key           varchar         클라이언트가 생성한 키
  endpoint                  varchar         `POST /api/v1/auth/sign-up` — 메서드 + 경로
  request_hash              varchar         요청 본문 해시. 같은 키에 다른 본문이면 충돌로 본다
  status                    enum            in_progress | completed
  response_status           smallint        NULL   완료된 요청의 HTTP 상태
  response_body             text            NULL   완료된 요청의 응답 본문 **원문** (204는 NULL)
  expires_at                timestamptz     보존 24시간

uq_idempotency_keys_owner_key_endpoint_idempotency_key (owner_key, endpoint, idempotency_key)
idx_idempotency_keys_expires_at
```

- **`user_id` FK를 두지 않는다.** 가입(`/auth/sign-up`)은 계정이 생기기 전에 호출되므로 참조할 행이 없다. 대신 `owner_key`로 스코프하며, `user_id`를 NULL 허용으로 두면 **유니크 제약이 동작하지 않는다**(Postgres는 NULL을 서로 다른 값으로 본다).
- **`endpoint`를 유니크 키에 포함한다.** 클라이언트가 같은 키를 다른 엔드포인트에 재사용해도 서로의 응답이 섞이지 않는다.
- **`request_hash`가 다르면 재요청으로 보지 않고 거절한다.** 같은 키에 다른 본문을 보내는 것은 클라이언트 버그이며, 첫 응답을 돌려주면 사용자가 요청한 적 없는 결과를 받는다.
- **`response_body`는 `jsonb`가 아니라 `text`다.** `jsonb`는 파싱해 이진 구조로 저장하므로 키 순서·공백·숫자 표기가 정규화되어 **"첫 응답을 그대로 반환한다"가 성립하지 않는다.** 이 컬럼은 질의 대상이 아니라 원문 재현이 목적이므로 문자열로 보관한다(질의가 필요한 다른 컬럼은 `jsonb`를 그대로 쓴다).
- **`in_progress` 상태의 키로 다시 들어오면 거절한다.** 동시에 도착한 두 요청이 모두 실행되는 것을 막는 것이 이 상태의 목적이다.
- **처리에 실패하면 행을 남기지 않는다.** 실패한 요청은 같은 키로 다시 시도할 수 있어야 한다.
- 보존은 **24시간**이며 배치가 `expires_at < now()`인 행을 hard delete 한다. 응답 본문에 개인정보가 포함될 수 있으므로 재시도 창을 넘겨 보관할 근거가 없다(개인정보보호법 제21조 제1항). 탈퇴 시에도 즉시 파기한다([12.3](#123-회원-탈퇴-처리)).

### 1.5 파생값을 컬럼으로 두지 않는다

집계로 구할 수 있는 값은 컬럼으로 만들지 않는다. 컬럼과 집계가 어긋나는 순간 어느 쪽이 맞는지 판단할 수 없게 된다(A-2에서 실제로 발생한 문제).

| 값 | 저장하지 않는 이유 | 구하는 방법 |
|---|---|---|
| `daily_play_count` | 판정 시점 계산 | `play_records` COUNT |
| `topics.content_count` | 관리자 화면에서만 필요 | `content_topics` COUNT |
| `complete_rate` | 비율은 합산이 불가능 | `complete_count / play_count` |
| 프로필 청취 통계 | **전부 파생값이다** (`profile.md` 4.5~4.7 — 누적 3지표·주간 요일별·주제 분포) | `play_records` · `library_items.status` · `content_topics` 집계 ([6.1](#61-library_items) · [6.3](#63-play_records)) |

---

## 2. 모듈별 Entity 소유권

`architecture.md` 4.1 — 모듈은 Entity를 기준으로 나누고, 각 모듈은 자기 Entity의 소유자다.

| 모듈 | 소유 Entity |
|---|---|
| `user` | `users`, `consents`, `withdrawal_logs`, `user_settings`, `device_tokens`, `email_verifications` |
| `auth` | `sessions` |
| `interest` | `topics`, `user_interests`, `topic_adjacencies` |
| `content` | `contents`, `content_topics`, `content_scripts`, `content_stats` |
| `library` | `library_items` |
| `playback` | `playback_progresses`, `play_records`, `user_signals`, `audio_access_logs`, `source_link_clicks` |
| `drip` | `drip_excluded_contents`, `user_preference_vectors`, `drip_batch_runs`, `first_drip_jobs` |
| `subscription` | `plans`, `subscriptions`, `purchase_intents`, `store_notification_logs` |
| `notification` | `notification_logs` |
| `partner` | `partners`, `content_control_requests`, `audit_logs` |
| `user` (archive 스키마) | `archived_users`, `archived_consents`, `archived_subscriptions` |
| `idempotency` | `idempotency_keys` — 도메인이 없는 플랫폼 모듈([1.4](#14-멱등-요청-저장--idempotency_keys)) |

**의존 방향** (`architecture.md` 4.3 — 단방향, 순환 금지)

| 모듈 | 의존하는 모듈 | 비고 |
|---|---|---|
| `auth` | `user`, `idempotency` | |
| `user` | `subscription`, `idempotency` | **탈퇴가 결제 이력을 판정**하려면 `subscriptions` 행의 존재 여부가 필요하다([12.3](#123-회원-탈퇴-처리)). ↓ 아래 주의 |
| `library` | `content`, `user` | |
| `playback` | `content`, `library`, `subscription`, `user`, `drip` | `content_stats` 집계 배치를 `playback`이 실행한다. 재생 한도 판정에 `users.tier`가([8.1](#81-plans)), 재생 시 드립 영구 제외 적재에 `drip_excluded_contents`가([7.1](#71-drip_excluded_contents)) 필요하다 |
| `drip` | `content`, `library`, `interest`, `subscription`, `user` | 편성 편수 판정에 `users.tier`가 필요하다(`architecture.md` 4.5) |
| `subscription` | `user` | |
| `notification` | `user` | |
| `partner` | `content` | |

**유스케이스 모듈은 위 두 표에 없다.** `onboarding` · `library-screen`은 Entity를 소유하지 않고 각 소유 모듈의 Service만 조합한다. 이 장은 Entity 소유 모듈의 표이므로, 그쪽 의존 방향은 `architecture.md` 4.5가 관리한다.

**`user` ↔ `subscription` 주의** — 위 표에 `user → subscription`과 `subscription → user`가 함께 있지만 **동시에 성립시키면 순환이다**(`architecture.md` 4.3, `forwardRef` 금지).

- 현재는 `user → subscription` 한 방향만 코드에 있다. 탈퇴가 결제 이력을 판정하는 경로다.
- `subscription`이 결제 반영으로 `users.tier`를 갱신하기 시작하면([3.1](#31-users)) 반대 방향이 생겨 순환이 된다. **그 시점에 탈퇴를 Orchestrator로 올려**(`architecture.md` 3.3) 위에서 두 모듈의 Service를 조합하고, `user → subscription` 의존은 제거한다.
- 즉 표의 `user → subscription`은 **subscription 모듈 완성 전까지의 한시적 상태**이며, 순환이 만들어지기 전에 해소해야 한다.

**`content_stats` 갱신 경로** — 테이블 소유는 `content` 모듈이지만, 집계 원천(`play_records` · `user_signals` · `source_link_clicks`)은 `playback` 모듈이 소유한다. 따라서 **집계 배치는 `playback` 모듈이 실행한다.** 자기 Repository로 원천을 읽어 계산한 뒤, 결과를 `content` 모듈의 Service에 넘겨 기록한다.

- `playback` → `content` 방향이므로 순환이 생기지 않는다.
- **다른 모듈의 Repository를 직접 주입받지 않는다**(`architecture.md` 4.3). `content` 모듈이 노출한 Service만 호출한다.

---

## 3. 계정 · 인증

### 3.1 `users`

```
users
  id                        uuid            PK
  provider                  enum            kakao | google | naver
  provider_user_id          varchar         제공자 고유 ID
  email                     varchar         NULL 허용 (미제공 · 마스킹 주소)
  is_email_verified         boolean         DEFAULT false   ★소유 확인 완료 여부
  nickname                  varchar         NULL 허용 (가입 시 미정 · 온보딩에서 입력)
  role                      enum            user | admin          DEFAULT 'user'
  tier                      enum            light | daily | pro   DEFAULT 'light'   ★캐시
  status                    enum            active | withdrawn    DEFAULT 'active'
  onboarding_completed      boolean         DEFAULT false
  onboarding_step           enum            topic | career | pick | done
  onboarding_completed_at   timestamptz     NULL
  job_category              varchar         NULL   ← UserCareer 병합 (C-2)
  job_title                 varchar         NULL
  years_of_experience       int             NULL
  withdrawn_at              timestamptz     NULL

uq_users_provider_provider_user_id (provider, provider_user_id)
idx_users_status
```

- **`tier`는 비정규화 캐시다** (A-3). 진실의 원천은 `subscriptions`이며, 갱신 경로는 `SubscriptionService` **한 곳으로만** 제한한다. 다른 모듈이 직접 `UPDATE`하지 않는다.
- `entitlements_cache`는 두지 않는다. 캐시가 두 겹이면 반드시 어긋난다. 권한은 `plans`에서 매번 조립한다.
- `daily_play_count` · `count_reset_at`은 **없다** (A-2). `play_records` 집계로만 판정한다.
- 커리어 3개 필드는 전부 선택 입력이므로 `users`에 병합한다 (C-2). 별도 `user_careers` 테이블을 만들지 않는다.
- **`nickname`은 NULL을 허용한다.** 제공자가 닉네임을 주지 않는 경우가 있고, 값은 **온보딩의 닉네임 입력 단계에서 채운다.** 기본 문자열을 넣어 두면 "아직 정하지 않았다"와 "사용자가 그 값으로 정했다"가 구분되지 않는다. 온보딩 완료(`onboarding_completed = true`) 시점에는 값이 있어야 하며, 그 보장은 온보딩 처리에서 한다. *(온보딩 단계 enum에 닉네임 단계를 어떻게 넣을지는 화면 확정 후 갱신한다)*
- `role = admin` 계정만 콘텐츠 업로드·주제 관리 API를 호출할 수 있다. 관리자도 동일한 소셜 로그인을 사용한다(자체 아이디/비밀번호를 만들지 않는다 — `auth.md` 4.1).
- **동일 이메일 다른 제공자는 별개 계정**이다. 계정 통합은 MVP 비범위(`auth.md` 4.1).

**`email`과 `is_email_verified`는 별개 값이다** (`auth.md` 4.1)

- **`email`이 있다고 해서 그 주소로 메일이 도달하는 것은 아니다.** 결제를 막는 기준은 `email IS NOT NULL`이 아니라 **`email IS NOT NULL AND is_email_verified = true`** 다. 두 조건을 한 곳(권한 판정 함수)에서만 조립하고 개별 쿼리에서 재작성하지 않는다.
- 값이 정해지는 경로는 셋뿐이다.

| 경로 | `email` | `is_email_verified` |
|---|---|---|
| 카카오 `is_email_valid = true` · `is_email_verified = true` | 받은 주소 | `true` |
| 카카오 `is_email_valid = true` · `is_email_verified = false` | 받은 주소 | `false` |
| 카카오 `is_email_valid = false` (마스킹 주소) | `NULL` | `false` |
| 구글·네이버 | 받은 주소 | `true` (대응 플래그 없음 — `auth.md` 4.1) |
| 우리 코드 인증 성공 (3.7) | 인증한 주소 | `true` |

- **제공자 응답을 판정 시점에 다시 조회하지 않는다.** 가입 시점에 이 컬럼으로 환산해 저장한 값만 쓴다. 제공자 응답은 재로그인마다 달라질 수 있고, 우리 코드 인증으로 확인한 주소는 애초에 제공자와 무관하다.
- **마스킹 여부를 문자열 패턴(`***`)으로 판정하지 않는다.** 카카오 `is_email_valid` 플래그가 기준이다 — 패턴 매칭은 제공자가 마스킹 형식을 바꾸면 그대로 뚫린다.
- `email`은 **유니크가 아니다.** 식별자가 아니라 거래 주체 확인용 연락처이며, 계정 식별은 `provider + provider_user_id`가 한다(`auth.md` 7).

### 3.2 `consents`

```
consents
  id                        uuid            PK
  user_id                   uuid            FK → users
  consent_type              enum            terms | privacy | marketing
  version                   varchar         NULL 허용 (marketing)
  is_agreed                 boolean         철회는 false 행을 추가
  agreed_at                 timestamptz

idx_consents_user_id_consent_type_agreed_at (user_id, consent_type, agreed_at DESC)
```

- **append-only.** 동의·재동의·철회가 발생할 때마다 새 행을 추가한다. `UPDATE`하지 않는다 — 갱신하는 순간 이력 테이블이 아니게 된다.
- 현재 동의 상태 = `consent_type`별 `agreed_at` 최신 1건.
- **동의 종류를 축으로 쪼갠다.** 이용약관과 개인정보처리방침은 개정 시점이 다르고, 마케팅 동의는 수시로 철회된다. 한 행에 3종을 묶으면 마케팅 토글만 껐는데 약관 버전이 딸려 들어간 행이 생기고, 그 행이 "약관에 다시 동의했다"로 읽힌다.
- 컬럼이 아니라 이력 테이블인 이유:
  - **동의 획득 사실의 입증 책임이 사업자에게** 있는데, 컬럼은 덮어쓰면 과거 근거가 소멸한다.
  - **정보통신망법 제50조 제8항 · 시행령 제62조의3** — 마케팅 수신 동의는 **동의를 받은 날부터 2년마다** 수신동의 여부를 확인해야 한다. 기산점이 "동의를 받은 날"이므로 시점이 기록돼 있지 않으면 이 의무를 이행할 수 없다.
- 행이 생기는 시점은 가입 1건 + 약관 개정 시 1건 + 마케팅 토글 시 1건뿐이라 크기 부담이 없다.

**마케팅 수신 동의의 저장 위치는 이 테이블 하나다** (합의 2026-08-06 — `settings.md` 4.1, `auth.md` 3장)

- 설정 화면의 마케팅 수신 동의 토글(즉시 저장)은 **`consents`에 행을 추가하는 것**이며, `user_settings`에 토글 컬럼을 두지 않는다. 상태를 두 곳에 두면 반드시 어긋난다(`users.tier` 캐시와 같은 문제 — 여기는 캐시가 필요할 만큼 자주 읽히지도 않는다). 현재 상태 = `consent_type = marketing`의 `agreed_at` 최신 1건.
- **2년 재확인(정보통신망법 제50조 제8항)의 기산점은 최신 `is_agreed = true` 행의 `agreed_at`이다.** 재확인 통지 후 사용자가 다시 동의하면 새 행이 추가되어 기산점이 자연히 갱신된다 — "재확인 시각" 컬럼을 따로 두지 않는다(append-only 이력이 그 자체로 시각 기록이다).
- 재확인 **통지를 보낸 사실**은 `notification_logs`(type으로 구분)에 남는다. 대상 판정(동의일 + 2년 경과)은 서버 배치가 이 테이블 집계로 수행한다 — 파생값이므로 컬럼을 만들지 않는다([1.5](#15-파생값을-컬럼으로-두지-않는다)).
- 탈퇴 시 처리는 [12장](#12-삭제--보존-정책) 참조 — `archived_consents`로 해시 보존한다.

### 3.3 `sessions`

```
sessions
  id                        uuid            PK
  user_id                   uuid            FK → users        ★B-2에서 추가
  refresh_token_hash        varchar
  device_id                 varchar
  issued_at                 timestamptz
  expires_at                timestamptz
  revoked_at                timestamptz     NULL

idx_sessions_user_id
idx_sessions_refresh_token_hash
```

- 다중 기기 동시 로그인을 허용한다. 로그아웃은 해당 기기 세션만 폐기한다(`auth.md` 7).
- **원문 토큰을 저장하지 않는다.** 해시만 저장한다.

### 3.4 `withdrawal_logs`

```
withdrawal_logs
  id                        bigserial       PK
  user_hash                 varchar         ★식별자 아님 — 복원 불가 해시
  user_hash_version         smallint        DEFAULT 1
  reason_code               varchar         NULL
  reason_text               text            NULL
  withdrawn_at              timestamptz
```

- **`user_id` FK를 두지 않는다.** 탈퇴 사용자를 다시 식별할 수 있으면 탈퇴의 의미가 없다.
- **`user_hash`는 `WITHDRAWAL_HASH_PEPPER`로 만든다** — 아카이브 스키마와 **다른 키다**([11.2](#112-user_hash-생성-규칙)). `archived_users`가 전자우편주소를 보존하므로, 같은 키를 쓰면 탈퇴 사유가 특정 개인과 연결된다. 탈퇴 사유는 집계 목적이라 그럴 필요가 없다.
- 법령 대응 목적이므로 DB 테이블로 유지한다 (B-8).

### 3.5 `user_settings`

```
user_settings
  id                          uuid          PK
  user_id                     uuid          FK → users
  default_playback_rate       float         DEFAULT 1.0    (0.8 | 1.0 | 1.2 | 1.5 | 2.0)
  sleep_timer_last_choice     enum          NULL
  is_auto_expand_enabled      boolean       DEFAULT true   (FR-06)
  is_drip_notification_enabled boolean      DEFAULT true   (FR-19)

uq_user_settings_user_id (user_id)
```

- B-1 결정: `UserPlayerSetting` / `UserInterestSetting` / `NotificationSetting` / `UserOfflineSetting` **4개를 하나로 통합**했다. 설정 항목은 계속 늘어나는데 그때마다 테이블을 만들 수 없다.
- `os_permission_granted`는 여기 **두지 않는다.** user가 아니라 **device 단위 값**이므로 `device_tokens`에만 존재한다.
- `playback_rate`는 콘텐츠별이 아니라 사용자 전역 설정이다(`player.md` 4.2). `playback_progresses`에 두지 않는다.
- 오프라인 저장 관련 설정(`network_policy`)은 **P1 이연**이므로 지금 두지 않는다.
- **마케팅 수신 동의 토글 컬럼을 두지 않는다.** 그 상태의 소유자는 `consents`다([3.2](#32-consents) — 합의 2026-08-06). 설정 화면의 토글은 표시·철회 경로일 뿐 저장소가 아니다.
- **방해금지(야간 발송 제한) 설정 컬럼은 없다 — 없음을 유지한다**(합의 2026-08-06 — `notification.md` 4.3, 방해금지 개념 자체 폐기). 드립 도착은 순수 정보성 알림이라 전역·사용자별 야간 제한을 두지 않는다.
- `is_drip_notification_enabled`의 **사용자 노출 명칭은 "이어 PICK 알림"이다**(합의 2026-08-06 — `settings.md` 4.1). 화면 이름만 바뀐 것이므로 **컬럼명은 유지한다** — "드립"은 내부 용어라는 결정이지 데이터 의미가 바뀐 것이 아니다.

### 3.6 `device_tokens`

```
device_tokens
  id                          uuid          PK
  user_id                     uuid          FK → users
  device_id                   varchar
  token                       varchar       NULL 허용 (권한 거부 — 발급받지 못함)
  platform                    enum          ios | android
  is_os_permission_granted    boolean       ★device 단위 값 (B-1)
  app_version                 varchar
  invalidated_at              timestamptz   NULL

uq_device_tokens_user_id_device_id (user_id, device_id)
idx_device_tokens_user_id
```

- **`token`은 NULL을 허용한다.** OS 알림 권한을 거부한 기기는 토큰을 발급받지 못하지만, **거부했다는 사실 자체를 기록해야** 발송 대상 판정과 재노출 판단이 가능하다(`onboarding-api.md` 4.9 — "거부했을 때도 호출한다"). 만들어 낸 값이나 빈 문자열을 넣지 않는다 — "없음"과 "그 값으로 정해짐"이 구분되지 않게 된다(3.1 `nickname`과 같은 이유).

### 3.7 `email_verifications`

이메일 코드 인증 1건 = 1행이다. 발송할 때마다 행을 추가하고, 갱신하는 것은 검증 시도 관련 컬럼뿐이다. 규칙은 `auth.md` 4.5.

```
email_verifications
  id                        bigserial       PK
  user_id                   uuid            FK → users
  email                     varchar         ★인증 대상 주소 — 카운트 키의 일부
  code_hash                 varchar         ★원문 저장 금지
  send_seq                  smallint        현재 발송 창에서 몇 번째인가 (1~5)
  sent_at                   timestamptz     발송 시각 — 쿨다운·잠금 기산점
  expires_at                timestamptz     sent_at + 3분
  attempt_count             smallint        DEFAULT 0   코드당 검증 시도 (최대 5)
  last_attempted_at         timestamptz     NULL   ★마지막 검증 시도 시각
  verified_at               timestamptz     NULL
  invalidated_at            timestamptz     NULL   재발송·메일 다시 입력 시 무효화

idx_email_verifications_user_id_email_sent_at (user_id, email, sent_at DESC)
idx_email_verifications_expires_at
```

**카운트 키는 `(user_id, email)`이다** (`auth.md` 4.5)

- 발송 5회 제한을 **계정이 아니라 주소 단위로** 센다. 오타로 잘못 입력한 주소가 맞는 주소의 기회까지 소진하는 것을 막기 위해서다.
- 따라서 `user_id` 단독 인덱스가 아니라 **`(user_id, email, sent_at DESC)` 복합 인덱스**가 판정 경로다. 발송 직전 이 인덱스로 **직전 1행만** 읽는다.

**`send_seq` — 발송 창을 한 행으로 판정한다**

`COUNT(*)`로 세지 않고 각 행에 창 내 순번을 기록한다. 발송 요청이 오면 같은 `(user_id, email)`의 **가장 최근 행 하나만** 보고 결정한다.

| 직전 행 상태 | 처리 |
|---|---|
| 없음 | `send_seq = 1`로 발송 |
| `send_seq < 5` 이고 `sent_at + 30초` 경과 | `send_seq + 1`로 발송 |
| `send_seq < 5` 이고 30초 미경과 | **쿨다운 거절** — 남은 초를 응답에 담는다 |
| `send_seq = 5` 이고 `sent_at + 1시간` 미경과 | **잠금 거절** — 남은 시간을 응답에 담는다 |
| `send_seq = 5` 이고 `sent_at + 1시간` 경과 | 창이 끝났으므로 `send_seq = 1`로 다시 발송 |

- **누적 개수를 세는 방식(`COUNT(*)`)을 쓰지 않는 이유**: 잠금이 풀린 뒤 카운트가 0으로 초기화돼야 하는데, 단순 개수는 지나간 창의 행까지 함께 세어 6회째부터 영구히 잠긴다. 슬라이딩 윈도우(`sent_at > now() - 1시간`)도 `auth.md` 4.5가 정한 "5회째 발송 시각 + 1시간"과 기산점이 다르다.
- `send_seq`는 파생값이 아니라 **창 상태 그 자체**이므로 [1.5](#15-파생값을-컬럼으로-두지-않는다)에 걸리지 않는다. 지나간 창의 순번을 재계산할 방법이 없다.
- 발송에 **실패하면 행을 만들지 않는다.** 인프라 장애로 사용자의 5회를 소진시키지 않기 위해서다(`auth.md` 4.5).

**동시 요청 방지 — 부분 유니크 인덱스**

발송 요청은 `(user_id, email)` 단위로 직렬화한다. 직전 행 조회와 삽입 사이에 다른 요청이 끼어들면 같은 `send_seq` 행이 두 개 생겨 제한이 새어 나간다. **최종 방어는 아래 부분 유니크 인덱스가 한다.**

```
uq_email_verifications_active (user_id, email)
  WHERE verified_at IS NULL AND invalidated_at IS NULL
```

- **"유효한 코드는 항상 1개"라는 규칙을 그대로 제약으로 옮긴 것이다.** 발송 시 직전 행에 `invalidated_at`을 찍고 새 행을 넣으므로, 정상 흐름에서는 활성 행이 언제나 하나뿐이다. 동시 요청 두 건은 둘 다 활성 행을 만들려 하므로 **하나가 반드시 실패한다.**
- 실패한 쪽은 예외로 노출하지 않고 **재발송 쿨다운으로 흡수한다**(`architecture.md` 8.4 — 유니크 위반을 도메인 흐름으로 흡수). 직전 발송이 방금 성공했다는 뜻이므로 쿨다운이 정확한 응답이다.
- **`(user_id, email, send_seq)` 유니크는 쓸 수 없다.** 1시간 뒤 창이 초기화되면 `send_seq`가 다시 1부터 시작해 이전 창의 1번과 충돌하고, 정상 사용자가 영구히 막힌다. 여기에 `sent_at`을 더하면 충돌은 피하지만 밀리초가 다른 동시 요청이 그대로 통과해 **방어가 사라진다.**
- **행 잠금만으로는 부족하다.** `SELECT … FOR UPDATE`는 존재하는 행에만 걸리므로, 그 주소로의 **첫 발송**에는 잠글 대상이 없다. 첫 발송이야말로 동시 요청이 겹치기 쉬운 지점이다.
- 검증 성공(`verified_at`)·무효화(`invalidated_at`) 행은 조건에서 빠지므로 지난 이력은 인덱스에 쌓이지 않는다.

**유효한 코드는 항상 1개다**

- 재발송하거나 `auth.md` 4.5의 [메일 다시 입력]으로 화면을 벗어나면, 직전 행에 `invalidated_at`을 찍는다.
- 검증 대상은 `verified_at IS NULL AND invalidated_at IS NULL AND expires_at > now()`인 행 **하나**뿐이다.
- **`code_hash`는 원문을 저장하지 않는다.** `sessions.refresh_token_hash`와 같은 규칙이다([3.3](#33-sessions)).

**검증 시도**

- 코드를 입력할 때마다 `attempt_count`를 올리고 `last_attempted_at`을 갱신한다. **행을 새로 만들지 않는다** — 발송 1건에 검증 여러 번이다.
- `attempt_count = 5`가 되면 그 코드를 무효화한다(`invalidated_at`). 잠기는 것은 검증이며, 발송은 `send_seq` 규칙을 그대로 따른다.
- 실패 응답에 "코드 불일치"와 "코드 만료"를 구분해 내려준다(`auth.md` 4.5).

**보존**

- 인증 목적이 끝난 행은 **보관 근거가 없다**(개인정보보호법 제21조 제1항). 배치가 `expires_at < now() - interval '24 hours'`인 행을 hard delete 한다.
- 24시간을 두는 것은 발송 잠금(1시간)과 CS 문의 대응을 위한 여유일 뿐이며, 그 이상 남기지 않는다.
- 탈퇴 시에는 **결제 이력 유무와 무관하게 즉시 파기한다**([12.3](#123-회원-탈퇴-처리)). 인증 사실은 `users.is_email_verified`로 충분하고, 아카이브 대상이 아니다.

---

## 4. 관심사

### 4.1 `topics`

```
topics
  id                        uuid            PK
  name                      varchar
  parent_category           varchar
  is_visible                boolean         DEFAULT false  ★관리자만 변경 (합의 2026-08-06)
  display_order             int

idx_topics_is_visible_display_order (is_visible, display_order)
```

- **`content_count` 컬럼을 두지 않는다** (B-7). 관리자 화면에서 필요할 때 `content_topics` COUNT로 집계한다. 주제 수가 수십 개 수준이라 비용 문제가 없다.
- **`is_visible`은 관리자만 변경한다.** 시스템이 자동으로 내리지 않는다. 갱신 주체를 한 곳으로 고정해 어긋남을 없앤다.
- **기본값은 `false`다** (합의 2026-08-06 — `admin.md` 4.5). 주제는 콘텐츠가 충분히 수급된 뒤에 노출을 시작한다. 기본 `true`면 생성 즉시 0건 주제가 온보딩·탐색에 노출되어 "고를 수는 있는데 볼 게 없는 주제"가 생긴다(PRD 8.1의 전제 위반).
- **노출 통제(`is_visible`)는 신규 주제의 공개 전 단계에만 쓴다**(합의 2026-08-06). 이미 선택한 사용자가 있는 주제를 숨기는 운영은 하지 않으며, 품질 문제 콘텐츠는 숨김이 아니라 **회수**로 처리한다(`admin.md` 4.5).
- **특정 주제의 콘텐츠를 사용자가 다 소비했더라도 목록에서 제외하지 않는다.** 소비 여부는 주제 노출과 무관하다.
- 주제 추가·삭제·노출 제어는 전부 관리자 페이지에서 이뤄진다.

### 4.2 `user_interests`

```
user_interests
  id                        uuid            PK
  user_id                   uuid            FK → users
  topic_id                  uuid            FK → topics
  source                    enum            onboarding | manual | auto_expand
  is_active                 boolean         DEFAULT true
  is_user_removed           boolean         DEFAULT false   ★자동 확장 재추가 금지 (FR-06)
  deactivated_at            timestamptz     NULL

uq_user_interests_user_id_topic_id (user_id, topic_id)
idx_user_interests_user_id_is_active (user_id, is_active)
```

- `is_user_removed = true`인 주제는 자동 확장(FR-18) 대상에서 **영구 제외**한다. 사용자가 직접 뺀 주제를 시스템이 다시 넣으면 안 된다.

### 4.3 `topic_adjacencies` *(P1 — FR-18 자동 확장)*

```
topic_adjacencies
  id                        uuid            PK
  topic_id                  uuid            FK → topics
  adjacent_topic_id         uuid            FK → topics
  similarity                float

uq_topic_adjacencies_topic_id_adjacent_topic_id (topic_id, adjacent_topic_id)
```

- FR-18(주제 자동 확장)이 P1이므로 MVP에서는 만들지 않아도 된다. 자동 확장을 켤 때 함께 도입한다.

---

## 5. 콘텐츠

> **A-6 결정** — 콘텐츠는 개발자가 직접 제작해 관리자 계정으로 업로드한다. 업로드 즉시 `published`가 된다. 업로드 이전 단계(수급·대본 생성·QA)는 시스템에서 관리하지 않으므로 **`source_documents` / `episodes` / `scripts` / `qa_reports` / `pipeline_runs`는 만들지 않는다.**

### 5.1 `contents`

```
contents
  id                        uuid            PK
  title                     varchar
  description               text
  author_name               varchar         NULL 허용 — origin 분기 (합의 2026-08-06, 아래)
  source_name               varchar         ★origin 분기 — partner: 파트너명 (B-5) / ai_generated: "참고한 자료" 표기
  source_url                varchar         NULL 허용 — origin 분기 (합의 2026-08-06, 아래)
  origin                    enum            partner | ai_generated
  partner_id                uuid            FK → partners, NULL 허용 (partner만 채운다)
  series_id                 uuid            NULL   ← Episode 흡수 (B-5)
  episode_no                int             NULL
  total_episodes            int             NULL
  audio_path                varchar         ★URL이 아니라 저장 경로 (B-5)
  duration_sec              int
  thumbnail_url             varchar
  content_version           int             DEFAULT 1
  license_expires_at        timestamptz     NULL
  status                    enum            published | withdrawn | expired
  published_at              timestamptz
  withdrawn_at              timestamptz     NULL

idx_contents_status_published_at (status, published_at DESC)
idx_contents_series_id_episode_no (series_id, episode_no)
idx_contents_partner_id

chk_contents_partner_disclosure
  origin <> 'partner'
  OR (author_name IS NOT NULL AND source_url IS NOT NULL
      AND partner_id IS NOT NULL AND license_expires_at IS NOT NULL)
```

- **`audio_url`이 아니라 `audio_path`다** (B-5). 재생 URL은 매 요청 서명 발급이므로 컬럼이 아니라 응답 DTO 필드다. 서명 URL을 DB에 저장하면 그 자체가 유출 경로가 된다.
- `status`는 **3값만** 갖는다 (A-6). 파이프라인 상태(`draft` / `partner_review` / `qa_failed` 등)는 존재하지 않는다. 업로드 = 발행이다.
- **노출 조건은 어디서나 `status = published` 단 하나로 통일한다.**
- `series_id` / `episode_no` / `total_episodes`는 `Episode` 테이블을 폐기하면서 흡수했다. 드립 스코어링의 시리즈 연속성 가점과 편성 순서 판정이 Content 단위 조회를 요구한다(`drip-scheduling.md` 4.2, 7).
- 분할되지 않은 단일 콘텐츠는 `series_id = NULL`, `episode_no = NULL`이다. 조회 코드는 이 분기를 처리해야 한다.
- **`content_version`은 같은 행의 값을 증가시킨다.** 재발행 시 새 행을 만들지 않으므로 `content_id`가 바뀌지 않고, `library_items` · `playback_progresses` · `content_stats`의 참조가 그대로 유지된다.
  - 따라서 `status`에 `superseded`가 필요 없다. 이전 버전은 행에 남지 않는다.
  - 클라이언트는 `content_version`이 올라간 것을 보고 저장한 재생 위치·오프라인 파일을 폐기한다(`player.md` 7).
  - 재발행 이력이 필요해지면 그때 별도 이력 테이블을 만든다. 지금은 요구가 없다.
- `WithdrawnContent` 테이블은 만들지 않는다 (B-3). 클라이언트 동기화는 `GET /contents/withdrawn?since=<timestamp>`로 이 테이블에서 조회한다.

**출처 필드는 `origin`으로 분기한다** (합의 2026-08-06 — `admin.md` 3.1)

| origin | `author_name` | `source_name` | `source_url` | `partner_id` · `license_expires_at` |
|---|---|---|---|---|
| `partner` | **필수** (FR-12) | **필수 — 파트너명** | **필수** (FR-12) | **필수** |
| `ai_generated` | 선택 | **필수 — "참고한 자료" 소스 표기** | 선택 | NULL |

- `origin = partner`의 `source_name`에는 **파트너명**이 들어간다 (B-5). `partners.name`의 비정규화 사본이며, 발행 시점 값을 고정한다(파트너명이 나중에 바뀌어도 발행된 콘텐츠의 고지 문구는 변하면 안 된다).
- `origin = ai_generated`의 `source_name`에는 **"참고한 자료" 소스 표기**가 들어간다(복수 소스 가능). 근거 소스가 단일 원문·단일 저자가 아니므로 `author_name`·`source_url`은 선택이다(`admin.md` 3.1 — `content-pipeline.md` 4.3의 AI 생성 고지 멘트와 같은 기준).
- **복수 소스를 별도 테이블·배열로 정규화하지 않는다.** 이 값의 용도는 출처 고지 문구 표시(FR-12) 하나뿐이고, 소스 단위 질의·조인·집계 요구가 없다 — `content_topics`를 정규화한 이유(후보 필터 인덱스)가 여기에는 없다. 표기 문자열 하나로 담고, 소스 단위 관리 요구가 생기면 그때 테이블로 승격한다. 다만 **소스 목록·정책 확인 기록을 시스템 필드로 남길지는 미결이다**([15.1](#151-남아-있는-결정) — `admin.md` 4.2-1의 적법 수집 확인).
- `chk_contents_partner_disclosure`가 파트너 콘텐츠의 필수 고지(FR-12 — 예외 없는 필수)를 DB에서 이중 방어한다([1.1](#11-모든-테이블에-공통으로-들어가는-것)). 업로드 검증이 뚫려도 고지 정보 없는 파트너 콘텐츠 행이 생기지 않는다.

**검수 완료 확인(체크)은 컬럼으로 두지 않는다** (합의 2026-08-06 — `admin.md` 3.1·4.2-1의 이행 기록)

- 업로드 검증이 체크 누락을 거부하므로(`admin.md` 4.2) 발행된 모든 행에서 **항상 참인 값**이 된다. "행이 존재한다 = 검수를 확인했다"라 컬럼이 정보를 더하지 않는다 — 집계로 구할 수 있는 값을 컬럼으로 두지 않는 것과 같은 이유다([1.5](#15-파생값을-컬럼으로-두지-않는다)).
- 이행 기록(누가·언제 확인했는가)은 **업로드 감사 로그가 담당한다.** 모든 관리자 행위는 `audit_logs`에 남고(`admin.md` 4.1), 업로드 기록의 `actor` · `created_at` · `after`(검수 확인 입력값 포함)가 그대로 이행 증적이다. PRD 9.1의 이행률 검증도 이 로그로 산출한다.

### 5.2 `content_topics`

```
content_topics
  id                        uuid            PK
  content_id                uuid            FK → contents
  topic_id                  uuid            FK → topics

uq_content_topics_content_id_topic_id (content_id, topic_id)
idx_content_topics_topic_id
```

- 명세서들은 `Content.topic_ids[]` 배열로 적고 있었으나, **다대다 조인 테이블로 정규화한다** (`convention.md` 1.5 다대다 규칙).
- 이유: 드립 후보 필터가 "`topic_ids`가 사용자의 활성 관심 주제와 교집합"(`drip-scheduling.md` 4.2)이고 탐색 주제 필터도 같은 조건이다. 배열 컬럼으로는 인덱스가 제대로 걸리지 않아 후보 필터가 전체 스캔이 된다.

### 5.3 `content_scripts`

```
content_scripts
  id                        uuid            PK
  content_id                uuid            FK → contents
  segments                  jsonb           [{ start_sec, end_sec, text }]

uq_content_scripts_content_id (content_id)
```

- FR-25(스크립트 열람). 소유 모듈은 `content`로 확정한다 (C-1).
- 세그먼트 단위 조회·검색 요구가 아직 없으므로 `jsonb` 한 컬럼으로 둔다.

### 5.4 `content_stats`

```
content_stats
  id                        bigserial       PK
  content_id                uuid            FK → contents
  period_type               enum            week | month | all
  period_start              date            ★구간 시작일
  play_count                int             DEFAULT 0
  complete_count            int             DEFAULT 0
  replay_count              int             DEFAULT 0    ★재청취 수 (PRD 10장, 합의 2026-08-06)
  total_listen_sec          bigint          DEFAULT 0    ★실제 청취 시간 합계 (FR-34)
  save_count                int             DEFAULT 0
  source_link_click_count   int             DEFAULT 0    ★FR-34 핵심 지표
  is_final                  boolean         DEFAULT false

uq_content_stats_content_id_period_type_period_start (content_id, period_type, period_start)
idx_content_stats_period_type_period_start_play_count (period_type, period_start, play_count DESC)
```

**`period_start` 규칙**

| `period_type` | `period_start` 값 |
|---|---|
| `week` | 그 주 **월요일** 날짜 |
| `month` | 그 달 **1일** |
| `all` | `1970-01-01` **고정** |

- `all`의 `period_start`를 `NULL`로 두지 않는다. PostgreSQL의 UNIQUE는 NULL을 서로 다른 값으로 취급하므로 중복 행을 막지 못하고, 배치 재실행 한 번에 인기도가 2배로 뛴다.

**갱신 주기** (B-6 결정)

| `period_type` | 실행 시각 |
|---|---|
| `week` | 매주 **월요일 04:00** |
| `month` | 매달 **1일 04:00** |
| `all` | 위 배치와 함께 갱신 |

- **직전 확정 구간의 값으로 순위를 보여준다.** 예) 5월에는 4월 집계로 인기 순위를 만든다. 진행 중인 구간을 쓰면 월초·주초에 표본이 부족해 랭킹이 무너진다.
- 구간이 끝나면 `is_final = true`로 잠근다. **정산·리포팅은 `is_final = true` 행만 읽는다.** 이후 재집계 배치는 이 행을 건드리지 않는다.
- **증분(`play_count += 1`)이 아니라 재집계 upsert로 갱신한다.** 원천(`play_records` / `user_signals`)에서 해당 구간을 다시 세어 통째로 덮어쓴다. 배치가 두 번 돌아도 결과가 같아야 한다.
- **`complete_rate`를 저장하지 않는다.** 비율은 합산이 불가능해서(`avg(주별 완청률) ≠ 전체 완청률`) 상위 구간을 만들 때 조용히 틀린 값이 나온다. 조회 시 `complete_count / play_count`로 계산한다.
- **`total_listen_sec`은 `play_records.listened_sec`의 합계다.** `max_reached_sec`(도달 위치) 합산으로 근사하지 않는다 — 2배속 청취와 반복 청취가 반영되지 않아 정산 근거로 쓸 수 없다.
- **`replay_count`의 원천은 `user_signals`의 `replay` 신호다**(PRD 10장, `partner-control.md` 4.6 — 합의 2026-08-06). 다른 카운트와 마찬가지로 증분이 아니라 해당 구간 재집계 upsert로 채운다 — 배치가 두 번 돌아도 결과가 같다.
- **`source_link_click_count`의 원천은 `source_link_clicks`다**([6.6](#66-source_link_clicks)). `user_signals`에는 넣지 않는다 — 이유는 6.6 참조.
- 집계 배치는 `playback` 모듈이 실행한다([2장](#2-모듈별-entity-소유권) 참조).
- 회수(`withdrawn`)된 콘텐츠의 통계도 삭제하지 않는다. 회수 전 재생분은 집계 대상이다.
- `PartnerReport` 테이블은 만들지 않는다 (B-6). 파트너 리포팅은 이 테이블 집계 + `contents.partner_id` 필터로 산출한다.

---

## 6. 라이브러리 · 재생

### 6.1 `library_items`

```
library_items
  id                        uuid            PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents
  source                    enum            drip | save | onboarding
  status                    enum            unplayed | in_progress | completed
  added_at                  timestamptz
  last_played_at            timestamptz     NULL
  completed_at              timestamptz     NULL
  deleted_at                timestamptz     NULL   ★소프트 삭제

uq_library_items_user_id_content_id (user_id, content_id)
idx_library_items_user_id_deleted_at_added_at_id (user_id, deleted_at, added_at DESC, id DESC)
idx_library_items_user_id_deleted_at_last_played_at (user_id, deleted_at, last_played_at DESC)
idx_library_items_content_id (content_id)
```

- `uq_library_items_user_id_content_id`가 **중복 적립 방지의 최종 방어선이다** (A-5). 드립과 사용자 담기가 동시에 같은 콘텐츠를 적립해도 DB가 1건만 남긴다.

**목록 인덱스에 `id`를 함께 넣는 이유** — 커서 페이지네이션의 tie-break다(`library-api.md` 4.1).

- 커서는 `(added_at, id)` keyset이다. `added_at`만으로는 **같은 시각에 적립된 행들의 순서가 정해지지 않아** 페이지 경계에서 아이템이 중복되거나 누락된다. 드립 배치는 한 사용자에게 2편을 **같은 트랜잭션에서** 적립하므로 이 상황이 예외가 아니라 매일 발생한다.
- 인덱스에 `id`가 없으면 정렬은 맞아도 tie 구간마다 추가 스캔이 붙는다.

**`last_played_at` 인덱스는 미니플레이어 복원용이다**(`library.md` 4.2).

- 복원 대상은 "완청하지 않은 것 중 `last_played_at`이 가장 최근인 1건"이라 **정렬 축이 목록(`added_at`)과 다르다.** 앱을 열 때마다 실행되는 조회이므로 자기 인덱스가 필요하다.

**`content_id` 단독 인덱스는 회수 반영용이다.**

- 파트너가 콘텐츠를 회수하면 그 콘텐츠를 담고 있는 **전 사용자의 라이브러리 행**을 찾아야 한다(`partner-control.md`). 유니크 인덱스는 `user_id`가 선두라 이 방향 조회에 쓸 수 없다.
- 목록 조회에서 **회수 콘텐츠를 걸러내는 것은 인덱스 문제가 아니다.** `contents`를 `id`로 조인하면 PK 조회에 `status`가 함께 딸려 오므로 별도 인덱스를 만들 이유가 없다. `idx_contents_status_published_at`([5.1](#51-contents))은 발행 목록 조회용이지 이 경로용이 아니다.
- **주제 필터도 새 인덱스가 필요 없다.** `idx_content_topics_topic_id`([5.2](#52-content_topics))로 주제에 속한 `content_id`를 뽑고, 위 `idx_library_items_content_id`로 라이브러리 행에 붙인다.
- **`resume_position_sec`을 두지 않는다** (A-1). 재생 위치는 `playback_progresses`가 단독으로 소유하고, 목록 조회 시 조인한다. 라이브러리에서 삭제해도 재생 이력이 남아야 하기 때문이다(`library.md` 4.4).
- **`deleted_reason`을 두지 않는다** (A-4). 삭제 경로(라이브러리 삭제 / 탐색 담기 해제)를 구분하지 않기로 했다. 어느 쪽이든 드립 재적립에서 영구 제외되며, 그 판정은 `drip_excluded_contents`가 담당한다.
- `source = onboarding`은 유지한다. **무료 티어도 온보딩 초기 적립과 자동 드립을 받는다**(PRD 미확정 3번 결정).
- **프로필의 "누적 청취 콘텐츠 수"(완청 고유 콘텐츠 수 — `profile.md` 4.5)의 원천은 이 테이블이다.** `status = completed`인 고유 `content_id` COUNT로 구한다(`deleted_at` 무관 — soft delete라 행이 남는다). 파생값이므로 컬럼·집계 테이블을 만들지 않는다([1.5](#15-파생값을-컬럼으로-두지-않는다)).

### 6.2 `playback_progresses`

```
playback_progresses
  id                        uuid            PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents
  position_sec              int             DEFAULT 0
  max_reached_sec           int             DEFAULT 0   ★완청 판정용

uq_playback_progresses_user_id_content_id (user_id, content_id)
```

- A-1 결정: `LibraryItem.resume_position_sec` · `PlaybackSession`을 폐기하고 **이 테이블 하나로 통일**한다. user × content 당 1건이다.
- `max_reached_sec`은 완청 판정에 반드시 필요하다(`player.md` 4.4) — 2배속으로 끝까지 들은 것은 완청, 시크로 끝까지 점프한 것은 완청이 아니다. 이 구분은 `position_sec`만으로는 불가능하다.
- `playback_rate`는 여기 두지 않는다. 콘텐츠별 값이 아니라 사용자 전역 설정이므로 `user_settings.default_playback_rate`가 소유한다.
- **라이브러리에서 삭제해도 이 행은 남긴다** (C-4). 회원 탈퇴 시에만 삭제한다.
- 여러 기기 충돌은 `updated_at` 최신이 이긴다(last-write-wins). 충돌 UI는 두지 않는다(`library.md` 7).

### 6.3 `play_records`

```
play_records
  id                        bigserial       PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents
  play_date                 date            ★04시 기준 서비스 날짜
  played_at                 timestamptz     최초 재생 시각
  listened_sec              int   DEFAULT 0 ★실제 청취 시간 누적 (FR-34)

uq_play_records_user_id_content_id_play_date (user_id, content_id, play_date)
idx_play_records_user_id_play_date (user_id, play_date)
idx_play_records_content_id_play_date (content_id, play_date)
```

- **페이월 카운트의 유일한 근거다** (A-2). `daily_play_count`는 컬럼이 아니라 이 테이블의 집계다.

```
daily_play_count = COUNT(*) FROM play_records
                   WHERE user_id = ? AND play_date = <오늘의 서비스 날짜>
```

- `play_date`가 유니크 키에 포함되므로 **같은 날 같은 콘텐츠를 다시 재생해도 카운트가 늘지 않는 것을 DB가 보장한다**(`paywall.md` 4.2).
- 04시 리셋 배치를 돌리지 않는다. 판정 시점에 계산한다(`paywall.md` 4.3).
- 라이브러리에 "담기"만 하는 행위는 행을 만들지 않는다. **재생이 실제로 시작된 경우에만** 적재한다.

**`listened_sec` — 실제 청취 시간**

- **재생 종료(일시정지·이탈·완청·앱 백그라운드) 시점마다 그 구간의 실제 경과 시간을 더한다.** 하루·콘텐츠당 1행이므로 같은 날 여러 번 들으면 같은 행에 누적된다.
- 도달 위치(`max_reached_sec`)가 아니라 **재생기가 실제로 소리를 낸 시간**이다. 2배속으로 10분짜리를 끝까지 들으면 `max_reached_sec = 600`이지만 `listened_sec ≈ 300`이다. 시크로 건너뛴 구간은 포함되지 않는다.
- `content_stats.total_listen_sec`의 유일한 원천이며, 이 값이 파트너 정산의 재생 점유율 근거가 된다(`partner-control.md` 4.6, PRD 7).
- 카운트(페이월)와 청취 시간(정산)이 같은 행에 있는 이유: 둘 다 "사용자 × 콘텐츠 × 서비스 날짜" 단위이고, 유니크 제약이 이미 그 축으로 걸려 있다. 별도 세션 테이블을 만들면 A-1에서 폐기한 `PlaybackSession`이 되살아난다.
- 날짜 경계를 넘겨 재생한 경우 **재생 시작 시점의 서비스 날짜** 행에 누적한다.

**프로필 청취 통계의 원천이다** (`profile.md` 4.5~4.7 — 합의 2026-08-06)

- 누적 청취 시간 = `listened_sec` 총합, 연속 청취 일수 = `play_date` 연속 구간(그 서비스 날짜에 행 1건 이상이면 "들은 날"), 주간 요일별 그래프 = `play_date`별 `listened_sec` 합, 주제 분포 = `listened_sec` × `content_topics` 조인 비율.
- **전부 파생값이므로 사용자 테이블에 컬럼을 만들지 않는다**([1.5](#15-파생값을-컬럼으로-두지-않는다)). 사용자 단위 통계 집계 테이블(캐시)을 신설할지는 매 조회 집계 비용을 보고 정한다 — [15.1](#151-남아-있는-결정) 결정 항목.

### 6.4 `user_signals`

```
user_signals
  id                        bigserial       PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents
  action                    enum            play | complete | skip | save | unsave | delete | replay
  position_sec              int             NULL
  max_reached_sec           int             NULL

idx_user_signals_user_id_created_at (user_id, created_at DESC)
```

- **추천 스코어링 입력 전용이다** (A-7). `drip-scheduling.md` 4.3 신호 해석 표에 쓰이는 값만 담는다.
- `seek` · `rate_change` · `share`는 **넣지 않는다.** 스코어링에 쓰이지 않으면서 재생 1회당 수십 건씩 쌓여 테이블 대부분을 차지한다. 필요하면 구조화 로그로 남긴다.
- **원문 유입 클릭([원문 보기] 탭)도 넣지 않는다** (합의 2026-08-06). `drip-scheduling.md` 4.3 신호 해석 표에 없는 행동이라 스코어링 전용이라는 이 테이블의 목적(A-7)에 어긋난다. 다만 정산 지표의 원천이라 구조화 로그로도 보낼 수 없으므로 별도 테이블 `source_link_clicks`([6.6](#66-source_link_clicks))에 적재한다.
- `manual_complete`도 **없다.** 수동 완료 표시 기능 자체를 삭제하기로 했다 (A-7).
- 별도 테이블인 이유: `playback_progresses`·`library_items`는 "현재 상태"만 알고 있어서 추천 학습에 필요한 **행동 이력**을 표현할 수 없다. 특히 `skip`은 상태 테이블에서 "아직 듣는 중"과 구분되지 않고, `unsave`·`delete`는 행이 사라져 근거가 남지 않는다.
- 최근성 가중(`drip-scheduling.md` 4.3)을 위해 `created_at`이 반드시 필요하다.

### 6.5 `audio_access_logs`

```
audio_access_logs
  id                        bigserial       PK
  content_id                uuid            FK → contents
  user_id                   uuid            FK → users
  device_id                 varchar
  issued_at                 timestamptz
  expires_at                timestamptz
  ip_hash                   varchar

idx_audio_access_logs_content_id_issued_at (content_id, issued_at DESC)
idx_audio_access_logs_user_id_issued_at (user_id, issued_at DESC)
```

- B-4 결정: `AudioAccessToken`과 `AudioAccessLog`는 같은 것이므로 **하나로 통합**했다.
- **`signed_url`을 저장하지 않는다.** 서명 URL을 DB에 남기면 그 자체가 유출 경로가 된다(`architecture.md` 9.4). 발급 사실만 기록한다.
- FR-33 무단 재배포 방지의 이상 탐지·감사 근거다.

### 6.6 `source_link_clicks`

플레이어의 [원문 보기] 탭 1회 = 1행이다(`player.md` 4.5). `content_stats.source_link_click_count`의 유일한 원천이다(합의 2026-08-06).

```
source_link_clicks
  id                        bigserial       PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents

idx_source_link_clicks_content_id_created_at (content_id, created_at)
idx_source_link_clicks_user_id (user_id)
```

- 클릭 시각은 별도 컬럼 없이 `created_at`이다(행 생성 = 클릭).
- **`user_signals`에 action을 추가하지 않고 별도 테이블을 두는 이유** — `user_signals`는 추천 스코어링 입력 전용이고(A-7), 원문 클릭은 스코어링에 쓰이지 않는다. `seek`·`rate_change`를 뺀 것과 같은 기준을 지키면서 목적이 다른 행만 별도로 담는다.
- **구조화 로그로 보낼 수도 없다.** `content_stats`는 원천을 재집계하는 upsert로 갱신되고([5.4](#54-content_stats)), 이 값은 파트너 리포팅 지표라 "원천 로그와 집계값이 재현 가능해야 한다"(`partner-control.md` 4.6). 재집계·재현이 가능하려면 원천이 DB 테이블이어야 한다 — `play_records`·`user_signals`와 같은 지위다.
- 재생 1회당 최대 몇 건 수준이라 적재량 부담이 없다(`seek`류와 다른 점).
- `user_id`는 중복 클릭 분석·탈퇴 파기 경로용이다. 집계는 개인 식별 없이 카운트만 쓴다.
- 탈퇴 시 **즉시 파기한다**([12.3](#123-회원-탈퇴-처리)) — 확정된 `content_stats` 집계값은 남는다(`play_records`와 같은 논리).

---

## 7. 편성(드립)

> **A-5 결정** — `drip_schedules` 테이블은 만들지 않는다. 편성 이력은 `library_items.source = 'drip'`으로 확인할 수 있고, 재적립 방지는 `drip_excluded_contents`가 담당한다.

### 7.1 `drip_excluded_contents`

```
drip_excluded_contents
  id                        uuid            PK
  user_id                   uuid            FK → users
  content_id                uuid            FK → contents
  reason                    enum            unsave | library_delete | played | dripped
  excluded_at               timestamptz

uq_drip_excluded_contents_user_id_content_id (user_id, content_id)
idx_drip_excluded_contents_user_id
```

- A-4 결정으로 신설한 테이블이다. **드립 후보에서 영구 제외할 콘텐츠를 사용자별로 모은다.**
- 행이 추가되는 시점:

| 시점 | `reason` |
|---|---|
| 탐색에서 담기 해제 | `unsave` |
| 라이브러리에서 삭제 | `library_delete` |
| 콘텐츠를 재생함 | `played` |
| 드립으로 적립됨 | `dripped` |

- **삭제 경로를 구분하지 않는다.** 라이브러리 삭제든 탐색 담기 해제든 결과는 동일하게 영구 제외다.
- `reason`은 운영·디버깅용이며 필터 조건에는 쓰이지 않는다. 이미 행이 있으면 최초 사유를 유지한다(upsert 시 갱신하지 않음).
- **`onboarding`을 reason에 추가하지 않는다** (확정 — 15.1 충돌 #5 해소). 온보딩 담기는 이 테이블에 행을 만들지 않는다 — 담기분은 `library_items(source = onboarding)` 행이 되므로 아래 후보 필터 첫 줄이 이미 제외하고, 중복 적립은 `library_items (user_id, content_id)` 유니크가 막는다(A-5와 같은 방어선). 이후 삭제하면 그때 `library_delete` 사유로 적재된다. 온보딩만의 사유가 필요한 상황이 없다.
- **`withdraw`(파트너 회수)도 reason에 추가하지 않는다** (합의 2026-08-06 — `partner-control.md` 4.3). 회수로 인한 라이브러리 삭제는 사용자의 "관심 없음" 신호가 아니므로 영구 제외 사유가 아니다. 복구(restore)·재발행되면 **아직 받은 적 없는 사용자에게는 드립 후보로 복귀한다.** 이미 적립된 적이 있는 사용자는 기존 `dripped` 행(과 soft delete로 남은 `library_items` 행)이 그대로 재적립을 막는다.

**드립 후보 필터** (`drip-scheduling.md` 4.2)

```
제외 대상 =  library_items 에 행이 존재 (deleted_at 여부 무관)
          OR drip_excluded_contents 에 행이 존재
```

`played`·`dripped`가 이 테이블에 적재되므로, "라이브러리에 있는 것 / 들은 이력이 있는 것 / 제외 목록에 있는 것" 세 조건이 위 두 줄로 정리된다.

### 7.2 `user_preference_vectors`

```
user_preference_vectors
  id                        uuid            PK
  user_id                   uuid            FK → users
  topic_weights             jsonb           { topic_id: float }
  author_weights            jsonb           { author: float }
  signal_count              int             ★콜드스타트 판정용

uq_user_preference_vectors_user_id (user_id)
```

- `user_signals`를 집계한 결과다. 원천은 `user_signals`이고 이것은 파생 캐시다.
- 갱신 주기: 편성 배치 시점에 계산한다. **실시간 재계산은 하지 않는다**(`drip-scheduling.md` 4.3).
- `signal_count < 3`(완청 기준)이면 콜드스타트로 판정하고 인기도·신선도 비중을 높인다(`drip-scheduling.md` 4.4).

### 7.3 `drip_batch_runs`

```
drip_batch_runs
  id                        uuid            PK
  run_date                  date
  target_count              int
  success_count             int
  skipped_count             int
  failed_count              int
  started_at                timestamptz
  finished_at               timestamptz     NULL

uq_drip_batch_runs_run_date (run_date)
```

- `uq_drip_batch_runs_run_date`가 **배치 중복 실행을 막는다** (A-5). 사용자 단위 중복은 `library_items` 유니크가 막는다.
- 운영 콘솔 조회용으로 DB에 유지한다 (B-8).

### 7.4 `first_drip_jobs`

온보딩 3단계에서 **하나도 담지 않은 사용자**의 첫 드립 편성 1건을 추적한다. 클라이언트가 완료 대기 로딩을 걸어놓고 이 상태를 폴링한다(`onboarding.md` 4 [완료 대기], `onboarding-api.md` 4.8).

```
first_drip_jobs
  id                        uuid            PK
  user_id                   uuid            FK → users
  status                    enum            pending | completed | no_candidates | queued | failed
  attempt_count             smallint        DEFAULT 0   서버 내부 재시도 횟수
  last_attempted_at         timestamptz     NULL
  completed_at              timestamptz     NULL
  item_count                int             DEFAULT 0   실제로 적립된 편수

uq_first_drip_jobs_user_id (user_id)
idx_first_drip_jobs_status_last_attempted_at (status, last_attempted_at)
```

**`drip_batch_runs`로 대신할 수 없는 이유** ([7.3](#73-drip_batch_runs))

- `drip_batch_runs`는 `run_date` 유니크라 **하루 1행짜리 일일 배치 기록**이다. 온보딩 첫 드립은 가입 시점에 사용자별로 발생하므로 같은 날 여러 건이 생기고, 그 테이블에는 담을 자리가 없다.
- **`library_items` 유무만으로는 상태를 구분할 수 없다.** 행이 없다는 사실 하나로 "아직 편성 중"인지 "후보가 고갈돼 만들 수 없었는지"를 가를 수 없어, 클라이언트가 영영 오지 않을 결과를 15초 내내 기다리게 된다.

**상태값이 다섯인 이유**

| 값 | 의미 | 클라이언트 |
|---|---|---|
| `pending` | 편성 진행 중 | 계속 폴링 |
| `completed` | 적립 완료 | 완료 화면으로 |
| `no_candidates` | 후보 고갈 — **실패가 아니다** | 즉시 완료 화면으로. **재시도하지 않는다** |
| `queued` | 서버가 자체 재시도를 소진해 비동기 큐로 넘김 | 즉시 완료 화면으로 |
| `failed` | 큐 적재까지 실패 | 즉시 완료 화면으로 + 운영 알림 |

- **`no_candidates`를 실패로 뭉뚱그리지 않는다.** 재시도해도 결과가 바뀌지 않는 종료 상태이므로(`onboarding.md` 7), 실패로 취급하면 서버가 헛된 재시도를 하고 사용자는 상한까지 기다린다.
- **사용자당 1행이다**(`uq_first_drip_jobs_user_id`). 온보딩은 계정 생애에 한 번뿐이고, 유니크가 완료 요청 재시도로 인한 **중복 편성 트리거를 막는 최종 방어선**이다.
- `attempt_count`는 **서버 내부 재시도 횟수**다. 클라이언트가 보내는 값이 아니며, 사용자 화면에도 노출하지 않는다(`onboarding.md` 4).
- 보존: 온보딩 완료 후 목적이 끝나므로 **`completed_at` 기준 30일 후 배치 삭제**한다. 운영 지표(0건 담기 비율·편성 실패율)는 그 전에 구조화 로그로 빠져나간다(B-8).

---

## 8. 구독 · 결제

### 8.1 `plans`

```
plans
  id                        uuid            PK
  tier                      enum            light | daily | pro
  name                      varchar
  description               text
  daily_play_limit          int             NULL = 무제한
  daily_drip_count          int             일일 자동 적립 편수
  is_drip_enabled           boolean
  is_ads_enabled            boolean
  price_krw                 int
  store_product_id_ios      varchar         NULL (light)
  store_product_id_android  varchar         NULL (light)
  display_order             int
  is_active                 boolean         DEFAULT true

uq_plans_tier (tier)
```

**MVP 값**

| tier | price_krw | daily_play_limit | daily_drip_count | is_drip_enabled |
|---|---|---|---|---|
| `light` (무료) | 0 | **2** | **2** | true |
| `daily` | 미정 | 미정 | **2** | true |
| `pro` | 미정 | `NULL`(무제한) | **2** | true |

- **`daily_drip_count`는 전 티어 2편으로 확정됐다**(PRD 1.3·FR-14). 티어가 가르는 것은 드립 편수가 아니라 재생 한도(`daily_play_limit`)다. 미정으로 남은 것은 `price_krw`와 유료 티어의 `daily_play_limit`뿐이다.
  - **그래도 `daily`·`pro` 행은 아직 만들 수 없다.** 편수는 확정됐지만 나머지 두 값이 비어 있어 행을 완성할 수 없다 — subscription 모듈에서 함께 넣는다.
- `daily_drip_count`는 어느 명세에도 없던 컬럼이다. `drip-scheduling.md`가 "서버 설정값"이라고만 해서 소유처가 없었으므로 `plans`에 둔다 — **배포 없이 조정할 정책값이기 때문이다**(시범 운영 중 2편 → 3편 같은 조정). 전 티어 값이 같아진 뒤에도 코드 상수로 옮기지 않는 이유가 이것이다.
- `offline_download_enabled`는 **두지 않는다.** 오프라인 저장이 P1 이연이라 지금 컬럼을 만들면 의미 없는 값이 채워진다.
- **무료 티어도 드립을 받는다**(PRD 미확정 3번 결정). `drip-scheduling.md` 4.1의 "`tier == free`면 편성하지 않음"은 폐기된 규칙이다.

### 8.2 `subscriptions`

```
subscriptions
  id                        uuid            PK
  user_id                   uuid            FK → users
  tier                      enum            light | daily | pro   (실제로는 daily | pro만 생성)
  store                     enum            app_store | play_store
  original_transaction_id   varchar         ★유니크 — 계정 간 중복 연결 방지
  latest_receipt            text
  status                    enum            active | grace | cancelled | expired | refunded
  is_auto_renew             boolean
  started_at                timestamptz
  expires_at                timestamptz
  cancelled_at              timestamptz     NULL

uq_subscriptions_original_transaction_id (original_transaction_id)
idx_subscriptions_user_id_status (user_id, status)
```

- **티어의 진실의 원천이다** (A-3). `users.tier`는 이 테이블을 반영한 캐시일 뿐이다.
- **무료 사용자는 행이 없다.** 행이 없으면 `light`로 간주한다.
- 실제 갱신 근거는 **스토어 서버 알림(S2S)**이다(`subscription.md` 4.3). 클라이언트가 보낸 값으로 티어를 바꾸지 않는다.
- `uq_subscriptions_original_transaction_id`가 하나의 스토어 구독이 여러 계정에 연결되는 것을 막는다.

**`status` 값의 의미** (확정 2026-08-08 — 프로필 구현 중 `cancelled`의 뜻이 정의된 곳이 없어 확정했다)

| 값 | 뜻 | 만료 전 접근 권한 | `is_auto_renew` |
|---|---|---|---|
| `active` | 정상 이용 중 | 있음 | 보통 `true` |
| `grace` | 결제 실패 유예 — 재청구를 기다리는 동안 혜택을 유지한다 | 있음 | `true` |
| `cancelled` | **해지 예약** — 사용자가 자동 갱신을 껐고 **만료일까지는 유효하다** | **있음** | `false` |
| `expired` | 기간이 끝나 만료됐다 | 없음 | `false` |
| `refunded` | **환불·철회** — 거래가 취소돼 **즉시 무효**다 | **없음** | — |

- **`cancelled`와 `refunded`를 반드시 구분한다.** 스토어마다 "cancel"이라는 단어가 다른 사건을 가리킨다 — Google Play의 `userCancellationTimeMillis`는 **해지 예약**(만료 전 유효)이고, Apple 영수증의 `cancellation_date`는 **환불·철회**(즉시 무효)다. 같은 단어를 그대로 받아 한 값에 담으면 **환불받은 사용자가 만료일까지 유료 혜택을 계속 쓴다.**
  - 따라서 S2S 연동은 스토어 필드명이 아니라 **위 표의 의미로 환산해 저장한다.** Apple의 `cancellation_date`는 `refunded`로, Play의 사용자 해지는 `cancelled`로 간다.
- **`cancelled`는 정의상 `is_auto_renew = false`다.** 두 값이 어긋난 행(`cancelled`인데 자동 갱신이 켜져 있음)은 생기지 않아야 하며, 생겼다면 S2S 환산이 잘못된 것이다.
- 화면에 보여줄 때는 이 raw 값을 그대로 내려주지 않고 **4분기로 정규화한다**(`profile-api.md` 4.1 — `free` / `subscribed` / `cancel_scheduled` / `grace`). 해지 예약 판정이 클라이언트마다 재작성되는 것을 막기 위해서다.

### 8.3 `purchase_intents`

```
purchase_intents
  id                        uuid            PK   ★멱등키
  user_id                   uuid            FK → users
  plan_id                   uuid            FK → plans
  platform                  enum            ios | android
  status                    enum            created | verified | failed

idx_purchase_intents_user_id_created_at (user_id, created_at DESC)
```

- 결제 버튼 연타로 인한 중복 결제 요청을 막는 멱등키다(`paywall.md` 7).

### 8.4 `store_notification_logs`

```
store_notification_logs
  id                        bigserial       PK
  store                     enum            app_store | play_store
  notification_id           varchar         스토어가 부여한 ID
  type                      varchar
  payload                   jsonb
  processed_at              timestamptz     NULL

uq_store_notification_logs_store_notification_id (store, notification_id)
```

- 결제 재처리의 근거이므로 DB 테이블로 유지한다 (B-8).
- 유니크 제약이 **같은 알림의 중복 처리를 막는다.** 스토어는 같은 알림을 여러 번 보낼 수 있다.

---

## 9. 알림

### 9.1 `notification_logs`

```
notification_logs
  id                        bigserial       PK
  user_id                   uuid            FK → users
  type                      varchar
  deep_link                 varchar         NULL
  scheduled_at              timestamptz
  sent_at                   timestamptz     NULL
  status                    enum            scheduled | sent | failed | skipped
  skip_reason               enum            no_permission | toggle_off | daily_cap
  opened_at                 timestamptz     NULL

idx_notification_logs_user_id_scheduled_at (user_id, scheduled_at DESC)
```

- **중복 발송 방지에 필요하므로** 구조화 로그가 아니라 DB 테이블로 유지한다 (B-8).
- `skip_reason`에서 `free_tier`를 **제거했다.** 무료 티어도 드립을 받으므로(PRD 미확정 3번) 이 사유가 발생하지 않는다.
- `skip_reason`에서 `quiet_hours`도 **제거했다**(합의 2026-08-06 — `notification.md` 4.3). 방해금지 개념 자체를 폐기했으므로(전역·사용자별 모두) 이 사유가 발생하지 않는다. 드립 도착은 순수 정보성 알림이라 편성 직후(05:00 확정 배치) 야간 제한 없이 발송한다.
- **탈퇴 시 즉시 파기한다.** 보존해야 할 법령 근거가 없고(개인정보보호법 제21조 제1항 — 원칙은 파기), 이 테이블의 목적인 중복 발송 방지는 탈퇴한 사용자에게 성립하지 않는다. 발송량·개봉률 같은 운영 지표가 필요하면 개인 식별자가 없는 집계로 따로 남긴다.

---

## 10. 파트너

> 발행 전 검수(`PartnerReview`)는 **삭제했다.** A-6에서 업로드 즉시 발행으로 정했으므로 검수 결과를 반영할 상태(`partner_review`)가 `contents.status`에 존재하지 않는다.

### 10.1 `partners`

```
partners
  id                        uuid            PK
  name                      varchar
  contract_starts_at        timestamptz
  contract_expires_at       timestamptz
  revenue_share_rate        float           매출 % 풀 방식 (PRD 7)
  contact_email             varchar
  status                    enum            active | suspended | terminated   (C-5)
```

- `requires_review` 컬럼은 두지 않는다(발행 전 검수 폐기).

### 10.2 `content_control_requests`

```
content_control_requests
  id                        uuid            PK
  partner_id                uuid            FK → partners
  action                    enum            exclude | withdraw | restore
  target_content_ids        jsonb           uuid[]
  reason                    text            NULL
  effective_at              timestamptz
  requested_by              varchar
  requested_at              timestamptz
  status                    enum            pending | applied | failed
  applied_at                timestamptz     NULL
  applied_surfaces          jsonb           어느 노출면까지 반영됐는지

idx_content_control_requests_partner_id_requested_at (partner_id, requested_at DESC)
```

- FR-32는 P0다. **회수는 계약 이행 수단이므로 반영 로직 자체는 반드시 구현한다**(`partner-control.md` 2). MVP에서 파트너 포털을 만들지 않고 운영자가 대행하더라도 요청 이력은 남긴다.
- 회수 처리 결과는 `contents.status = withdrawn` + `withdrawn_at`에 반영된다.

### 10.3 `audit_logs`

```
audit_logs
  id                        bigserial       PK
  actor                     varchar
  action                    varchar
  target                    varchar
  before                    jsonb           NULL
  after                     jsonb           NULL

idx_audit_logs_target_created_at (target, created_at DESC)
```

- 파트너 통제·결제 관련 변경의 감사 근거다. DB 필수 (B-8).

---

## 11. 보존 아카이브

> 탈퇴 후에도 법령에 따라 보존해야 하는 데이터를 담는다. **개인정보보호법 제21조 제3항**이 "파기하지 아니하고 보존하여야 하는 경우에는 해당 개인정보를 **다른 개인정보와 분리하여서 저장·관리**하여야 한다"고 규정하므로, 운영 테이블과 **별도 DB 스키마(`archive`)** 에 둔다.

### 11.1 공통 규칙

- **아카이브 대상은 결제 이력이 있는 탈퇴 사용자뿐이다.** 결제 이력이 없으면 세 테이블 어디에도 행을 만들지 않고 전량 즉시 파기한다([12.3](#123-회원-탈퇴-처리)). 보존을 허용하는 근거가 거래기록이므로, 거래가 없으면 이 스키마에 들어올 자격 자체가 없다.
- **이 스키마는 익명 데이터가 아니라 "개인정보 보존 영역"이다.** `archived_users`가 거래 주체 식별 정보(전자우편주소·제공자 계정 ID)를 평문으로 보존하기 때문이다 — 근거는 [12.2](#122-법적-근거) 참조.
- 따라서 **접근 통제를 운영 테이블과 다르게 건다.** 애플리케이션의 일반 조회 경로에서 이 스키마를 읽지 않는다. 읽는 경우는 (a) 재가입 시 구독 복원 판정, (b) 분쟁·감사 대응, (c) 보존 만료 파기 배치 셋뿐이며, 모든 조회를 `audit_logs`에 남긴다.
- **`users`를 참조하는 FK를 두지 않는다.** 원본 행이 이미 파기되었기 때문이다. 아카이브 테이블끼리는 `user_hash`로 연결한다.
- **`archived_at`이 보존 시작일이다.** 파기 배치는 `archived_at < now() - interval '5 years'`로 대상을 찾는다. 만료일 컬럼을 따로 두지 않는다(파생값 — [1.5](#15-파생값을-컬럼으로-두지-않는다)).
- 아카이브 테이블은 **append-only**다. 이관 후 갱신하지 않는다.

### 11.2 `user_hash` 생성 규칙

```
user_hash = HMAC-SHA256(key = <pepper>, message = user_id)
```

**pepper를 두 개로 분리한다.**

| pepper | 사용처 | 목적 |
|---|---|---|
| `ARCHIVE_HASH_PEPPER` | `archived_users` · `archived_consents` · `archived_subscriptions` | 아카이브 테이블 간 **조인 키** |
| `WITHDRAWAL_HASH_PEPPER` | `withdrawal_logs` | **연결 차단** |

- `withdrawal_logs`를 다른 키로 만드는 이유: `archived_users`가 식별 정보를 갖게 되었으므로, 같은 키를 쓰면 **탈퇴 사유가 특정 개인과 연결된다.** `auth.md` 6이 이 테이블을 "식별자 없음"으로 설계한 의도가 깨진다. 탈퇴 사유는 집계 목적이라 개인 연결이 필요 없다.
- **단순 `SHA256(user_id)`를 쓰지 않는다.** `user_id`는 UUID라 공간이 넓지만, 운영 DB 스냅샷이나 백업에서 살아 있는 `user_id` 목록을 얻은 사람은 전부 해시해서 대조하면 탈퇴자를 역추적할 수 있다. **키가 있어야 대조가 불가능해진다.**
- 두 pepper 모두 **시크릿 매니저에 보관한다.** 코드·설정 파일·DB·로그 어디에도 남기지 않는다(`convention.md` 8.4).
- **정기 로테이션하지 않는다.** 키를 바꾸면 그 시점 이후 기록이 과거 기록과 연결되지 않아 조인이 끊긴다. 이 값은 비밀번호 해시가 아니라 **식별자 대체값**이므로 회전의 이득이 없다.

**키가 유출된 경우에만** 교체하며, 이때를 위해 모든 테이블이 `user_hash_version`을 갖는다.

- 기존 행은 **재계산하지 않는다.** 원본 `user_id`가 이미 없으므로 재계산이 불가능하다.
- 새 키로 만든 행은 `user_hash_version = 2`로 기록한다.
- 조인은 **같은 버전끼리만** 성립한다. 버전이 다른 행을 같은 사용자로 묶으려 시도하지 않는다.
- 키 교체는 `audit_logs`에 남긴다.

### 11.3 `archived_users`

```
archived_users
  id                        uuid            PK
  user_hash                 varchar         아카이브 테이블 간 조인 키
  user_hash_version         smallint        DEFAULT 1
  email                     varchar   NOT NULL  ★거래 주체 식별 정보 (법 제6조 제2항)
  provider                  enum            kakao | google | naver
  provider_user_id          varchar         ★재가입 매칭·보조 식별 수단
  tier                      enum            탈퇴 시점 티어
  joined_at                 timestamptz     원래 users.created_at
  withdrawn_at              timestamptz
  archived_at               timestamptz     ★보존 시작일

uq_archived_users_user_hash (user_hash)
idx_archived_users_email
idx_archived_users_archived_at
```

**식별 정보를 보존하는 이유** — 전자상거래법 제6조 제2항이 보존 가능한 개인정보를 이렇게 한정한다:

> 성명·주소·**전자우편주소** 등 **거래의 주체를 식별할 수 있는 정보**만 해당

거래기록은 "누구와의 거래인가"가 특정되어야 기록으로서 기능한다. 5년 뒤 소비자가 결제 분쟁을 제기했을 때 해시만 남아 있으면 그 사람의 거래기록을 찾아 제시할 수 없다. 원본 `user_id`가 이미 파기되어 해시를 재계산할 수도 없다.

- **`email`은 `NOT NULL`이다.** 아카이브 대상이 결제 이력이 있는 사용자로 한정되고([11.1](#111-공통-규칙)), 결제는 인증된 이메일 없이 시작되지 않기 때문이다(`auth.md` 4.4). 따라서 "식별 수단이 없는 아카이브 행"은 생기지 않는다.
  - 이관 시 `users.email IS NULL`이면 **탈퇴 트랜잭션을 실패시킨다.** 결제 이력이 있는데 이메일이 없다는 것은 4.4의 게이트가 뚫렸다는 뜻이므로, 조용히 `NULL`을 넣어 넘기지 않는다.
- `provider` + `provider_user_id`는 **재가입 시 매칭과 보조 식별용**으로 함께 보존한다. 이메일은 사용자가 바꿀 수 있지만 이 조합은 고정이다.
- **`nickname`은 담지 않는다.** 변경·중복이 가능해 "거래의 주체를 식별할 수 있는 정보"로 기능하지 않는다. 조문의 "만 해당"은 범위를 넓히는 표현이 아니라 좁히는 표현이다.
- **주소는 애초에 수집하지 않는다.** 디지털 콘텐츠 구독이라 배송이 없다.
- **담지 않는 것**: `nickname` · 커리어(`job_category`·`job_title`·`years_of_experience`) · 온보딩 상태 · 관심사. 거래 주체 식별과 무관하므로 보존 근거가 없다(개인정보보호법 제21조 제1항).
- 보존 기간 **5년**.

### 11.4 `archived_consents`

```
archived_consents
  id                        uuid            PK
  user_hash                 varchar
  user_hash_version         smallint        DEFAULT 1
  consent_type              enum            terms | privacy | marketing
  version                   varchar         NULL
  is_agreed                 boolean
  agreed_at                 timestamptz
  archived_at               timestamptz     ★보존 시작일

idx_archived_consents_user_hash (user_hash)
idx_archived_consents_archived_at
```

- 탈퇴 시 `consents`의 전 이력을 **해시로 치환해 이관**한다(15.2 확정 사항).
- 동의 획득 사실의 입증 책임이 사업자에게 있으므로, 탈퇴했다고 지우면 과거 수집분에 대한 근거가 사라진다.
- 보존 기간 **5년**.

### 11.5 `archived_subscriptions`

```
archived_subscriptions
  id                        uuid            PK
  user_hash                 varchar
  user_hash_version         smallint        DEFAULT 1
  original_transaction_id   varchar         ★재가입 시 복원 판정 근거
  store                     enum            app_store | play_store
  tier                      enum            light | daily | pro
  status                    enum            active | grace | cancelled | expired | refunded
  started_at                timestamptz
  expires_at                timestamptz
  cancelled_at              timestamptz     NULL
  archived_at               timestamptz     ★보존 시작일

uq_archived_subscriptions_original_transaction_id (original_transaction_id)
idx_archived_subscriptions_user_hash (user_hash)
idx_archived_subscriptions_archived_at
```

- **`latest_receipt`은 이관하지 않는다.** 개인정보가 포함될 수 있고, 재검증이 필요하면 `original_transaction_id`로 스토어 API를 호출하면 된다.
- `original_transaction_id` 유니크가 **하나의 스토어 구독이 여러 계정에 연결되는 것을 계속 막는다.** 탈퇴 후 재가입해도 마찬가지다.
- 보존 기간 **5년** — 전자상거래법 시행령 제6조(대금결제 및 재화 등의 공급에 관한 기록 5년, 계약 또는 청약철회 등에 관한 기록 5년).

---

## 12. 삭제 · 보존 정책

### 12.1 운영 중 삭제 정책

`architecture.md` 6 — 기본은 hard delete이며, 이력이 필요한 경우만 soft delete를 쓴다.

| 테이블 | 정책 | 근거 |
|---|---|---|
| `library_items` | **soft** (`deleted_at`) | 삭제 후 [실행 취소] 지원, 재적립 방지 근거 |
| `contents` | **soft** (`status = withdrawn` + `withdrawn_at`) | 파트너 회수 이력 |
| `sessions` | **soft** (`revoked_at`) | 폐기 이력 |
| `device_tokens` | **soft** (`invalidated_at`) | 발송 실패 원인 추적 |
| `user_interests` | **soft** (`is_active`, `deactivated_at`) | 재활성화 가능 |
| `email_verifications` | **hard** — 만료 24시간 후 배치 삭제 | 인증 목적 종료 후 보관 근거 없음 ([3.7](#37-email_verifications)) |
| `first_drip_jobs` | **hard** — `completed_at` 30일 후 배치 삭제 | 온보딩 1회성 작업 기록. 지표는 구조화 로그로 빠진다 ([7.4](#74-first_drip_jobs)) |
| 나머지 | hard | |

### 12.2 법적 근거

> **이하는 조문 확인 결과이며, 실제 적용 범위는 법무 검토가 필요하다.**

**개인정보보호법 제21조** — 보존 정책의 뼈대다.

> **제1항** 개인정보처리자는 (…) 그 개인정보가 불필요하게 되었을 때에는 **지체 없이 그 개인정보를 파기**하여야 한다. **다만, 다른 법령에 따라 보존하여야 하는 경우에는 그러하지 아니하다.**
>
> **제3항** 제1항 단서에 따라 (…) 보존하여야 하는 경우에는 해당 개인정보 또는 개인정보파일을 **다른 개인정보와 분리하여서 저장·관리**하여야 한다.

- **원칙은 파기다.** "혹시 몰라서 남긴다"는 허용되지 않는다. 보존하려면 근거 법령을 댈 수 있어야 한다.
- 제3항 때문에 보존 대상을 운영 테이블에 그대로 두면 안 된다 → [11장 아카이브 스키마](#11-보존-아카이브).

**전자상거래법 제6조 · 시행령 제6조** — 결제 이력을 보존하는 근거다.

| 보존 대상 | 기간 |
|---|---|
| 표시·광고에 관한 기록 | 6개월 |
| 계약 또는 청약철회 등에 관한 기록 | **5년** |
| 대금결제 및 재화 등의 공급에 관한 기록 | **5년** |
| 소비자의 불만 또는 분쟁처리에 관한 기록 | 3년 |

**법 제6조 제2항**은 보존할 수 있는 개인정보의 범위까지 정한다.

> 사업자가 보존하는 거래기록 및 그와 관련된 **개인정보**(성명·주소·**전자우편주소** 등 **거래의 주체를 식별할 수 있는 정보**만 해당)는 **소비자가 개인정보의 이용에 관한 동의를 철회하는 경우에도 이를 보존할 수 있다.**

- 탈퇴 시 결제 이력과 **거래 주체 식별 정보**를 남기는 직접 근거다 → `archived_users`가 전자우편주소·제공자 계정 ID를 보존하는 이유([11.3](#113-archived_users)).
- 동시에 **범위를 좁히는 조문이다.** "거래의 주체를 식별할 수 있는 정보만 해당"이므로 닉네임·커리어·관심사처럼 식별과 무관한 필드는 보존 대상이 아니다.
- **조문이 보존을 허용하는 대상은 "거래기록 및 그와 관련된 개인정보"다.** 거래가 없으면 보존 대상이 성립하지 않으므로, **결제 이력이 없는 탈퇴 사용자는 이 근거를 쓸 수 없다.** 이 경우 제21조 제1항 본문(지체 없는 파기)으로 되돌아간다 → [12.3](#123-회원-탈퇴-처리)의 분기.
  - "혹시 재가입할 수도 있으니까" · "분쟁이 생길 수도 있으니까"는 근거가 아니다. 제21조 제1항 단서는 **다른 법령의 보존 의무**를 요구하며, 가능성은 법령이 아니다.

**시행령 제6조 — 별도 보존 의무**

> 사업자가 개인정보의 이용에 관한 동의를 **철회한 소비자**의 거래기록 및 개인정보를 보존하는 경우에는, **철회하지 아니한 소비자**의 거래기록 및 개인정보와 **별도로 보존**하여야 한다.

- 개인정보보호법 제21조 제3항(분리 저장)과 같은 요구가 전자상거래법에도 있다. **아카이브를 별도 스키마로 분리한 설계가 두 조문을 동시에 충족한다.**
- 거래기록을 보존하지 않거나 열람 방법을 제공하지 않으면 **500만원 이하의 과태료** 대상이다.

**정보통신망법 제50조 제8항 · 시행령 제62조의3** — 마케팅 수신 동의는 **동의를 받은 날부터 2년마다** 수신동의 여부를 확인해야 한다. `consents.agreed_at`이 기산점이다.

**적용되지 않는 것**

- **전자금융거래법** — 의무 주체가 금융회사·전자금융업자다. 인앱결제만 쓰는 이 서비스는 해당하지 않는다. 자체 PG나 선불수단(포인트·캐시)을 도입하면 그때 검토한다.
- **개인정보 유효기간제** — 2023년 9월 15일 시행 개정으로 **폐지되었다.** 1년 미접속 사용자를 파기·분리 보관할 의무가 없고, 오히려 사용자가 탈퇴하지 않는 한 임의로 삭제할 수 없다. **따라서 휴면 계정 상태나 미접속 기반 파기 배치를 만들지 않는다.**

### 12.3 회원 탈퇴 처리

**전제** — 활성 구독이 있는 사용자는 **구독 만료에 동의한 뒤에만 탈퇴할 수 있다.** 스토어 구독은 앱 탈퇴로 자동 해지되지 않으므로(`auth.md` 4.3), 탈퇴 화면에서 스토어 해지 안내와 만료 동의를 받는다.

**처리는 결제 이력 유무로 갈린다.** 판정 기준은 **`subscriptions` 행의 존재 여부** 하나다.

- 무료(`light`)는 구독 행이 생기지 않으므로([1.3](#13-티어)), 행이 하나라도 있으면 결제 이력이 있는 것으로 본다.
- `status`는 보지 않는다. `refunded` · `expired` · `cancelled`도 모두 거래기록이다.
- 판정은 **탈퇴 트랜잭션 안에서** 한다. 안내 화면에 내려준 값을 클라이언트가 되돌려 보내는 방식을 쓰지 않는다.

**결제 이력이 있는 사용자**

| 처리 | 대상 |
|---|---|
| **아카이브 후 파기** (5년) | `users` → `archived_users`, `consents` → `archived_consents`, `subscriptions` → `archived_subscriptions` |
| **즉시 파기** | `library_items`, `playback_progresses`, `play_records`, `user_signals`, `source_link_clicks`, `user_interests`, `user_settings`, `device_tokens`, `sessions`, `user_preference_vectors`, `drip_excluded_contents`, `purchase_intents`, `notification_logs`, `email_verifications`, `first_drip_jobs`, `idempotency_keys`(해당 사용자 `owner_key`) |
| **그대로 유지** | `withdrawal_logs`(원래 해시만), `store_notification_logs`(개인 식별자 없음), `content_stats`(집계값) |

**결제 이력이 없는 사용자 — 아카이브 없이 전량 즉시 파기**

| 처리 | 대상 |
|---|---|
| **즉시 파기** | 위 즉시 파기 목록 **전부 + `users` + `consents`** |
| **아카이브** | **없음.** `archived_users` · `archived_consents` · `archived_subscriptions` 어디에도 행을 만들지 않는다 |
| **그대로 유지** | `withdrawal_logs`, `store_notification_logs`, `content_stats` |

- 근거: **제21조 제1항의 원칙은 파기이며, 보존은 다른 법령에 근거가 있을 때만 허용되는 예외다**([12.2](#122-법적-근거)). 거래가 없으면 전자상거래법 시행령 제6조가 보존을 허용하는 대상이 존재하지 않으므로, 5년 보관은 그 자체가 제21조 제1항 위반이 된다.
- `consents`도 함께 파기한다. 동의 이력의 보존 근거는 거래기록이 아니라 **동의 획득의 입증 책임**인데, 이는 법령상 보존 의무가 아니므로 제21조 제1항 단서에 해당하지 않는다.
  - 다만 이 판단은 **법무 확인 대상이다**([15.1](#151-남아-있는-결정)). 입증 책임을 우선한다는 결론이 나오면 동의 이력만 예외로 남기도록 바꾼다.
- `withdrawal_logs`는 두 경우 모두 남긴다. 별도 pepper로 만든 해시라 개인을 식별하지 않는다([11.2](#112-user_hash-생성-규칙)).

**공통**

- 탈퇴 처리는 **하나의 트랜잭션**에서 이관 + 파기를 수행한다. 이관만 되고 파기가 실패하면 개인정보가 두 곳에 남는다.
- `users` 행은 **두 경우 모두 삭제한다.** `status = withdrawn`으로 남겨두지 않는다 — 남기면 제21조 제3항의 분리 저장 요건을 충족하지 못한다.
- 아카이브 이관 시 `users.email IS NULL`이면 **트랜잭션을 실패시킨다**([11.3](#113-archived_users)). 결제 이력이 있는데 이메일이 없다는 것은 `auth.md` 4.4의 게이트가 뚫렸다는 뜻이다.
- 재가입 시에는 **신규 계정으로 온보딩부터 시작한다**(`auth.md` 7). 이전 계정은 복원되지 않는다.
- 다만 **구독 권한은 복원된다.** 복원은 계정이 아니라 영수증의 `original_transaction_id`로 판정하므로, `archived_subscriptions`만 있으면 새 계정에 티어를 붙일 수 있다.
- `purchase_intents`는 결제 멱등키일 뿐이고 결제 결과는 `subscriptions`에 남으므로 아카이브하지 않는다.

### 12.4 보존 만료 파기

- 파기 배치가 `archived_at < now() - interval '5 years'`인 행을 찾아 **hard delete** 한다.
- 보존 기간이 지난 데이터를 계속 들고 있는 것도 제21조 제1항 위반이다. 아카이브는 "영구 보관"이 아니라 "기한부 보관"이다.
- 파기 실행 기록은 `audit_logs`에 남긴다.

---

## 13. 테이블에 두지 않는 것

### 13.1 클라이언트 로컬 전용

| 개체 | 출처 | 비고 |
|---|---|---|
| `OfflineItem` | `offline-download.md` | 로컬 DB |
| `OfflineLicense` | `offline-download.md` | 로컬 서명 검증 |
| `SearchHistory` | `explore.md` | 로컬 |
| `PendingRequest` | `common-error-handling.md` | 로컬 재시도 큐 |
| `NetworkState` | `common-error-handling.md` | 클라이언트 전역 상태 |

### 13.2 응답 규격 (DTO)

| 개체 | 출처 |
|---|---|
| `ExploreFeed` | `explore.md` — 섹션 조립 응답 |
| `ApiError` | `common-error-handling.md` — 에러 응답 규격 |

### 13.3 배포 설정으로 관리

| 개체 | 출처 | 관리 방법 |
|---|---|---|
| `AppConfig` | `splash.md` 6 | **테이블로 만들지 않는다.** 최소 지원 버전(FR-35)·최신 버전·점검 공지는 배포 설정(환경 변수 / 설정 파일)에서 관리하고, 서버가 조회 API로 내려준다 |

- 값이 바뀌는 시점이 곧 배포 시점이라 DB에 둘 이유가 없다. 관리자 화면도 필요 없어진다.
- **플랫폼(iOS/Android)별로 값을 나눠야 한다.** 스토어 심사 주기가 달라 최소 지원 버전이 동시에 올라가지 않는다.
- 점검 공지를 배포 없이 켜야 하는 요구가 생기면 그때 테이블로 승격한다.
- **`latest_version` · `min_supported_version`의 원천이 배포 설정이라는 결정은 그대로 유효하다**(합의 2026-08-06 — `splash.md` 6, `settings.md` 4.1). 스플래시의 강제·권장 업데이트 판정과 설정 화면의 앱 버전 표시·[업데이트] 노출 판정이 **같은 원천을 쓰고, 판정은 서버가 한다.**

### 13.4 구조화 로그로 대체 (B-8)

| 개체 | 대체 |
|---|---|
| `InterestChangeLog` | 관심사 변경 시 구조화 로그 + 분석 도구 |
| `PaywallEvent` | 페이월 노출·전환 시 구조화 로그 + 분석 도구 |

---

## 14. 폐기된 개체

| 개체 | 폐기 사유 |
|---|---|
| `PlaybackSession` | A-1 — `playback_progresses`로 통합 |
| `LibraryItem.resume_position_sec` | A-1 — 재생 위치는 `playback_progresses`가 단독 소유 |
| `User.daily_play_count` · `count_reset_at` | A-2 — 파생값. `play_records` 집계로 대체 |
| `User.entitlements_cache` | A-3 — 캐시 두 겹 금지. `plans`에서 조립 |
| `UserCareer` | C-2 — `users`에 병합 |
| `LibraryItem.deleted_reason` | A-4 — 삭제 경로를 구분하지 않기로 결정 |
| `DripSchedule` | A-5 — `drip_excluded_contents` + `library_items.source`로 대체 |
| `SourceDocument` · `Episode` · `Script` · `QaReport` · `PipelineRun` | A-6 — 파이프라인 미운영. 시리즈 정보는 `contents`로 흡수 |
| `UserPlayerSetting` · `UserInterestSetting` · `NotificationSetting` · `UserOfflineSetting` | B-1 — `user_settings`로 통합 |
| `WithdrawnContent` | B-3 — `contents.status = withdrawn` 조회로 대체 |
| `AudioAccessToken` | B-4 — `audio_access_logs`로 통합 |
| `PartnerReport` | B-6 — `content_stats` + `partner_id` 필터로 산출 |
| `PartnerReview` | A-6 — 발행 전 검수 단계 소멸 |
| `Topic.content_count` | B-7 — 조회 시 집계 |
| `OfflineDownloadRecord` | PRD 2번 — 오프라인 저장 P1 이연 |
| `UserSignal.action` 중 `seek` · `rate_change` · `share` · `manual_complete` | A-7 — 추천 스코어링 미사용 |
| `AppConfig` | 13.3 — 배포 설정에서 관리 |
| `Content.status` 중 `superseded` | 15.2 — 재발행 시 같은 행의 `content_version`을 올리므로 불필요 |
| `Content`의 검수 완료 확인 필드 | 합의 2026-08-06 — 업로드 검증이 체크 누락을 거부하므로 항상 참인 값. 이행 기록은 `audit_logs`의 업로드 기록이 담당 (5.1) |
| 방해금지 설정 필드 · 전역 방해금지 시간대 | 합의 2026-08-06 — 방해금지 개념 자체 폐기(`notification.md` 4.3). 순수 정보성 알림이라 야간 제한 없음 |
| `NotificationLog.skip_reason` 중 `quiet_hours` · `free_tier` | 방해금지 폐기 · 무료 티어 드립 수신으로 발생하지 않는 사유 (9.1) |

**테이블 수**: MVP 필수 **34개** (+ P1 `topic_adjacencies`).

| 영역 | 개수 | 테이블 |
|---|---|---|
| 계정·인증 | 7 | `users` `consents` `sessions` `withdrawal_logs` `user_settings` `device_tokens` `email_verifications` |
| 관심사 | 2 | `topics` `user_interests` |
| 콘텐츠 | 4 | `contents` `content_topics` `content_scripts` `content_stats` |
| 라이브러리·재생 | 6 | `library_items` `playback_progresses` `play_records` `user_signals` `audio_access_logs` `source_link_clicks` |
| 편성 | 4 | `drip_excluded_contents` `user_preference_vectors` `drip_batch_runs` `first_drip_jobs` |
| 구독·결제 | 4 | `plans` `subscriptions` `purchase_intents` `store_notification_logs` |
| 알림 | 1 | `notification_logs` |
| 파트너 | 3 | `partners` `content_control_requests` `audit_logs` |
| 보존 아카이브 | 3 | `archived_users` `archived_consents` `archived_subscriptions` |

---

## 15. 미결 사항

### 15.1 남아 있는 결정

| # | 항목 | 내용 |
|---|---|---|
| 1 | **유료 티어 값** | `plans.daily_play_limit` · `price_krw`의 `daily`/`pro` 값이 미정. 1~2주 시범 운영 후 확정. **`daily_drip_count`는 전 티어 2편으로 확정됐다**(PRD 1.3·FR-14) — 미정 대상에서 제외한다. **컬럼은 이미 있으므로 값만 채우면 되고 마이그레이션은 필요 없다.** |
| 2 | **결제 이력 없는 사용자의 `consents` 파기 — 법무 확인** | [12.3](#123-회원-탈퇴-처리)에서 `archived_consents`도 함께 파기하기로 했다. 동의 획득의 입증 책임은 사업자에게 있으므로, 탈퇴자가 나중에 동의 사실을 다투면 반박 근거가 남지 않는다. **입증 책임과 제21조 제1항 중 어느 쪽이 우선하는지 확인이 필요하다.** 보존이 필요하다는 판단이 나오면 `archived_consents`만 예외로 남긴다 — 스키마 변경은 없고 12.3의 분기만 바뀐다. |
| 3 | **계정 단위 발송 상한(백스톱)** | [3.7](#37-email_verifications)의 발송 제한이 `(user_id, email)` 단위이므로 **계정 단위 총량 제한이 없다.** 주소를 갈아 끼우면 한 계정의 발송량에 상한이 없어 메일 발송기로 악용될 수 있다. 상한을 둘지, 둔다면 저장소를 어디로 할지(같은 테이블 집계 / Redis 카운터) 결정 필요. 발신 도메인 평판이 걸린 문제다 — `auth.md` 미결 사항 참조. |
| 4 | **`users.years_of_experience` 타입 불일치** | [3.1](#31-users)은 `int`인데 `onboarding.md` 3장의 입력은 **구간 enum**(1년 미만 / 1–3년 / 4–6년 / 7년 이상)이다. 현재는 구간 하한값(0·2·4·7)으로 저장하는 것으로 읽히는데, **매핑이 문서 어디에도 없어 구간을 조정하면 기존 값의 의미가 조용히 바뀐다.** 구간 enum으로 바꾸거나, `int`를 유지하되 매핑을 이 문서에 못박아야 한다. |
| 5 | ~~`drip_excluded_contents.reason`에 온보딩 담기 값이 없다~~ | **해소 (2026-08-06)** — **reason에 `onboarding`을 추가하지 않는다.** 온보딩 담기는 이 테이블에 행을 만들지 않는다: 중복 적립은 `library_items (user_id, content_id)` 유니크가 막고, 후보 필터 첫 줄(`library_items` 행 존재)이 담기분을 이미 제외하며, 삭제 시에는 `library_delete` 사유가 커버한다 → [7.1](#71-drip_excluded_contents). `onboarding.md` 6장의 주석도 이 결론으로 갱신 완료(2026-08-06). |
| 6 | ~~추천 세트 스냅샷 저장소 없음~~ | **해소 (2026-08-06)** — 사용자·세션 단위 고정(랜덤 배치 + 시드 고정) 규칙 자체가 폐기됐다(`features/README.md` 결정 #12, `onboarding.md` 4장). 표본 크기와 무관하게 같은 선정 기준으로 정렬한 상위를 노출하므로 결과가 결정론적이고, 스냅샷·캐시가 필요 없다. |
| 7 | **비동기 재시도 큐 미정** | [7.4](#74-first_drip_jobs)의 `queued`가 넘기는 대상이며 `onboarding.md`의 최종 폴백 경로인데, 큐 인프라 자체가 `architecture.md` 미결이다. 미정인 채로는 `queued` 상태가 종착지 없이 남는다. |
| 8 | **`ai_generated` 근거 소스 목록·정책 확인 기록 필드 도입 여부** | 적법 수집 확인(FR-11)은 업로드 전 수동 확인뿐이고 확인 기록이 시스템에 남지 않는다(`admin.md` 4.2-1 미결). `source_name` 표기 문자열([5.1](#51-contents))은 고지용이지 소스 단위 기록이 아니다. 소스 단위 테이블로 승격할지, 감사 로그로 충분한지 결정 필요. |
| 9 | **사용자 단위 청취 통계 집계 테이블 신설 여부** | 프로필 통계(`profile.md` 4.5~4.7)는 전부 파생값이라 컬럼을 두지 않는다([1.5](#15-파생값을-컬럼으로-두지-않는다) · [6.3](#63-play_records)). 다만 연속 일수·주제 분포는 매 조회 집계 비용이 사용자 이력에 비례하므로, 집계 캐시 테이블(또는 구체화 뷰)을 둘지는 실측 후 백엔드가 판단한다. 캐시를 두는 경우에도 진실의 원천은 `play_records`다. |

### 15.2 회의에서 확정된 사항 (반영 완료)

| 항목 | 결정 | 반영 위치 |
|---|---|---|
| `total_listen_sec` 원천 | 재생 종료 시 **실제 경과 시간을 별도 기록** | `play_records.listened_sec` (6.3), `content_stats.total_listen_sec` (5.4) |
| `content_version` 증가 방식 | **같은 행의 버전을 올린다** | 5.1 — `status`에서 `superseded` 제거 |
| 탈퇴 시 `consents` | **해시 보존** — 단 결제 이력이 있는 사용자만 | `archived_consents` (11.4), 12.3 |
| 탈퇴 시 `subscriptions` | 구독 만료 동의 후 탈퇴, **5년 보존 후 파기** | `archived_subscriptions` (11.5), 12.3 |
| 탈퇴 시 유저 데이터 | 별도 테이블로 **5년 보존 후 파기** — 단 결제 이력이 있는 사용자만 | `archived_users` (11.3), 12.3 |
| **결제 이력 없는 탈퇴자** | **아카이브하지 않고 전량 즉시 파기.** 거래가 없으면 전자상거래법 시행령 제6조의 보존 대상이 성립하지 않으므로, 개인정보보호법 제21조 제1항의 원칙(지체 없는 파기)으로 돌아간다. 판정 기준은 `subscriptions` 행의 존재 여부 | 11.1, 12.2, 12.3 |
| 온보딩 첫 드립 상태 저장소 | **`first_drip_jobs` 신설.** 0건 담기 사용자의 완료 대기 로딩이 폴링할 대상이다. `drip_batch_runs`는 `run_date` 유니크라 대신할 수 없고, `library_items` 유무만으로는 `pending`과 `no_candidates`를 구분할 수 없다 | 7.4 |
| 라이브러리 목록 인덱스 | **커서 tie-break용 `id` 추가**(같은 트랜잭션에서 2편이 적립되므로 `added_at` 동률이 매일 발생), **미니플레이어 복원용 `last_played_at` 인덱스**, **회수 반영용 `content_id` 인덱스** 신설. 회수 필터·주제 필터는 기존 인덱스로 충분해 추가하지 않는다 | 6.1 |
| 이메일 인증 저장소 | **`email_verifications` 신설.** 코드 해시·만료·검증 시도·마지막 시도 시각을 서버가 판정한다. 발송 5회 제한은 `(user_id, email)` 단위이며 `send_seq`로 창을 판정한다 | 3.7 |
| 제공자 이메일 인증 여부 | **`users.is_email_verified`로 분리 저장.** 카카오는 `is_email_valid`·`is_email_verified`가 **둘 다 true일 때만** 인증으로 보고, `is_email_valid = false`(마스킹 주소)면 `email = NULL`로 둔다 | 3.1 |
| `consents` 구조 | **`consent_type` 축으로 분리** | 3.2 |
| `AppConfig` | **배포 설정에서 관리** | 13.3 — 테이블 폐기 |
| `content_stats` 배치 소유 | **`playback` 모듈이 실행**, `content` Service에 기록 위임 | 2장 |
| `notification_logs` 탈퇴 처리 | **즉시 파기** — 보존 근거가 없고, 중복 발송 방지 목적이 탈퇴자에게 성립하지 않는다 | 9.1, 12.3 |
| `user_hash` 생성·키 관리 | **HMAC-SHA256 + 시크릿 매니저 pepper, 정기 로테이션 없음.** 유출 시에만 교체하고 `user_hash_version`으로 세대를 구분. `withdrawal_logs`는 **별도 pepper**로 연결을 차단 | 11.2 |
| 아카이브 보존 범위 | **전자우편주소 + 제공자 계정 ID를 평문 보존.** 전자상거래법 제6조 제2항이 "거래의 주체를 식별할 수 있는 정보"를 보존 대상으로 명시한다. 닉네임·커리어·관심사는 제외 | 11.3, 12.2 |
| 무료 티어 정책 | **의도한 설계다.** 드립은 추천·자동 적립일 뿐이며, 탐색에서 직접 담은 콘텐츠도 재생 한도 안에서 들을 수 있다. 드립받은 것을 반드시 들어야 하는 구조가 아니다 | — |

**2026-08-06 합의·개정 반영분**

| 항목 | 결정 | 반영 위치 |
|---|---|---|
| 검수 완료 확인 이행 기록 | **`contents` 컬럼을 만들지 않는다.** 업로드 검증이 체크 누락을 거부해 항상 참인 값이 되므로, 이행 증적은 `audit_logs`의 업로드 기록(actor·시각·입력값)이 담당한다 | 5.1, 14장 |
| 출처 필드 `origin` 분기 | `ai_generated`는 `author_name`·`source_url` 선택, `source_name`은 "참고한 자료" 표기(복수 가능 — 표기 문자열, 정규화하지 않음). 파트너 필수 고지는 `chk_contents_partner_disclosure`로 이중 방어 | 5.1 |
| `topics.is_visible` 기본값 | **`false`** — 콘텐츠 수급 후 노출을 시작한다. 노출 통제는 신규 주제 공개 전 단계 전용 | 4.1 |
| 재청취 수 집계 | **`content_stats.replay_count` 신설.** 원천은 `user_signals`의 `replay` 신호, 재집계 upsert | 5.4 |
| 원문 유입 클릭 적재 | **`source_link_clicks` 신설.** `user_signals`는 스코어링 전용(A-7)이라 넣지 않고, 정산 지표 재현성 때문에 구조화 로그로도 보낼 수 없다 | 6.6, 5.4, 2장, 12.3 |
| 마케팅 수신 동의 저장 구조 | **`consents`가 단독 소유.** `user_settings`에 토글 컬럼을 두지 않고, 2년 재확인 기산점은 최신 동의 행의 `agreed_at`, 재동의는 행 추가로 기록 | 3.2, 3.5 |
| 온보딩 담기의 제외 사유 | **reason에 `onboarding`을 추가하지 않는다** (충돌 #5 해소) | 7.1, 15.1-5 |
| 파트너 회수의 제외 사유 | **reason에 `withdraw`를 추가하지 않는다.** 회수는 사용자의 관심 없음 신호가 아니며, 복구·재발행 시 미수신 사용자에게 후보 복귀 | 7.1 |
| 프로필 청취 통계 | **전부 파생값 — 컬럼·테이블을 만들지 않는다.** 원천은 `play_records`(시간·연속 일수·주간·주제 분포)와 `library_items.status`(완청 고유 수). 집계 캐시 신설 여부만 15.1-9로 남김 | 1.5, 6.1, 6.3 |
| 방해금지 폐기 | 설정 필드 없음 유지, `notification_logs.skip_reason`에서 `quiet_hours` 제거 | 3.5, 9.1, 14장 |
| 이어 PICK 알림 명칭 | 사용자 노출명만 변경 — `user_settings.is_drip_notification_enabled` **컬럼명 유지** | 3.5 |
| 버전 정보 원천 | `latest_version`·`min_supported_version`은 **배포 설정이 원천**(13.3 서술과 정합 확인) — 설정 화면의 버전 표시·업데이트 판정도 같은 원천, 판정은 서버 | 13.3 |
