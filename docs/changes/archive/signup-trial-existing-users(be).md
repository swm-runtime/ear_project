# 가입 체험 — 도입 전 가입자에게도 한 번 준다 (앱을 연 날부터)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/subscription.md` 4.8 / `backend/domain.md` 3.1 / `spec/api/auth-api.md`(`user.tier` · `GET /users/me`) / `features/README.md` 결정 #55 / `infra/runbook.md` 4장 스위치 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-10-05 |
| 관련 티켓 | `tickets/frontend/pending/signup-trial-notice-existing-users.md`([KAN-121](https://runtime364.atlassian.net/browse/KAN-121)) — 팝업 조건이 함께 바뀐다. 원 팝업 티켓은 KAN-119(반영 완료, PR #1123) |

## 수정 내용

### 1. `features/subscription.md` 4.8

"대상" 항목을 바꾸고 "기존 가입자" 항목을 더한다.

- **대상**(변경): 스위치가 켜져 있는 동안 새로 가입한 계정 + **체험 도입 전에 가입한 계정(한 번)**. ~~기존 계정에는 소급하지 않는다.~~
- **기존 가입자**(신설): 체험이 생기기 전에 가입한 계정은 **스위치가 켜진 뒤 처음 앱을 여는 날**을 1일차로 같은 기간(7개 서비스 날짜, 04:00 경계)을 받는다.
  - 기산점이 가입일이나 켜는 날이 아닌 이유: 켜는 날 전원에게 같은 종료일을 적으면 그 주에 앱을 열지 않은 사람은 안내도 못 보고 기간이 지나간다.
  - "앱을 여는" 지점은 세션 복원(`GET /users/me`)과 기존 계정 로그인(`POST /auth/social-login`)이다.
  - **한 번뿐이다.** `users.trial_ends_at`이 비어 있는 계정만 받는다 — 끝난 체험도 받은 것이다.
  - **경계**: `SIGNUP_TRIAL_EXISTING_USERS_BEFORE`(서비스 날짜 `YYYY-MM-DD`)보다 먼저 가입한 계정만 대상이다. 비우면 기존 가입자에게는 주지 않는다. 스위치를 껐다 켜는 사이의 가입자가 쓸려 들어가지 않게 날짜로 자른다 — 도입 시점의 한 번이지 상시 규칙이 아니다.
  - 가입 체험 스위치(`SIGNUP_TRIAL_ENABLED`)가 꺼지면 이 지급도 멈춘다.
- **안내**(변경): ~~가입 직후 한 번~~ → **체험을 받은 뒤 처음 앱에 들어왔을 때 한 번** 팝업으로 알린다(신규 가입자는 가입 직후, 기존 가입자는 스위치가 켜진 뒤 처음 연 때). 이후에는 프로필에서 보여준다. **앱은 아직 가입 직후에만 띄운다**(KAN-119 구현) — 기존 가입자 쪽은 KAN-121이 반영한다. `spec/uiux/profile-uiux.md` 4.11의 "온보딩을 막 끝낸 진입에서만"은 그 티켓에서 FE가 고친다.

### 2. `backend/domain.md` 3.1

`trial_ends_at` 설명의 "가입 시 한 번만 쓴다"를 고친다.

> `trial_ends_at`은 **한 번만 쓴다** — 가입 트랜잭션에서, 또는 체험 도입 전에 가입한 계정이 스위치가 켜진 뒤 처음 앱을 열 때(`subscription.md` 4.8). 비어 있을 때만 쓰는 조건부 UPDATE라 동시에 두 요청이 와도 한 값만 남는다.

### 3. `spec/api/auth-api.md`

- `GET /users/me`: **조회가 쓰기를 일으키는 예외** — 대상 계정이면 이 호출에서 체험이 지급되고 응답 `user.tier`가 `trial`로 나간다. 받은 뒤로는 쓰지 않는다. 지급이 실패해도 응답은 정상이다(다음 호출에서 다시 시도).
- `POST /auth/social-login`(기존 계정): 같은 지급을 거친 `user`를 돌려준다.

### 4. `features/README.md` 결정 #55 · `infra/runbook.md` 4장

- 결정 #55에 "도입 전 가입자는 처음 앱을 여는 날부터 한 번" 추가.
- runbook 스위치 설명에 `SIGNUP_TRIAL_EXISTING_USERS_BEFORE` 추가:
  - **켜는 날의 다음 날짜를 넣는다**(늦는 것은 해가 없고, 이르면 그 사이 가입자가 어느 쪽에서도 못 받는다).
  - **팝업이 들어간 앱이 나간 뒤에 켠다** — 그 전에 켜면 옛 앱 사용자는 안내 없이 7일이 시작된다.
  - 지급 확인: api 로그 `signup trial granted`의 `source`(`signup` / `existing_user`).

## 사유

체험을 가입 시점에만 주면, 기능을 켜는 날 이미 가입해 있던 계정은 영영 받지 못한다. 기존 가입자에게도 이번 한 번 같은 혜택을 주기로 했다(2026-10-05 박준현). 기산점은 "각자 앱을 연 날"로 정했다 — 켜는 날 전원 동시 지급은 그 주에 들어오지 않는 다수(최근 7일 청취자가 전체의 40%가량)가 받지 못한다.

## 완료 조건

- Given 스위치 켬 + 경계 날짜 설정 + 경계보다 먼저 가입했고 체험을 받은 적 없는 계정 / When 앱을 연다(`GET /users/me`) / Then `trial_ends_at`이 그날 서비스 날짜 시작 + 7일로 저장되고 `user.tier`는 `trial`이다
- Given 같은 계정 / When 다시 앱을 연다 / Then `trial_ends_at`이 바뀌지 않는다
- Given 체험이 이미 끝난 계정 / When 앱을 연다 / Then 다시 지급되지 않는다
- Given 경계 날짜가 비어 있거나 스위치가 꺼져 있다 / When 기존 가입자가 앱을 연다 / Then 지급되지 않는다
- Given 경계 날짜 이후에 가입한 계정 / When 앱을 연다 / Then 이 경로로는 지급되지 않는다
- Given 위 문서들 / When 읽는다 / Then 기존 가입자 규칙과 env 키가 코드와 같다

## 처리 기록

- 반영 날짜: 2026-10-05 (코드와 같은 PR — #1124 `feat(be)/signup-trial-existing-users`)
- `features/subscription.md` 4.8 — "대상" 개정 · "기존 가입자" 항목 신설 · "안내" 개정(앱은 아직 가입 직후에만 띄운다는 현재 상태와 KAN-121 연결을 함께 적음)
- `backend/domain.md` 3.1 — `trial_ends_at` 컬럼 설명·주석(쓰는 시점 두 곳, 조건부 UPDATE)
- `spec/api/auth-api.md` 4.13 — `GET /users/me`가 쓰기를 일으키는 예외와 실패 시 동작
- `features/README.md` 결정 #55 · `infra/runbook.md` 4장 스위치 설명(`SIGNUP_TRIAL_EXISTING_USERS_BEFORE`, 켜는 순서)
- 반영하지 않은 것: `spec/uiux/profile-uiux.md` 4.11의 "온보딩을 막 끝낸 진입에서만" — FE 소유 문서라 KAN-121에서 FE가 고친다
