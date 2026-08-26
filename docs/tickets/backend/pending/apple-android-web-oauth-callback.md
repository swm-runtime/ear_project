# [BE] 안드로이드 애플 로그인 — 웹 OAuth 콜백 수신·앱 복귀

| 항목 | 값 |
|---|---|
| 대상 | 애플 웹 OAuth `form_post` 콜백 수신 지점(`https://earcast.co.kr/auth/apple/callback` — **랜딩 Vercel**) · 앱 복귀 딥링크 · `backend/src/modules/auth/providers/apple.client.ts` 120행(`aud` 허용값 2개) · `backend/src/config/env.validation.ts`(`APPLE_CLIENT_ID`) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 FE 소셜 로그인 4종 SDK 연동 병합(PR #63) 후 BE 대응 착수 — `changes/pending/auth-api-apple-android-web-flow(fe).md`가 "백엔드와 정할 것"으로 남긴 항목 검토 |
| 근거 문서 | `features/auth.md` 1·4.1(제공자 버튼 4개 — 플랫폼 구분 없음) · `spec/api/auth-api.md` 4.1(`apple` 검증·nonce 계약) · `prd/ear_root_prd.md` FR-01 · `backend/architecture.md` 9.1 · 짝 문서 `changes/pending/auth-api-apple-android-web-flow(fe).md` |
| 심각도 | **중** — 안드로이드에서 애플 버튼이 네이티브 모듈 부재로 실패하는 상태가 유지된다. iOS 애플 로그인·나머지 3종은 영향 없다. 다만 **iOS에서 애플로 가입한 사용자가 안드로이드로 기기를 바꾸면 진입 경로가 없다** |
| 상태 | pending — **설계는 확정, 실측 하나만 남았다**(아래 "착수 조건") |

## 배경

안드로이드에는 애플 네이티브 SDK가 없어 **웹 OAuth 플로우**로 구현해야 한다. 애플 웹 플로우에는 앱만으로 닫을 수 없게 만드는 제약이 둘 있다.

- `redirect_uri`는 **Services ID에 등록된 HTTPS URL**이어야 한다. `ear://` 같은 커스텀 스킴을 애플이 받지 않는다.
- `scope`에 name·email이 있으면 애플이 **`response_mode=form_post`를 강제**한다. 브라우저 리다이렉트가 아니라 **애플 서버가 그 URL로 HTTP POST를 쏜다.**

즉 **그 POST를 받아줄 서버가 하나 필요**하고, 받은 `id_token`을 브라우저 밖의 앱으로 되돌려줘야 한다.

콘솔 선행 작업은 끝나 있다(FE, 2026-08-26) — Services ID `com.runtime.ear.signin`, 도메인 `earcast.co.kr`, Return URL `https://earcast.co.kr/auth/apple/callback`.

**범위 확정(2026-08-26)** — 안드로이드에서도 애플 로그인을 제공한다. "안드로이드에서는 버튼을 감춘다"(플레이스토어에는 애플 로그인 요구 규정이 없다)도 검토했으나, **`auth.md`가 버튼 4개에 플랫폼 구분을 두지 않고, iOS에서 애플로 가입한 사용자의 기기 변경 경로가 막히는 것**이 결정적이었다.

## 설계 결정 (2026-08-26)

### 1. 콜백은 랜딩(Vercel)이 받는다 — NestJS가 아니다

당초 NestJS 소유를 권고했으나 **뒤집었다.** 근거는 셋이다.

- **콜백이 비밀을 갖지 않는다.** `response_type`에 `id_token`을 포함해 form_post로 직접 받으면 authorization code 교환을 하지 않으므로 **애플 `.p8`(client secret)이 필요 없다.** 콜백은 서명된 JWT를 받아 그대로 넘기는 중계기일 뿐이다.
- **신뢰 경계가 움직이지 않는다.** 검증은 여전히 NestJS가 한다 — 앱이 `POST /auth/social-login`으로 보내면 `apple.client.ts`가 JWKS 서명·`iss`·`aud`·`exp`·nonce를 대조한다. **Vercel은 아무것도 승인하지 않는다.**
- **중계기가 탈취돼 다른 사람의 유효한 애플 토큰으로 바꿔치기해도 통과하지 못한다.** 원본 nonce는 앱이 만들어 앱이 보관하고 `/auth/social-login`에 직접 싣는다 — **중계기는 원본 nonce를 본 적이 없다.**

반대로 NestJS 소유는 **API 공개 도메인을 전제**하는데, 인프라 설계·배포가 아직 없다(`backend/.env.example`은 전부 localhost, `backend/`에 배포 설정은 `docker-compose.yml`뿐). Vercel 수신은 **이 대기를 통째로 없앤다.**

### 2. `id_token`을 딥링크로 앱에 직송한다 — 핸드오프 코드를 만들지 않는다

당초 PKCE식 일회용 핸드오프 코드를 권고했으나 **불필요로 판단했다. nonce가 이미 같은 일을 하고 있다.**

악성 앱이 `ear://`를 등록해 복귀 딥링크를 가로채도, **원본 nonce가 없어 로그인에 쓸 수 없다.** 임의의 nonce를 실으면 토큰의 `nonce` 클레임과 어긋나 거부되고, 아예 빼면 `auth-api.md` 4.1의 "토큰에 `nonce` 클레임이 있는데 요청에 `nonce`가 없으면 거부한다"에 걸린다.

남는 피해는 **정상 사용자의 로그인 실패(DoS)와 토큰 내 이메일·`sub` 노출** 두 가지다. 계정 탈취와는 급이 다르고, 안드로이드 서명 지문 확보 후 App Link로 바꾸면 이것도 사라진다.

이 결정으로 **저장소가 필요 없어졌다** — Redis 도입도, 테이블 신설도, `domain.md` 수정도 없다. **`POST /auth/social-login` 계약도 그대로 재사용**한다.

> **전제 조건 — 원본 nonce가 브라우저·콜백을 절대 거치면 안 된다.** 앱 메모리에만 두고 `/auth/social-login`에만 싣는다. 이것이 깨지면 위 안전성 근거가 통째로 무너진다. FE 짝 티켓에 못박는다.

### 3. 복귀 딥링크는 `ear://auth/apple` (확정 2026-08-26)

**앱에 커스텀 스킴이 등록돼 있지 않았다** — `frontend/app.json`에는 안드로이드 `intentFilters` 안의 `"scheme": "https"`뿐이고 앱 고유 스킴이 없었다. 값을 확정했으므로 **FE가 `app.json`에 `scheme: "ear"`를 등록**하고(짝 티켓), 콜백은 이 주소로 302한다.

**커스텀 스킴으로 시작하고, 지문 확보 후 App Link로 옮긴다.**

App Link(`https`)가 OS 검증으로 가로채기를 원천 차단하지만 **`assetlinks.json`이 필요하고, 그것은 안드로이드 배포 서명 SHA-256 지문 대기 중**이다(`share-universal-links-hosting.md`와 같은 블로커). 위 2의 근거로 커스텀 스킴으로도 계정 탈취는 성립하지 않으므로 **지문을 기다리지 않는다.**

## 착수 조건 — 실측 하나

**랜딩이 지금 POST를 받을 수 없다.** `landing-page/next.config.ts`가 `output: "export"`라 정적 파일뿐이고 서버 런타임이 없다. 방법은 둘이고, **어느 쪽인지는 프리뷰 배포로 실측해야 확정된다.**

**실측할 때 세 번째 가능성도 함께 찌른다** — **`scope`를 요청하지 않으면 form_post 강제가 풀린다.** `response_mode=fragment`로 받으면 브라우저가 `#id_token=...`을 달고 우리 페이지에 도착하고, **정적 페이지의 JS가 그것을 읽어 앱으로 넘길 수 있다** — 서버 함수도 `output: "export"` 제거도 필요 없어진다. 대가는 애플이 **이메일 클레임을 주지 않을 수 있다**는 것인데, 닉네임은 온보딩에서 받고(`domain.md` 3.1) 이메일은 `null`로 와도 `AppleClient`가 정상 처리하므로 감당할 수 있다. **애플이 `response_type=id_token`에 `fragment`를 허용하는지는 확인되지 않았다** — 되면 작업이 절반으로 준다.

| 방법 | 확인할 것 | 비용 |
|---|---|---|
| **루트 `api/` 디렉토리에 Vercel 함수 추가** | Next.js 프리셋 + `output: "export"`와 공존하는지 (Vercel 플랫폼 기능이라 Next 라우팅 밖이다) | 랜딩 정적 유지 — 가능하면 이쪽 |
| **`output: "export"` 제거 후 Route Handler** | 확실히 동작한다 | 페이지는 여전히 빌드 시 정적 생성된다. 잃는 것은 **순수 정적 호스팅 가능성**뿐(`next.config.ts` 주석이 이미 이 경우를 상정해뒀다) |

프리뷰에 함수 하나 올려 POST를 쏴보면 판가름난다. **그 외에 결정할 것은 없다.**

## 요청 내용

1. **Vercel 함수 실측** — 위 표의 두 방법 중 하나를 확정한다.
2. **콜백 함수를 구현한다** — 애플의 `form_post`(`application/x-www-form-urlencoded`)를 받아 `id_token`·`state`를 꺼내고, **`ear://auth/apple`로 302**한다. **비밀값을 두지 않는다. 토큰을 검증하지 않는다**(검증은 NestJS 몫이다).
3. **`aud` 허용값을 2개로 넓힌다** — `apple.client.ts:120`의 `audience`가 `APPLE_CLIENT_ID` 단일값이라 **Services ID(`com.runtime.ear.signin`)로 발급된 안드로이드 웹 플로우 토큰이 거부된다.** iOS 네이티브(`com.runtime.ear`)와 함께 둘 다 허용한다. `env.validation.ts`·`.env.example`의 `APPLE_CLIENT_ID` 서술도 "iOS Bundle ID"에서 "허용 `aud` 목록"으로 바꾼다.
4. **FE 짝 티켓** — 발행 완료(2026-08-26, `tickets/frontend/pending/apple-android-web-oauth-app-flow.md`). **실측 결과(⑥)가 FE 구현의 전제다** — form_post냐 fragment냐에 따라 authorize 요청 파라미터가 달라져, 실측 전에 착수하면 다시 짠다. `spec/api/auth-api.md` 4.1에 `aud` 허용값 2개를 반영한다(`changes/pending/auth-api-apple-android-web-flow(fe).md` 처리).
5. **범위 밖** — 구글 ID 토큰 검증·카카오 `app_id` 대조(`feat(be)/social-login`에서 처리 완료), 공유 링크용 `assetlinks.json`(`share-universal-links-hosting.md` 소유), iOS 네이티브 애플 로그인(이미 동작), ~~애플 nonce 인코딩 불일치~~ → **해소(2026-08-26)**: `tickets/backend/archive/apple-nonce-hash-encoding-mismatch.md`. 서버 해시를 소문자 hex로 맞췄다 — 이 티켓의 웹 플로우도 같은 nonce 규칙을 쓰므로 **선행 조건이 하나 사라졌다**

## 완료 조건

- Given 랜딩 프리뷰 배포 / When `https://<preview>/auth/apple/callback`으로 form-urlencoded POST를 보낸다 / Then 405·404가 아니라 함수가 실행되고 `id_token`을 파싱한다
- Given 안드로이드 기기의 시작 화면 / When 애플 버튼을 누른다 / Then 브라우저에서 애플 로그인이 뜨고, 완료 후 앱으로 돌아와 로그인이 성립한다
- Given Android 웹 플로우의 identity token(`aud` = `com.runtime.ear.signin`) / When 서버가 검증한다 / Then 유효한 토큰으로 통과한다
- Given iOS 네이티브의 identity token(`aud` = `com.runtime.ear`) / When 서버가 검증한다 / Then 종전과 같이 통과한다
- Given `aud`가 둘 중 어느 것도 아닌 identity token / When 서버가 검증한다 / Then 거부한다
- Given 악성 앱이 복귀 딥링크를 가로챈다 / When 가로챈 `id_token`으로 `/auth/social-login`을 호출한다 / Then 원본 nonce가 없어 실패한다
- Given 콜백 함수의 코드·환경변수 / When 확인한다 / Then 비밀값이 하나도 없다
- Given 랜딩의 기존 경로들 / When 접속한다 / Then 이 티켓의 반영분으로 인한 동작 변화가 없다

## 보류·미결

- **딥링크 방식 전환** — 안드로이드 배포 서명 SHA-256 지문 확보 후 커스텀 스킴 → App Link로 옮긴다. 지문은 `share-universal-links-hosting.md`와 공유하는 블로커다
- **`state` 활용** — 현 설계에서는 CSRF 방어를 nonce가 대신하므로 `state`를 필수로 쓰지 않는다. 복귀 시 앱 내 화면 구분이 필요해지면 그때 정한다

**다음에 집는 사람에게** — 설계는 끝났고 근거도 위에 다 있다. **새로 조사할 것은 "Vercel 함수 실측" 하나뿐이다.**

---

## 진행 기록 (2026-08-26 — 브랜치 `feat(be)/apple-callback`)

**요청 2(콜백 함수)를 form_post 전제로 먼저 구현했다.** fragment 안은 애플이 `response_type=id_token`에 `response_mode=fragment`를 허용하는지 **여기서 확인할 수 없다** — 실제 authorize 왕복이 필요해 브라우저에서 사람이 해봐야 한다. form_post는 애플 문서상 확실한 경로이므로 **되는 쪽부터 세우고**, 함수가 동작하면 fragment 안은 굳이 쫓지 않는다(작업이 이미 끝나므로).

- **`landing-page/api/apple-callback.ts` 신설** — Vercel 함수(웹 표준 `Request`/`Response` 시그니처, 새 의존성 없음). `form_post`를 파싱해 `id_token`·`state`·`error`를 꺼내고 **`ear://auth/apple`로 302**한다. **토큰을 검증하지 않고 비밀값도 없다.**
  - **쿼리로 넘긴다(프래그먼트 아님)** — 커스텀 스킴 URL은 HTTP 요청이 되지 않아 어느 서버에도 남지 않으므로 노출 차이가 없는 반면, **일부 안드로이드 브라우저가 앱 인텐트로 넘길 때 프래그먼트를 떨어뜨린다.** 앱 파싱도 쿼리가 단순하다
  - 복귀 주소는 상수다 — 요청 값으로 만들지 않는다(오픈 리다이렉트 차단)
  - `error`(취소 포함)도 성공과 같은 경로로 앱에 돌려보낸다. **문구 판단은 앱이 한다** — 미결이던 "취소 시 동작"을 이 방향으로 제안한다
  - `GET`은 200 평문을 준다 — **라우팅이 살아 있는지 확인하는 실측 지점**이다
- **`vercel.json`에 rewrite 추가** — `/auth/apple/callback`(+ 슬래시) → `/api/apple-callback`. **콘솔에 등록된 Return URL을 그대로 쓰기 위해서다.** 랜딩의 기존 rewrite·헤더는 무변경
- **정적 빌드 무영향 확인** — `npm run build` 통과, `out/`에 `api/`가 섞이지 않고 `out/.well-known/apple-app-site-association`도 그대로다. 타입체크·린트 0 에러

### 남은 실측 — 프리뷰 배포에서 확인한다

**루트 `api/`가 `output: "export"`와 공존하는지가 이 브랜치의 유일한 미확인 항목이다.**

| 확인 | 방법 | 실패하면 |
|---|---|---|
| 함수가 배포되는가 | `GET https://<preview>/api/apple-callback` → 200 평문 | **`output: "export"` 제거 후 Route Handler로 전환**(사용자 결정 필요 — 랜딩을 순수 정적으로 유지할 수 없게 된다) |
| rewrite가 POST를 넘기는가 | `POST https://<preview>/auth/apple/callback` (form-urlencoded, `id_token=test`) → 302 `Location: ear://auth/apple?id_token=test` | rewrite 대신 Return URL을 `/api/apple-callback`으로 콘솔에서 변경 |
| 기존 랜딩 무변화 | 6종 경로 200 · AASA 200 | — |

프로덕션 승격은 지난번과 같이 **수동**이다.

## 프로덕션 검증 완료 (2026-08-26) — 요청 1·2·3 닫힘

**루트 `api/`는 `output: "export"`와 공존한다.** 이 티켓의 유일한 미확인 항목이었고, **랜딩을 순수 정적으로 유지한 채 함수를 쓸 수 있다** — `output: "export"` 제거 결정은 필요 없어졌다.

**시그니처가 갈렸다.** 첫 배포에서 `FUNCTION_INVOCATION_FAILED`가 났는데 404가 아니라 500이었다 — Vercel이 함수를 찾아 실행했으나 핸들러를 못 찾은 것이다. **명명 export(`GET`/`POST`)는 Next.js Route Handler 규약이고, Vercel `api/` 함수는 `export default`를 찾는다.** Edge(웹 표준)와 Node(고전 `(req, res)`) 두 판본을 함께 올려 한 번에 갈랐다.

| 확인 | 결과 |
|---|---|
| `GET /api/apple-callback/` (**Edge · 웹 표준**) | **200** `apple sign-in callback (edge)` |
| `GET /api/apple-callback-node/` (Node · 고전) | 500 — **채택하지 않고 삭제** |
| `POST /auth/apple/callback/` (`id_token`+`state`) | **302** `Location: ear://auth/apple?id_token=test-token&state=abc` · `Cache-Control: no-store` |
| `POST /auth/apple/callback` (슬래시 없음) | 308 → 302, **바디 보존됨** |
| `POST` `error=user_cancelled_authorize` | 302 `ear://auth/apple?error=user_cancelled_authorize` |
| `POST` `id_token` 없음 | 302 `ear://auth/apple?error=missing_id_token` |
| `POST` `state` 없음 | 302 `ear://auth/apple?id_token=only` (빈 `state`를 붙이지 않는다) |
| `PUT` | 405 |
| 기존 랜딩 6종 + AASA + `/contents/:id` | 전부 200, 변화 없음 |

- **`trailingSlash: true`가 rewrite보다 먼저 걸린다.** `/auth/apple/callback` → 308 → `/auth/apple/callback/`. **308은 메서드·바디를 보존하고 실제로 보존되는 것을 확인했으므로 콘솔 변경은 필요 없다.** 홉 하나를 줄이고 싶으면 Return URL을 끝 슬래시로 바꾸면 된다(선택).
- **`aud` 허용값 2개도 반영했다**(요청 3) — `APPLE_SERVICES_ID` 환경변수를 신설해 `APPLE_CLIENT_ID`와 함께 목록으로 넘긴다. 한 변수에 쉼표로 담지 않은 것은 **두 값의 출처와 의미가 달라서**다(번들 ID = iOS 네이티브, Services ID = 안드로이드 웹). `apple.client.spec.ts`에 두 `aud` 통과 + 그 외 거부 검증 추가, 전체 403건 통과.
- 승격은 이번에도 **수동**이었다.

### 남은 것 — FE 구현뿐이다

**서버 쪽은 끝났다.** 짝 티켓(`tickets/frontend/pending/apple-android-web-oauth-app-flow.md`)의 착수 조건이 해소됐고, 확정 규약은 아래와 같다.

| 항목 | 확정값 |
|---|---|
| authorize 방식 | **A안 — `response_type=code id_token` · `response_mode=form_post` · `scope=name email`** (fragment 안은 함수가 동작하므로 쫓지 않는다) |
| `client_id` | `com.runtime.ear.signin` (Services ID — 번들 ID가 아니다) |
| `redirect_uri` | `https://earcast.co.kr/auth/apple/callback` |
| 복귀 | `ear://auth/apple?id_token=...&state=...` (**쿼리**, 프래그먼트 아님) |
| 취소·실패 | 같은 경로로 `?error=...` — **문구 판단은 앱이 한다**(미결이던 항목, 이 방향으로 확정) |
| nonce | 원본은 앱 메모리에만. authorize에는 **SHA-256 소문자 hex**만 |

**`aud` 확장이 반영됐으므로 `auth-api.md` 4.1도 이제 갱신할 수 있다**(`changes/pending/auth-api-apple-android-web-flow(fe).md` 처리 — 요청 4의 남은 절반).
