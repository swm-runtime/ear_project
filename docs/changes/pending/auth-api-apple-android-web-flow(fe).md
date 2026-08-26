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
