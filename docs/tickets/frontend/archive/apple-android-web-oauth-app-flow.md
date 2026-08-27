# [FE] 안드로이드 애플 로그인 — 앱 스킴 등록·웹 OAuth 플로우·복귀 딥링크 수신

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json`(`scheme` 신설) · `features/auth`의 애플 웹 OAuth 플로우(안드로이드 한정) · 복귀 딥링크 수신 라우팅 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 안드로이드 애플 로그인 설계 확정 — 짝 티켓(BE)의 요청 4 |
| 근거 문서 | `features/auth.md` 1·4.1(제공자 버튼 4개 — 플랫폼 구분 없음) · `spec/api/auth-api.md` 4.1(`apple` 검증·nonce 계약) · `features/README.md` 결정 50 · 짝 티켓 `tickets/backend/archive/apple-android-web-oauth-callback.md`(**완료** — 서버 쪽은 끝났다) |
| 심각도 | **중** — 안드로이드에서 애플 버튼이 네이티브 모듈 부재로 실패하는 상태가 유지된다. iOS·나머지 3종은 영향 없다 |
| 상태 | pending — **착수 가능**(BE 실측 완료 2026-08-26, 규약 확정) |

## 배경

안드로이드에는 애플 네이티브 SDK가 없어 **웹 OAuth 플로우**로 구현한다. 애플은 등록된 HTTPS Return URL로만 결과를 보내므로 브라우저를 한 번 거치고, 그 결과를 앱으로 되돌리는 것이 이 티켓이다.

설계는 확정됐다(2026-08-26 — 짝 티켓에 근거 전문).

- **콜백은 랜딩(Vercel)이 받는다.** 콜백은 토큰을 검증하지 않는 중계기이며 비밀값을 갖지 않는다
- **`id_token`을 딥링크로 앱에 직송한다.** PKCE식 핸드오프 코드를 만들지 않는다 — **nonce가 같은 일을 이미 하고 있다**
- **복귀 주소는 `ear://auth/apple`** (확정 2026-08-26)

콘솔 준비 완료 — Services ID `com.runtime.ear.signin`, 도메인 `earcast.co.kr`, Return URL `https://earcast.co.kr/auth/apple/callback`.

## 확정 규약 (2026-08-26 — BE 실측·프로덕션 배포 완료)

**서버 쪽은 끝났다.** 콜백 함수가 프로덕션에서 동작하는 것까지 확인했고 짝 티켓은 archive로 갔다(검증표는 거기 있다). **이 티켓이 안드로이드 애플 로그인의 유일한 남은 작업이다.**

| 항목 | 확정값 |
|---|---|
| authorize 방식 | **`response_type=code id_token` · `response_mode=form_post` · `scope=name email`** |
| `client_id` | **`com.runtime.ear.signin`** (Services ID — **앱 번들 ID가 아니다**) |
| `redirect_uri` | `https://earcast.co.kr/auth/apple/callback` |
| 복귀 | **`ear://auth/apple?id_token=...&state=...`** — **쿼리다**(프래그먼트 아님). 일부 안드로이드 브라우저가 앱 인텐트로 넘길 때 프래그먼트를 떨어뜨린다 |
| 취소·실패 | 같은 경로로 **`?error=...`** (`user_cancelled_authorize` 등). 서버가 판정하지 않으므로 **문구 판단은 앱이 한다** — 미결이던 항목을 이 방향으로 확정했다 |
| nonce | 원본은 **앱 메모리에만**. authorize에는 **SHA-256 소문자 hex**만 |

**서버가 `aud` 두 개를 받는다** — iOS 네이티브(`com.runtime.ear`)와 안드로이드 웹(`com.runtime.ear.signin`). 같은 `POST /auth/social-login`을 쓰면 된다.

## 요청 내용

1. **`app.json`에 앱 스킴을 등록한다** — `"scheme": "ear"`. **현재 앱에 커스텀 스킴이 없다**(안드로이드 `intentFilters` 안의 `"scheme": "https"`는 App Links용이라 다른 것이다). 이것이 없으면 콜백이 앱으로 돌아올 주소가 없다.
2. **안드로이드 한정으로 애플 웹 OAuth 플로우를 구현한다**(expo-auth-session 등) — iOS는 네이티브 모듈 그대로 두고 **플랫폼 분기**한다. `client_id`는 앱 번들 ID가 아니라 **Services ID `com.runtime.ear.signin`**이다.
3. **복귀 딥링크를 수신한다** — `ear://auth/apple`로 돌아온 `id_token`을 꺼내 `POST /auth/social-login`을 호출한다(`provider: "apple"`, `provider_token: <id_token>`, `nonce: <원본>`). 응답 처리는 기존 소셜 로그인 경로와 같다.
4. **원본 nonce를 브라우저·콜백에 절대 흘리지 않는다** — **이 티켓에서 가장 중요한 제약이다.**
   - 앱이 요청마다 임의의 nonce를 만들고 **앱 메모리에만** 둔다
   - 애플 authorize 요청에는 **SHA-256 소문자 hex 해시**만 싣는다(`auth-api.md` 4.1)
   - 원본은 `POST /auth/social-login`에만 싣는다
   - **근거**: 악성 앱이 `ear://`를 가로채 `id_token`을 훔쳐도 원본 nonce가 없어 로그인에 쓸 수 없다. **이 설계의 안전성이 통째로 여기 걸려 있다** — 원본이 브라우저를 거치면 커스텀 스킴 탈취가 곧 계정 탈취가 된다
5. **취소·실패를 처리한다** — 사용자가 애플 화면에서 취소하면 애플이 `error=user_cancelled_authorize`를 보낸다. 처리 방식은 **미결**(아래).
6. **범위 밖** — iOS 네이티브 애플 로그인(이미 동작), 콜백 구현·`aud` 확장(짝 티켓 BE), 공유 링크용 `assetlinks.json`.

## 완료 조건

- Given `frontend/app.json` / When 확인한다 / Then 최상위에 `scheme`이 등록돼 있다
- Given 안드로이드 스탠드얼론 빌드 / When 시작 화면에서 애플 버튼을 누른다 / Then 브라우저에서 애플 로그인이 뜨고, 완료 후 앱으로 돌아와 로그인이 성립한다
- Given iOS 스탠드얼론 빌드 / When 애플 버튼을 누른다 / Then 종전대로 네이티브 시트가 뜬다(웹 플로우로 바뀌지 않았다)
- Given 애플 authorize 요청 / When 실제로 나가는 URL을 확인한다 / Then `nonce` 파라미터가 **해시**이고 원본이 어디에도 없다
- Given 애플 화면에서 취소한다 / When 앱으로 돌아온다 / Then 정해진 안내가 뜨고 시작 화면에 머무른다
- Given 구글·카카오·네이버 로그인 / When 이 티켓의 반영분을 확인한다 / Then 기존 동작에 변화가 없다

## 보류·미결

- ~~authorize 파라미터(A/B)~~ → **해소(2026-08-26)**: form_post로 확정. 위 "확정 규약"
- ~~취소·실패 시 동작~~ → **해소(2026-08-26)**: 에러도 같은 딥링크로 앱에 돌려보낸다. 랜딩에 안내를 띄우면 사용자가 브라우저에 갇힌다
- **딥링크 방식 전환** — 안드로이드 배포 서명 SHA-256 지문 확보 후 커스텀 스킴 → App Link로 옮긴다(`share-universal-links-hosting.md`와 공유하는 블로커)

---

## 처리 기록 (반영 날짜 2026-08-27 — 브랜치 `feat(fe)/apple-web-oauth`)

- **요청 1** — `app.json` 최상위에 `"scheme": "ear"` 등록. prebuild로 AndroidManifest에 `<data android:scheme="ear"/>` 주입 확인(완료 조건 1 충족).
- **요청 2** — `authenticateWithApple`을 플랫폼 분기로 확장: iOS는 기존 네이티브(`authenticateWithAppleNative`) 그대로, 안드로이드는 `authenticateWithAppleWeb` 신설. 구현 수단은 expo-auth-session이 아니라 **expo-web-browser `openAuthSessionAsync`** — 커스텀 플로우(form_post → 랜딩 중계 → 스킴 복귀)라 AuthRequest 추상화가 맞지 않고, 복귀 딥링크가 프라미스 반환값으로 와서 전역 딥링크 리스너 없이 기존 `authenticateWithProvider` 구조에 그대로 맞는다. `client_id`는 `extra.socialAuth.appleServicesId`(`com.runtime.ear.signin`), redirect는 `appleRedirectUri` — app config로 관리(architecture 9.1).
- **요청 3** — 복귀 URL의 쿼리를 파싱(RN URL 폴리필이 searchParams 미지원이라 직접 파싱)해 `id_token`+원본 nonce로 기존 `socialLogin` 경로를 그대로 탄다. `state`(요청마다 무작위)를 발급·대조해 다른 시도의 늦은 콜백을 배제한다.
- **요청 4** — 원본 nonce는 함수 지역변수(앱 메모리)뿐이다. authorize에는 `digestStringAsync` SHA-256 **소문자 hex** 해시만 싣는다 — iOS 네이티브 경로와 동일 규칙·동일 서버 대조.
- **요청 5(취소·실패)** — `error=user_cancelled_authorize` → `ProviderAuthCancelledError`(무반응 복귀). 브라우저를 그냥 닫은 것(dismiss)도 취소로 취급. 그 외 `error`는 일반 실패로 던져 기존 실패 토스트를 탄다. **완료 조건의 "정해진 안내가 뜨고"는 features/auth.md 7("사용자가 인증 취소 — 별도 에러 문구 없음")과 상충해 features 기준(무반응)으로 처리했다** — 안내가 필요하다는 결정이면 별도 요청으로.
- 검증: tsc·eslint·jest 68/68 통과. **완료 조건 2·4·5(실기기 E2E)는 안드로이드 dev/스탠드얼론 빌드에서 확인 필요** — nonce 해시는 코드 경로상 원본이 authorize URL에 실릴 수 없는 구조다.
