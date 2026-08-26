# auth-api.md 4.1 — provider_token의 제공자별 형식 확정 (백엔드 확인 필요)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.1(POST /auth/social-login) |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 소셜 로그인 4종 SDK 연동(`feat(fe)/social-login`) — 클라이언트가 보내는 토큰 형식이 구현으로 확정됨 |
| 요청 파트 | 프론트엔드 (백엔드 검증 방식 합의 필요) |

## 수정 내용

4.1의 `provider_token` 설명 "제공자 SDK가 반환한 인증 코드 또는 액세스 토큰"을 제공자별 확정 형식으로 바꾼다. **클라이언트는 이 형식으로 보낸다(구현 완료)**:

| provider | provider_token | 비고 |
|---|---|---|
| google | **ID 토큰(JWT)** | 서버는 구글 공개키 서명 검증 + `aud` = 우리 **웹 클라이언트 ID** 대조. 액세스 토큰·인증 코드가 아니다 |
| kakao | 액세스 토큰 | 서버가 카카오 API로 검증(토큰 정보 조회의 `app_id` 대조 포함) |
| naver | 액세스 토큰 | 서버가 네이버 프로필 API 호출로 검증 |
| apple | identity token(JWT) + `nonce`(원본) | 현행 문서 그대로 — 변경 없음 |

- 구글 웹 클라이언트 ID(aud 검증값): `475643832949-q10v2jk03pjh0f37vurot61c216snist.apps.googleusercontent.com`
- 애플 nonce의 해시 방식 부기: 클라이언트는 **원본 nonce의 SHA-256 해시(소문자 hex)**를 인가 요청에 싣는다. 서버가 원본을 해시해 대조할 때 같은 인코딩(hex)을 쓴다.

## 사유

`@react-native-google-signin/google-signin`은 `webClientId` 설정 시 ID 토큰을 반환하며, ID 토큰은 서버가 제공자 API 왕복 없이 서명·`aud`로 검증할 수 있어 액세스 토큰보다 검증 경로가 단순하다(애플과 같은 방식). 문서가 "인증 코드 또는 액세스 토큰"으로 열려 있으면 서버 검증 구현이 클라이언트가 실제 보내는 값과 어긋날 수 있다 — 통신 계약은 spec/api가 기준이므로 확정해 기재한다.

## 완료 조건

- Given `docs/spec/api/auth-api.md` 4.1을 읽는다 / When `provider_token` 항목을 확인한다 / Then 제공자별 형식(구글=ID 토큰, 카카오·네이버=액세스 토큰, 애플=identity token)이 표기되어 있다
- Given 백엔드 소셜 로그인 검증 구현 / When 구글 provider_token을 검증한다 / Then ID 토큰으로서 서명·aud(웹 클라이언트 ID)를 검증한다
- Given 애플 nonce 검증 구현 / When 원본 nonce를 해시해 대조한다 / Then SHA-256 소문자 hex 인코딩으로 비교한다

## 남은 결정 항목 (백엔드)

- 구글 검증을 ID 토큰 방식으로 확정할지(FE 구현은 ID 토큰 전송, 2026-08-26). 액세스 토큰 방식을 원하면 FE의 configure/전송부를 바꿔야 하므로 통합 전에 결정 필요.
