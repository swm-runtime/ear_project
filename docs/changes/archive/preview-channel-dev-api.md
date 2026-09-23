# [문서] preview 채널·프로필은 개발계 API 를 본다 — OTA env 규칙에 채널 구분을 넣는다

| 항목 | 값 |
|---|---|
| 대상 문서 | `frontend/architecture.md` 2.1(OTA 번들 env 규칙, "eas.json 과 같은 값" 문단) · `infra/runbook.md` 4장(배포 흐름 표 — 앱 채널 행) |
| 요청 파트 | 문서(FE 구현은 `chore(fe)/preview-channel-dev-api`에서 선반영 — 티켓 `tickets/frontend/pending/dev-api-test-method.md`, KAN-65) |
| 발행 날짜 | 2026-09-17 |
| 발견 시점 | KAN-62 배포 흐름 전환 뒤 dev 머지 백엔드를 폰 앱으로 확인할 통로가 없었다 — KAN-65 결정 A |
| 심각도 | 하 — 운영 규칙 명시. 스토어 앱의 동작은 바뀌지 않는다 |

## 현재 규칙

`architecture.md` 2.1: "OTA 번들의 env 는 `eas.json` 과 같은 값을 유지해야 한다. 워크플로가 `EXPO_PUBLIC_API_BASE_URL` 을 번들에 박는다." — 채널과 무관하게 **운영 주소 하나**였다.

## 수정 내용

| 채널 / 프로필 | 트리거 | API |
|---|---|---|
| `preview` | dev 머지 OTA · `eas build --profile preview`(내부 테스트 빌드) | **개발계** `https://api-dev.earcast.co.kr/api/v1` |
| `production` | main 머지 OTA · `eas build --profile production`(스토어) | 운영 `https://api.earcast.co.kr/api/v1` |

- 워크플로의 "채널 결정" 단계가 채널과 함께 API 주소를 정하고, `eas.json` 의 같은 프로필 env 와 값이 같아야 한다는 규칙은 그대로다(드리프트 시 OTA 번들만 다른 서버를 본다).
- **폰 하나에 스토어 앱과 preview 앱을 같이 못 깐다** — 번들 ID 가 같다. 테스트 폰에는 preview 를 깐다(스토어 앱을 덮는다). 분리는 소셜 로그인 키 재등록이 따라와서 보류.
- `production` 프로필은 `extends: preview` 로 env 를 상속하지 않고 운영 주소를 **명시**한다 — 상속에 기대면 preview 를 바꿀 때 스토어 빌드가 따라 바뀐다.

`runbook.md` 4장 배포 흐름 표에 앱 행을 추가한다: "dev 머지 → preview 채널 OTA(개발계) / main 머지 → production 채널 OTA(운영)".

## 완료 조건

- Given `architecture.md` 2.1 / When OTA env 규칙을 읽는다 / Then preview=개발계·production=운영 표와 "한 폰에 둘 못 깐다" 주의가 있다
- Given `runbook.md` 4장 / When 배포 흐름 표를 본다 / Then 앱 채널 행이 있다
- Given dev 에 백엔드 변경이 머지됐다 / When preview 빌드를 깐 폰에서 앱을 연다 / Then 개발계 변경이 보이고, 스토어 앱은 운영을 그대로 본다

## 처리 기록

| 항목 | 값 |
|---|---|
| **반영 날짜** | **2026-09-23** |
| 반영 내용 | `frontend/architecture.md` 2.1 OTA env 규칙에 채널/API 표·"한 폰에 둘 못 깐다"(변형 분리로 해소 기록), `infra/runbook.md` 4장 앱 행 2줄 |
| 반영 PR | `docs/changes-integration-2026-09-23` (dev) |
