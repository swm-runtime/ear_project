# 가입 체험 — 새로 가입하면 7일간 무제한 청취

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 1.3 · 3.1 · 8.1 / `features/subscription.md` 4.8(신설) · 미결 / `features/paywall.md` 4.1 / `spec/api/auth-api.md` · `profile-api.md` 4.1 · `settings-api.md` 4.1 · `subscription-api.md` 4.2 / `features/README.md` 결정 목록 / `infra/runbook.md` 환경 변수 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-10-03 |
| 관련 티켓 | `tickets/frontend/pending/signup-trial-notice.md`([KAN-119](https://runtime364.atlassian.net/browse/KAN-119)) |

## 수정 내용

### 1. `backend/domain.md`

- **1.3 `user_tier`** — 값에 `trial`을 더하고 아래 주석을 붙인다.
  > `trial`은 **저장하지 않는 값**이다. `users.tier`·`subscriptions.tier`에는 들어가지 않고, 응답의 `tier`와 `plans` 행의 키로만 쓴다. `users.tier`는 결제가 쓰는 캐시(8.2)라 체험을 여기에 쓰면 구독 동기화가 덮어쓴다.
- **3.1 `users`** — 컬럼 추가.

  | 컬럼 | 타입 | NULL | 설명 |
  |---|---|---|---|
  | `trial_ends_at` | timestamptz | Y | 가입 체험이 끝나는 시각. 가입 시 한 번만 쓴다. NULL = 체험을 받지 않은 계정 |

- **8.1 `plans`** — 행 추가: `tier = 'trial'`, 이름 "무료 체험", `daily_play_limit = NULL`(무제한), `is_active = false`, `display_order = 0`. 판매 요금제가 아니라 **체험 기간의 한도·이름을 담는 정책 행**이다(`is_active = false`라 요금제 목록·페이월에 나오지 않는다).
- 마이그레이션: `1788400000000-AddSignupTrial`.

### 2. `features/subscription.md` — 4.8 "가입 체험" 신설

- **대상**: 스위치가 켜져 있는 동안 **새로 가입한 계정**. 기존 계정에는 소급하지 않는다.
- **기간**: 가입한 서비스 날짜를 1일차로 **7개 서비스 날짜**. 종료 시각은 04:00 경계에 맞춘다 — 10/3에 가입하면 10/9까지 무제한, 10/10 04:00부터 무료 한도.
  - 경계에 맞추는 이유: 하루 중간에 끝나면 체험 중 들은 편수가 그날 한도에 그대로 잡혀, 끝나는 순간 "이미 4편 들음 · 한도 2편"이 된다.
- **효과**: 체험 중에는 `plans`의 `trial` 행 한도(무제한)를 적용한다. 구독자는 **구독 티어 한도와 체험 한도 중 넉넉한 쪽**을 받는다(데일리 구독자가 체험 중이면 무제한).
- **티어와의 관계**: 체험은 `users.tier`를 바꾸지 않는다. 응답의 `tier`만 `trial`로 나간다(무료 계정 + 체험 중일 때). 구독자는 구독 티어가 그대로 나간다.
- **스위치**: `SIGNUP_TRIAL_ENABLED`(`true`일 때만 지급) · `SIGNUP_TRIAL_DAYS`(1~30, 기본 7). **끄면 새 지급만 멈춘다** — 이미 받은 체험은 끝까지 유효하다(약속한 날짜를 서버가 거두지 않는다).
- **탈퇴 후 재가입**: 다시 지급된다. 탈퇴 계정은 식별자를 파기하므로 같은 사람인지 서버가 알 수 없다.
- **미결 사항**의 "무료 체험(free trial) 제공 여부 및 기간"에 주석: 그 항목은 **스토어 구독의 무료 체험**(결제 수단 등록 후 N일 무료)이고, 이 절의 가입 체험과 별개다.

### 3. `features/paywall.md` 4.1

판정 순서의 한도 조회 단계에 한 줄: "가입 체험 중이면 체험 한도를 함께 본다(`subscription.md` 4.8). 무제한이면 카운트를 세지 않고 허용하되, 재청취 창의 기산점은 유료 티어와 똑같이 남긴다."

### 4. `spec/api/`

- **`auth-api.md`**(로그인·가입 응답 `user.tier`) · `GET /users/me`: `tier`가 `trial`일 수 있다. **표시용이며 판정에 쓰지 않는다.**
- **`profile-api.md` 4.1 · `settings-api.md` 4.1 · `subscription-api.md` 4.2** — `plan`에 `trial` 추가.

  ```json
  "plan": {
    "status": "free",
    "tier": "trial",
    "plan_name": "무료 체험",
    "daily_play_limit": null,
    "trial": {
      "ends_at": "2026-10-09T19:00:00.000Z",
      "last_free_date": "2026-10-09",
      "daily_play_limit_after": 2
    }
  }
  ```

  | 필드 | 설명 |
  |---|---|
  | `trial` | 체험 중이 아니면 `null` |
  | `trial.ends_at` | 체험이 끝나는 시각(UTC). 04:00 KST 경계 |
  | `trial.last_free_date` | 무제한으로 들을 수 있는 **마지막 서비스 날짜**. "10월 9일까지"를 클라이언트가 계산하지 않게 서버가 준다 |
  | `trial.daily_play_limit_after` | 체험이 끝난 뒤의 하루 한도(`null` = 무제한 — 구독자) |

- `subscription-api.md` 4.2의 `entitlements.daily_play_limit`도 체험 중에는 체험 한도가 반영된 값이다.
- `settings-api.md` 4.1: 사용자 행 조회가 실패하면 `failed_sections`에 `account`와 **`plan`이 함께** 들어간다(플랜 카드가 체험 종료 시각을 읽는다).

### 5. `features/README.md` 확정된 결정 사항

"가입 체험(2026-10-03): 신규 가입 계정에 7일 무제한. 저장 티어는 그대로 두고 `users.trial_ends_at`으로 판정. 환경 변수로 켜고 끈다."

### 6. `infra/runbook.md` 환경 변수

`SIGNUP_TRIAL_ENABLED` · `SIGNUP_TRIAL_DAYS` 두 줄. 켜고 끄는 절차: `.env.prod` 값 변경 → 컨테이너 재생성(`API_IMAGE=$(cat .api-image)` 포함).

## 사유

신규 가입자에게 일주일 무제한 청취를 제공하기로 했다(2026-10-03 박준현). 상시 정책이 아니라 **켜고 끌 수 있어야** 하고, 티어를 `pro`로 올리는 방식은 결제(구독 동기화가 `users.tier`를 쓴다)와 겹쳐서 쓸 수 없다. 코드는 먼저 구현했고 문서가 뒤따른다.

## 완료 조건

- Given 스위치가 켜져 있다 / When 새 계정이 가입한다 / Then `users.trial_ends_at`이 가입 서비스 날짜 시작 + 7일(04:00 KST 경계)로 저장되고 `users.tier`는 `light`다
- Given 스위치가 꺼져 있다 / When 새 계정이 가입한다 / Then `trial_ends_at`은 NULL이다
- Given 체험 중인 무료 계정 / When 하루에 3편 이상 재생을 시작한다 / Then 전부 허용되고 `daily_play_limit`은 `null`이다
- Given 체험 중인 무료 계정 / When 프로필·설정·구독 조회를 부른다 / Then `plan.tier`는 `trial`, `plan.trial`에 `ends_at`·`last_free_date`·`daily_play_limit_after`가 있다
- Given 체험이 끝난 계정 / When 같은 조회를 부른다 / Then `plan.tier`는 `light`, `plan.trial`은 `null`이고 하루 2편을 넘는 새 재생은 `PLAY_LIMIT_EXCEEDED`다
- Given 체험을 받은 뒤 스위치를 껐다 / When 그 계정이 재생한다 / Then 종료 시각까지 무제한이 유지된다
- Given 위 문서들 / When 읽는다 / Then 4.8의 규칙과 `plan.trial` 계약이 코드와 같다

## 처리 기록

- 반영 날짜: 2026-10-03 (코드와 같은 PR — `feat(be)/signup-trial`)
- `backend/domain.md` 1.3(`trial` 값·저장하지 않는다는 주석) · 3.1(`users.trial_ends_at`) · 8.1(`plans` `trial` 행)
- `features/subscription.md` 4.8 신설(안내 방식 한 줄 추가 — 가입 직후 팝업 1회 + 프로필, 문구·방식은 FE) · 미결 사항의 "무료 체험"이 스토어 구독 체험임을 주석
- `features/paywall.md` 4.1 · `spec/api/` `auth-api`(`user.tier`) · `profile-api` 4.1(`plan.trial` 정의) · `settings-api` 4.1 · `subscription-api` 2장·4.2
- `features/README.md` 결정 #55 · `infra/runbook.md` 4장 스위치 설명
- 요청서에 없던 추가: `prd/ear_root_prd.md` FR-29에 체험 기간 예외 한 문장(무료 하루 2편 규칙과 충돌하지 않게)
