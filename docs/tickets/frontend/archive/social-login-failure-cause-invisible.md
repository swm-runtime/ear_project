# [FE] 소셜 로그인 실패 원인이 아무 데도 남지 않는다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/auth/hooks/useStartScreen.ts` (catch 블록). **화면·문구·기능 변경 없음 — 로깅만 추가** |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-03 |
| 발견 시점 | 2026-09-03 Play 스토어 배포본에서 구글·카카오 로그인이 실패하는 원인을 추적하던 중. 실제 원인(앱 서명 키 재서명)에 도달하는 데 서버 env 대조·Play Console 확인·설치본 지문 조회까지 필요했는데, **앱이 던진 예외 한 줄만 있었으면 첫 시도에 끝났을 문제**였다 |
| 근거 문서 | `frontend/convention.md` 9장(로깅 — console 직접 사용 금지, `shared/lib/logger` 경유) · `spec/uiux/auth-uiux.md` 4.2(취소는 무반응 복귀) · `features/common-error-handling.md` |
| 심각도 | **중** — 기능은 정상이나 장애 대응 시간이 크게 늘어난다. 사용자에게 보이는 동작은 바뀌지 않는다 |
| 상태 | pending |

## 배경 — 무엇이 문제였나

`useStartScreen.ts`의 로그인 실패 처리는 지금 이렇다.

```ts
} catch (error) {
  // 취소는 실패가 아니다 — 에러 표시 없이 시작 화면으로 조용히 복귀한다(auth-uiux.md 4.2)
  if (error instanceof ProviderAuthCancelledError) return;
  showToast(AUTH_COPY.loginFailed);   // ← error 를 어디에도 남기지 않는다
}
```

**취소가 아닌 모든 실패가 같은 토스트 하나로 수렴하고, 원인은 버려진다.** 이 catch가 덮는 범위는 서로 원인이 완전히 다른 구간 셋이다.

| 구간 | 예 |
|---|---|
| 제공자 SDK | 서명 지문 불일치(`DEVELOPER_ERROR`·`KOE009`), Play Services 미지원, `idToken`이 `null`(`provider-auth.service.ts`의 `'google sign-in returned no id token'`) |
| 네트워크 | 서버 미도달, 타임아웃 |
| 서버 검증 | 401 `AUTH_PROVIDER_TOKEN_INVALID`, 502 `AUTH_PROVIDER_UNAVAILABLE` |

화면만 보면 이 셋을 구분할 수 없다. 2026-09-03 추적에서는 **"서버 로그에 요청이 아예 안 찍힌다"는 사실**로 겨우 앱 구간을 지목했는데, 이는 백엔드 로그에 접근할 수 있는 사람만 쓸 수 있는 방법이다.

`logger.error`는 `__DEV__` 가드가 없어 **릴리즈 빌드에서도 출력된다**(`shared/lib/logger.ts`). 한 줄만 있었으면 `adb logcat`으로 바로 원인이 나왔다.

## 요청 내용

1. **catch에서 예외를 `logger.error`로 남긴다.** 취소(`ProviderAuthCancelledError`) 반환 뒤이므로 정상 흐름에는 찍히지 않는다. 최소한 **제공자 종류**와 **예외의 식별 가능한 부분**(`name`·`message`·네이티브 모듈의 `code`)이 남아야 한다.
2. **토스트 문구·표시 조건은 그대로 둔다.** 사용자에게 원인을 노출하지 않는 것은 의도된 설계다(`auth-uiux.md` 4.2 — 취소는 무반응 복귀, 실패는 단일 문구). 이 티켓은 **개발자용 로그만** 추가한다.
3. **토큰을 로그에 남기지 않는다.** `convention.md` 9장 — `providerToken`·`idToken`·`signupToken`·리프레시 토큰은 어떤 형태로도 남기지 않는다. 예외 객체를 통째로 넘길 때 토큰이 딸려 들어가지 않는지 확인한다.
4. **범위 밖** — 에러 수집 도구(Sentry 등) 도입은 별건이다(`architecture.md` 8.4 미결). 이 티켓은 로거 호출 한 줄까지다.

## 완료 조건

- Given 릴리즈 빌드가 설치된 기기 / When 소셜 로그인이 취소가 아닌 사유로 실패한다 / Then `adb logcat`에 제공자 종류와 예외 식별 정보가 남는다
- Given 사용자가 제공자 인증 창에서 취소한다 / When 시작 화면으로 복귀한다 / Then 로그가 남지 않고 토스트도 뜨지 않는다 (기존 동작 유지)
- Given 로그인 실패 / When 화면을 확인한다 / Then 표시되는 문구가 `AUTH_COPY.loginFailed` 그대로다 (사용자 노출 변화 없음)
- Given 남은 로그 전문 / When 내용을 확인한다 / Then `providerToken`·`idToken` 등 토큰 값이 포함되어 있지 않다

## 보류·미결

- **다른 화면의 같은 패턴은 이 티켓 범위가 아니다.** 다만 `catch`에서 토스트만 띄우고 예외를 버리는 곳이 더 있는지는 별도로 훑어볼 가치가 있다 — 발견되면 이 티켓에 덧붙이지 말고 새로 발행한다.

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-03 |
| 반영 위치 | `frontend/src/features/auth/hooks/useStartScreen.ts` |
| 상태 | **완료 — archive** |

발행 당일 반영했다. 로거 호출 한 줄이면 되는 일이라 미룰 이유가 없었다.

- **`describeAuthError`(모듈 스코프)를 두고 식별 정보만 뽑는다.** 예외 객체를 통째로 넘기지 않는 것이 요청 3의 핵심이었다 — axios 에러의 `config.data`에 요청 본문이 그대로 들어 있어 `provider_token`이 로그로 새어 나간다.
- **`ApiError`면 `errorCode`·`httpStatus`·`traceId`를 남긴다.** 발행 시에는 `name`·`message`·`code`만 상정했는데, 실제로는 `shared/api/api-error.ts`에 정규화된 타입이 있어 이쪽이 훨씬 유용하다. **`traceId`로 서버 로그와 직접 맞출 수 있다** — 이번 추적에서 "요청이 서버에 닿았는가"를 확인하느라 백엔드 로그를 켜야 했던 일이 이걸로 없어진다.
- 제공자 SDK 예외는 `name`·`message`와 네이티브 reject의 `code`를 남긴다(`DEVELOPER_ERROR`·`KOE009` 등이 여기로 온다).

### 완료 조건 판정

- ✅ 릴리즈 빌드에서 취소가 아닌 실패 시 제공자 종류와 예외 식별 정보가 남는다 — `logger.error`는 `__DEV__` 가드가 없어 릴리즈에서도 출력된다
- ✅ 취소는 로그도 토스트도 없다 — `ProviderAuthCancelledError` 반환이 로깅보다 앞에 있다
- ✅ 사용자 노출 문구 무변경 — `showToast(AUTH_COPY.loginFailed)` 그대로
- ✅ 토큰 미기록 — 화이트리스트 방식이라 토큰이 들어갈 필드 자체가 없다

검증: `tsc` 0건, `expo lint` 0건, `jest` 74/74 통과.

### 남긴 것

보류·미결에 적었던 *"다른 화면의 같은 패턴"* 은 훑지 않았다. 발견되면 새 티켓으로 발행한다.
