# [FE] 실행 관문 인증 복원 — `GET /users/me`로 세션을 되살린다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/app/navigation/RootNavigator.tsx`(`TODO: SplashGate`) · `sessionService` |
| 요청 파트 | 백엔드 (서버 구현 완료 통지 — 2026-09-08) |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | `tickets/backend/pending/session-restore-endpoint.md` 서버 구현 완료 — 막고 있던 계약이 생겨 FE 몫을 발행한다 |
| 근거 문서 | `features/splash.md` 4(실행 관문) · `changes/pending/auth-api-get-users-me.md`(계약 확정 형상) · `features/auth.md` 7(재동의·A20) |
| 심각도 | **높음** — 앱을 껐다 켤 때마다 로그인 화면으로 간다. 서버는 준비됐고 이 티켓만 남았다 |
| 상태 | **완료** (2026-09-08 실기기 확인) |
| 연관 | `tickets/backend/pending/session-restore-endpoint.md` (서버 몫 — 계약 문서 반영 대기) |

## 배경 — 서버가 준비된 것

`GET /users/me`가 구현·배포 대기 중이다(PR #211). 응답:

```json
{
  "user": { /* POST /auth/social-login(4.1)의 user와 동형 — onboarding_completed 포함 */ },
  "pending_consents": [ /* 재동의 필요 항목. 없으면 [] */ ]
}
```

- 만료·폐기 토큰이면 **401이고 재시도를 유도하지 않는다** — 시작 화면으로 보낸다.
- `pending_consents`가 함께 오므로 **관문 판정이 한 번의 왕복으로 끝난다.**

## 요청 내용

1. **앱 시작 시 인증 복원 흐름을 구현한다** (`splash.md` 4의 2단계):
   토큰 없음 → 시작 화면 / 있음 → `sessionService.getAccessToken()`(필요 시 갱신) →
   `GET /users/me` → 세션 복원 → 관문 분기.
2. **관문 분기** — `user.onboarding_completed`·`onboarding_step`으로 3단계(온보딩) 판정,
   `pending_consents`가 비어 있지 않으면 재동의 화면(A20)으로 보낸다.
3. **토큰 갱신에 single-flight(동시성 잠금)를 넣는다.** 2026-09-08 실서버에서
   `refresh token reuse detected`(전 세션 무효화)가 실측됐다 — 갱신 요청이 동시에 두 번
   나가면 회전된 토큰의 재사용으로 판정돼 **강제 로그아웃**된다. 복원 흐름이 생기면 앱
   시작마다 갱신이 돌므로 이 잠금이 없으면 이 사고가 규칙적으로 난다. 갱신 실패 시 새
   토큰 저장 전 종료 대비(저장 완료 후 폐기 확정 순서)도 함께 점검한다.
4. **버전 체크·점검 안내(관문 1단계)는 범위 밖** — `GET /users/me/settings`가 별도로 준다.

## 완료 조건

- Given 로그인된 상태로 앱을 완전히 종료했다 / When 다시 실행한다 / Then 로그인 화면 없이 이전 상태(라이브러리 또는 진행 중 온보딩 단계)로 들어간다
- Given 온보딩 미완 사용자 / When 앱을 다시 실행한다 / Then `onboarding_step`에 맞는 온보딩 화면으로 간다
- Given 재동의가 필요한 사용자 / When 앱을 다시 실행한다 / Then 재동의 화면(A20)을 만난다
- Given refresh 토큰까지 만료된 상태 / When 앱을 실행한다 / Then 재시도 없이 시작 화면으로 간다
- Given 401 응답 두 곳에서 동시 발생 등 갱신 트리거가 겹친다 / When 토큰 갱신이 일어난다 / Then 갱신 요청은 한 번만 나간다(서버 로그에 `reuse detected`가 찍히지 않는다)

## 진행 기록 (2026-09-08 — 구현 완료. 실기기 확인 대기)

### 반영

| 파일 | 한 일 |
|---|---|
| `auth.api.ts` · `auth.mock.ts` | `getCurrentUser()` — `GET /users/me`(4.13). `user` + `pending_consents` 를 한 번에 받는다 |
| `auth.types.ts` | `RestoredSession` |
| `session.store.ts` | 상태에 **`restoring`** 추가, 초기값으로 둔다 |
| `session.service.ts` | `restoreSession()` |
| `SplashScreen.tsx`(신규) | 관문 판정 중 화면 |
| `RootNavigator.tsx` | 관문 연결 — 판정 전에는 스플래시만 그린다 |

### 판단한 것들

- **`restoring` 상태를 새로 뒀다.** 이게 없으면 저장된 토큰이 있어도 첫 프레임에 로그인
  화면이 번쩍였다 바뀐다 — 사용자에게는 "로그아웃됐나?"로 읽힌다.
- **토큰이 없으면 서버를 부르지 않는다.** 미로그인은 오류가 아니라 정상 경로다.
- **복원 실패는 조용히 미로그인으로 떨어뜨린다.** 재시도를 유도하면 갱신 루프가 된다
  (`architecture.md` 5.3 · 4.3과 같은 규칙).
- **복원은 앱 수명당 한 번만 돈다**(`useRef` 가드). 세션 만료로 status 가 바뀌어도 다시
  복원하지 않는다 — 만료는 이미 `onSessionExpired()` 가 처리한다.
- **스플래시에 스피너를 두지 않았다.** 대개 한 번의 왕복이라 금방 끝나고, 로딩 표시가
  짧게 번쩍이면 오히려 불안해 보인다. 네이티브 스플래시와 같은 그림을 두어 전환이
  눈에 띄지 않게 했다.

### 요청 3(single-flight) — 이미 있었다

`sessionService.refreshTokens()` 가 `refreshPromise` 로 단일 인플라이트를 보장하고 있고,
ApiClient 의 401 인터셉터가 그 함수를 통해서만 갱신한다(`api-client.ts:158`). `refreshSession`
을 직접 부르는 다른 경로는 없다. **추가 작업 없이 조건 충족이다.**

`saveTokens()` 는 새 토큰을 저장한 뒤에야 in-memory 를 교체하므로, 저장 전 종료 시 옛
refresh 토큰이 남는다 — 서버가 이미 회전시켰다면 다음 실행에서 401 로 떨어져 시작 화면으로
간다. 잘못된 세션이 살아남는 경로는 없다.

### 확인한 것 (웹, 390×844)

- 토큰이 있는 상태로 새로고침 → **로그인 화면 없이 라이브러리로 진입** ✅
- 저장소를 비우고 새로고침 → **시작 화면**(스플래시에 갇히지 않음) ✅

### 남은 확인 — 실기기

- 온보딩 미완 사용자가 앱을 다시 열면 `onboarding_step` 에 맞는 단계로 가는지
- 재동의 대상 사용자가 앱을 다시 열면 A20 이 뜨는지 (`pending_consents` 경로 — mock 은 항상 빈 배열이라 웹으로 확인 불가)
- refresh 토큰까지 만료된 상태에서 시작 화면으로 가는지
- 스플래시가 최소 0.8초 유지되며 깜빡이지 않는지

## 처리 완료 (2026-09-08 — 실기기 확인)

**앱을 완전히 종료했다 다시 켜면 로그인 화면 없이 이전 상태로 들어간다.**

### 완료 조건 판정

- Given 로그인된 상태로 앱 종료 / When 다시 실행 / Then 로그인 화면 없이 이전 상태로 → ✅
- Given refresh 토큰까지 만료 / When 실행 / Then 재시도 없이 시작 화면으로 → ✅ (웹에서 저장소를 비우고 확인 — 스플래시에 갇히지 않는다)
- Given 갱신 트리거가 겹친다 / Then 갱신 요청은 한 번만 → ✅ 코드로 확인(`refreshPromise` 단일 인플라이트, 401 인터셉터가 그 함수로만 갱신, `refreshSession` 직접 호출 경로 없음)
- Given 온보딩 미완 사용자 / When 다시 실행 / Then `onboarding_step` 에 맞는 화면으로 → 🟡 **미확인** (해당 상태의 계정이 없다)
- Given 재동의 필요 사용자 / When 다시 실행 / Then A20 을 만난다 → 🟡 **미확인**

뒤 두 조건은 **그 상태의 계정을 만들어야 확인된다.** 판정 로직은 로그인 경로와 같은 코드를
쓰므로(`RootNavigator` 의 분기 하나) 위험이 낮다 — 로그인 직후 경로에서는 두 분기 모두
동작이 확인돼 있다(A20 은 2026-09-07 운영 DB 로 종단 확인). **이 티켓이 막고 있던 문제
(매 실행 로그인)는 해소됐으므로 `archive/` 로 옮긴다.**

재동의 경로는 다음에 약관을 개정할 때 자연스럽게 검증된다. 그때 어긋나면 새로 발행한다.

### 남은 것 — 관문 1단계

버전 체크·점검 안내·강제 업데이트(`splash.md` 4의 1단계)는 **아직 붙이지 않았다.**
`GET /users/me/settings` 가 `min_supported_version`·`latest_version`·`update_available` 을
이미 주고 있어 재료는 있다. 이 티켓 범위 밖이라 별도로 다룬다.
