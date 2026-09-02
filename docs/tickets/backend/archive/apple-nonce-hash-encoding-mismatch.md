# [BE] 애플 nonce 해시 인코딩 불일치 — 서버는 base64url, 클라이언트는 hex

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/auth/providers/apple.client.ts` 47~48행(`base64UrlSha256`) · 252행(대조) · `apple.client.spec.ts` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-08-26 |
| 반영 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 FE 소셜 로그인 병합분 대응 중 `changes/pending/auth-api-provider-token-format(fe).md`의 nonce 인코딩 부기와 서버 구현을 대조하다 발견 |
| 근거 문서 | `spec/api/auth-api.md` 4.1(nonce 계약) · `changes/pending/auth-api-provider-token-format(fe).md`("클라이언트는 원본 nonce의 SHA-256 해시(**소문자 hex**)를 인가 요청에 싣는다") |
| 심각도 | **높음** — **애플 로그인이 전 플랫폼에서 실패한다.** nonce 대조가 항상 어긋나 `AUTH_PROVIDER_TOKEN_INVALID`가 난다. 개발 환경은 `dev.client`가 가려 재현되지 않는다 |
| 상태 | **완료** |

## 문제

서버는 원본 nonce를 **base64url**로 해시해 토큰의 `nonce` 클레임과 대조한다.

```ts
// apple.client.ts 47~48
const base64UrlSha256 = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');
```

클라이언트는 **소문자 hex**로 해시해 애플 인가 요청에 싣는다(FE 구현 확정, 2026-08-26). 애플은 받은 해시를 그대로 `nonce` 클레임에 담아 돌려주므로, **토큰에는 hex가 들어 있고 서버는 base64url과 비교한다.** 같은 값일 수 없다.

```ts
// apple.client.ts 252 — 항상 거짓이 된다
if (!rawNonce || base64UrlSha256(rawNonce) !== payload.nonce) {
```

## 어느 쪽이 맞는가 — **hex(클라이언트)가 맞다**

애플의 네이티브 Sign in with Apple 예제와 `expo-apple-authentication`·`expo-crypto`(`digestStringAsync(SHA256, ...)`의 기본 출력)가 모두 **hex**다. 사실상의 표준이 hex이므로 **서버를 hex로 맞춘다.** 클라이언트를 base64url로 바꾸면 표준 경로에서 벗어나고, 웹 OAuth 플로우까지 같은 변환을 손으로 유지해야 한다.

## 왜 지금까지 드러나지 않았나

- 개발 환경은 `social-provider.registry.ts` 30~44행이 **전 제공자를 `dev.client`로 갈아끼워** 실제 애플 검증이 돌지 않는다
- `apple.client.spec.ts`는 **서버 자신의 `base64UrlSha256`으로 픽스처를 만들어** 대조하므로 자기 자신과만 일치한다 — 인코딩이 틀려도 통과한다. **테스트가 있는데 못 잡은 케이스다**

## 요청 내용

1. **`base64UrlSha256`을 소문자 hex로 바꾼다** — `digest('base64url')` → `digest('hex')`. 함수명도 실제 인코딩에 맞춘다.
2. **`apple.client.spec.ts`의 nonce 픽스처를 하드코딩된 hex 기대값으로 바꾼다** — 서버 함수로 만든 값과 비교하면 같은 함정에 다시 빠진다. 알려진 문자열의 SHA-256 hex를 상수로 박는다.
3. **`spec/api/auth-api.md` 4.1에 인코딩을 명시한다** — "해시(SHA-256)"만으로는 이 사고가 반복된다. **소문자 hex**로 못박는다(`changes/pending/auth-api-provider-token-format(fe).md` 처리 시 함께).
4. **범위 밖** — `aud` 허용값 확장(`apple-android-web-oauth-callback.md` 소유).

## 완료 조건

- Given 원본 nonce `"abc"` / When 서버가 해시한다 / Then `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`(소문자 hex)를 만든다
- Given 클라이언트가 hex 해시로 받아온 실제 애플 identity token과 그 원본 nonce / When `POST /auth/social-login`을 호출한다 / Then nonce 대조를 통과해 로그인이 성립한다
- Given `apple.client.spec.ts` / When 인코딩을 base64url로 되돌린다 / Then **테스트가 실패한다**(자기참조 픽스처가 제거됐다는 확인)
- Given `spec/api/auth-api.md` 4.1 / When nonce 서술을 읽는다 / Then 해시 인코딩이 소문자 hex로 명시돼 있다

## 보류·미결

- **iOS 실기기 확인이 필요하다.** 이 티켓의 근거는 코드 대조와 FE 구현 서술이며, 실제 애플 토큰으로 확인한 것은 아니다. 수정 후 스탠드얼론 빌드로 애플 로그인이 성립하는 것까지 봐야 닫힌다

---

## 처리 기록 (2026-08-26 — 브랜치 `feat(be)/social-login`)

| 요청 | 처리 |
|---|---|
| 1. 해시를 소문자 hex로 | `apple.client.ts` — `base64UrlSha256` → **`sha256Hex`**(`digest('hex')`). 함수명이 인코딩을 말하도록 바꾸고, "클라이언트와 같은 인코딩이어야 한다"를 주석으로 못박았다 |
| 2. 자기참조 픽스처 제거 | `apple.client.spec.ts`의 `HASHED_NONCE`를 **하드코딩된 hex 상수**로 교체(`printf 'nonce-from-client' \| sha256sum`). 알려진 값(`'abc'` → `ba7816bf…15ad`)으로 인코딩을 직접 못박는 테스트도 추가했다 |
| 3. `auth-api.md` 4.1에 인코딩 명시 | 반영 완료 — nonce 절에 "해시 인코딩은 소문자 hex다"와 그 근거(애플 네이티브 예제·`expo-crypto` 기본 출력), "인코딩이 어긋나면 대조가 항상 실패한다"를 적었다. `changes/archive/auth-api-provider-token-format(fe).md`와 함께 처리 |

**역방향 확인** — 인코딩을 base64url로 되돌리자 `apple.client.spec.ts`가 **15건 중 7건 실패**했다. 자기참조 픽스처가 실제로 제거됐다는 확인이다(종전에는 되돌려도 전건 통과했다). 되돌린 뒤 전체 스위트 통과.

### 남은 것 — iOS 실기기 확인

이 티켓의 근거는 **코드 대조와 FE 구현 서술**이며, 실제 애플 토큰으로 확인한 것은 아니다. "실제 identity token으로 로그인이 성립한다"는 완료 조건은 **FE 스탠드얼론 빌드가 필요해 여기서 닫을 수 없다** — `tickets/frontend/pending/share-app-links-and-deep-link-routing.md`의 기기 검증과 함께 확인한다. **코드 수정은 이 티켓에서 끝났으므로 archive로 옮긴다.**
