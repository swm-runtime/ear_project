# [FE] iOS 잠금 화면에서 키체인 접근 실패 — 장시간 재생 중 로그아웃

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/shared/storage/secure-storage.ts` · `shared/storage/keychain-migration.ts`(신설) · `shared/storage/keychain-error.ts`(신설) · `shared/lib/device-id.ts` · `shared/api/api-client.ts`(`TokenProvider`) · `features/auth/services/session.service.ts` · `features/player/services/play-confirm-suppression.service.ts` · `app/App.tsx` |
| 요청 파트 | 프론트엔드 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-05 (High — 오늘 안) |
| 선행 | 없음 |
| Jira | [KAN-123](https://runtime364.atlassian.net/browse/KAN-123) |
| 근거 문서 | `frontend/architecture.md` 5.3(SessionService — 재갱신 루프 금지) · 7.2(영속 계층) · `features/common-error-handling.md` 7(401 갱신) · backend `modules/auth/services/auth.service.ts` `refresh()`(회전·재사용 탐지) |
| 중요도 | High — 잠금 화면에서 30분 넘게 들으면 듣는 도중 로그아웃된다. 이 앱의 핵심 사용 장면이다 |
| 상태 | 완료 (반영 2026-10-05, PR #1129) |

## 배경

Sentry·사용자 제보:

```
FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed (ExpoModulesCore/AsyncFunctionDefinition.swift:123)
→ Caused by: KeyChainException: User interaction is not allowed. (ExpoSecureStore/SecureStoreModule.swift:168)
```

`errSecInteractionNotAllowed` — 기기가 잠긴 상태에서 키체인을 읽었다.

## 원인

1. `secure-storage.ts`가 SecureStore 읽기·쓰기·지우기를 **옵션 없이** 불렀다 → 키체인 접근성 기본값 `WHEN_UNLOCKED`. 기기가 잠기면 모든 읽기·쓰기가 실패한다.
2. 앱은 잠금 화면에서 오디오를 계속 재생한다. access token 수명은 30분(backend `auth.constant.ts`)이고, 재생은 약 4분마다 서명 URL을 다시 받는다(`refreshAudioUrl` — 요청 본문에 `getDeviceId()`). 잠금 화면에서 30분이 지나면 API가 401 → `refreshTokens()` → `doRefresh()`가 `getDeviceId()`로 **매번 키체인을 읽다가** 던진다 → `catch`가 `false` → 세션 만료로 처리 → `clearSession()` → **듣는 도중 로그아웃**(재생도 `stopPlaybackForSignOut`으로 끊긴다).
3. 갱신까지 성공해도 `saveTokens()`의 키체인 쓰기가 잠금에 막힌다. 서버는 **갱신마다 refresh token을 회전하고 옛 토큰을 폐기한다**(`auth.service.ts` `refresh()` — `revokeIfActive`). 폐기된 옛 토큰이 키체인에 남은 채 앱이 끝나면, 다음 실행의 갱신이 그 토큰을 내밀고 서버는 **재사용 탐지로 그 사용자의 모든 세션을 폐기한다**(`revokeAllByUserId` + `AUTH_REFRESH_TOKEN_REUSED`) — 다른 기기까지 로그아웃된다.
4. 네이티브 세부(`expo-secure-store` 57.0.1 `SecureStoreModule.swift`): `set`은 `SecItemAdd`에 `kSecAttrAccessible`을 싣지만, 항목이 이미 있으면(`errSecDuplicateItem`) `update`로 넘어가 **값만** 바꾼다 — 접근성은 바뀌지 않는다. 읽기 쿼리는 접근성으로 거르지 않는다. 그래서 옵션만 바꾸면 **기존 설치의 항목은 계속 `WHEN_UNLOCKED`로 남는다.**

## 요건

1. 읽기·쓰기·지우기에 같은 옵션 `{ keychainAccessible: AFTER_FIRST_UNLOCK }`을 넘긴다(공유 상수 하나). Android는 무시한다.
2. 기존 항목을 한 번 새 접근성으로 옮긴다 — 키마다 읽기 → 지우기 → 다시 쓰기. 잠금이 풀린 전경에서만, 앱 시작 직후. 완료 표시(판 번호)를 남겨 한 번만 돈다. 한 키가 실패해도 값을 잃지 않는다. iOS만.
3. `getDeviceId()`는 처음 읽거나 만든 뒤 메모리에 둔다.
4. 갱신 중 키체인 잠금 실패는 세션 만료가 아니다 — 세션을 지우지 않고 나중에 다시 시도할 수 있게 한다. 재갱신 루프 금지(architecture.md 5.3)는 지킨다. 새 토큰 저장이 잠금에 막히면 메모리 토큰을 유지하고 전경이 되면 저장한다. 잠금 판정은 함수 하나로.
5. 잠금 화면 경로의 비필수 읽기(재생 확인 억제·회수 동기화·Meta·JS 트레이스 등)가 처리되지 않은 예외를 던지지 않는다.
6. 코드만(JS) — OTA로 나간다. 네이티브·설정 변경, 새 네이티브 의존성, runtimeVersion 변경 없음.

## 완료 조건

- Given iOS에서 secureStorage를 쓴다 / When 읽기·쓰기·지우기를 부른다 / Then 세 호출 모두 `keychainAccessible: AFTER_FIRST_UNLOCK`을 넘긴다
- Given 기존 설치의 키체인 항목(`WHEN_UNLOCKED`) / When 앱이 전경으로 시작한다 / Then 모든 키가 같은 값 그대로 새 접근성으로 다시 쓰이고 완료 표시가 남는다
- Given 완료 표시가 현재 판이다 / When 앱이 다시 시작한다 / Then 이관이 아무 항목도 건드리지 않는다
- Given 이관 중 한 키의 다시 쓰기가 실패한다 / When 이관이 끝난다 / Then 그 값은 사본에 남아 있고 완료 표시가 남지 않아 다음 실행이 되살린다
- Given 앱이 백그라운드로 실행됐다(잠겨 있을 수 있다) / When 시작한다 / Then 이관은 처음 전경이 될 때 돈다
- Given 기기 id를 한 번 읽었다 / When 다시 부른다 / Then 키체인을 다시 읽지 않는다
- Given 로그인한 채 잠금 화면에서 재생 중 / When 갱신이 기기 id·refresh token을 잠금 때문에 못 읽는다 / Then 서버를 부르지 않고 세션을 지우지 않는다(`deferred`)
- Given 서버가 새 토큰을 줬다 / When 저장이 잠금에 막힌다 / Then 메모리 토큰으로 계속 쓰고 전경이 되면 회전된 토큰을 저장한다
- Given 저장을 기다리는 중 / When 세션이 정리된다 / Then 전경이 되어도 토큰을 되살리지 않는다
- Given 실기기(iOS) / When 잠금 화면에서 35분 넘게 재생한다 / Then 로그아웃되지 않고 재생이 이어진다

## 처리 기록

- 2026-10-05 발행(이주호). Jira KAN-123(이주호, High, 기한 10-05). 이슈와 수정이 같은 PR에 실려 바로 archive에 둔다.
- **반영 날짜: 2026-10-05** — PR #1129(`fix(fe)/ios-keychain-after-first-unlock` → dev).
  - **옵션**: `secure-storage.ts` `SECURE_STORE_OPTIONS = { keychainAccessible: AFTER_FIRST_UNLOCK }` — get·set·delete 모두. `THIS_DEVICE_ONLY`는 쓰지 않았다(기기 이전·백업 복원 동작을 종전과 같게).
  - **이관**: `keychain-migration.ts`. 키마다 읽기 → `<키>.migrating` 사본 쓰기 → 지우기 → 다시 쓰기(실패 시 1회 재시도) → 사본 지우기. 사본을 먼저 쓰므로 지우고 다시 쓰는 사이에 앱이 죽어도 다음 실행이 사본으로 되살린다. 사본 쓰기가 실패하면 원본을 지우지 않는다. 한 키가 실패해도 나머지는 계속하고, 하나라도 실패하면 완료 표시(`STORAGE_KEYS.KEYCHAIN_ACCESSIBILITY_VERSION` = `'1'`)를 남기지 않는다. 대상은 `STORAGE_KEYS` 전부(완료 표시 제외) — JS 트레이스의 리터럴 키 `diag.js_trace`를 `STORAGE_KEYS.DIAG_JS_TRACE`로 옮겨 포함시켰다. `App.tsx` 최상단에서 시작하고, 전경이 아니면 처음 `active`가 될 때 돈다(`shared/lib/app-active.ts`). 도는 동안 `secureStorage`의 모든 호출은 관문(`holdSecureStorageWhile`)에서 기다린다 — 지운 틈에 세션 복원이 "토큰 없음"을 읽고 로그아웃하지 않게.
  - **기기 id**: `device-id.ts` 메모리 캐시 + 진행 중 조회 공유(동시 호출이 id를 둘 만들지 않는다). 실패는 기억하지 않는다. 재생의 서명 URL 요청(`player.api.ts`)도 이 값을 쓰므로 잠금 화면의 4분 주기 요청이 키체인에 닿지 않는다.
  - **갱신**: `TokenProvider.refreshTokens()`가 `boolean` → `'refreshed' | 'expired' | 'deferred'`. ApiClient는 `deferred`면 세션을 정리하지 않고 원 요청만 실패시킨다(자동 재시도 없음 — 다음 401이 다시 갱신). `doRefresh()`는 refresh token·기기 id 읽기가 잠금에 걸리면 서버를 부르기 **전에** `deferred` — 토큰이 회전되지 않아 같은 토큰으로 다시 시도할 수 있다. 그 밖의 실패는 종전대로 `expired`.
  - **저장**: `saveTokens()`가 잠금에 막히면 메모리 토큰을 유지하고 다음 `active`에 그때의 메모리 토큰을 저장한다. `clearSession()`은 대기 중인 저장을 취소한다.
  - **복원**: `restoreSession()`이 잠금으로 토큰을 못 읽으면 지우지 않고 전경이 될 때 한 번 다시 읽는다(그동안 `restoring` 유지). 그래도 못 읽으면 저장된 토큰은 남긴 채 미로그인으로 시작한다. `getAccessToken()`은 잠금이면 `null`(토큰 없이 나가 401 → 갱신 경로가 판정).
  - **잠금 판정**: `keychain-error.ts` `isKeychainLockedError()` 하나 — 메시지(원인 사슬 3단계)에 `User interaction is not allowed` · `errSecInteractionNotAllowed` · `-25308`. `KeyChainException`이라는 이름만으로는 잠금으로 보지 않는다(다른 OSStatus는 기다려도 안 풀린다).
  - **비필수 읽기**: 재생 확인 억제(`hydrateSuppressedServiceDate` · `suppressPlayConfirmForToday`)만 예외를 그대로 던지고 있어 try/catch를 붙였다. 회수 동기화·대기열 순서 이관·Meta 첫 재생·JS 트레이스·마지막 탭·가입 체험 안내·최근 검색어·버전 관문 캐시는 이미 잡고 있었다(확인).
  - 문서: `frontend/architecture.md` 5.3(잠금 실패는 갱신 실패가 아니다) · 7.2(접근성 선택·이관).
- **완료 조건 확인**
  - 옵션 전달: `secure-storage.test.ts`.
  - 이관 정상·멱등·부분 실패·사본 복구·사본 쓰기 실패 시 원본 유지: `keychain-migration.test.ts`(네이티브처럼 "있는 항목엔 값만 갱신"하는 가짜 키체인으로 접근성까지 확인).
  - 전경 대기: `runWhenAppActive` 경유(코드 확인). 이관 중 읽기가 기다림: `secure-storage.test.ts`.
  - 기기 id 캐시: `device-id.test.ts`.
  - 갱신 `deferred`·세션 유지·전경 저장·정리 후 미복원·복원 대기: `session.service.test.ts`.
  - 검사: `tsc --noEmit` · `eslint src` · `jest` 통과, PR 체크 통과.
  - **실기기(iOS) 확인은 사람 손으로 남는다** — 잠금 화면 35분+ 재생 · 잠긴 채 앱 실행.
