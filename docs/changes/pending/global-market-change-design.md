# global-api — 가입 뒤 콘텐츠 언어(시장) 전환 설계안 (BE · KAN-227)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/global-api.md` 2.1 "판정"·"전환" 행 · 4.1 "시장은 계정 생성 시점에만" · 4.3 `market` 읽기 전용 · 3장 표(신설 행) · 신설 4.11 · 5장 에러 코드 · 7장 · 8장 · 9장 미결 #1 · `backend/domain.md`(신설 `user_market_changes`) · `features/common-error-handling.md` 9장(신설 코드 2개 — FE 소유, 등재 요청) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 2026-10-19 (Highest — 티켓과 같이 **설계 착수 당일**. PM 결정 목표는 1.3.0 심사 제출(10-24) 전, 구현은 그 다음 버전) |
| 선행 | 없음 — 단 GLOBAL로의 전환은 GLOBAL 발행(AI KAN-204)과 운영 `GLOBAL_SIGNUP_ENABLED` 열림 뒤에만 열린다(아래 9번) |
| 중요도 | Highest(티켓과 같음 — 설계 착수 당일) |
| 관련 | [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) (`tickets/backend/pending/market-change-in-settings.md`) · FE [KAN-195](https://runtime364.atlassian.net/browse/KAN-195) |
| 상태 | **제안** — PM 결정이 필요한 항목(아래 "결정 요청")이 정해지면 global-api.md에 계약으로 옮기고 구현한다 |

## 배경

PM 결정(2026-10-19): 가입 뒤에는 설정에서 콘텐츠 언어(시장)를 바꿀 수 있게 한다. 지금 서버는 시장을 **불변으로 가정하고** 만들어져 있어, 컬럼 값만 바꾸면 아래처럼 깨진다. 이 문서는 현재 코드를 조사한 사실(파일 위치는 `backend/src/` 기준)과 그 위에 세운 전환 규칙이다.

### 조사한 사실 — 시장 불변 가정이 박힌 곳

| 영역 | 지금 동작 | 전환 시 문제 |
|---|---|---|
| 액세스 토큰 | `market`이 JWT 클레임이다(`auth/services/token.service.ts:49` — "불변이라 클레임으로 싣는다"). 가드는 DB를 읽지 않는다(`common/guards/jwt-auth.guard.ts:53`). TTL 30분 | 탐색·라이브러리·재생·상세·저장·공지·시리즈·`GET /onboarding/topics`는 **토큰** 시장으로, 관심 주제 저장·온보딩 추천·드립·프로필은 **DB** 시장으로 판정한다 → 토큰을 새로 주지 않으면 최대 30분간 두 시장이 섞인다 |
| 관심 주제 | `user_interests`에 시장 칸이 없고, 읽기(`findActiveWithTopics`)가 시장으로 거르지 않는다 | 이전 시장 주제가 활성으로 남아 설정·프로필에 보이고, 드립 후보(새 시장 콘텐츠)와 교집합이 0이 된다 |
| 온보딩 | `advanceStep`은 앞으로만 간다. 되돌리는 경로가 없다 | 새 시장 주제를 고르게 할 길이 없다 |
| 첫 드립 | `first_drip_jobs`가 사용자당 1행(`createIfAbsent`) | 재온보딩을 끝내도 첫 드립이 다시 돌지 않는다 |
| 시장 무관 카운터 | 안 들은 항목 수(`countUnfinishedByUserId` — 정규 배치 `unfinished_inventory` 판정) · 온보딩 담기 수(`countBySource(ONBOARDING)` — `awaitsFirstDrip`) · 프로필 주간 주제 분포가 시장으로 거르지 않는다 | 숨은 이전 시장 미청취 항목이 5개 이상이면 정규 드립이 **매일 조용히 건너뛴다**. 프로필에 이전 시장 주제 이름이 나온다 |
| 라이브러리·재개 | 목록·주제 칸·재개가 `CONTENT_SCOPE_CONDITION`(시장 포함)으로 거른다 | 이전 시장 항목은 **자동으로 숨는다**(행은 남는다) — 이것은 원하는 동작이다 |
| 다른 시장 콘텐츠 직접 접근 | `content.service.ts:490` 404 | 그대로 맞다 |
| 동의 | `pending_consents`는 `users.market`의 필수 목록으로 계산한다(`consent.service.ts:131`) | 시장만 바꿔도 새 시장 필수 동의가 저절로 pending이 된다 — 하지만 동의 전에도 새 시장 콘텐츠가 나간다 |
| 연령 | `confirmedMinAgeOf(version) < minAgeFor(audience)`면 다시 묻는다 | GLOBAL `age-16` → KR은 다시 묻는다(맞음). KR(null) → GLOBAL은 묻지 않아 `age-N` 기록이 안 남는다 |
| 구독·체험·초대 코드 | 구독·초대 코드에 시장 칸 없음. 가입 체험은 `trial_ends_at` 1회 | 전환으로 다시 받을 수 있는 혜택이 **없다** |
| 푸시·메일 언어 | `messageLanguageOf(users.market)` — DB를 읽는다 | 전환 즉시 바뀐다(의도대로) |
| 지표 | 가입·청취 시장 집계는 현재 `users.market`, 탈퇴는 `withdrawal_logs.market`(당시 값). 시장 이력 테이블 없음 | 전환한 사용자의 과거 가입이 새 시장으로 옮겨 세진다. 전환 수를 셀 수 없다 |

## 제안 — 티켓 1~10에 대한 답

### 1. 엔드포인트 — 미리보기 + 전환(동의를 함께 받는다)

탈퇴(`withdrawal-preview` → `withdraw`)와 같은 2단계다.

**`GET /users/me/market-change/preview?preferred_language=en`** — 바꿀 수 있는지와 받아야 할 동의를 준다(아무것도 바꾸지 않는다).

```json
{
  "current_market": "kr",
  "target_market": "global",
  "available": true,
  "blocked_reason": null,
  "retry_after_sec": null,
  "required_consents": [
    { "consent_type": "terms", "version": "global-0.1", "is_required": true },
    { "consent_type": "privacy", "version": "global-0.1", "is_required": true },
    { "consent_type": "cross_border_transfer", "version": null, "is_required": true },
    { "consent_type": "age_confirmation", "version": "age-16", "min_age": 16, "is_required": true }
  ],
  "steps": ["topic"]
}
```

- `blocked_reason`: `null` · `market_unavailable`(9번) · `cooldown`(8번). 막혀 있으면 `available: false`이고 FE는 사유 문구를 보여 준다.
- 동의 항목 객체는 가입 재조회(`auth-api.md` 4.14)와 **같은 모양**이다 — FE가 A4 컴포넌트를 그대로 쓴다.

**`POST /users/me/market-change`** — 전환한다.

```json
{ "preferred_language": "en", "consents": [ { "consent_type": "terms", "version": "global-0.1", "is_agreed": true }, "..." ] }
```

- 클라이언트는 `market`이 아니라 **`preferred_language`**를 보낸다 — 7장 "`market`은 클라이언트가 보내지 않는다"와 가입 규칙(`ko` → `kr`, `en` → `global`)을 그대로 쓴다.
- 응답: `{ "user": {…, "market": "global"}, "access_token": "…", "access_token_expires_at": "…", "onboarding": { "onboarding_completed": false, "onboarding_step": "topic", "steps": ["topic"] } }`. 리프레시 토큰은 그대로다.
- 이미 그 시장이면 200 + 변화 없음(멱등 — 재시도가 안전하다). 토큰도 새로 주지 않는다.
- **한 트랜잭션**: 사용자 행 잠금 → 막힘 판정(8·9번) → 동의 검증·기록 → 시장 변경 → 관심 주제 비활성 → 온보딩 되돌림 → 첫 드립 작업 초기화 → 이력 기록. 하나라도 실패하면 아무것도 바뀌지 않는다.

**왜 동의를 같은 요청에 받나**: 시장만 먼저 바꾸고 동의를 나중에(A20 재동의) 받으면, 동의 전까지 새 시장 콘텐츠가 나가는 시간이 생긴다. 서버의 콘텐츠 API는 `pending_consents`로 막지 않는다(A20은 클라이언트가 띄우는 화면이다). 완료 조건 2("동의 받기 전까지 GLOBAL 콘텐츠가 나오지 않는다")를 서버가 보장하려면 **동의 없이는 전환 자체가 일어나지 않게** 하는 것이 가장 단순하다.

**왜 토큰을 새로 주나**: 시장이 토큰 클레임이다. 새 토큰 없이 바꾸면 30분간 탐색(토큰 시장)과 관심 주제(DB 시장)가 다른 시장을 본다. 전환한 기기는 응답의 토큰으로 바로 맞는다. **같은 계정의 다른 기기**는 다음 갱신(최대 30분)까지 이전 시장을 보고, 그동안 DB 기준(관심 주제·드립)은 이미 새 시장이라 섞인다. 7장은 시장 격리 누락을 데이터 유출로 보지만, 이것은 **본인이 고른 전환의 30분 지연**이라 다른 사람의 데이터가 새는 것이 아니다 — 로그아웃시키는 것보다 낫다고 보고, 7장에 이 예외를 명시한다(결정 요청 D4).

### 2. 관심 주제 — 이전 시장 주제는 비활성, 주제 단계부터 다시 고른다

- 전환 때 이전 시장 주제의 활성 행을 전부 `is_active = false`, `deactivated_at = now`로 바꾼다. **지우지 않는다**(행은 원래 물리 삭제하지 않는다). `is_user_removed`는 건드리지 않는다 — 사용자가 뺀 것이 아니다.
- 되돌아오면(KR → GLOBAL → KR) 이전 행을 되살리지 않는다. 다시 고른다 — 1년 전 선택을 말없이 되살리면 사용자가 모르는 주제로 드립이 나간다.
- 읽기(`findActiveWithTopics`)에 시장 조건을 더하지는 않는다 — 사용자를 받지 않는 함수라 드립·탐색·설정의 뜨거운 경로에 조회가 하나 늘어난다. 대신 전환 트랜잭션의 비활성화를 e2e로 보장한다.

### 3. 온보딩·라이브러리·청취 기록·드립

- **온보딩**: `onboarding_completed = false`, `onboarding_step = topic`으로 되돌린다. 앱은 실행 때 미완료 사용자를 온보딩으로 보내지만(`RootNavigator`) **세션 중에는 다시 읽지 않는다** — 전환한 기기는 응답의 토큰과 `user`로 세션을 갱신해 온보딩으로 보내야 한다(FE 작업). 다른 기기는 다음 실행까지 메인에 남고, 그동안 관심 주제 편집은 409 `ONBOARDING_NOT_COMPLETED`다. 단계는 새 시장의 `steps[]`(KR `topic`·`career`, GLOBAL `topic`). **커리어는 지우지 않는다** — GLOBAL → KR이고 예전에 저장한 커리어가 있으면 KR 커리어 단계는 기존 값을 기본 선택으로 보여 준다(FE 판단).
- **라이브러리·재생 위치·완청**: 행을 남긴다. 이전 시장 항목은 시장 조건으로 **자동으로 숨고**, 되돌아오면 다시 보인다. 드립으로 받은 이전 시장 항목도 같다.
- **프로필 통계**: 누적 청취 시간·완청 수는 **계정 기준 그대로 둔다**(이전 시장 기록 포함). 들은 사실은 시장과 무관하다. 백분위 모집단은 새 시장이 된다(현재 동작 그대로).
- **첫 드립**: 재온보딩을 끝내면 새 시장으로 첫 드립이 다시 돌게 한다 — 전환 때 `first_drip_jobs` 행을 초기화한다. 첫 드립은 하루 편성 판정(`countPlacedToday`)을 보지 않으므로 같은 날 바로 새 시장 편성이 들어간다. 정규 배치의 하루 1회 판정은 **그대로 시장 무관**으로 둔다 — 좁히면 KR → GLOBAL로 그룹이 asia → americas로 바뀔 때 하루 두 번 편성될 수 있다.
- **시장으로 좁힐 카운터**: 안 들은 항목 수(`countUnfinishedByUserId`) · 온보딩 담기 수(`countBySource(ONBOARDING)`)는 **현재 시장 콘텐츠만** 센다. 안 좁히면 숨은 이전 시장 미청취 항목 때문에 정규 드립이 매일 건너뛰어진다(`unfinished_inventory`) — 이번 설계에서 가장 큰 구멍이다.
- **커리어 점수**: 첫 드립·추천의 커리어 가중은 KR 시장일 때만 쓴다 — GLOBAL로 옮긴 사용자에게 남아 있는 KR 커리어가 점수에 섞이지 않게.
- **온보딩 완료 시각**: `onboarding_completed_at`은 **처음 값을 유지**한다(재완료가 덮어쓰지 않는다) — 어드민 퍼널이 재온보딩 중 사용자를 빼거나 날짜를 옮기지 않게. GA4 `onboarding_complete`가 두 번째로 찍히는 것은 FE가 전환 재온보딩이면 보내지 않도록 요청한다.
- **도착 알림**: 05시 배치와 07시 알림 사이에 전환하면 이전 시장 제목으로 새 언어 알림이 나간다. 알림을 만들 때 **현재 시장 콘텐츠만** 고르고, 없으면 보내지 않는다.
- **프로필 주간 주제 분포**: 현재 시장 주제만 보여 준다(누적 시간은 위대로 전체).
- **드립 시간대 그룹**: 배치가 매 회차 `dripGroupOf(user)`로 다시 계산하므로 손댈 것이 없다(GLOBAL만 시간대로 나뉜다).

### 4. 동의 — 새 시장 필수 동의를 전환 요청에 받는다

- 1번의 `consents`가 **새 시장의 필수 목록**(`REQUIRED_CONSENT_TYPES_BY_MARKET`)을 전부 덮어야 한다. 빠지면 400 `CONSENT_REQUIRED`(가입과 같은 코드), 다른 시장 버전·`null` 버전이면 409 `CONSENT_VERSION_STALE`(가입과 같은 판정). 기록은 기존 동의 이력에 추가 행으로 쌓는다(append-only 그대로).
- **새 검증 코드가 필요하다** — 재동의(`recordConsents`)에는 필수 누락 검사가 없고 `version: null`을 받는다. 누락 검사는 가입(`user.service.ts`)에만 있다. 전환은 가입 쪽 검증을 재사용한다.
- FE의 기존 `CONSENT_VERSION_STALE` 처리는 가입 목록(auth-api 4.14)을 다시 받는다 — 전환 화면에서는 **미리보기를 다시 받아야** 한다(FE 작업).
- 이전 시장 동의 행은 그대로 둔다 — 그때 동의한 사실의 기록이다.
- 마케팅 수신 동의는 시장과 무관한 선택 항목이라 그대로 유지한다.

### 5. 연령 — 새 시장 기준으로 항상 한 번 받는다

- 전환 요청의 `age_confirmation`은 **방향과 무관하게 필수**다. 새 시장·현재 `region_code` 기준 `min_age`로 받는다(KR 18 · GLOBAL 16/18).
- 현재 규칙대로면 KR → GLOBAL은 다시 묻지 않지만(18 ≥ 16), 그러면 GLOBAL 동의 이력에 `age-N` 버전이 남지 않는다. 항상 받으면 "어느 기준을 확인했는가"가 이력에 남고 규칙이 하나로 줄어든다.

### 6. 구독 — 그대로 유지

- 구독 행은 시장 칸이 없고 결제는 스토어 국가 기준이다. 전환해도 구독·결제·만료가 그대로다. 요금제 이름·설명만 새 시장 언어로 나온다(`planTextOf`).
- 재생 한도는 티어 기준(`plans.daily_play_limit`)이라 바뀌지 않는다. **오늘 들은 편수도 그대로 센다** — 전환으로 한도를 다시 채우는 경로가 생기지 않는다.

### 7. 푸시·메일 언어 — 전환 즉시 바뀐다(의도대로)

`users.market`을 읽으므로 다음 발송부터 새 언어다. 코드 변경 없음.

### 8. 악용·횟수 제한

- 조사 결과 **전환으로 다시 받을 수 있는 혜택이 없다** — 가입 체험은 계정당 1회(`trial_ends_at`), 초대 코드·구독은 시장 무관, 재생 한도는 그날 들은 편수를 그대로 센다.
- 그래도 쿨다운을 둔다: **전환 후 7일**(결정 요청 D2). 이유는 악용이 아니라 데이터 흔들림이다 — 전환할 때마다 관심 주제 초기화·첫 드립 재실행·지표 이동이 일어난다. 걸리면 429 `MARKET_CHANGE_COOLDOWN` + `details.retry_after_sec`(이메일 재발송 쿨다운과 같은 방식).
- **되돌리기는 쿨다운에서 뺀다**: 전환 뒤 재온보딩을 끝내기 전에 **원래 시장으로 돌아가는 것**은 쿨다운 없이 허용한다. 잘못 누른 사용자가 7일 동안 온보딩에 갇히면 그동안 드립·알림도 끊긴다(미완료 사용자는 배치 대상이 아니다).

### 9. 비어 있는 시장으로는 전환하지 않는다

- 새 시장에 노출 중인 주제가 0개면 409 `MARKET_UNAVAILABLE`. 판정은 interest 모듈이 export한 `TopicService`의 노출 주제 목록(`findAllVisible(market)`)이 비지 않았는가다 — 노출 콘텐츠가 0편인 주제는 운영 배치가 자동으로 숨기므로(`topic-exposure.service.ts`) "노출 주제 있음"이 "고를 콘텐츠 있음"을 대신한다.
- **GLOBAL로의 전환은 `GLOBAL_SIGNUP_ENABLED`도 따른다.** 닫혀 있으면 같은 409다 — 가입이 닫힌 시장으로 전환만 열리면 출시 순서(주제 노출 → 콘텐츠 발행 → 스위치)가 뒤로 새어 나간다.
- 미리보기(1번)가 같은 판정을 `blocked_reason`으로 미리 준다. FE는 막힌 선택지를 처음부터 비활성으로 그릴 수 있다.

### 10. 관리자·지표 — 전환 이력 테이블을 둔다

`domain.md` 신설:

```
user_market_changes
  id            uuid         PK
  user_id       uuid         NOT NULL  FK users(id) ON DELETE CASCADE
  from_market   varchar(20)  NOT NULL
  to_market     varchar(20)  NOT NULL
  changed_at    timestamptz  NOT NULL
  INDEX (user_id, changed_at DESC)
```

- 쓰임: 8번 쿨다운 판정 · 일일 Slack 보고의 "시장 전환 N건(KR→GLOBAL · GLOBAL→KR)" 줄 · 지원 문의 대응.
- **시장별 집계는 현재 시장 기준을 유지한다**(`by_market` · 일일 보고). 전환한 사용자의 과거 가입은 새 시장에 세진다 — 지금 규모에서 전환자는 소수이고, 전환 수를 따로 보이면 해석할 수 있다. 가입 당시 시장(`users.signup_market`)을 따로 두는 것은 필요해지면 그때 한다.
- 탈퇴 시 이력 행은 사용자와 함께 지운다(CASCADE) — 개인 식별과 묶인 행동 기록이라 보존 근거가 없다(`archived_*` 대상 아님).

## 결정 요청 (PM)

| # | 항목 | BE 제안 | 대안 |
|---|---|---|---|
| D1 | 전환 시 관심 주제 | 이전 시장 주제 비활성 + 주제 단계 재진입(2·3번) | 이전 주제 유지 — 비추천: 새 시장 후보와 교집합 0이라 드립이 끊긴다 |
| D2 | 쿨다운 | 7일(재온보딩 완료 전 원래 시장으로 되돌리기는 예외) | 없음 / 서비스 날짜당 1회 / 30일 |
| D3 | 이전 시장 라이브러리 | 숨김(행 유지 — 되돌아오면 다시 보임) | 삭제 — 비추천: 되돌릴 수 없다 |
| D4 | 다른 기기 | 다음 토큰 갱신(≤30분)까지 이전 시장 — global-api 7장에 예외로 명시 | 다른 기기 강제 로그아웃(리프레시 폐기) |
| D5 | 연령 | 방향과 무관하게 항상 다시 확인(5번) | 강화 방향(→ KR, 또는 16 → 18)만 |

## 구현 범위 (결정 뒤, 1.3.0 다음 버전)

- `market.policy.ts`·`user.entity.ts`·`token.service.ts`·`settings` DTO의 "불변" 주석을 고친다.
- 마이그레이션: `user_market_changes`.
- 서비스: `UserMarketChangeService`(user 모듈) — 1번 트랜잭션. 관심 주제 비활성은 interest 모듈이 export한 서비스로, 첫 드립 초기화는 drip 모듈 서비스로 부른다(다른 모듈 레포지토리 직접 주입 금지).
- 에러 코드 신설 2개: `MARKET_UNAVAILABLE`(409) · `MARKET_CHANGE_COOLDOWN`(429) — `common-error-handling.md` 9장 등재는 FE 담당에 요청.
- 시장으로 좁히는 카운터: `countUnfinishedByUserId` · `countBySource(ONBOARDING)` · 도착 알림 대상 · 프로필 주간 주제 분포. `onboarding_completed_at` 유지. 첫 드립 커리어 가중은 KR만.
- FE 작업(별도 티켓): 설정 › 콘텐츠 언어 · 미리보기 → 동의(A4 재사용) → 전환 → 토큰·세션 교체 후 온보딩 이동 · `CONSENT_VERSION_STALE` 시 미리보기 재조회 · 재온보딩의 `onboarding_complete` 이벤트 생략 · A21 "바꿀 수 없어요" 문구.
- e2e(`test/market-change.e2e-spec.ts`): 티켓 완료 조건 6개 + 전환 직후 새 토큰으로 탐색이 새 시장만 + 옛 토큰은 30분 안에서 옛 시장(문서화된 동작) + 동의 누락 시 아무것도 안 바뀜 + 이전 시장 미청취 5개가 있어도 다음 정규 배치가 편성.

## 완료 조건

- Given D1~D5 결정 / When global-api.md를 본다 / Then 9장 미결 #1이 지워지고 2.1 "전환" 행이 ✅, 신설 4.11에 미리보기·전환 계약이 적혀 있다
- Given `domain.md` / Then `user_market_changes`가 있다
- Given 이 문서 / When 반영을 마친다 / Then `changes/archive/`로 옮기고 반영 날짜를 적는다

## 처리 기록

- 2026-10-19 발행(BE — 브랜치 `docs(be)/market-change-design`). 코드 조사 기준 커밋 `64878f9f`(dev).
