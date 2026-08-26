# auth-api.md 4.1 — Android 애플 로그인(웹 OAuth) 검증 분기·콜백 협의 (백엔드 확인 필요)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.1(POST /auth/social-login) |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | Android 애플 로그인 준비 — 네이티브 모듈(expo-apple-authentication)이 iOS 전용이라 Android는 애플 웹 OAuth로 별도 구현 필요. 콘솔 선행 작업(Services ID) 완료 시점 |
| 요청 파트 | 프론트엔드 (백엔드 협의 필요) |

## 배경

auth.md는 시작 화면의 제공자 버튼 4개에 플랫폼 구분을 두지 않는다 — Android에서도 애플 로그인이 가능해야 한다. Android에는 애플 네이티브 SDK가 없어 **웹 OAuth 플로우**(브라우저에서 애플 로그인 → 콜백)로 구현하며, 이때 서버가 받는 identity token은 iOS 네이티브와 **`aud`가 다르다**.

콘솔 준비는 완료됐다(2026-08-26): Services ID **`com.runtime.ear.signin`**, 도메인 `earcast.co.kr`, Return URL **`https://earcast.co.kr/auth/apple/callback`**.

## 수정 내용

4.1의 `apple` 검증 서술에 다음을 추가한다:

- **`aud` 허용값 2개**: iOS 네이티브 플로우 = 앱 번들 ID(`com.runtime.ear`), Android 웹 플로우 = Services ID(`com.runtime.ear.signin`). 서버는 둘 다 유효한 aud로 검증한다. 그 외 값은 거부.
- nonce 규칙은 두 플로우 동일(원본 전송·SHA-256 해시 대조).

## 백엔드와 정할 것 (문서 반영 전 결정 필요)

1. **콜백 엔드포인트 처리**: 애플은 Return URL(`https://earcast.co.kr/auth/apple/callback`)로 인증 결과를 **`form_post`(POST)** 로 보낸다(name·email scope 요청 시 애플이 form_post를 강제). 이 엔드포인트를 누가 소유하고(API 서버 vs 랜딩 인프라), 받은 `id_token`을 **앱으로 어떻게 복귀시킬지**(딥링크 리다이렉트 등) 방식을 정해야 한다.
2. FE는 결정된 복귀 방식에 맞춰 expo-auth-session 플로우를 구현한다 — 결정 전에는 Android 애플 버튼이 네이티브 모듈 부재 에러로 실패하는 현 상태가 유지된다.

## 완료 조건

- Given `docs/spec/api/auth-api.md` 4.1을 읽는다 / When apple 검증 서술을 확인한다 / Then aud 허용값 2개(번들 ID·Services ID)와 각 플로우의 대응이 기재되어 있다
- Given 백엔드 apple 검증 구현 / When Android 웹 플로우의 identity token(aud=`com.runtime.ear.signin`)을 검증한다 / Then 유효한 토큰으로 통과한다
- Given 콜백 처리 방식 결정 / When `https://earcast.co.kr/auth/apple/callback`으로 애플이 form_post한다 / Then 정해진 방식으로 앱 복귀(또는 토큰 전달)가 일어난다

---

## 백엔드 회신 (2026-08-26)

- **범위 확정 — 안드로이드에서도 애플 로그인을 제공한다.** "안드로이드에서는 버튼을 감춘다"(플레이스토어에는 애플 로그인 요구 규정이 없다)도 검토했으나, `auth.md`가 플랫폼 구분을 두지 않고 **iOS에서 애플로 가입한 사용자의 기기 변경 경로가 막히는 것**이 결정적이었다.
- **"백엔드와 정할 것" 1을 결정했다 — 콜백은 랜딩(Vercel)이 받고, `id_token`을 딥링크로 앱에 직송한다.** NestJS 소유를 먼저 검토했으나 API 공개 도메인이 없어 인프라 대기가 걸리고, 콜백이 비밀을 갖지 않으며(code 교환을 안 하므로 `.p8` 불필요), **검증은 여전히 NestJS가 하므로 신뢰 경계가 움직이지 않는다.** PKCE식 핸드오프 코드는 **nonce가 같은 일을 이미 하고 있어 만들지 않는다.** 근거와 남은 실측은 `tickets/backend/pending/apple-android-web-oauth-callback.md`에 있다.
- **FE에 못박을 전제 하나** — **원본 nonce가 브라우저·콜백을 절대 거치면 안 된다.** 앱 메모리에만 두고 `/auth/social-login`에만 싣는다. 이것이 위 안전성 근거의 전부다. (2에서 말한 "결정된 복귀 방식"이 이것이다 — 커스텀 스킴 딥링크로 `id_token` 수신)
- **`aud` 허용값 2개 확장도 같은 티켓에서 처리한다.** 이 문서의 반영은 그때 함께 한다 — 지금 `aud`만 먼저 쓰면 문서가 구현보다 앞선 채로 남는다.
- **별건 발견** — 애플 nonce 해시 인코딩이 서버(base64url)와 클라이언트(hex)로 어긋나 있다. **그대로 두면 애플 로그인이 전 플랫폼에서 실패한다.** 발행 즉시 처리해 닫았다 — `tickets/backend/archive/apple-nonce-hash-encoding-mismatch.md`(반영 2026-08-26, 서버 해시를 소문자 hex로 교정). **iOS 실기기 확인만 FE 빌드에 남아 있다.**

---

## 처리 기록 (반영 날짜 2026-08-26 — 브랜치 `feat(be)/apple-callback`)

- **`auth-api.md` 4.1에 "`apple` — `aud` 허용값 2개" 절을 신설**했다. 플랫폼별 발급 경로 표(iOS 네이티브 = Bundle ID / Android 웹 = Services ID), 콜백이 API 서버가 아니라는 것, **계약상 두 플랫폼의 요청이 완전히 같다는 것**을 명시했다. `provider_token` 표의 `apple` 행에도 표시를 걸었다.
- **"백엔드와 정할 것" 1·2 모두 해소.** 콜백은 **랜딩(Vercel)의 Edge 함수**가 받고, `id_token`을 **`ear://auth/apple?...`(쿼리)** 로 앱에 직송한다. 프로덕션 동작까지 확인했다 — `tickets/backend/pending/apple-android-web-oauth-callback.md`의 검증표.
- **코드도 함께 들어갔다** — `APPLE_SERVICES_ID` 신설, `apple.client.ts`가 `aud` 두 값을 허용 목록으로 넘긴다. Services ID 통과·번들 ID 통과·그 외 거부를 검증했다(403건 통과).
- **nonce 규칙에 제약을 하나 더 적었다** — 원본이 브라우저·콜백을 거치면 안 된다. 문서에 없으면 구현이 편한 쪽으로 흘러가고, 그 순간 딥링크 탈취가 곧 계정 탈취가 된다.
- **FE 몫은 짝 티켓으로 넘겼다** — `tickets/frontend/pending/apple-android-web-oauth-app-flow.md`(확정 규약 표 포함, 착수 가능).
