# [문서] `auth-api.md` — "네이버는 대응 수단이 없다"는 사실과 다르다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.1(제공자별 검증) · `docs/features/auth.md` 미결 "구글·네이버의 이메일 인증 여부 판정" 인접 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | 2026-09-08 백엔드 코드 전수 점검 — 네이버에만 앱 식별 검증이 없어 계정 탈취를 의심했다가, 실제 근거를 확인하는 과정에서 |
| 심각도 | **중** — 보안 판단의 근거 문장이다. 틀린 채로 두면 같은 오독이 반복된다 |

## 문제

4.1이 이렇게 적는다.

> **`kakao`·`naver`는 제공자 API 왕복으로 검증한다.** 액세스 토큰에는 대상 앱 정보가 실려 있지 않으므로, **카카오는 `app_id` 대조가 `aud` 검증에 해당하는 자리**다. **네이버는 대응 수단이 없다.**

**두 가지가 빠져 있고, 마지막 문장은 틀렸다.**

### 1. 왜 지금 안전한지가 적혀 있지 않다 — 이게 제일 중요하다

네이버 클라이언트에는 카카오의 `app_id` 대조에 해당하는 호출이 없다. 그런데도 남의 네이버 앱 토큰으로 우리 계정에 로그인할 수 없는 이유는 **네이버의 `id`가 애플리케이션마다 다른 pairwise 값이기 때문이다.**

- 네이버 프로필 API 명세 5장: "`id`값은 각 애플리케이션마다 회원 별로 유니크한 값으로, 같은 네이버 회원이라도 네이버 로그인을 적용한 애플리케이션이 다르면 id값이 다른 점 유념하시길 바랍니다."
- OIDC discovery(`https://nid.naver.com/.well-known/openid-configuration`): `"subject_types_supported": ["pairwise"]`

남의 앱 토큰으로 `/v1/nid/me`를 부르면 **그 앱 네임스페이스의 id**가 돌아오므로 `uq_users_provider_provider_user_id`에 걸린 우리 행과 절대 일치하지 않는다.

**이 문장이 없어서 실제로 오독이 일어났다** — 점검 중 "네이버만 앱 식별이 없으니 계정 탈취가 가능하다"고 판단했다가, 근거를 파고 나서야 아니라는 것을 확인했다. **안전한 이유를 적어 두지 않으면 안전하다는 사실이 전달되지 않는다.**

### 2. "대응 수단이 없다"는 틀렸다

**네이버는 OIDC를 지원하고, `id_token.aud`가 구글·애플과 완전히 같은 모양의 `aud` 검증이다.** 확인한 값(2026-09-08, discovery 문서 실측):

| 항목 | 값 |
|---|---|
| `issuer` | `https://nid.naver.com` |
| `token_endpoint` | `https://nid.naver.com/oauth2/token` |
| `jwks_uri` | `https://nid.naver.com/oauth2/jwks` |
| `id_token_signing_alg_values_supported` | `["RS256"]` |
| `code_challenge_methods_supported` | `["S256"]` |
| `token_endpoint_auth_methods_supported` | `["client_secret_post", "none"]` |

**지금 못 쓰는 이유는 네이버가 수단을 안 줘서가 아니라 클라이언트 SDK 때문이다.** `@react-native-seoul/naver-login`은 액세스 토큰만 돌려주고 `code`도 `id_token`도 주지 않는다.

### 3. `/v1/nid/verify`는 있지만 앱 식별이 아니다

존재한다(개발가이드 3.4.6·4.1.3). 응답은 `resultcode` · `message` · (`info=true`면) `token` · `expire_date` · `allowed_profile`. **`client_id`가 없다.** 유효성·허용 범위 확인이지 카카오 `app_id`의 대응물이 아니다 — 이 점에서는 원문의 결론이 맞다.

## 수정 내용

4.1의 해당 불릿을 다음으로 교체한다.

> - **`kakao`·`naver`는 제공자 API 왕복으로 검증한다.** 액세스 토큰에는 대상 앱 정보가 실려 있지 않으므로, **카카오는 `app_id` 대조가 `aud` 검증에 해당하는 자리**다.
> - **네이버는 앱 식별 호출이 없다. 대신 네이버의 `id`가 애플리케이션별 pairwise 값이라는 성질에 기댄다** — 다른 앱에서 발급된 토큰은 그 앱 네임스페이스의 id를 돌려주므로 우리 사용자 행과 일치할 수 없다(프로필 API 명세 5장 · OIDC discovery `subject_types_supported: ["pairwise"]`).
>   - `/v1/nid/verify`는 응답에 `client_id`가 없어 **유효성 확인이지 앱 식별이 아니다.**
>   - **`aud` 검증 수단 자체는 존재한다** — 네이버 OIDC(`scope=openid` → `id_token`, RS256 + JWKS)가 구글·애플과 같은 모양이다. 지금 쓰지 않는 것은 네이티브 SDK가 액세스 토큰만 돌려주기 때문이고, 옮기려면 `sub`가 현재 `id`와 다른 값이라 **`provider_user_id` 마이그레이션**이 따라온다.

## 남은 결정 (미결 등재 제안)

- **네이버를 OIDC로 옮길지.** 얻는 것은 명시적 `aud` 검증(pairwise 성질에 대한 암묵 의존 제거), 잃는 것은 네이버앱 원탭 로그인과 `provider_user_id` 마이그레이션 비용이다. **지금 당장의 취약점 때문이 아니라 가정을 명시적으로 만들기 위한 선택**이므로 급하지 않다.

## 참고 — 코드 쪽 반영 (이 요청과 별개로 완료)

`backend/src/modules/auth/providers/naver.client.ts`의 클래스 주석에 위 1의 내용을 적었다(2026-09-08). 가정이 깨지는 조건과 그때의 대안까지 함께 남겼다.

## 완료 조건

- Given `auth-api.md` 4.1 / When 네이버 항목을 읽는다 / Then "대응 수단이 없다"가 아니라 **pairwise id에 기댄다**는 근거가 적혀 있다
- Given 같은 항목 / When `aud` 검증 가능 여부를 찾는다 / Then 네이버 OIDC가 수단으로 존재한다는 사실과 전환 비용(`provider_user_id` 마이그레이션)이 적혀 있다

## 처리 기록 (반영 날짜: 2026-09-08)

`auth-api.md` 4.1의 "네이버는 대응 수단이 없다"를 불릿 하나로 분리해 교체했다.

- **왜 지금 안전한지**(pairwise `id`)를 근거 두 개와 함께 적었다 — 이게 없어서 점검 중 실제로 계정 탈취로 오독됐고, 그 사실도 문서에 남겼다. **안전한 이유를 적지 않으면 안전하다는 사실이 전달되지 않는다.**
- `/v1/nid/verify`는 앱 식별이 아니라는 것과, **OIDC라는 수단은 존재한다**는 것을 함께 적었다. 전환 비용(`provider_user_id` 마이그레이션)을 미결로 달았다.
- 코드 쪽 주석은 같은 날 `naver.client.ts`에 이미 반영했다.
