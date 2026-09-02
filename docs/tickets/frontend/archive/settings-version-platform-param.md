# [FE] 설정 조회 — `platform` 파라미터를 함께 보낸다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/settings/api/settings.api.ts`(`fetchSettingsSummary`) · `hooks/useSettingsQuery.ts` · `api/settings.mock.ts`(시그니처 정합) |
| 요청 파트 | 프론트엔드 |
| 발견 시점 | 2026-08-09 설정 백엔드 구현 (`feat(be)/settings`, PR #28) — 계약에 입력이 없다는 것을 백엔드가 발견 |
| 근거 문서 | `changes/archive/settings-api-version-per-platform(be).md`(요청) · `spec/api/settings-api.md` 4.1(**반영 완료**) · `backend/domain.md` 13.3 |
| 심각도 | **중** — 반영 전에는 화면이 정상으로 보인다. **서버가 필수로 바꾸는 순간 400이 되어 설정 화면 전체가 뜨지 않는다** |
| 상태 | **반영 완료** (2026-08-09, `feat(fe)/settings`) |

## 처리 기록 (2026-08-09)

고쳐야 할 것 1~4를 전부 반영했다.

1. `fetchSettingsSummary` — `params`에 `platform` 추가. 응답 타입·변환 함수는 무변경
2. `useSettingsQuery` — `getDevicePlatform()` 값 전달. queryKey에는 넣지 않음(티켓 지침대로)
3. 플랫폼 판정을 **`shared/lib/device-platform.ts`로 공용화**(`DevicePlatform` 타입 + `getDevicePlatform()`).
   `notification.api.ts`의 기존 `Platform.OS` 삼항식도 이걸로 교체 — 스플래시 구현 시 재사용한다
4. mock — `mockFetchSettingsSummary(platform)` 시그니처 정합 + **`update-android-only` 시나리오 신설**
   (Android만 최신 아님 — platform 전달 누락 회귀가 mock 단계에서 드러난다)

**검증(에뮬레이터 실측, 2026-08-09)**

- 실서버 경로: `GET /api/v1/users/me/settings?app_version=1.0.0&platform=android` 전송 확인(완료 조건 1·2)
- mock 경로: `update-android-only`에서 Android 배지 노출 확인. 화면 코드 무변경(완료 조건 6)
- ⚠️ **배포 순서 전제 정정** — 짝 티켓 미반영 서버는 `platform`을 "무시"하지 않고
  **400 `VALIDATION_FAILED`로 거부한다**(전역 ValidationPipe `forbidNonWhitelisted`).
  따라서 "FE 먼저"도 안전하지 않으며 **FE·BE가 같은 릴리스로 나가야 한다** — 통합 브랜치
  동시 머지면 문제없다. 짝 티켓 반영 서버에서의 200 확인(완료 조건 4)은 통합 테스트에서 한다

> **짝 티켓** — `tickets/backend/pending/settings-version-platform-param.md`. **이쪽이 먼저 나가거나 같은 릴리스에 함께 나가야 한다** — 서버가 `platform`을 필수로 만든 뒤에 클라이언트가 안 보내면 `VALIDATION_FAILED`다.
>
> **작업량이 작다.** 쿼리 파라미터 한 줄이고 **응답 모양이 바뀌지 않아 화면 코드는 손대지 않는다.** 타입(`settings.dto.ts`)도 그대로다 — 요청은 인라인 파라미터라 DTO 타입이 없다.

## 증상

`settings-api.md` 4.1이 `platform`(`ios` / `android`)을 **필수**로 정했는데 클라이언트가 보내지 않는다.

```ts
// settings.api.ts — 현재
await apiClient.get<SettingsSummaryResponseDto>('/users/me/settings', {
  params: { app_version: input.appVersion },   // platform 없음
});
```

지금은 서버가 그 값을 무시하므로 화면이 정상으로 보인다. **서버가 짝 티켓을 반영하는 순간 400이 되고**, 설정 화면은 부분 실패가 아니라 **통째로 실패한다**(`settings-api.md` 4.1 — `version`은 `failed_sections`가 흡수하지 않는다).

## 재현 절차

**짝 티켓 반영 후에만 재현된다.**

1. 서버를 짝 티켓 반영본으로 띄운다.
2. `EXPO_PUBLIC_SETTINGS_API=real`로 전환한다.
3. 설정 화면에 진입한다 → **400 `VALIDATION_FAILED`**, 화면 전체가 오류 상태다.

반영 전 상태의 문제는 다르다 — **한쪽 스토어 심사가 밀리면 잘못된 [업데이트] 배지가 뜬다.** 서버가 어느 플랫폼의 최신 버전과 비교할지 모르기 때문이다(짝 티켓의 "증상" 표 참조).

## 원인

FE 구현 시점(`feat(fe)/settings`, PR #27)에 `settings-api.md` 4.1 Request 표에 `app_version`밖에 없었다. **계약대로 만든 것이라 FE 잘못이 아니다.** `domain.md` 13.3·`splash.md` 6장이 "플랫폼별로 값이 다르다"고 정하는데 계약에 그 입력이 없다는 것을 백엔드가 구현 중 발견했고, **A안(파라미터 추가)으로 확정돼 문서에 반영됐다**(2026-08-09).

## 고쳐야 할 것

### 1. `fetchSettingsSummary` — 파라미터에 `platform`을 더한다

```ts
export const fetchSettingsSummary = async (input: {
  appVersion: string;
  platform: 'ios' | 'android';
}): Promise<SettingsSummary> => {
  ...
  params: { app_version: input.appVersion, platform: input.platform },
```

- **값 집합은 `ios` · `android` 둘이다.** 기기 등록(`onboarding-api.md` 4.9)과 같은 문자열이고, 서버는 `DevicePlatform` enum으로 검증한다.
- **`params`에만 더한다.** 응답 타입·변환 함수(`toSettingsSummary`)는 손대지 않는다.

### 2. `useSettingsQuery` — 값을 넘긴다

`APP_VERSION`을 넘기는 자리에 플랫폼을 함께 넘긴다. **`queryKey`에 넣을 필요는 없다** — 한 기기에서 값이 바뀌지 않으므로 캐시를 가를 축이 아니다.

### 3. 플랫폼 값은 기존 방식을 그대로 쓴다

`notification.api.ts:25`에 **이미 같은 패턴이 있다.**

```ts
platform: Platform.OS === 'android' ? 'android' : 'ios',
```

- **새 유틸을 만들지, 이 표현을 재사용할지는 FE가 정한다.** 두 곳에서 같은 값을 쓰게 되므로 `shared/lib`로 올릴 만하다 — `APP_VERSION`(`shared/lib/app-version.ts`)이 기기 등록과 설정 조회에 함께 쓰이는 것과 같은 상황이다.
- `Platform.OS`가 `ios`·`android` 밖의 값(web 등)을 주는 경우를 **`ios`로 접는 것이 현재 동작이다.** 앱만 있는 지금은 문제가 없고, 웹이 생기면 서버 enum부터 늘려야 한다.

### 4. mock

`mockFetchSettingsSummary()`는 인자를 받지 않는다. **시그니처 정합만 맞추면 되고 mock 데이터는 바뀌지 않는다** — 플랫폼별로 다른 버전을 흉내 낼 필요가 있는지는 FE가 판단한다. 흉내 낸다면 `update_available`이 플랫폼에 따라 갈리는 케이스를 하나 두면 실서버 전환 전에 화면을 확인할 수 있다.

**mock을 없애지 않는다.** `EXPO_PUBLIC_SETTINGS_API=real` 스위치는 그대로 남는다.

## 함께 확인할 것

- **배포 순서** — 서버가 `platform`을 필수로 만들기 전에 이 변경이 나가 있어야 한다. 통합 브랜치에서 함께 머지되면 문제가 없다.
- **스플래시도 같은 값을 보내게 된다.** `splash.md` 6장이 버전 조회 API에 같은 `platform` 규칙을 따르도록 기재됐다. 스플래시를 만들 때 3번의 플랫폼 값을 그대로 쓰면 된다 — **판정은 서버가 하므로 클라이언트는 값만 실어 보낸다.**
- **화면 코드는 확인만 하면 된다.** `version` 응답의 세 필드(`latest_version` · `min_supported_version` · `update_available`)가 그대로라 [업데이트] 배지 로직은 무변경이다.

## 완료 조건

- Given 설정 화면에 진입한다 / When 네트워크 요청을 본다 / Then `GET /users/me/settings`에 `app_version`과 `platform`이 **함께** 실려 있다
- Given Android 기기 / When 요청을 본다 / Then `platform=android`다
- Given iOS 기기 / When 요청을 본다 / Then `platform=ios`다
- Given 짝 티켓이 반영된 서버 / When `EXPO_PUBLIC_SETTINGS_API=real`로 설정 화면에 진입한다 / Then 200이고 화면이 정상으로 그려진다(400 `VALIDATION_FAILED`가 아니다)
- Given `settings-api.md` 4.1 Request 표를 본다 / When 클라이언트가 보내는 파라미터와 대조한다 / Then 이름·값 집합이 일치한다
- Given 응답의 `version` 오브젝트를 본다 / When 필드를 확인한다 / Then 세 필드가 그대로이고 화면 코드가 바뀌지 않았다
