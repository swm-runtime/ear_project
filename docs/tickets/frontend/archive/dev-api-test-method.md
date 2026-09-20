# [FE] 개발계 API를 앱에서 테스트하는 방법 결정 — preview 채널 전환 또는 앱 내 환경 스위치

| 항목 | 값 |
|---|---|
| 대상 | `.github/workflows/eas-update.yml`(preview 채널 `EXPO_PUBLIC_API_BASE_URL`) · `frontend/`(개발 메뉴 환경 스위치 — 선택 시) |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 요청자 | 박준현(인프라) |
| 발행 날짜 | 2026-09-16 |
| Jira | [KAN-65](https://runtime364.atlassian.net/browse/KAN-65) |
| 발견 시점 | 2026-09-16 23:00 KST 배포 흐름 전환(KAN-62) — 이후 **dev 머지는 개발계(`api-dev.earcast.co.kr`)에만 배포**되고 운영은 dev→main PR로만 반영된다. 앱 OTA(`eas-update.yml`)는 이번 전환에서 건드리지 않아 preview·production 채널 모두 계속 **운영 API**를 본다 → dev에 머지된 백엔드 변경을 폰의 앱으로는 확인할 수 없다(로컬 Metro로만 가능) |
| 근거 문서 | `docs/tickets/infra/pending/dev-environment-and-main-deploy.md`(KAN-62 결정 6·미결 "앱 preview 빌드") · `docs/infra/runbook.md` 4장 · `docs/frontend/architecture.md`(환경변수 `EXPO_PUBLIC_API_BASE_URL`) |
| 중요도 | **Medium** — 3일 안에 방법 결정. 서버 배포 전환은 이 결정과 무관하게 진행되며, 결정 전까지 개발계 확인은 로컬 실행으로 한다 |
| 상태 | **완료**(2026-09-20) — A 선택 후 개발계 앱을 별도 번들로 분리(KAN-76) |

## 배경

지금은 환경이 한 벌이라 dev 머지가 곧 운영이었고, 앱은 어느 채널이든 운영 API를 보면 최신 백엔드를 확인할 수 있었다. 전환 뒤에는 최신 백엔드가 개발계에 먼저 올라가므로, **폰에 설치된 앱이 개발계를 볼 수 있는 통로**가 있어야 dev 머지 직후 통합 확인이 된다. 결정 전까지는 개발자 PC에서 `EXPO_PUBLIC_API_BASE_URL=https://api-dev.earcast.co.kr/api/v1 npx expo start`로만 개발계를 볼 수 있다(본인 화면 한정).

## 가능한 방법 — 둘 중 하나를 FE 담당이 선택한다

### A. preview 채널을 개발계로 고정 (권장 — 워크플로 한 줄 + 빌드 1회)

- `eas-update.yml`의 preview 채널(dev 머지 시 OTA)에 `EXPO_PUBLIC_API_BASE_URL=https://api-dev.earcast.co.kr/api/v1`, production 채널(main 머지 시 OTA)은 운영 주소 유지. `eas.json`의 preview/production env도 같게 맞춘다.
- 팀원 폰에 **preview 빌드를 한 번 설치**(TestFlight 내부 / Play 내부 트랙). 이후 dev 머지마다 개발계를 보는 앱이 OTA로 자동 갱신되고, 스토어 앱은 main 머지 시 운영 OTA.
- 폰에 앱이 두 개(스토어 = 운영, preview = 개발계) 깔리며 각자 자기 환경만 본다 — 실수로 운영을 가리킬 여지가 없다.
- 확인할 것: preview 빌드의 번들 ID가 스토어 앱과 같으면 한 폰에 둘을 같이 못 깐다 → 분리 여부(FE 판단). 소셜 로그인 리다이렉트·카카오 앱 키가 번들 ID에 묶여 있으면 개발계용 등록이 필요할 수 있다.

### B. 앱 안 환경 스위치 (빌드 하나로 두 환경)

- 개발 메뉴(개발 빌드에만 노출)에서 운영/개발계 API 주소를 토글하고, 선택값을 저장해 다음 실행에도 유지. 토큰은 환경별로 분리 보관(운영 토큰으로 개발계를 부르면 401).
- 빌드 하나로 두 환경을 오가므로 설치가 간단하지만 FE 코드 작업이 있고, 스위치가 스토어 빌드에 노출되지 않도록 막아야 한다.

## 요청

1. A·B 중 하나를 선택하고 이 티켓에 사유를 한 줄 남긴다.
2. 선택한 방법을 구현한다(A면 `eas-update.yml`·`eas.json` 변경 + preview 빌드 배포 안내, B면 FE 코드).
3. 팀에 "앱으로 개발계 확인하는 법"을 한 줄로 공유한다(Slack).

## 완료 조건

- Given 백엔드 변경이 dev에 머지되어 개발계에 배포됐다 / When 팀원이 폰의 앱(A: preview 빌드, B: 스위치를 개발계로 둔 빌드)을 연다 / Then 그 변경이 앱에서 확인되고, 같은 시각 스토어 앱(또는 스위치 운영)은 운영 API를 그대로 본다
- Given 스토어(production) 앱 / When 어떤 조작을 해도 / Then 개발계 API로 요청이 나가지 않는다

## 처리 기록

- 2026-09-16 발행. 서버 배포 전환(KAN-62 6~8단계)은 이 결정과 무관하게 진행한다.

## 처리 기록 (2026-09-17 — A 선택, 설정 반영)

- **A(preview 채널 = 개발계)를 택했다.** 사유: 코드 작업 없이 워크플로·`eas.json` 두 줄이고, 마침 네이티브 재빌드(expo-video, runtimeVersion 2)를 뽑는 참이라 같은 커밋으로 preview 빌드를 같이 낼 수 있다. B는 토큰 환경별 분리·스토어 빌드 노출 차단까지 만들 게 많고 실수로 운영을 가리킬 여지가 생긴다. 3인 팀이라 "테스트 폰엔 preview 하나"로 충분하다.
- `.github/workflows/eas-update.yml`: 채널 결정 단계가 `api_base_url` 도 정한다 — preview `api-dev.earcast.co.kr`, production `api.earcast.co.kr`.
- `frontend/eas.json`: `preview` env 를 개발계로, `production` env 는 `extends` 상속에 기대지 않고 운영 주소를 명시.
- **번들 ID 는 분리하지 않았다** — 한 폰에 스토어 앱과 preview 앱을 같이 못 깐다(preview 가 덮는다). 소셜 로그인 키를 번들별로 다시 등록하는 비용이 더 커서 지금은 받아들인다. 필요해지면 별도 티켓.
- 남은 것: preview 빌드(`eas build --profile preview --platform all`) → TestFlight 내부 / Play 내부 트랙 → 팀 Slack 에 "앱으로 개발계 확인하는 법" 한 줄. 그 뒤 archive · KAN-65 완료.

## 처리 기록 (2026-09-19 티켓 정리)

- preview 채널 = 개발계 API 는 동작 중이다(dev 머지마다 preview OTA 발행, 2026-09-18~19 에 40여 건).
- Android preview APK 는 2026-09-17 에 빌드됐다(versionCode 9, runtime 2). **iOS preview 는 아직 없다** — ad-hoc 배포에 등록된 기기가 0대라 `eas device:create` 로 팀 기기를 먼저 등록해야 한다(계정 소유자 작업).
- **남은 것**: ① iOS 기기 등록 → iOS preview 빌드, ② 팀 Slack 에 "앱으로 개발계 확인하는 법" 공지. 그 뒤 archive · KAN-65 완료.
- **마감 초과 사유**(Medium, 발행 2026-09-16): 방법 결정·설정 반영은 기한 안(2026-09-17)에 끝났다. iOS 기기 등록이 수동 작업이라 밀렸다.

## 처리 기록 (2026-09-20 — 완료, archive 로 옮긴다)

- **반영 날짜: 2026-09-20.**
- 2026-09-17 의 결정("번들 ID 는 분리하지 않는다")을 2026-09-19 에 뒤집었다 — 개발계 앱을 **별도 앱**(`dev.runtime.ear`, "이어 - preview")으로 분리했다(KAN-76, `dev-app-separate-bundle.md`). 한 폰에 운영 앱과 같이 깔리고, iOS 는 ad-hoc 기기 등록 없이 TestFlight 내부 테스트로 배포된다 — 2026-09-19 기록의 "iOS 기기 등록" 병목이 이 방식으로 사라졌다.
- 배포: iOS TestFlight 1.0.0 (4), 내부 그룹 SWM-Team 자동 배포. Android APK 는 Actions `dev-app-build` 아티팩트 `ear-dev-apk`.
- PM 이 실기기에서 개발계·운영계 분리 동작을 확인했다(2026-09-20). 운영 앱의 API 주소는 빌드·OTA 시점에 고정돼 앱 안에서 바꿀 수단이 없다 — 완료 조건 2.
- 팀 공지: #dev-fullstack 2026-09-20 (요청 3).
- 개발계 앱의 남은 사람 손(소셜 로그인 플랫폼 등록 등)은 `dev-app-separate-bundle.md`(KAN-76)가 이어서 갖는다.
