# [BE] 버전 안내 — `platform`을 받아 플랫폼별 값으로 판정한다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/settings/dto/get-settings-query-request.dto.ts` · `settings.orchestrator.ts`(`buildVersion`) · `settings.orchestrator.spec.ts` · `backend/src/config/env.validation.ts` · `env.validation.spec.ts` · `backend/.env.example` |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-09 설정 백엔드 구현 (`feat(be)/settings`, PR #28) — 버전 판정 구현 중 계약에 입력이 없다는 것을 발견 |
| 근거 문서 | `changes/archive/settings-api-version-per-platform(be).md`(요청) · `spec/api/settings-api.md` 4.1(**반영 완료**) · `backend/domain.md` 13.3 · `features/splash.md` 6장 |
| 심각도 | **중** — 지금은 드러나지 않는다. **한쪽 스토어 심사가 밀리는 순간** 잘못된 안내가 나간다 |
| 상태 | **완료** (2026-08-09) — `fix(be)/settings-version-platform` |

> **2026-08-09 반영 결과** — "고쳐야 할 것" 1~4를 모두 반영했다.
>
> - **환경 변수 2개 → 4개.** `LATEST_APP_VERSION` · `MIN_SUPPORTED_APP_VERSION`을 각각 `_IOS` / `_ANDROID`로 교체했다. **옛 이름을 폴백으로 남기지 않았다** — 넷 다 필수라 일부만 채운 배포는 기동 시점에 실패한다. `.env.example` 주석에는 왜 나눴는지(스토어 심사 주기)와 **한쪽만 배포된 동안에는 그쪽 값만 올린다**는 운영 규칙을 적었다
> - **요청 DTO에 `platform` 필수.** `DevicePlatform`(`user.enum.ts:72`)을 그대로 재사용했다 — 티켓이 지적한 대로 기기 등록이 이미 쓰는 값 집합이라 새로 만들 것이 없었다
> - **`buildVersion(appVersion, platform)`** — 분기는 이 메서드 안에만 있다. `semver.util.ts`는 손대지 않았다. **최소 지원 버전도 같은 플랫폼 값으로 고른다** — 두 값이 다른 플랫폼에서 오면 화면이 나란히 읽을 수 없다
> - **테스트 4건 추가** — orchestrator 2건(android가 android 값을 받는지 / 같은 앱 버전이 플랫폼에 따라 갈리는지), env 2건(하나만 빠져도 기동 실패 / semver 아니면 실패). **두 플랫폼의 상수를 일부러 다르게 뒀다**(iOS 1.4.0 · Android 1.5.0) — 같은 값이면 분기를 잘못 타도 통과한다
>
> **실 서버로 확인했다.** iOS 1.4.0 / Android 1.5.0으로 어긋난 상태를 만들고 같은 `app_version=1.4.0`을 두 플랫폼으로 보냈다.
>
> | 요청 | latest | min | update_available |
> |---|---|---|---|
> | `1.4.0` + `ios` | 1.4.0 | 1.1.0 | **false** — 받을 게 없다 |
> | `1.4.0` + `android` | 1.5.0 | 1.2.0 | **true** |
>
> 단일 값 판정이 틀리던 지점이 그대로 갈렸다. 에러 경로도 확인했다 — `platform` 누락 · `web` · 대문자 `IOS` · `app_version` 누락 · `1.4`(semver 아님) 전부 400 `VALIDATION_FAILED`, 인증 없음은 401이다. 환경 변수 하나를 지우고 띄우니 `environment validation failed` + 변수명만 남고 **값은 로그에 남지 않았다.**
>
> 단위 267 · E2E 21 · lint 0 errors · build 통과. 확인 후 테스트 계정과 `.env` 값(전부 1.0.0)은 원복했다.
>
> **문서는 건드리지 않았다.** 계약은 이 티켓 발행 시점에 이미 반영돼 있었다(`settings-api.md` 4.1).

> **짝 티켓** — `tickets/frontend/pending/settings-version-platform-param.md`. **아직 대기다.** `platform`을 필수로 만들었으므로 **이 브랜치가 FE보다 먼저 배포되면 값을 안 보내는 클라이언트가 400을 받는다.** 통합 브랜치에서 함께 머지되면 문제가 없다 — 배포 순서는 아래 "함께 확인할 것" 참조.
>
> **계약은 이미 확정·반영됐다**(2026-08-09). `settings-api.md` 4.1 Request 표에 `platform`이 필수로 들어갔고, `splash.md` 6장도 같은 규칙을 따르도록 기재됐다. 이 티켓은 **코드를 계약에 맞추는 일**이다.

## 증상

`settings-api.md` 4.1이 `platform`을 필수로 정했는데 **서버가 그 값을 받지도, 쓰지도 않는다.** 현재 구현은 단일 값(`LATEST_APP_VERSION` · `MIN_SUPPORTED_APP_VERSION`)으로 판정한다.

Android에 1.5.0이 먼저 배포되고 iOS는 심사 대기 중이라고 하자. 배포 체크리스트대로 `LATEST_APP_VERSION`을 1.5.0으로 올리면:

| 플랫폼 | 실제 스토어 최신 | 사용자 앱 | 현재 구현의 판정 |
|---|---|---|---|
| Android | 1.5.0 | 1.4.0 | [업데이트] ✅ 맞다 |
| iOS | **1.4.0** | 1.4.0 | **[업데이트]** ❌ 받을 게 없는데 배지가 뜬다 |

설정 화면은 **안내**라 사용자가 스토어에 갔다가 돌아오는 정도로 끝난다. **스플래시는 다르다** — `min_supported_version`으로 **차단**하기 때문이다. iOS 심사가 밀린 상태에서 최소 지원을 1.5.0으로 올리면 **iOS 사용자 전원이 업데이트할 수 없는 화면에 갇힌다.**

## 재현 절차

두 플랫폼의 최신 버전이 같은 동안에는 재현되지 않는다. 어긋난 상태를 만들어야 한다.

1. `.env`에 `LATEST_APP_VERSION=1.5.0`을 넣고 서버를 띄운다(Android만 배포된 상황 가정).
2. `GET /api/v1/users/me/settings?app_version=1.4.0` 호출 → `update_available: true`.
3. **같은 응답이 iOS 클라이언트에도 그대로 간다.** iOS 스토어에는 1.4.0이 최신인데 배지가 뜬다.
4. `platform`을 붙여 호출해도 결과가 같다 — 서버가 파라미터를 무시한다(전역 `ValidationPipe`의 whitelist가 잘라낸다).

## 원인

구현 시점(2026-08-09)에 `settings-api.md` 4.1 Request 표에 `platform`이 없었다. `domain.md` 13.3과 `splash.md` 6장은 **"플랫폼별로 값을 나눠야 한다"**고 정하고 있었지만, **계약에 그 값을 고를 입력이 없어** 서버가 어느 쪽과 비교할지 알 수 없었다. 계약에 없는 파라미터를 임의로 만들지 않고(`backend/CLAUDE.md` 1·6장) `changes/pending`에 요청을 올렸고, **A안(파라미터 추가)으로 확정돼 문서에 반영됐다**(2026-08-09).

## 고쳐야 할 것

### 1. 환경 변수 — 2개 → 4개

```
LATEST_APP_VERSION_IOS=1.0.0
LATEST_APP_VERSION_ANDROID=1.0.0
MIN_SUPPORTED_APP_VERSION_IOS=1.0.0
MIN_SUPPORTED_APP_VERSION_ANDROID=1.0.0
```

- `env.validation.ts`의 기존 두 필드를 **넷으로 교체한다.** 검증은 그대로 `@IsString()` + `@Matches(SEMVER_PATTERN)`이다.
- **기존 두 이름을 폴백으로 남기지 않는다.** 남기면 넷 중 일부만 채운 배포에서 어느 값이 쓰였는지가 조용해진다 — 필수로 두면 기동 시점에 실패한다(`env.validation.ts`의 기존 방침).
- `.env.example`의 주석도 함께 고친다. **플랫폼별로 나눈 이유**(스토어 심사 주기)를 한 줄 남긴다 — 나중에 값을 올리는 사람이 한쪽만 올려야 하는 상황을 만나게 된다.

### 2. 요청 DTO — `platform` 필수

`get-settings-query-request.dto.ts`에 필드를 더한다. **값 집합을 새로 만들지 않는다.**

```ts
@IsEnum(DevicePlatform)
readonly platform: DevicePlatform;
```

- `DevicePlatform`(`user.enum.ts:72`)이 이미 `ios` · `android`를 갖고 있고 기기 등록(`register-device-request.dto.ts:24`)이 쓰고 있다. **같은 문자열을 그대로 재사용한다** — 설정용 enum을 따로 만들면 두 곳이 갈라진다.
- **`@IsOptional()`을 붙이지 않는다.** 기본값을 두면 그 플랫폼에는 맞고 다른 쪽에는 **틀렸다는 사실이 드러나지 않는 판정**이 나간다(`settings-api.md` 4.1).
- 누락·오타는 기존대로 400 `VALIDATION_FAILED`다. **새 에러 코드를 만들지 않는다** — `settings-api.md` 5장이 "설정에는 고유 에러 코드가 없다"고 정하고 있고, `common-error-handling.md`는 수정 범위 밖이다.

### 3. `SettingsOrchestrator.buildVersion()` — 플랫폼으로 값을 고른다

`getSummary(userId, appVersion)`의 시그니처가 `platform`을 함께 받도록 바뀐다. 분기는 `buildVersion` 안에 둔다.

- **`semver.util.ts`는 손대지 않는다.** 비교 함수는 그대로고 **어느 값을 비교할지만** 달라진다.
- **`min_supported_version`도 플랫폼 값으로 내려준다.** 설정은 차단하지 않지만(4.1) 화면이 참고하는 값이라 두 값이 같은 플랫폼에서 와야 한다.
- Controller는 DTO를 그대로 넘긴다 — 판정을 Controller로 끌어올리지 않는다.

### 4. 테스트

- `settings.orchestrator.spec.ts` — **두 플랫폼의 값이 다를 때** 각각 자기 값으로 판정하는지. 이게 이 티켓의 핵심 케이스다
- 같은 `app_version`이 한 플랫폼에서는 `update_available: true`, 다른 쪽에서는 `false`가 되는 케이스
- `env.validation.spec.ts` — 넷 중 하나라도 빠지면 기동 실패, semver 아닌 값이면 실패

## 함께 확인할 것

- **배포 순서를 FE보다 뒤에 둔다.** `platform`을 필수로 만드는 순간 값을 안 보내는 클라이언트는 400을 받고 **설정 화면 전체가 뜨지 않는다.** 짝 티켓이 먼저 배포되거나, 최소한 같은 릴리스에 함께 나가야 한다. 통합 브랜치에서 함께 머지되면 문제가 없다.
- **`.env`를 쓰는 팀원 전원이 갱신해야 한다.** 이미 PR #28에서 두 변수를 추가했는데 이 티켓이 다시 이름을 바꾼다 — 반영 시 팀에 한 번 더 알린다.
- **점검 공지도 같은 배포 설정에 있다**(`domain.md` 13.3 `AppConfig`). 플랫폼별로 나눌지는 그 기능을 만들 때 함께 본다 — 이 티켓은 버전 네 값만 다룬다.
- **스플래시 구현 시 같은 규칙을 따른다.** `splash.md` 6장에 기재해 뒀다. 스플래시 API 명세를 쓸 때 이 티켓의 env 네 개를 그대로 읽으면 되고, **버전 판정 로직을 두 벌로 만들지 않는다.**
- **웹은 범위 밖이다.** 현재 클라이언트는 앱뿐이라 `ios` · `android` 둘로 충분하다. 늘어나면 `DevicePlatform`에 값을 더한다.

## 완료 조건

- Given 서버가 기동한다 / When `.env`에 네 변수 중 하나가 없다 / Then **기동에 실패하고** 어느 변수가 빠졌는지 로그에 남는다(값은 남기지 않는다)
- Given `LATEST_APP_VERSION_IOS=1.4.0` · `LATEST_APP_VERSION_ANDROID=1.5.0` / When `app_version=1.4.0&platform=ios`로 조회한다 / Then `latest_version`이 `1.4.0`이고 `update_available`이 **`false`**다
- Given 같은 설정 / When `app_version=1.4.0&platform=android`로 조회한다 / Then `latest_version`이 `1.5.0`이고 `update_available`이 **`true`**다
- Given 같은 설정 / When `platform` 없이 조회한다 / Then 400 `VALIDATION_FAILED`다
- Given 같은 설정 / When `platform=web`으로 조회한다 / Then 400 `VALIDATION_FAILED`다
- Given `settings-api.md` 4.1 Request 표를 본다 / When 서버 DTO와 대조한다 / Then 필드·필수 여부·값 집합이 일치한다
- Given `min_supported_version`을 본다 / When 요청한 플랫폼을 바꾼다 / Then 그 플랫폼의 값이 내려온다
