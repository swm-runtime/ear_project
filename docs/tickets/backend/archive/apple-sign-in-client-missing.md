# [BE] 애플 소셜 로그인 — `AppleClient` 미구현 · 이메일 저장 분기 필요

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/auth/providers/`(`apple.client.ts` 신설) · `social-provider.registry.ts` 40~52행 · `auth.module.ts` · 애플 이메일 저장 분기(`auth.service.ts` 계열) |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-12 `UI-improvement` → `dev` PR 사전 점검 |
| 근거 문서 | `prd/ear_root_prd.md` FR-01(애플 필수 — App Store 심사 4.8) · `features/auth.md` 1·4.1 · `spec/api/auth-api.md` 4.1 · `backend/domain.md` 3.1·11.3(`provider` enum) |
| 심각도 | **높음** — `SocialProvider.APPLE`이 이미 추가돼 **요청은 검증을 통과하는데 처리할 클라이언트가 없다.** 운영에서 `provider=apple`이 오면 레지스트리가 던진다. 개발 환경은 `dev.client`가 가려 재현되지 않는다 |
| 발행 날짜 | 2026-08-12 |
| 반영 날짜 | 2026-08-12 |
| 상태 | **완료** |

## 처리 기록 (2026-08-12)

| 요청 | 처리 |
|---|---|
| 1. `AppleClient` 구현 | `providers/apple.client.ts` 신설 — JWKS 조회·캐시(TTL 1시간, 미등록 `kid`면 즉시 재조회), RS256 서명 검증, `iss`·`aud`·`exp`·nonce 대조 |
| 2. 레지스트리·모듈 등록 | `social-provider.registry.ts` 운영 분기와 `auth.module.ts`에 등록. `TODO(auth)` 주석 제거 |
| 3. 이메일 저장 분기 | **코드 변경 불필요로 확인.** 재로그인 시 `auth.service.ts`가 기존 사용자에게는 `profile`을 쓰지 않고 세션만 발급하므로 **덮어쓰기가 구조적으로 발생하지 않는다.** 릴레이 주소는 `AppleClient`가 저장 + `isEmailVerified = true`로 처리 |
| 4. 마이그레이션 | 예상대로 불필요(`varchar(20)`) |

**계약 변경이 함께 일어났다** — nonce 대조에는 클라이언트가 보낸 원본 nonce가 필요하다. `SocialLoginRequestDto`에 선택 필드 `nonce`를 추가하고 `auth-api.md` 4.1에 계약을 명시했다. **애플에서는 사실상 필수**이며, 없으면 검증에 실패한다.

**검증** — `apple.client.spec.ts` 14건(정상·서명 위조·`aud` 불일치·발급자 불일치·만료·nonce 불일치/누락·키 캐시·키 교체·애플 장애), `social-provider.registry.spec.ts` 4건(enum 전 provider 등록 확인). 전체 337건 통과, 린트 0 에러.

### 닉네임 — `null`이 의도된 값이다 (확인 2026-08-12)

애플 identity token에는 이름 클레임이 없어 `AppleClient`는 `nickname = null`을 돌려준다. **이는 결함이 아니다** — `domain.md` 3.1대로 닉네임은 제공자에게서 받는 값이 아니라 **온보딩의 닉네임 입력 단계에서 채우는 값**이며, 그 단계는 아직 미정이라 현재 전 제공자가 사실상 `null`로 출발한다. 표기 규칙은 `profile-uiux.md` 4.1(`"이어 사용자"`)이 소유한다.

### 남은 것 — 이 티켓 밖

- **프론트 애플 SDK 연동과 nonce 생성**은 FE 작업이다. 현재 `provider-auth.service.ts`가 전 제공자 공통 스텁이라 애플만의 문제가 아니다. **nonce 전송 계약만 FE에 먼저 반영해 두었다**(`auth.api.ts`) — SDK를 붙일 때 원본 nonce를 넘기기만 하면 된다.

## 배경

애플 로그인은 **선택 항목이 아니다.** App Store 심사 가이드라인 4.8에 따라 다른 소셜 로그인을 제공하는 iOS 앱은 Sign in with Apple을 함께 제공해야 하며, 빠뜨리면 반려된다(`auth.md` 1).

`UI-improvement` 브랜치에서 애플을 **enum·문서·프론트까지 반영했으나 서버 구현이 비어 있다.**

| 위치 | 상태 |
|---|---|
| `user.enum.ts` `SocialProvider.APPLE` | ✅ 추가됨 |
| `domain.md` 3.1·11.3 `provider` enum | ✅ `apple` 포함 |
| `auth-api.md` 4.1 요청 필드 | ✅ `apple` 포함 |
| 프론트 `auth.types.ts` · `SOCIAL_PROVIDERS` · `PROVIDER_BRAND` | ✅ 반영됨 |
| **`AppleClient` · 레지스트리 등록** | ❌ **없음** |
| **애플 이메일 저장 분기** | ❌ **없음** |

### 지금 상태가 왜 위험한가

`SocialLoginRequestDto`가 `@IsEnum(SocialProvider)`로 검증하므로, **enum에 값이 생긴 순간 `provider=apple` 요청이 검증을 통과해 레지스트리까지 도달한다.** 그리고 `get()`에서 던진다.

개발 환경에서는 `dev.client`가 `Object.values(SocialProvider)` 전체에 등록되어 **모든 provider를 받아내므로 재현되지 않는다**(`social-provider.registry.ts` 33~41행). **운영에서만 터진다.**

## 요청 내용

### 1. `AppleClient` 구현

애플은 다른 셋과 **자격 증명의 종류와 검증 수단이 다르다.** 카카오·구글·네이버처럼 액세스 토큰으로 프로필 API를 호출하는 구조가 아니다.

- 클라이언트가 보내는 `provider_token`은 **identity token(JWT)** 이다.
- **애플 공개키(JWKS)로 서명을 검증**하고, `iss` · `aud` · `exp`와 **nonce를 대조**한다. 토큰을 그대로 신뢰하면 안 된다.
- `provider_user_id`는 JWT의 `sub` 클레임이다.
- **`SocialProviderClient` 인터페이스에 그대로 맞출 수 있는지 먼저 확인한다.** `fetchProfile(providerToken)` 시그니처가 외부 API 호출을 전제로 한다면, 애플은 네트워크 호출 없이 로컬 검증만으로 끝나므로 인터페이스 조정이 필요할 수 있다. **조정이 필요하면 이 티켓에서 함께 처리한다.**

### 2. 레지스트리·모듈 등록

`social-provider.registry.ts` 48~52행의 운영 분기 `Map`에 `appleClient`를 추가하고, `auth.module.ts`의 provider 목록에도 등록한다. 현재 남아 있는 `TODO(auth)` 주석은 이 작업으로 해소되므로 함께 제거한다.

### 3. 애플 이메일·이름 저장 분기

`auth.md` 4.1과 `auth-api.md` 4.1에 규칙이 확정돼 있다. 다른 제공자와 **두 가지가 다르다.**

- **이메일·이름은 최초 인가 때 한 번만 내려온다.** 재로그인 응답에는 오지 않으므로 **첫 응답에서 반드시 저장하고, 이후 응답의 빈 값으로 기존 값을 덮어쓰지 않는다.** 놓치면 사용자가 애플 설정에서 앱 연동을 해제하기 전까지 다시 받을 수 없다.
- **릴레이 주소(`...@privaterelay.appleid.com`)는 저장하고 `is_email_verified = true`로 둔다.** 값이 온전하고 발송도 되므로 **발송 불가인 카카오 마스킹 주소와 다르게 처리한다.**

### 4. DB 마이그레이션은 불필요

`users.provider` · `archived_users.provider`는 **Postgres enum 타입이 아니라 `varchar(20)`** 이다(`user.entity.ts` 21행, `archived-user.entity.ts` 32행). TS enum에 값을 추가하는 것만으로 저장된다. **마이그레이션 파일을 만들지 않는다.**

## 완료 조건

- Given 운영 환경(`dev.client` 미사용) / When `POST /auth/social-login`에 `provider=apple`로 요청한다 / Then 레지스트리가 던지지 않고 `AppleClient`가 처리한다
- Given 서명이 위조된 identity token / When 애플 로그인을 시도한다 / Then `AUTH_PROVIDER_TOKEN_INVALID`(401)로 거부된다
- Given nonce가 요청 시점과 다른 identity token / When 애플 로그인을 시도한다 / Then 거부된다
- Given 애플 최초 인가로 이메일·이름을 받은 사용자 / When 같은 계정으로 재로그인한다(이메일·이름 미포함 응답) / Then `users.email` · `users.nickname`의 기존 값이 유지된다
- Given "이메일 가리기"로 릴레이 주소를 받은 사용자 / When 계정이 생성된다 / Then `users.email`에 릴레이 주소가 저장되고 `is_email_verified = true`다
- Given 애플로 가입한 사용자 / When 첫 결제를 시도한다 / Then 이메일 인증 화면 없이 결제가 시작된다(인증된 주소이므로 — `auth.md` 4.4)
- Given `backend/src` 전체 / When `TODO(auth)`를 검색한다 / Then 애플 관련 TODO가 남아 있지 않다

## 참고 — 이 티켓 범위 밖

- **프론트 애플 로그인 SDK 연동**(`expo-apple-authentication` 등)은 FE 작업이다. 현재 `frontend/package.json`에 애플 로그인 의존성이 없어 **버튼만 있고 실제 인증은 붙지 않은 상태**이므로, FE 티켓이 별도로 필요하다.
- **닉네임 널 처리**는 이미 서버가 `string | null`로 내려주고 있어 추가 작업이 없다(`profile.types.ts` 12행). 표기 규칙만 `profile-uiux.md` 4.1에 추가됐다.
