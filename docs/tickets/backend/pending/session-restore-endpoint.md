# [BE] 세션 복원용 `GET /users/me` 가 없다 — 앱을 켤 때마다 다시 로그인한다

| 항목 | 값 |
|---|---|
| 대상 | `spec/api/auth-api.md`(계약 신설) · `backend/src/modules/user`(구현) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | "앱을 켤 때마다 다시 로그인해야 한다"는 실사용 보고 — 원인을 따라가니 복원에 쓸 엔드포인트가 없었다 |
| 근거 문서 | `features/splash.md` 4(실행 관문 2단계 — 인증 상태 판정) · `spec/api/auth-api.md` 4.1·4.3 |
| 심각도 | **높음** — 앱을 껐다 켤 때마다 로그인 화면으로 간다. 토큰은 기기에 남아 있는데 쓰지 못한다 |
| 상태 | 대기 |
| 연관 | FE 의 실행 관문(SplashGate) 구현이 이 계약에 막혀 있다 — `app/navigation/RootNavigator.tsx` 의 `TODO: SplashGate` |

## 문제

`splash.md` 4의 2단계는 **"토큰 없음 → 시작 화면 / access_token 만료 → refresh 로 갱신 시도 → 성공하면 3번으로"** 다.
클라이언트에는 refresh 토큰이 안전 저장소에 남아 있고 `sessionService.getAccessToken()` 이 갱신도 한다.

**그런데 갱신에 성공해도 세션을 복원할 수 없다.** 화면 분기에 필요한 사용자 객체를 받을 곳이 없기 때문이다.

`RootNavigator` 가 쓰는 `AuthUser`:

```
id · nickname · email · isEmailVerified · provider · tier · role
onboardingCompleted · onboardingStep
```

| 후보 | 주는 것 | 빠진 것 |
|---|---|---|
| `POST /auth/token/refresh`(4.3) | `access_token` · `refresh_token` 뿐 | **사용자 객체 전체** |
| `GET /users/me/settings` | `is_admin` · `tier` · `email` · `is_email_verified` · 버전 정보 | **`id` · `nickname` · `provider` · `onboarding_completed` · `onboarding_step`** |

특히 **`onboarding_completed` 가 없다.** 관문의 3단계(온보딩 판정)를 할 수 없으므로, 복원해도 어디로 보낼지 정할 수 없다.

그래서 지금 앱은 매 실행마다 `status: 'unauthenticated'` 로 시작한다 — **토큰이 멀쩡한데 로그인 화면을 띄운다.**

## 요청 내용

1. **`GET /users/me` 를 신설한다.** 응답은 **`POST /auth/social-login`(4.1) 의 `user` 객체와 같은 모양**이어야 한다. 모양이 갈리면 로그인 경로와 복원 경로가 서로 다른 판정을 하게 된다.

   ```json
   {
     "id": "...", "nickname": null, "email": null, "is_email_verified": false,
     "provider": "kakao", "tier": "...", "role": "...",
     "onboarding_completed": false, "onboarding_step": "..."
   }
   ```

2. **`spec/api/auth-api.md` 에 등재한다.** 지금은 계약이 없어 FE 가 추정으로 만들 수 없다.

3. **`pending_consents` 를 함께 내려줄지 정한다.** 재동의 판정은 현재 로그인 응답(4.1)에만 실려 있어서, **이미 로그인된 세션으로 앱을 다시 열면 재동의 화면을 만나지 못한다**(`auth.md` 7 · A20). 복원 경로에도 같은 값이 필요하다.
   - 함께 내려주면 관문이 한 번의 왕복으로 판정한다.
   - 별도 엔드포인트로 가르면 관문이 두 번 왕복한다.
   **전자를 제안한다.**

4. **인증 실패(401) 시 동작을 명시한다.** `refresh` 가 이미 "재갱신 여지 없이 명확히 실패"를 정하고 있으므로(4.3), 이 엔드포인트도 같은 규칙을 따르고 클라이언트는 시작 화면으로 간다.

## 완료 조건

- Given 유효한 access token / When `GET /users/me` 를 호출한다 / Then `social-login`(4.1)의 `user` 와 **필드 구성이 같은** 객체가 반환된다
- Given 그 응답 / When `onboarding_completed` 를 읽는다 / Then 값이 있다(관문 3단계 판정이 가능하다)
- Given 재동의가 필요한 사용자 / When 같은 엔드포인트를 호출한다 / Then `pending_consents` 로 그 사실을 알 수 있다(요청 3의 결정에 따름)
- Given 만료·폐기된 토큰 / When 호출한다 / Then 401 이고 재시도를 유도하지 않는다
- Given `spec/api/auth-api.md` / When 이 엔드포인트를 찾는다 / Then 요청·응답·에러가 확정 계약으로 적혀 있다

## FE 쪽 후속 (이 티켓이 닫힌 뒤)

계약이 생기면 FE 가 실행 관문의 **인증 복원**을 구현한다 — 앱 시작 시 토큰 갱신 → `GET /users/me` → 세션 복원 → 관문 분기.

**버전 체크·점검 안내·강제 업데이트(`splash.md` 4의 1단계)는 이 티켓 범위가 아니다.** 그쪽은 `GET /users/me/settings` 가 이미 `min_supported_version`·`latest_version`·`update_available` 을 주고 있어 별도로 붙일 수 있다.

## 임시 회피책을 쓰지 않기로 한 이유

FE 가 로그인 시 사용자 객체를 기기에 캐시해 두고 복원하는 안을 검토했다(서버 변경 없이 오늘 해결 가능). **채택하지 않았다**(2026-09-08 결정) — 온보딩 완료 여부는 관문의 **분기 판정**에 쓰이는 값이고, "판정은 서버가 하고 클라이언트는 표시만 한다"는 공통 원칙에 어긋난다. 캐시가 낡으면 잘못된 화면으로 보낸다.
